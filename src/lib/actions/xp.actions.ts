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
import { getSessionUid, requireAuthContext } from "./server-auth";

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
    // Auth-exists gate: caller must be a signed-in user OR running inside a
    // verified webhook context (Stripe). The function is also called from
    // server actions that award XP to other users (e.g. reportMatchResult
    // awarding XP to the match winner, finalizeTournament awarding placement
    // XP) — those flows do have a session. The webhook context bypass exists
    // specifically for confirmPaidParticipant fired from the Stripe handler,
    // where there is no session cookie. The XP rule caps/dedup provide the
    // second layer of defence against abuse.
    await requireAuthContext();

    const rule = XP_RULES[reason];
    if (!rule) return { success: false, error: `Unknown XP reason: ${reason}` };

    const { adminDb } = await import("@/lib/firebase/admin");

    const profileRef = adminDb.collection("profiles").doc(uid);
    const eventsCol  = profileRef.collection("xp_events");

    // ── Mission-reward derivation ────────────────────────────────────────────
    // For mission completion reasons, the amount is NOT taken from rule.amount
    // or any caller-supplied value. It's read from the user's server-only-
    // written mission doc, using the targetId to identify which mission. This
    // prevents an attacker from calling awardXp directly with a synthesized
    // targetId and inflating their XP — they would need a real completed
    // mission in their own doc, which only trackMissionProgress can produce.
    // (See docs/security-guidelines.md §1.5 amount inflation.)
    let missionDerivedAmount: number | null = null;
    if (reason === "daily_mission_complete" || reason === "weekly_mission_complete") {
      const parts = (targetId ?? "").split(":");
      if (parts.length !== 4 || parts[0] !== "mission" || parts[1] !== uid) {
        return { success: false, error: "Invalid mission targetId format" };
      }
      const key        = parts[2];
      const templateId = parts[3];
      const cadenceCol = reason === "daily_mission_complete" ? "missions_daily" : "missions_weekly";
      const missionDoc = await adminDb
        .collection("profiles").doc(uid)
        .collection(cadenceCol).doc(key)
        .get();
      if (!missionDoc.exists) return { success: false, error: "Mission doc not found" };
      const data = missionDoc.data()!;
      type MinMission = { templateId: string; xpReward: number; completed: boolean };
      let m: MinMission | undefined;
      if (cadenceCol === "missions_daily") {
        const list = (data.missions as MinMission[]) ?? [];
        m = list.find(x => x.templateId === templateId);
      } else {
        const single = data.mission as MinMission | undefined;
        if (single && single.templateId === templateId) m = single;
      }
      if (!m || !m.completed) {
        return { success: false, error: "Mission not completed in user doc" };
      }
      // Hard cap defends against future template tuning errors.
      missionDerivedAmount = Math.max(0, Math.min(Math.floor(m.xpReward), 1000));
    }

    // ── Clan-mission contributor bonus derivation ────────────────────────────
    // For `clan_mission_contribute`, the amount comes from the snapshotted
    // memberXpReward on the per-CLAN mission doc, not from any caller value.
    // The targetId encodes (clanId, key, templateId, uid). We:
    //   1. Verify the uid in the targetId matches the recipient `uid` param.
    //   2. Read the clan mission doc.
    //   3. Verify the mission exists, is completed, and the recipient is in
    //      its `contributors` map (proves they actually participated).
    //   4. Derive amount from the snapshot.
    // Same protection class as the personal-mission validation above.
    if (reason === "clan_mission_contribute") {
      const parts = (targetId ?? "").split(":");
      if (parts.length !== 5 || parts[0] !== "clan_mission" || parts[4] !== uid) {
        return { success: false, error: "Invalid clan mission targetId format" };
      }
      const clanId     = parts[1];
      const key        = parts[2];
      const templateId = parts[3];
      const isWeekly   = key.includes("W");
      const cadenceCol = isWeekly ? "clan_missions_weekly" : "clan_missions_daily";
      const missionDoc = await adminDb
        .collection("clans").doc(clanId)
        .collection(cadenceCol).doc(key)
        .get();
      if (!missionDoc.exists) return { success: false, error: "Clan mission doc not found" };
      const data = missionDoc.data()!;
      type MinClanMission = {
        templateId:    string;
        memberXpReward: number;
        completed:     boolean;
        contributors?: Record<string, number>;
      };
      let m: MinClanMission | undefined;
      if (cadenceCol === "clan_missions_daily") {
        const list = (data.missions as MinClanMission[]) ?? [];
        m = list.find(x => x.templateId === templateId);
      } else {
        const single = data.mission as MinClanMission | undefined;
        if (single && single.templateId === templateId) m = single;
      }
      if (!m || !m.completed) {
        return { success: false, error: "Clan mission not completed" };
      }
      // The recipient must actually be a contributor — proves participation.
      if (!m.contributors || !(uid in m.contributors)) {
        return { success: false, error: "User not a contributor to this mission" };
      }
      missionDerivedAmount = Math.max(0, Math.min(Math.floor(m.memberXpReward), 500));
    }

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
    // For mission reasons the amount comes from the server-validated mission
    // doc above; for all other reasons it comes from XP_RULES (no caller
    // override). This keeps the public surface caller-amount-free.
    const baseAmount = missionDerivedAmount !== null ? missionDerivedAmount : rule.amount;
    let amount = capped ? 0 : baseAmount;
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
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

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
