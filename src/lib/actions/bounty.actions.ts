"use server";

// ─── Wanted / Bounty server actions ──────────────────────────────────────────
//
// XP-only economy. The flow lives partly out of band — issuance and claim
// evidence go through a Discord ticket; the in-app surface is just for the
// mod queue + the public Wanted board + the claim button.
//
// Security model:
//   - Publishing a bounty is moderator+ only (it's the outcome of a vetted
//     intake ticket).
//   - Claiming is any signed-in user — but only when status === 'open'.
//   - Approving / rejecting a claim is moderator+ only.
//   - Cancelling is issuer-only AND only after the 24h cooldown.
//   - XP awards run inside runInTrustedServerContext because the moderator
//     awards XP to a different user (the hunter).

import { revalidatePath } from "next/cache";
import { getSessionUid, getSessionWithRole } from "./server-auth";
import { meetsRole } from "@/lib/auth/roles";
import { runInTrustedServerContext } from "@/lib/webhook-context";
import {
  BOUNTY_CANCEL_COOLDOWN_MS,
  BOUNTY_DEFAULT_TTL_DAYS,
  BOUNTY_MAX_XP,
  BOUNTY_MIN_XP,
  BOUNTY_NOTES_MIN_LEN,
  BOUNTY_NOTES_MAX_LEN,
  BOUNTY_RECLAIM_COOLDOWN_MS,
  type ActivityEntry,
  type ActivityFieldChange,
  type ActivityKind,
  type Bounty,
} from "@/types/bounty";
import type { GameSlug } from "@/lib/games/types";
import { friendlyActionError } from "./_errors";
import {
  postBountyBoard,
  postBountyModLog,
  type BountyEventPayload,
} from "@/lib/discord/webhooks";

// ─── Profile-identity helper ─────────────────────────────────────────────────
// Reads displayName + discordUserId off /profiles/{uid} for the webhook ping
// layer. Returns null-shaped data on miss so callers can pass through to
// the embed builder without branching.

interface IdentitySnapshot {
  displayName:   string;
  discordUserId: string | null;
}

async function readIdentity(uid: string): Promise<IdentitySnapshot> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb.collection("profiles").doc(uid).get();
    if (!snap.exists) return { displayName: "Unknown", discordUserId: null };
    const data = snap.data()!;
    return {
      displayName:   (data.displayName   as string | undefined) ?? "Unknown",
      discordUserId: (data.discordUserId as string | undefined) ?? null,
    };
  } catch {
    return { displayName: "Unknown", discordUserId: null };
  }
}

// ─── Activity-feed helper ────────────────────────────────────────────────────
//
// Appends a single entry to /bounties/{bountyId}/activity. Every mod action
// (publish, edit, claim_opened, claim_approved/rejected, cancel, note) calls
// this so the admin detail panel can render a coherent audit timeline.
// Best-effort — failures log but don't throw, because losing an audit entry
// is preferable to rolling back the lifecycle action itself.

interface ActivityInput {
  bountyId:   string;
  kind:       ActivityKind;
  actorUid:   string;
  actorName:  string;
  actorRole?: ActivityEntry["actorRole"];
  reason?:    string;
  body?:      string;
  changes?:   ActivityFieldChange[];
}

async function appendActivity(input: ActivityInput): Promise<void> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const entry: Omit<ActivityEntry, "id"> = {
      kind:       input.kind,
      actorUid:   input.actorUid,
      actorName:  input.actorName,
      actorRole:  input.actorRole,
      createdAt:  new Date(),
      // Only include the fields that were actually provided — Firestore
      // doesn't like `undefined` field values and the panel filters by
      // presence anyway.
      ...(input.reason  !== undefined ? { reason:  input.reason  } : {}),
      ...(input.body    !== undefined ? { body:    input.body    } : {}),
      ...(input.changes !== undefined ? { changes: input.changes } : {}),
    };
    await adminDb
      .collection("bounties").doc(input.bountyId)
      .collection("activity")
      .add(entry);
  } catch (err) {
    console.error("[appendActivity]", err);
  }
}

// Public helper so other modules (e.g. listBounties admin panel reads) can
// fetch the feed without re-implementing the hydration.
export async function listBountyActivity(bountyId: string): Promise<ActivityEntry[]> {
  try {
    const session = await getSessionWithRole();
    if (!meetsRole(session.role, "moderator")) return [];
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb
      .collection("bounties").doc(bountyId)
      .collection("activity")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    return snap.docs.map(d => {
      const data = d.data();
      const createdAt = (data.createdAt as { toDate?: () => Date } | undefined)?.toDate?.() ?? new Date(0);
      return {
        id:        d.id,
        kind:      data.kind as ActivityKind,
        actorUid:  data.actorUid as string,
        actorName: data.actorName as string,
        actorRole: data.actorRole as ActivityEntry["actorRole"],
        createdAt,
        reason:    data.reason as string | undefined,
        body:      data.body as string | undefined,
        changes:   data.changes as ActivityFieldChange[] | undefined,
      };
    });
  } catch (err) {
    console.error("[listBountyActivity]", err);
    return [];
  }
}

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
}

const VALID_GAMES: GameSlug[] = ["league-of-legends", "arc-raiders"];
const MAX_TITLE       = 120;
const MAX_DESC        = 2000;
const MAX_TARGET_DESC = 200;
const MAX_REASON      = 500;

export interface PublishBountyInput {
  gameSlug:          GameSlug;
  /** Uid of the original ticket opener (the issuer). Mod sets this from intake. */
  issuerUid:         string;
  title:             string;
  description:       string;
  targetDescription: string;
  rewardXp:          number;
  discordTicketUrl?: string | null;
}

export async function adminPublishBounty(input: PublishBountyInput): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getSessionWithRole();
    if (!meetsRole(session.role, "moderator")) return { success: false, error: "Forbidden" };

    if (!VALID_GAMES.includes(input.gameSlug)) return { success: false, error: "Unknown game" };
    const title  = (input.title ?? "").trim();
    const desc   = (input.description ?? "").trim();
    const target = (input.targetDescription ?? "").trim();
    if (!title)  return { success: false, error: "Title is required" };
    if (!desc)   return { success: false, error: "Description is required" };
    if (!target) return { success: false, error: "Target description is required" };
    if (title.length  > MAX_TITLE)       return { success: false, error: `Title must be ${MAX_TITLE} chars or fewer` };
    if (desc.length   > MAX_DESC)        return { success: false, error: `Description must be ${MAX_DESC} chars or fewer` };
    if (target.length > MAX_TARGET_DESC) return { success: false, error: `Target description must be ${MAX_TARGET_DESC} chars or fewer` };
    if (!Number.isFinite(input.rewardXp) || input.rewardXp < BOUNTY_MIN_XP || input.rewardXp > BOUNTY_MAX_XP) {
      return { success: false, error: `Reward XP must be between ${BOUNTY_MIN_XP} and ${BOUNTY_MAX_XP}` };
    }

    const { adminDb } = await import("@/lib/firebase/admin");

    // Resolve issuer + mod identities server-side (H2 pattern).
    const [issuerSnap, modSnap] = await Promise.all([
      adminDb.collection("profiles").doc(input.issuerUid).get(),
      adminDb.collection("profiles").doc(session.uid).get(),
    ]);
    if (!issuerSnap.exists) return { success: false, error: "Issuer profile not found" };
    const issuerName = (issuerSnap.data()?.displayName as string | undefined) ?? "Unknown";
    const modName    = (modSnap.exists ? (modSnap.data()?.displayName as string | undefined) : undefined) ?? "Moderator";

    const now = new Date();
    const docRef = await adminDb.collection("bounties").add({
      gameSlug:            input.gameSlug,
      title,
      description:         desc,
      targetDescription:   target,
      rewardXp:            Math.floor(input.rewardXp),
      status:              "open",
      issuedBy:            input.issuerUid,
      issuedByName:        issuerName,
      issuedAt:            now,
      publishedBy:         session.uid,
      publishedByName:     modName,
      publishedAt:         now,
      expiresAt:           new Date(now.getTime() + BOUNTY_DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000),
      cancelCooldownUntil: new Date(now.getTime() + BOUNTY_CANCEL_COOLDOWN_MS),
      discordTicketUrl:    input.discordTicketUrl ?? null,
    });

    revalidatePath(`/games/${input.gameSlug}/wanted`);
    revalidatePath("/admin/bounties");

    // Activity feed — first entry on a fresh bounty is the publish event.
    // The mod is the actor; the issuer's identity is captured on the
    // bounty doc itself (issuedBy/issuedByName).
    void appendActivity({
      bountyId:  docRef.id,
      kind:      "published",
      actorUid:  session.uid,
      actorName: modName,
      actorRole: "mod",
    });

    // Discord announcement — public board only on publish. Issuer's
    // discordUserId is read alongside the displayName above (issuerSnap)
    // so we don't refetch.
    const issuerDiscordUserId = (issuerSnap.data()?.discordUserId as string | undefined) ?? null;
    void postBountyBoard({
      kind:             "published",
      gameSlug:         input.gameSlug,
      bountyId:         docRef.id,
      title,
      targetLabel:      target,
      rewardXp:         Math.floor(input.rewardXp),
      issuer:           { displayName: issuerName, discordUserId: issuerDiscordUserId },
      discordTicketUrl: input.discordTicketUrl ?? null,
    });

    return { success: true, data: { id: docRef.id } };
  } catch (err) {
    console.error("[adminPublishBounty]", err);
    return { success: false, error: friendlyActionError(err, "Could not publish bounty") };
  }
}

export interface ClaimBountyInput {
  /** Hunter's free-form context for the mod review (10–500 chars). Required —
   *  this is "where to look in the evidence". */
  notes:        string;
  /** Optional direct link to the evidence (Discord message link, YouTube,
   *  Streamable, etc.). When omitted, mods rely on the bounty's existing
   *  discordTicketUrl to find the clip. */
  evidenceUrl?: string;
}

export async function claimBounty(
  bountyId: string,
  input:    ClaimBountyInput,
): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();

    // ── Pre-tx validation ────────────────────────────────────────────────────
    const notes = (input.notes ?? "").trim();
    if (notes.length < BOUNTY_NOTES_MIN_LEN) {
      return { success: false, error: `Notes must be at least ${BOUNTY_NOTES_MIN_LEN} characters` };
    }
    if (notes.length > BOUNTY_NOTES_MAX_LEN) {
      return { success: false, error: `Notes must be ${BOUNTY_NOTES_MAX_LEN} characters or fewer` };
    }
    const evidenceUrl = (input.evidenceUrl ?? "").trim();
    if (evidenceUrl) {
      // Light shape check only — no host whitelist. We just want a real URL
      // so the mod side can render it as a clickable link without surprise.
      try {
        const parsed = new URL(evidenceUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return { success: false, error: "Evidence URL must use http or https" };
        }
      } catch {
        return { success: false, error: "Evidence URL is not a valid URL" };
      }
      if (evidenceUrl.length > 2048) {
        return { success: false, error: "Evidence URL is too long" };
      }
    }

    const { adminDb } = await import("@/lib/firebase/admin");
    const ref  = adminDb.collection("bounties").doc(bountyId);

    // Captured inside the tx for the post-tx Discord webhook so we don't
    // refetch the bounty after committing.
    let bountyForPost: BountyEventPayload | null = null;

    await adminDb.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Bounty not found");
      const data = snap.data() as Bounty;
      if (data.status !== "open") throw new Error("Bounty is not open");
      if (data.issuedBy === sessionUid) throw new Error("You cannot claim your own bounty");

      // Re-claim cooldown — same hunter must wait after a rejection. Other
      // hunters can claim immediately. Stamped by adminResolveBounty on
      // reject; cleared on successful approval / cancel / publish (the
      // bounty doc gets reset on those paths).
      const cooldown = data.reclaimCooldownUntil instanceof Date
        ? data.reclaimCooldownUntil
        : (data.reclaimCooldownUntil as unknown as { toDate?: () => Date })?.toDate?.();
      if (data.lastRejectedHunterUid === sessionUid && cooldown && cooldown > new Date()) {
        const remainMin = Math.ceil((cooldown.getTime() - Date.now()) / 60000);
        throw new Error(`Your previous claim was rejected — wait ${remainMin}m before re-claiming`);
      }

      // Auto-expire on read if past expiry.
      if (data.expiresAt instanceof Date ? data.expiresAt < new Date() : false) {
        tx.update(ref, { status: "expired" });
        throw new Error("Bounty has expired");
      }

      const profSnap = await tx.get(adminDb.collection("profiles").doc(sessionUid));
      const hunterName = (profSnap.exists ? (profSnap.data()?.displayName as string | undefined) : undefined) ?? "Hunter";
      const hunterDiscordUserId = (profSnap.exists ? (profSnap.data()?.discordUserId as string | undefined) : undefined) ?? null;

      tx.update(ref, {
        status:         "claimed",
        claimedBy:      sessionUid,
        claimedByName:  hunterName,
        claimedAt:      new Date(),
        evidenceUrl:    evidenceUrl || null,
        evidenceNotes:  notes,
        // A fresh claim by anyone clears the reject cooldown — if a new
        // hunter is claiming, the old reject state no longer applies, and
        // if the previously-rejected hunter is re-claiming after the
        // cooldown then they've earned a fresh chance.
        lastRejectedHunterUid:  null,
        reclaimCooldownUntil:   null,
      });

      // Stash everything the webhook needs so we don't refetch later.
      bountyForPost = {
        kind:        "claim_opened",
        gameSlug:    data.gameSlug,
        bountyId,
        title:       data.title,
        targetLabel: data.targetDescription,
        rewardXp:    data.rewardXp,
        issuer:      { displayName: data.issuedByName ?? "Unknown", discordUserId: null }, // not needed for this event
        hunter:      { displayName: hunterName, discordUserId: hunterDiscordUserId },
        // Carry evidence so the mod-log embed surfaces the link inline.
        evidenceUrl:   evidenceUrl || null,
        evidenceNotes: notes,
      };
    });

    revalidatePath("/games/arc-raiders/wanted");
    revalidatePath("/admin/bounties");

    // Activity feed + Discord mod-log post.
    if (bountyForPost) {
      const huntPayload = bountyForPost as BountyEventPayload;
      void appendActivity({
        bountyId,
        kind:      "claim_opened",
        actorUid:  sessionUid,
        actorName: huntPayload.hunter?.displayName ?? "Hunter",
        actorRole: "hunter",
        // Reason is the evidence URL (when present), body is the notes.
        // The activity row renderer in the mod panel surfaces both.
        reason:    huntPayload.evidenceUrl ?? undefined,
        body:      huntPayload.evidenceNotes ?? undefined,
      });
      void postBountyModLog(huntPayload);
    }

    return { success: true };
  } catch (err) {
    console.error("[claimBounty]", err);
    return { success: false, error: friendlyActionError(err, "Could not claim bounty") };
  }
}

export async function adminResolveBounty(
  bountyId: string,
  approved: boolean,
  reason?:  string,
): Promise<ActionResult> {
  try {
    const session = await getSessionWithRole();
    if (!meetsRole(session.role, "moderator")) return { success: false, error: "Forbidden" };

    const trimmedReason = (reason ?? "").trim();
    if (trimmedReason.length > MAX_REASON) return { success: false, error: `Reason must be ${MAX_REASON} chars or fewer` };
    if (!approved && !trimmedReason)       return { success: false, error: "A rejection reason is required" };

    const { adminDb } = await import("@/lib/firebase/admin");
    const ref = adminDb.collection("bounties").doc(bountyId);

    // Resolve mod display name once, outside the tx (read order matters in transactions).
    const modSnap = await adminDb.collection("profiles").doc(session.uid).get();
    const modName = (modSnap.exists ? (modSnap.data()?.displayName as string | undefined) : undefined) ?? "Moderator";

    const result = await adminDb.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Bounty not found");
      const data = snap.data() as Bounty;
      if (data.status !== "claimed") throw new Error("Only claimed bounties can be resolved");

      const hunterUid = data.claimedBy as string | undefined;

      if (approved) {
        tx.update(ref, {
          status:           "resolved",
          resolution:       "approved",
          resolvedBy:       session.uid,
          resolvedByName:   modName,
          resolvedAt:       new Date(),
          resolutionReason: trimmedReason || null,
        });
      } else {
        // Rejected: bounce back to open so another hunter can claim. Stamp
        // the re-claim cooldown so the SAME hunter can't immediately spam-
        // resubmit; other hunters are unaffected. claimBounty enforces it.
        tx.update(ref, {
          status:           "open",
          resolution:       "rejected",
          resolvedBy:       session.uid,
          resolvedByName:   modName,
          resolvedAt:       new Date(),
          resolutionReason: trimmedReason || null,
          claimedBy:        null,
          claimedByName:    null,
          claimedAt:        null,
          // Clear the now-stale evidence so the bounty card doesn't show
          // a rejected hunter's link to other viewers.
          evidenceUrl:           null,
          evidenceNotes:         null,
          lastRejectedHunterUid: hunterUid ?? null,
          reclaimCooldownUntil:  new Date(Date.now() + BOUNTY_RECLAIM_COOLDOWN_MS),
        });
      }

      // Snapshot fields needed by the webhook layer post-tx so we don't
      // refetch the document.
      return {
        hunterUid,
        rewardXp:          data.rewardXp,
        gameSlug:          data.gameSlug,
        title:             data.title,
        targetDescription: data.targetDescription,
        claimedByName:     (data.claimedByName as string | undefined) ?? "Hunter",
        issuedByName:      (data.issuedByName  as string | undefined) ?? "Unknown",
        // Carry the claim's evidence so the resolution webhook embed can
        // link to what was reviewed. On reject the doc-level fields are
        // about to be wiped (see the reject branch above), so snapshotting
        // pre-write is the right time.
        evidenceUrl:       (data.evidenceUrl   as string | undefined) ?? null,
        evidenceNotes:     (data.evidenceNotes as string | undefined) ?? null,
        discordTicketUrl:  (data.discordTicketUrl as string | undefined) ?? null,
      };
    });

    // Award XP outside the transaction. Wrapped in trusted-server-context
    // because the moderator is awarding XP to a different user (the hunter).
    if (approved && result.hunterUid) {
      await runInTrustedServerContext(async () => {
        try {
          const { awardXp } = await import("@/lib/actions/xp.actions");
          await awardXp(result.hunterUid as string, "bounty_claim_approved", bountyId);
        } catch (err) {
          console.error("[adminResolveBounty] awardXp failed", err);
        }
      });

      // Notify the hunter that their claim was approved.
      try {
        const { createNotification } = await import("@/lib/server/notifications");
        await createNotification(result.hunterUid, {
          type:  "bounty_approved",
          title: "Bounty claim approved",
          body:  `You earned ${result.rewardXp} XP.`,
          href:  `/games/${result.gameSlug}/wanted`,
        });
      } catch { /* best-effort */ }
    }

    revalidatePath(`/games/${result.gameSlug}/wanted`);
    revalidatePath("/admin/bounties");

    // Activity feed entry — captures who resolved + the reason for audit.
    void appendActivity({
      bountyId,
      kind:      approved ? "claim_approved" : "claim_rejected",
      actorUid:  session.uid,
      actorName: modName,
      actorRole: "mod",
      reason:    trimmedReason || undefined,
    });

    // Discord notification per the brainstorm matrix:
    //   approved → board (celebration + winner ping) + mod-log (audit)
    //   rejected → mod-log only (with rejection reason + claimer ping)
    // Identities are read post-tx so the read happens off the critical
    // path of the resolution itself.
    if (result.hunterUid) {
      const hunterIdentity = await readIdentity(result.hunterUid);
      const baseEmbed: BountyEventPayload = {
        kind:        approved ? "claim_approved" : "claim_rejected",
        gameSlug:    result.gameSlug,
        bountyId,
        title:       result.title,
        targetLabel: result.targetDescription,
        rewardXp:    result.rewardXp,
        issuer:      { displayName: result.issuedByName, discordUserId: null },
        hunter:      hunterIdentity,
        reason:      trimmedReason || null,
        // Pass the claim's evidence through so the resolution embed renders
        // an "Open evidence" / "Submitted evidence" link.
        evidenceUrl:      result.evidenceUrl,
        evidenceNotes:    result.evidenceNotes,
        discordTicketUrl: result.discordTicketUrl,
      };
      if (approved) {
        void postBountyBoard(baseEmbed);
        void postBountyModLog(baseEmbed);
      } else {
        void postBountyModLog(baseEmbed);
      }
    }

    return { success: true };
  } catch (err) {
    console.error("[adminResolveBounty]", err);
    return { success: false, error: friendlyActionError(err, "Could not resolve bounty") };
  }
}

export async function cancelBounty(bountyId: string): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    const { adminDb } = await import("@/lib/firebase/admin");
    const ref  = adminDb.collection("bounties").doc(bountyId);

    // Snapshot the post-tx webhook payload from inside the tx so we don't
    // refetch after committing.
    let bountyForPost: BountyEventPayload | null = null;

    await adminDb.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Bounty not found");
      const data = snap.data() as Bounty;
      if (data.issuedBy !== sessionUid) throw new Error("Only the issuer can cancel their bounty");
      if (data.status === "resolved")   throw new Error("Bounty already resolved");
      if (data.status === "cancelled" || data.status === "expired") return;
      const cooldownEnds = data.cancelCooldownUntil instanceof Date
        ? data.cancelCooldownUntil
        : (data.cancelCooldownUntil as unknown as { toDate?: () => Date })?.toDate?.();
      if (cooldownEnds && cooldownEnds > new Date()) {
        throw new Error("You can only cancel a bounty after the 24-hour cooldown");
      }
      tx.update(ref, { status: "cancelled" });

      bountyForPost = {
        kind:        "cancelled",
        gameSlug:    data.gameSlug,
        bountyId,
        title:       data.title,
        targetLabel: data.targetDescription,
        rewardXp:    data.rewardXp,
        issuer:      { displayName: data.issuedByName ?? "Unknown", discordUserId: null },
      };
    });

    revalidatePath("/games/arc-raiders/wanted");
    revalidatePath("/admin/bounties");

    // Mod-log only — issuer-initiated cancellation is admin-relevant noise,
    // not something the public board needs to announce.
    if (bountyForPost !== null) {
      // Hydrate the issuer's discord ID for a more useful ping in the log.
      const issuerIdentity = await readIdentity(sessionUid);
      const finalPayload: BountyEventPayload = {
        ...(bountyForPost as BountyEventPayload),
        issuer: issuerIdentity,
      };

      // Activity feed — note the actorRole=issuer so the panel + future
      // mod-cancel can render different copy.
      void appendActivity({
        bountyId,
        kind:      "cancelled",
        actorUid:  sessionUid,
        actorName: issuerIdentity.displayName,
        actorRole: "issuer",
      });

      void postBountyModLog(finalPayload);
    }

    return { success: true };
  } catch (err) {
    console.error("[cancelBounty]", err);
    return { success: false, error: friendlyActionError(err, "Could not cancel bounty") };
  }
}

// ─── adminEditBounty ─────────────────────────────────────────────────────────
//
// Mod-only post-publish edits. Accepts a partial patch of the fields that
// make sense to change after the fact:
//   - title / description / targetDescription / rewardXp / expiresAt /
//     discordTicketUrl
// Status-bound: refuses to edit a resolved bounty (XP already awarded —
// editing the reward retroactively would be a trust violation).
//
// Side effects:
//   - Writes an `edited` activity entry with per-field before/after pairs.
//   - Fires the mod-log Discord webhook with the diff summary.
//   - Sends an in-site notification to the issuer + (if claimed) hunter.

export interface AdminEditBountyPatch {
  title?:             string;
  description?:       string;
  targetDescription?: string;
  rewardXp?:          number;
  /** ISO timestamp or Date — coerced server-side. */
  expiresAt?:         Date | string;
  discordTicketUrl?:  string | null;
}

const EDITABLE_FIELDS: (keyof AdminEditBountyPatch)[] = [
  "title", "description", "targetDescription", "rewardXp", "expiresAt", "discordTicketUrl",
];

export async function adminEditBounty(
  bountyId: string,
  patch:    AdminEditBountyPatch,
): Promise<ActionResult> {
  try {
    const session = await getSessionWithRole();
    if (!meetsRole(session.role, "moderator")) return { success: false, error: "Forbidden" };

    // Validate patch fields against the same bounds adminPublishBounty enforces.
    const cleanPatch: Record<string, unknown> = {};
    if (patch.title !== undefined) {
      const v = (patch.title ?? "").trim();
      if (!v) return { success: false, error: "Title cannot be blank" };
      if (v.length > MAX_TITLE) return { success: false, error: `Title must be ${MAX_TITLE} chars or fewer` };
      cleanPatch.title = v;
    }
    if (patch.description !== undefined) {
      const v = (patch.description ?? "").trim();
      if (!v) return { success: false, error: "Description cannot be blank" };
      if (v.length > MAX_DESC) return { success: false, error: `Description must be ${MAX_DESC} chars or fewer` };
      cleanPatch.description = v;
    }
    if (patch.targetDescription !== undefined) {
      const v = (patch.targetDescription ?? "").trim();
      if (!v) return { success: false, error: "Target description cannot be blank" };
      if (v.length > MAX_TARGET_DESC) return { success: false, error: `Target description must be ${MAX_TARGET_DESC} chars or fewer` };
      cleanPatch.targetDescription = v;
    }
    if (patch.rewardXp !== undefined) {
      const xp = Math.floor(patch.rewardXp);
      if (!Number.isFinite(xp) || xp < BOUNTY_MIN_XP || xp > BOUNTY_MAX_XP) {
        return { success: false, error: `Reward XP must be between ${BOUNTY_MIN_XP} and ${BOUNTY_MAX_XP}` };
      }
      cleanPatch.rewardXp = xp;
    }
    if (patch.expiresAt !== undefined) {
      const d = patch.expiresAt instanceof Date ? patch.expiresAt : new Date(patch.expiresAt);
      if (Number.isNaN(d.getTime())) return { success: false, error: "Invalid expiry date" };
      // Must be in the future — editing to a past date would auto-expire it
      // on next read, which is confusing. Refuse with a clear error.
      if (d.getTime() <= Date.now()) return { success: false, error: "Expiry must be in the future" };
      cleanPatch.expiresAt = d;
    }
    if (patch.discordTicketUrl !== undefined) {
      cleanPatch.discordTicketUrl = patch.discordTicketUrl || null;
    }

    if (Object.keys(cleanPatch).length === 0) {
      return { success: false, error: "No editable fields supplied" };
    }

    const { adminDb } = await import("@/lib/firebase/admin");
    const ref = adminDb.collection("bounties").doc(bountyId);

    // Resolve mod identity once outside the tx (Firestore tx reads must
    // happen before writes, and we want the mod name in the activity entry).
    const modSnap = await adminDb.collection("profiles").doc(session.uid).get();
    const modName = (modSnap.exists ? (modSnap.data()?.displayName as string | undefined) : undefined) ?? "Moderator";

    interface EditResult {
      changes:           Array<{ field: string; from: string; to: string }>;
      gameSlug:          GameSlug;
      title:             string;
      targetDescription: string;
      rewardXp:          number;
      issuedBy:          string;
      issuedByName:      string;
      claimedBy?:        string;
    }
    const result = await adminDb.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Bounty not found");
      const data = snap.data() as Bounty;

      // Resolved bounties are immutable — XP has already been awarded.
      // Mods can still re-open via adminResolveBounty(false), but not via
      // edit. This avoids accidental tampering with closed records.
      if (data.status === "resolved") throw new Error("Resolved bounties cannot be edited");

      // Compute the per-field diff for the activity feed + webhook embed.
      const changes: Array<{ field: string; from: string; to: string }> = [];
      for (const f of EDITABLE_FIELDS) {
        if (!(f in cleanPatch)) continue;
        const before = (data as unknown as Record<string, unknown>)[f];
        const after  = cleanPatch[f];
        const fmt = (v: unknown): string => {
          if (v === null || v === undefined) return "—";
          if (v instanceof Date) return v.toISOString().slice(0, 10);
          const maybeDate = (v as { toDate?: () => Date })?.toDate?.();
          if (maybeDate instanceof Date) return maybeDate.toISOString().slice(0, 10);
          return String(v);
        };
        const beforeStr = fmt(before);
        const afterStr  = fmt(after);
        if (beforeStr !== afterStr) {
          changes.push({ field: f, from: beforeStr, to: afterStr });
        }
      }

      if (changes.length === 0) {
        // No actual change — short-circuit cleanly so we don't write an
        // empty "edited" entry. Returning a sentinel result that we
        // identify after the tx commits.
        return { changes: [] as EditResult["changes"], gameSlug: data.gameSlug, title: data.title, targetDescription: data.targetDescription, rewardXp: data.rewardXp, issuedBy: data.issuedBy, issuedByName: data.issuedByName, claimedBy: data.claimedBy };
      }

      tx.update(ref, {
        ...cleanPatch,
        updatedAt: new Date(),
      });

      // Build the result snapshot from the post-patch state so the webhook
      // / notification layer reflects the new values.
      return {
        changes,
        gameSlug:          data.gameSlug,
        title:             (cleanPatch.title             as string | undefined) ?? data.title,
        targetDescription: (cleanPatch.targetDescription as string | undefined) ?? data.targetDescription,
        rewardXp:          (cleanPatch.rewardXp          as number | undefined) ?? data.rewardXp,
        issuedBy:          data.issuedBy,
        issuedByName:      data.issuedByName,
        claimedBy:         data.claimedBy,
      } as EditResult;
    });

    if (result.changes.length === 0) {
      // No-op edit — no activity entry, no webhook, no notification.
      return { success: true };
    }

    revalidatePath(`/games/${result.gameSlug}/wanted`);
    revalidatePath("/admin/bounties");

    void appendActivity({
      bountyId,
      kind:      "edited",
      actorUid:  session.uid,
      actorName: modName,
      actorRole: "mod",
      changes:   result.changes,
    });

    // Mod-log webhook — diff summary embed.
    const modIdentity = await readIdentity(session.uid);
    void postBountyModLog({
      kind:        "edited",
      gameSlug:    result.gameSlug,
      bountyId,
      title:       result.title,
      targetLabel: result.targetDescription,
      rewardXp:    result.rewardXp,
      issuer:      { displayName: result.issuedByName, discordUserId: null },
      mod:         modIdentity,
      changes:     result.changes,
    });

    // In-site notification fan-out — issuer + (if claimed) hunter.
    try {
      const { createNotification } = await import("@/lib/server/notifications");
      const summary = result.changes.map(c => c.field).join(", ");
      const body    = `A moderator updated this bounty (${summary}).`;
      const href    = `/games/${result.gameSlug}/wanted#bounty-${bountyId}`;
      await createNotification(result.issuedBy, {
        type:  "bounty_edited",
        title: `Bounty updated: ${result.title}`,
        body,
        href,
      });
      if (result.claimedBy && result.claimedBy !== result.issuedBy) {
        await createNotification(result.claimedBy, {
          type:  "bounty_edited",
          title: `Bounty you claimed was updated: ${result.title}`,
          body,
          href,
        });
      }
    } catch (err) {
      console.error("[adminEditBounty→notify]", err);
    }

    return { success: true };
  } catch (err) {
    console.error("[adminEditBounty]", err);
    return { success: false, error: friendlyActionError(err, "Could not edit bounty") };
  }
}

// ─── adminCancelBounty ───────────────────────────────────────────────────────
//
// Mod-override cancel. Distinct from cancelBounty (issuer self-cancel) so
// audit trail + Discord webhook can render different copy. Requires a reason
// (the issuer + hunter notifications include it, so they know why their work
// went away).
//
// Allowed from any non-terminal status (open / claimed). Refuses on resolved
// for the same reason adminEditBounty does — XP has been awarded.

export async function adminCancelBounty(bountyId: string, reason: string): Promise<ActionResult> {
  try {
    const session = await getSessionWithRole();
    if (!meetsRole(session.role, "moderator")) return { success: false, error: "Forbidden" };

    const trimmed = (reason ?? "").trim();
    if (!trimmed)                       return { success: false, error: "A cancellation reason is required" };
    if (trimmed.length > MAX_REASON)    return { success: false, error: `Reason must be ${MAX_REASON} chars or fewer` };

    const { adminDb } = await import("@/lib/firebase/admin");
    const ref = adminDb.collection("bounties").doc(bountyId);

    const modSnap = await adminDb.collection("profiles").doc(session.uid).get();
    const modName = (modSnap.exists ? (modSnap.data()?.displayName as string | undefined) : undefined) ?? "Moderator";

    interface ModCancelResult {
      gameSlug:          GameSlug;
      title:             string;
      targetDescription: string;
      rewardXp:          number;
      issuedBy:          string;
      issuedByName:      string;
      claimedBy?:        string;
    }
    const result = await adminDb.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Bounty not found");
      const data = snap.data() as Bounty;
      if (data.status === "resolved")  throw new Error("Resolved bounties cannot be cancelled");
      if (data.status === "cancelled" || data.status === "expired") {
        throw new Error("Bounty is already closed");
      }

      tx.update(ref, {
        status:            "cancelled",
        resolutionReason:  trimmed,
        // Stamp the mod as the resolver so the bounty doc captures who
        // closed it without needing to load the activity feed.
        resolvedBy:        session.uid,
        resolvedByName:    modName,
        resolvedAt:        new Date(),
        resolution:        "rejected",
      });

      return {
        gameSlug:          data.gameSlug,
        title:             data.title,
        targetDescription: data.targetDescription,
        rewardXp:          data.rewardXp,
        issuedBy:          data.issuedBy,
        issuedByName:      data.issuedByName,
        claimedBy:         data.claimedBy,
      } as ModCancelResult;
    });

    revalidatePath(`/games/${result.gameSlug}/wanted`);
    revalidatePath("/admin/bounties");

    void appendActivity({
      bountyId,
      kind:      "cancelled",
      actorUid:  session.uid,
      actorName: modName,
      actorRole: "mod",
      reason:    trimmed,
    });

    // Discord mod-log — distinct embed kind so the copy differentiates from
    // issuer-cancel.
    const modIdentity    = await readIdentity(session.uid);
    const issuerIdentity = await readIdentity(result.issuedBy);
    void postBountyModLog({
      kind:        "cancelled_by_mod",
      gameSlug:    result.gameSlug,
      bountyId,
      title:       result.title,
      targetLabel: result.targetDescription,
      rewardXp:    result.rewardXp,
      issuer:      issuerIdentity,
      mod:         modIdentity,
      reason:      trimmed,
    });

    // Notifications — issuer always; hunter if a claim was open at the
    // moment of cancel.
    try {
      const { createNotification } = await import("@/lib/server/notifications");
      const href = `/games/${result.gameSlug}/wanted`;
      await createNotification(result.issuedBy, {
        type:  "bounty_cancelled_by_mod",
        title: `Your bounty was cancelled by a moderator`,
        body:  `"${result.title}" — ${trimmed}`,
        href,
      });
      if (result.claimedBy && result.claimedBy !== result.issuedBy) {
        await createNotification(result.claimedBy, {
          type:  "bounty_cancelled_by_mod",
          title: `Bounty you claimed was cancelled`,
          body:  `"${result.title}" — ${trimmed}`,
          href,
        });
      }
    } catch (err) {
      console.error("[adminCancelBounty→notify]", err);
    }

    return { success: true };
  } catch (err) {
    console.error("[adminCancelBounty]", err);
    return { success: false, error: friendlyActionError(err, "Could not cancel bounty") };
  }
}

// ─── adminAddBountyNote ──────────────────────────────────────────────────────
//
// Mod-only internal note appended to the activity feed. Never user-visible;
// never reaches Discord. Used by mods to leave context for other mods
// (e.g. "issuer requested via DM — flagging in case of follow-up").

export async function adminAddBountyNote(bountyId: string, body: string): Promise<ActionResult> {
  try {
    const session = await getSessionWithRole();
    if (!meetsRole(session.role, "moderator")) return { success: false, error: "Forbidden" };

    const trimmed = (body ?? "").trim();
    if (!trimmed) return { success: false, error: "Note body cannot be empty" };

    const { ACTIVITY_NOTE_MAX } = await import("@/types/bounty");
    if (trimmed.length > ACTIVITY_NOTE_MAX) {
      return { success: false, error: `Note must be ${ACTIVITY_NOTE_MAX} chars or fewer` };
    }

    const { adminDb } = await import("@/lib/firebase/admin");
    // Quick existence check so we don't write notes against a deleted bounty.
    const snap = await adminDb.collection("bounties").doc(bountyId).get();
    if (!snap.exists) return { success: false, error: "Bounty not found" };

    const modSnap = await adminDb.collection("profiles").doc(session.uid).get();
    const modName = (modSnap.exists ? (modSnap.data()?.displayName as string | undefined) : undefined) ?? "Moderator";

    await appendActivity({
      bountyId,
      kind:      "note",
      actorUid:  session.uid,
      actorName: modName,
      actorRole: "mod",
      body:      trimmed,
    });

    revalidatePath("/admin/bounties");
    return { success: true };
  } catch (err) {
    console.error("[adminAddBountyNote]", err);
    return { success: false, error: friendlyActionError(err, "Could not add note") };
  }
}

// ─── Read helpers ────────────────────────────────────────────────────────────

export async function listBounties(gameSlug: GameSlug, statuses: Bounty["status"][]): Promise<Bounty[]> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    if (statuses.length === 0) return [];
    const snap = await adminDb.collection("bounties")
      .where("gameSlug", "==", gameSlug)
      .where("status",   "in", statuses)
      .orderBy("publishedAt", "desc")
      .limit(100)
      .get();
    return snap.docs.map(d => hydrate(d.id, d.data()));
  } catch (err) {
    console.error("[listBounties]", err);
    return [];
  }
}

export async function listBountiesForAdmin(): Promise<Bounty[]> {
  try {
    const session = await getSessionWithRole();
    if (!meetsRole(session.role, "moderator")) return [];
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb.collection("bounties")
      .orderBy("publishedAt", "desc")
      .limit(200)
      .get();
    return snap.docs.map(d => hydrate(d.id, d.data()));
  } catch (err) {
    console.error("[listBountiesForAdmin]", err);
    return [];
  }
}

function hydrate(id: string, data: FirebaseFirestore.DocumentData): Bounty {
  const toDate = (v: unknown): Date | undefined =>
    (v as { toDate?: () => Date } | undefined)?.toDate?.() ?? (v instanceof Date ? v : undefined);
  return {
    id,
    gameSlug:            data.gameSlug,
    title:               data.title,
    description:         data.description,
    targetDescription:   data.targetDescription,
    rewardXp:            data.rewardXp,
    status:              data.status,
    issuedBy:            data.issuedBy,
    issuedByName:        data.issuedByName,
    issuedAt:            toDate(data.issuedAt)            ?? new Date(0),
    publishedBy:         data.publishedBy,
    publishedByName:     data.publishedByName,
    publishedAt:         toDate(data.publishedAt)         ?? new Date(0),
    expiresAt:           toDate(data.expiresAt)           ?? new Date(0),
    cancelCooldownUntil: toDate(data.cancelCooldownUntil) ?? new Date(0),
    claimedBy:           data.claimedBy ?? undefined,
    claimedByName:       data.claimedByName ?? undefined,
    claimedAt:           toDate(data.claimedAt),
    resolvedBy:          data.resolvedBy ?? undefined,
    resolvedByName:      data.resolvedByName ?? undefined,
    resolvedAt:          toDate(data.resolvedAt),
    resolution:          data.resolution ?? undefined,
    resolutionReason:    data.resolutionReason ?? undefined,
    discordTicketUrl:    data.discordTicketUrl ?? null,
    evidenceUrl:         data.evidenceUrl   ?? null,
    evidenceNotes:       data.evidenceNotes ?? null,
    reclaimCooldownUntil:   toDate(data.reclaimCooldownUntil)   ?? null,
    lastRejectedHunterUid:  data.lastRejectedHunterUid ?? null,
  };
}
