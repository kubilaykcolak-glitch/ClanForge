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
}

export const BOUNTY_MIN_XP = 50;
export const BOUNTY_MAX_XP = 500;
export const BOUNTY_DEFAULT_TTL_DAYS = 14;
export const BOUNTY_CANCEL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
