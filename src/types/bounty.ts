// ─── Wanted / Bounty system ──────────────────────────────────────────────────
//
// XP-only economy. Flow:
//   1. Issuer opens a Discord ticket with bounty details + supporting evidence.
//   2. Moderator reviews. If approved, the moderator publishes the bounty
//      in-app via adminPublishBounty.
//   3. Hunter sees the open bounty and clicks Claim. Status flips to
//      `claimed`. The hunter is prompted to submit evidence (screenshot +
//      video) via the same Discord ticket channel.
//   4. Moderator reviews evidence. adminResolveBounty(approved) awards XP to
//      the hunter; (rejected) returns the bounty to `open`.
//
// Issuers can cancel their own open bounties after a 24h cooldown — earlier
// would let them bait-and-pull the bounty the moment a hunter prepared.

import type { GameSlug } from "@/lib/games/types";

export type BountyStatus =
  | "open"
  | "claimed"
  | "resolved"
  | "cancelled"
  | "expired";

export interface Bounty {
  id?:                  string;
  gameSlug:             GameSlug;
  title:                string;
  description:          string;
  /** Short one-liner — "Eliminate Player X in Forge", "Find rare item Y". */
  targetDescription:    string;
  rewardXp:             number;
  status:               BountyStatus;

  issuedBy:             string;
  issuedByName:         string;
  issuedAt:             Date;

  /** Moderator who reviewed the intake ticket and published the bounty. */
  publishedBy:          string;
  publishedByName:      string;
  publishedAt:          Date;

  /** Bounty self-destructs after this date if still open/claimed. */
  expiresAt:            Date;
  /** Issuer cannot cancel until this passes (24h after publish). */
  cancelCooldownUntil:  Date;

  claimedBy?:           string;
  claimedByName?:       string;
  claimedAt?:           Date;

  resolvedBy?:          string;
  resolvedByName?:      string;
  resolvedAt?:          Date;
  resolution?:          "approved" | "rejected";
  resolutionReason?:    string;

  /** Optional link to the intake Discord ticket (mods can see context). */
  discordTicketUrl?:    string | null;

  // ─── Latest claim's evidence ───────────────────────────────────────────────
  // Hunters upload video evidence to Discord (the bounty's intake ticket or
  // any Discord channel). They paste an optional direct link in the claim
  // form so mods can one-click to the message; otherwise they rely on the
  // notes field to point to where the clip lives. These fields are stamped
  // at claim time and OVERWRITTEN on each successful re-claim — the per-
  // claim history is preserved in the activity subcollection.
  /** Direct link to the hunter's evidence (Discord message link, YouTube,
   *  Streamable, etc.). Null when the hunter didn't include one. */
  evidenceUrl?:         string | null;
  /** Hunter's free-form notes attached to the claim — context for mods.
   *  10–500 chars, validated server-side. Null when no claim is active. */
  evidenceNotes?:       string | null;

  // ─── Re-claim cooldown ─────────────────────────────────────────────────────
  // When adminResolveBounty rejects a claim, the bounty bounces to `open`
  // and these fields are stamped so the same hunter can't immediately spam-
  // resubmit. Other hunters can claim immediately. Cleared on successful
  // approval. 15-minute window — long enough to discourage retry-spam, short
  // enough that a legitimate "blurry video, redo" retry isn't punished.
  reclaimCooldownUntil?: Date | null;
  lastRejectedHunterUid?: string | null;
}

export const BOUNTY_MIN_XP = 50;
export const BOUNTY_MAX_XP = 500;
export const BOUNTY_DEFAULT_TTL_DAYS = 14;
export const BOUNTY_CANCEL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// ─── Claim evidence + re-claim cooldown bounds ───────────────────────────────
export const BOUNTY_NOTES_MIN_LEN = 10;
export const BOUNTY_NOTES_MAX_LEN = 500;
/** After a claim is rejected, the SAME hunter has to wait this long before
 *  re-claiming. Other hunters are unaffected. */
export const BOUNTY_RECLAIM_COOLDOWN_MS = 15 * 60 * 1000;

// ─── Activity feed (subcollection /bounties/{id}/activity) ───────────────────
//
// Every meaningful interaction with a bounty appends a doc here, giving the
// admin detail panel a per-bounty audit timeline. Server-only writes via
// bounty.actions.ts — no client write rule exists, so a forged feed entry
// can't appear. Mod-only reads (the public board never reads this feed; it
// reads top-level bounty fields directly).
//
// Field-change events ("edited") capture per-field before/after pairs so the
// detail panel can render diff chips ("rewardXp 500 → 800"). Other events
// keep the payload narrow.

export type ActivityKind =
  | "published"        // mod intake → bounty live
  | "edited"           // mod tweaked one or more fields
  | "claim_opened"     // hunter submitted a claim
  | "claim_approved"   // mod approved the claim, XP awarded
  | "claim_rejected"   // mod rejected, bounty back to open
  | "cancelled"        // closed (by issuer OR mod — see actor field)
  | "expired"          // auto-closed past expiresAt
  | "note";            // mod-only internal note (never user-visible)

export interface ActivityFieldChange {
  field: string;
  /** Stringified previous value — embedded as text so JSON-encoding is trivial
   *  and the panel doesn't have to guess at types. */
  from:  string;
  to:    string;
}

export interface ActivityEntry {
  id?:        string;
  kind:       ActivityKind;
  /** Who took the action. Server-side actions stamp this from the verified
   *  session uid; clients can't forge it because clients never write here. */
  actorUid:   string;
  actorName:  string;
  /** For cancellations, lets the panel + webhook differentiate issuer-cancel
   *  ("the issuer pulled their own bounty") from mod-cancel ("admin override"). */
  actorRole?: "issuer" | "hunter" | "mod" | "system";
  createdAt:  Date;
  /** Free-form payload sized to the event kind. */
  reason?:    string;
  body?:      string;
  changes?:   ActivityFieldChange[];
}

// Bound the body of an internal note so a runaway paste can't bloat the
// activity subcollection. Mirror the resolutionReason cap for consistency.
export const ACTIVITY_NOTE_MAX = 2000;
export const ACTIVITY_REASON_MAX = 500;
