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
  type Bounty,
} from "@/types/bounty";
import type { GameSlug } from "@/lib/games/types";
import { friendlyActionError } from "./_errors";

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
    return { success: true, data: { id: docRef.id } };
  } catch (err) {
    console.error("[adminPublishBounty]", err);
    return { success: false, error: friendlyActionError(err, "Could not publish bounty") };
  }
}

export async function claimBounty(bountyId: string): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    const { adminDb } = await import("@/lib/firebase/admin");
    const ref  = adminDb.collection("bounties").doc(bountyId);

    await adminDb.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Bounty not found");
      const data = snap.data() as Bounty;
      if (data.status !== "open") throw new Error("Bounty is not open");
      if (data.issuedBy === sessionUid) throw new Error("You cannot claim your own bounty");
      // Auto-expire on read if past expiry.
      if (data.expiresAt instanceof Date ? data.expiresAt < new Date() : false) {
        tx.update(ref, { status: "expired" });
        throw new Error("Bounty has expired");
      }

      const profSnap = await tx.get(adminDb.collection("profiles").doc(sessionUid));
      const hunterName = (profSnap.exists ? (profSnap.data()?.displayName as string | undefined) : undefined) ?? "Hunter";

      tx.update(ref, {
        status:        "claimed",
        claimedBy:     sessionUid,
        claimedByName: hunterName,
        claimedAt:     new Date(),
      });
    });

    revalidatePath("/games/arc-raiders/wanted");
    revalidatePath("/admin/bounties");
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
        // Rejected: bounce back to open so another hunter can claim.
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
        });
      }

      return { hunterUid, rewardXp: data.rewardXp, gameSlug: data.gameSlug };
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
    });

    revalidatePath("/games/arc-raiders/wanted");
    revalidatePath("/admin/bounties");
    return { success: true };
  } catch (err) {
    console.error("[cancelBounty]", err);
    return { success: false, error: friendlyActionError(err, "Could not cancel bounty") };
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
  };
}
