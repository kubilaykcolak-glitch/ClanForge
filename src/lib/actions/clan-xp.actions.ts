"use server";

// ─── Clan XP server actions ────────────────────────────────────────────────────
//
// awardClanXp      — increment a clan's XP, log the event, detect level-ups
// awardClanXpForMember — convenience wrapper: looks up the caller's clanId
// getClanXpFeed    — returns recent XP events for the activity feed

import { FieldValue } from "firebase-admin/firestore";
import { getClanLevel, getClanBorderSlug, CLAN_LEVELS } from "@/lib/clan-levels";
import { requireAuthContext } from "./server-auth";

// ── XP rule definitions ───────────────────────────────────────────────────────

export type ClanXpReason =
  | "member_join"
  | "post_created"
  | "tournament_participate"
  | "tournament_win"
  | "challenge_complete"
  | "member_recruited"
  | "mission_contribute"
  | "clan_mission_complete";

export type ClanXpRuleType =
  | "per_event"       // always fires, no dedup
  | "daily_cap"       // max N events per clan per 24h
  | "once_per_target" // fires once per clanId + reason + targetId combo

export interface ClanXpRule {
  reason:    ClanXpReason;
  amount:    number;
  type:      ClanXpRuleType;
  dailyCap?: number;
  label:     string;
}

const CLAN_XP_RULES: Record<ClanXpReason, ClanXpRule> = {
  member_join:            { reason: "member_join",            amount:  50,  type: "once_per_target", label: "New member joined"              },
  post_created:           { reason: "post_created",           amount:  20,  type: "daily_cap", dailyCap: 3, label: "Clan post published"      },
  tournament_participate: { reason: "tournament_participate",  amount: 100,  type: "once_per_target", label: "Tournament entry"              },
  tournament_win:         { reason: "tournament_win",          amount: 500,  type: "once_per_target", label: "Tournament victory"            },
  challenge_complete:     { reason: "challenge_complete",      amount:   0,  type: "once_per_target", label: "Challenge completed"           },
  member_recruited:       { reason: "member_recruited",        amount:  75,  type: "once_per_target", label: "Member recruited"              },
  // Amount=0 here — actual amount is always passed via overrideAmount from the
  // snapshotted clanXpReward on the per-user mission doc. once_per_target keyed
  // by `<uid>:<dateKey or weekKey>:<templateId>` so a single mission can only
  // contribute clan XP once even if trackMissionProgress fires multiple times.
  mission_contribute:     { reason: "mission_contribute",      amount:   0,  type: "once_per_target", label: "Mission contribution"           },
  // Amount=0 — actual amount derived from the snapshotted clanXpReward on the
  // per-clan mission doc inside awardClanXp's validation block below. once_per_target
  // keyed by `clan_mission:<clanId>:<dateKey|weekKey>:<templateId>` so a completed
  // mission can only award clan XP once.
  clan_mission_complete:  { reason: "clan_mission_complete",   amount:   0,  type: "once_per_target", label: "Clan mission completed"        },
};

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// ── Serialisable types ────────────────────────────────────────────────────────

export interface ClanXpEventRow {
  id:            string;
  reason:        ClanXpReason;
  amount:        number;
  contributorUid: string;
  targetId:      string | null;
  label:         string;
  createdAt:     number;  // ms
}

export interface ClanXpAwardResult {
  awarded:    number;
  capped:     boolean;
  reason:     ClanXpReason;
  label:      string;
  newTotal:   number;
  leveledUp:  boolean;
  newLevel:   number;
}

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
}

// ── awardClanXp ───────────────────────────────────────────────────────────────

export async function awardClanXp(
  clanId:          string,
  reason:          ClanXpReason,
  contributorUid:  string,
  targetId?:       string,
  /** Override the rule's default amount (used by challenge_complete). */
  overrideAmount?: number,
): Promise<ActionResult<ClanXpAwardResult>> {
  if (!clanId || !contributorUid) {
    return { success: false, error: "Missing clanId or contributorUid" };
  }

  try {
    // Auth-exists gate: signed-in user OR verified webhook context. Same
    // reasoning as awardXp — cross-user awards happen from server actions
    // that do have a session; the webhook bypass is for confirmPaidParticipant
    // firing from Stripe's signed payload where no session cookie exists.
    await requireAuthContext();

    const { adminDb } = await import("@/lib/firebase/admin");
    const rule = CLAN_XP_RULES[reason];
    if (!rule) return { success: false, error: `Unknown ClanXpReason: ${reason}` };

    // ── Mission-reward derivation ──────────────────────────────────────────
    // For mission_contribute the amount comes from the server-only-written
    // per-user mission doc, NOT the caller. Mirrors the same protection added
    // to awardXp for daily_/weekly_mission_complete reasons. The caller may
    // not supply an arbitrary overrideAmount for this reason — even though
    // the rule is once_per_target, an attacker could grind unique synthesized
    // targetIds to inflate clan XP. (See docs/security-guidelines.md §1.5.)
    let missionDerivedAmount: number | null = null;
    if (reason === "mission_contribute") {
      const parts = (targetId ?? "").split(":");
      if (parts.length !== 4 || parts[0] !== "mission" || parts[1] !== contributorUid) {
        return { success: false, error: "Invalid mission targetId format" };
      }
      const key        = parts[2];
      const templateId = parts[3];
      // Cadence is inferred from the key shape: daily keys are YYYY-MM-DD
      // (contains two '-'), weekly keys are YYYY-W## (contains 'W').
      const isWeekly   = key.includes("W");
      const cadenceCol = isWeekly ? "missions_weekly" : "missions_daily";
      const missionDoc = await adminDb
        .collection("profiles").doc(contributorUid)
        .collection(cadenceCol).doc(key)
        .get();
      if (!missionDoc.exists) return { success: false, error: "Mission doc not found" };
      const data = missionDoc.data()!;
      type MinMission = { templateId: string; clanXpReward: number; completed: boolean };
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
      missionDerivedAmount = Math.max(0, Math.min(Math.floor(m.clanXpReward), 500));
    }

    // ── Clan-mission completion derivation ─────────────────────────────────
    // For `clan_mission_complete` the amount comes from the snapshotted
    // clanXpReward on the per-CLAN mission doc. The targetId encodes
    // (clanId, key, templateId). We verify:
    //   1. The clanId in the targetId matches the recipient `clanId` param.
    //   2. The clan mission doc exists with this templateId.
    //   3. The mission is completed.
    // The caller cannot fire this on a fake mission — only trackClanMissionProgress
    // sets `completed: true` after a transactional progress check.
    if (reason === "clan_mission_complete") {
      const parts = (targetId ?? "").split(":");
      if (parts.length !== 4 || parts[0] !== "clan_mission" || parts[1] !== clanId) {
        return { success: false, error: "Invalid clan mission targetId format" };
      }
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
      type MinClanMission = { templateId: string; clanXpReward: number; completed: boolean };
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
      missionDerivedAmount = Math.max(0, Math.min(Math.floor(m.clanXpReward), 1000));
    }

    const amount   = missionDerivedAmount !== null
      ? missionDerivedAmount
      : (overrideAmount ?? rule.amount);
    const clanRef   = adminDb.collection("clans").doc(clanId);
    const eventsCol = clanRef.collection("xp_events");
    const now       = new Date();

    // ── Cap / dedup check ─────────────────────────────────────────────────────
    let capped = false;

    if (rule.type === "once_per_target") {
      if (!targetId) {
        return { success: false, error: `Reason "${reason}" requires a targetId` };
      }
      // Race-safe check is done inside the transaction via deterministic doc ID below.
    } else if (rule.type === "daily_cap") {
      const cap   = rule.dailyCap ?? 1;
      const since = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);
      const snap  = await eventsCol.where("reason", "==", reason).get();
      const recentCount = snap.docs.filter(d => {
        const data = d.data();
        if ((data.amount as number) <= 0) return false;
        const created = data.createdAt?.toDate?.() ?? new Date(0);
        return created >= since;
      }).length;
      if (recentCount >= cap) capped = true;
    }
    // per_event: never capped

    let effectiveAmount = capped ? 0 : amount;

    // Deterministic doc ID for once_per_target — concurrent calls can't both slip
    // through; the second retries, reads the committed doc, and is capped.
    const eventRef = (rule.type === "once_per_target" && targetId)
      ? eventsCol.doc(`${reason}:${targetId}`)
      : eventsCol.doc();

    // ── Transaction: log event + increment XP + detect level-up ──────────────
    let newTotal = 0;
    let oldLevel = 0;
    let newLevel = 0;

    await adminDb.runTransaction(async tx => {
      // Race-safe once_per_target dedup inside transaction
      if (rule.type === "once_per_target" && !capped) {
        const existing = await tx.get(eventRef);
        if (existing.exists && ((existing.data()?.amount as number) ?? 0) > 0) {
          capped          = true;
          effectiveAmount = 0;
          return; // already awarded — no writes needed
        }
      }

      const clanSnap = await tx.get(clanRef);
      if (!clanSnap.exists) throw new Error("Clan not found");

      const currentXp = (clanSnap.data()!.xp as number) ?? 0;
      oldLevel = getClanLevel(currentXp).level;
      newTotal = currentXp + effectiveAmount;
      newLevel = getClanLevel(newTotal).level;

      tx.set(eventRef, {
        reason,
        amount:         effectiveAmount,
        capped,
        contributorUid,
        targetId:       targetId ?? null,
        label:          rule.label,
        createdAt:      now,
      });

      // Increment XP and (if changed) denorm the level
      if (effectiveAmount > 0) {
        const updates: Record<string, unknown> = {
          xp:        FieldValue.increment(effectiveAmount),
          updatedAt: now,
        };
        if (newLevel !== oldLevel) {
          updates.level = newLevel;
        }
        tx.update(clanRef, updates);

        // Keep clan_points.clanXp in sync for leaderboard level badges
        const pointsRef = adminDb.collection("clan_points").doc(clanId);
        const pointsSnap = await tx.get(pointsRef);
        if (pointsSnap.exists) {
          tx.update(pointsRef, { clanXp: FieldValue.increment(effectiveAmount) });
        }
      }
    });

    // ── Level-up side-effects (outside transaction) ───────────────────────────
    const leveledUp = newLevel > oldLevel && effectiveAmount > 0;
    if (leveledUp) {
      // Enforce the highest member_cap perk accumulated up to the new level
      const highestCap = CLAN_LEVELS
        .filter(d => d.level <= newLevel)
        .flatMap(d => d.perks)
        .filter(p => p.type === "member_cap")
        .reduce((max, p) => Math.max(max, typeof p.value === "number" ? p.value : 0), 0);

      if (highestCap > 0) {
        adminDb.collection("clans").doc(clanId)
          .update({ memberLimit: highestCap })
          .catch(() => {});
      }

      // If the new level crosses a border threshold, update all members' profiles
      const oldBorder = getClanBorderSlug(oldLevel);
      const newBorder = getClanBorderSlug(newLevel);
      if (newBorder !== oldBorder) {
        _applyBorderToAllMembers(adminDb, clanId, newBorder).catch(() => {});
      }

      await _sendLevelUpNotifications(clanId, newLevel).catch(() => {});
    }

    return {
      success: true,
      data: {
        awarded:   effectiveAmount,
        capped,
        reason,
        label:     rule.label,
        newTotal,
        leveledUp,
        newLevel,
      },
    };
  } catch (err) {
    console.error("[awardClanXp]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to award clan XP" };
  }
}

// ── awardClanXpForMember ──────────────────────────────────────────────────────
// Convenience wrapper for client components: looks up the user's clan and
// calls awardClanXp. Fire-and-forget — errors are swallowed.

export async function awardClanXpForMember(
  uid:      string,
  reason:   ClanXpReason,
  targetId?: string,
  overrideAmount?: number,
): Promise<void> {
  if (!uid) return;
  try {
    // Auth-exists gate: signed-in user OR verified webhook context.
    await requireAuthContext();

    const { adminDb } = await import("@/lib/firebase/admin");
    const profileSnap = await adminDb.collection("profiles").doc(uid).get();
    const clanId = profileSnap.data()?.clanId as string | null | undefined;
    if (!clanId) return;
    await awardClanXp(clanId, reason, uid, targetId, overrideAmount);
  } catch (err) {
    console.error("[awardClanXpForMember]", err);
  }
}

// ── getClanXpFeed ─────────────────────────────────────────────────────────────

export async function getClanXpFeed(
  clanId: string,
  limit = 10,
): Promise<ActionResult<ClanXpEventRow[]>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb
      .collection("clans").doc(clanId)
      .collection("xp_events")
      .where("amount", ">", 0)
      .orderBy("amount")   // needed for the inequality filter field to come first
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    // Re-sort by createdAt desc (Firestore requires the inequality field first)
    const rows: ClanXpEventRow[] = snap.docs
      .map(d => {
        const data = d.data();
        return {
          id:             d.id,
          reason:         data.reason        as ClanXpReason,
          amount:         data.amount        as number,
          contributorUid: data.contributorUid as string,
          targetId:       (data.targetId     as string | null) ?? null,
          label:          data.label         as string,
          createdAt:      (data.createdAt?.toDate?.()?.getTime()) ?? Date.now(),
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    return { success: true, data: rows };
  } catch (err) {
    console.error("[getClanXpFeed]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to load XP feed" };
  }
}

// ── Border batch-update helper ────────────────────────────────────────────────
// Fired when a clan crosses a border threshold (Level 4 or Level 9).
// Writes the new border slug (or null) to every active member's profile doc.

async function _applyBorderToAllMembers(
  adminDb: FirebaseFirestore.Firestore,
  clanId:  string,
  border:  string | null,
): Promise<void> {
  const membersSnap = await adminDb
    .collection("clans").doc(clanId)
    .collection("members")
    .where("role", "in", ["leader", "officer", "member"])
    .get();

  if (membersSnap.empty) return;

  // Firestore batch limit is 500 writes — clans top out at 100 members so one
  // batch is always sufficient here.
  const batch = adminDb.batch();
  for (const m of membersSnap.docs) {
    const profileRef = adminDb.collection("profiles").doc(m.id);
    batch.update(profileRef, { clanBorder: border ?? null });
  }
  await batch.commit();
}

// ── Level-up notification helper ──────────────────────────────────────────────

async function _sendLevelUpNotifications(clanId: string, newLevel: number): Promise<void> {
  try {
    const { adminDb }            = await import("@/lib/firebase/admin");
    const { CLAN_LEVELS }        = await import("@/lib/clan-levels");
    const { createNotification } = await import("@/lib/server/notifications");
    const def = CLAN_LEVELS.find(d => d.level === newLevel);
    const tierName = def ? `${def.icon} ${def.name}` : `Level ${newLevel}`;

    // Notify leader + officers
    const membersSnap = await adminDb
      .collection("clans").doc(clanId)
      .collection("members")
      .where("role", "in", ["leader", "officer"])
      .get();

    await Promise.all(
      membersSnap.docs.map(m =>
        createNotification(m.id, {
          type:        "clan_level_up",
          title:       `Clan reached Level ${newLevel}!`,
          body:        `Your clan is now ${tierName}. Check what new perks have been unlocked.`,
          href:        `/clans`,
          clanId,
          challengeId: null,
        }),
      ),
    );
  } catch (err) {
    console.error("[_sendLevelUpNotifications]", err);
  }
}
