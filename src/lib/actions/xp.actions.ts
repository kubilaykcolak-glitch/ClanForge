"use server";

// ─── XP server actions ────────────────────────────────────────────────────────
//
// `awardXp` is the only place XP is incremented. Call it from server actions
// (or directly from client components — Next.js routes server actions through
// a signed RPC channel, so the increment still happens server-side).
//
// Dedupe/limit logic uses the /profiles/{uid}/xp_events subcollection:
//   - once_global:     reject if ANY past event with this reason
//   - once_per_target: reject if past event with this reason + targetId
//   - daily_cap:       reject if N past events in last 24h with this reason
//
// Even when XP is NOT awarded (capped / duplicate), we record an event with
// amount=0 and capped=true so the user's audit feed shows it tried.

import { FieldValue } from "firebase-admin/firestore";
import { CLAN_JOIN_COOLDOWN_MS, XP_RULES, type XpReason } from "@/lib/xp";

export interface AwardResult {
  awarded:        number;       // 0 if capped or dedupe'd
  reason:         XpReason;
  capped?:        boolean;
  capReason?:     "once_global" | "once_per_target" | "daily_cap";
  /** Human-readable label suitable for a toast. */
  label:          string;
  /** New total XP after this award (for UI updates if useful). */
  newTotal:       number;
}

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function awardXp(
  uid:      string,
  reason:   XpReason,
  targetId?: string,
): Promise<ActionResult<AwardResult>> {
  try {
    const rule = XP_RULES[reason];
    if (!rule) return { success: false, error: `Unknown XP reason: ${reason}` };

    const { adminDb } = await import("@/lib/firebase/admin");

    const profileRef = adminDb.collection("profiles").doc(uid);
    const eventsCol  = profileRef.collection("xp_events");

    // ── Cap / dedupe check ───────────────────────────────────────────────────
    let capped: AwardResult["capped"] = false;
    let capReason: AwardResult["capReason"];

    if (rule.type === "once_global") {
      const snap = await eventsCol
        .where("reason", "==", reason)
        .where("amount", ">", 0)
        .limit(1)
        .get();
      if (!snap.empty) {
        capped = true;
        capReason = "once_global";
      }
    } else if (rule.type === "once_per_target") {
      if (!targetId) {
        return { success: false, error: `Reason "${reason}" requires a targetId` };
      }
      // Race-safe check is done inside the transaction via deterministic doc ID below.
    } else if (rule.type === "daily_cap") {
      const cap = rule.dailyCap ?? 0;
      const since = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);
      // Single-field query + JS filter avoids requiring a (reason + createdAt)
      // composite index on the xp_events subcollection.
      const snap = await eventsCol.where("reason", "==", reason).get();
      const recentCount = snap.docs.filter(d => {
        const data = d.data();
        if ((data.amount as number) <= 0) return false; // ignore prior capped attempts
        const created = data.createdAt?.toDate?.() ?? new Date(0);
        return created >= since;
      }).length;
      if (recentCount >= cap) {
        capped = true;
        capReason = "daily_cap";
      }
    }

    // ── Write event + maybe increment xp ─────────────────────────────────────
    let amount = capped ? 0 : rule.amount;
    const now  = new Date();
    // Deterministic doc ID for once_per_target so the dedup check can happen
    // inside the transaction — Firestore's optimistic locking means the second
    // concurrent call retries, reads the committed doc, and is capped.
    const eventRef = (rule.type === "once_per_target" && targetId)
      ? eventsCol.doc(`${reason}:${targetId}`)
      : eventsCol.doc();

    await adminDb.runTransaction(async tx => {
      // Race-safe once_per_target dedup: read the deterministic doc inside the
      // transaction so Firestore's optimistic locking retries the second caller.
      if (rule.type === "once_per_target" && !capped) {
        const existing = await tx.get(eventRef);
        if (existing.exists && ((existing.data()?.amount as number) ?? 0) > 0) {
          capped  = true;
          capReason = "once_per_target";
          amount  = 0;
          return; // already awarded — no writes needed
        }
      }

      tx.set(eventRef, {
        reason,
        amount,
        targetId:  targetId ?? null,
        capped,
        capReason: capReason ?? null,
        createdAt: now,
      });
      if (amount > 0) {
        tx.update(profileRef, {
          xp:        FieldValue.increment(amount),
          updatedAt: now,
        });
      }
    });

    // Fetch the new total for the response (cheap — one doc read).
    let newTotal = 0;
    try {
      const profileSnap = await profileRef.get();
      newTotal = (profileSnap.data()?.xp as number) ?? 0;
    } catch {
      // Non-fatal: total not critical for the toast.
    }

    return {
      success: true,
      data: {
        awarded:   amount,
        reason,
        capped,
        capReason,
        label:     rule.label,
        newTotal,
      },
    };
  } catch (err) {
    console.error("[awardXp]", err);
    const message = err instanceof Error ? err.message : "Could not award XP";
    return { success: false, error: message };
  }
}

// ─── Clan-join cooldown precheck ──────────────────────────────────────────────
// Called by client-side join flows (ClanActions, ClanCardJoinButton) before
// they perform the Firestore write. The server-side joinClan action enforces
// this too as a backstop, but pre-checking gives a clean error message
// without partial side-effects.

export interface ClanJoinCheckResult {
  allowed:       boolean;
  hoursLeft?:    number;
  message?:      string;
}

export async function checkClanJoinAllowed(uid: string): Promise<ActionResult<ClanJoinCheckResult>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb.collection("profiles").doc(uid).get();
    const lastLeaveAt = snap.data()?.lastClanLeaveAt?.toDate?.() ?? null;

    if (!lastLeaveAt) {
      return { success: true, data: { allowed: true } };
    }

    const elapsed = Date.now() - lastLeaveAt.getTime();
    if (elapsed >= CLAN_JOIN_COOLDOWN_MS) {
      return { success: true, data: { allowed: true } };
    }

    const hoursLeft = Math.ceil((CLAN_JOIN_COOLDOWN_MS - elapsed) / (60 * 60 * 1000));
    return {
      success: true,
      data: {
        allowed:   false,
        hoursLeft,
        message:   `You can join another clan in about ${hoursLeft}h.`,
      },
    };
  } catch (err) {
    console.error("[checkClanJoinAllowed]", err);
    const message = err instanceof Error ? err.message : "Could not check clan cooldown";
    return { success: false, error: message };
  }
}
