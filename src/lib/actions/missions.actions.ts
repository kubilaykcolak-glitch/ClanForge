"use server";

// ─── Personal daily / weekly missions ─────────────────────────────────────────
//
// Each signed-in user gets:
//   • 3 daily missions, refreshed at UTC midnight, stored at
//     /profiles/{uid}/missions_daily/{YYYY-MM-DD}
//   • 1 weekly mission, refreshed Monday 00:00 UTC, stored at
//     /profiles/{uid}/missions_weekly/{YYYY-W##}
//
// Each doc holds the missions inline (3 for daily, 1 for weekly) with reward
// values SNAPSHOTTED from MISSION_TEMPLATES at generation time. Snapshotting
// guarantees the user gets paid the amount they were promised even if the
// pool is tuned later.
//
// Security notes — cross-reference docs/security-guidelines.md:
//   • Both read actions enforce sessionUid === uid (Audit Log §1.1).
//   • trackMissionProgress uses a session-exists gate WITHOUT uid equality
//     because it's called server-to-server for events that credit a different
//     user than the caller (e.g. reportMatchResult crediting the winner from
//     the loser's session). Same exception as awardXp. (§1.6)
//   • The `action` parameter is validated against the MissionAction enum
//     (§1.4 cross-reference allowlist).
//   • Progress always increments by +1; caller-supplied amounts are rejected
//     (§1.5).
//   • Webhook-reachable paths wrap this call in try/catch (§1.7).

import {
  MISSION_TEMPLATES,
  dailyKey,
  weeklyKey,
  msUntilNextDailyRefresh,
  msUntilNextWeeklyRefresh,
  selectDailyTemplates,
  selectWeeklyTemplate,
  isMissionAction,
  type MissionAction,
  type MissionCadence,
  type MissionTemplate,
} from "@/lib/missions";
import { getSessionUid } from "./server-auth";

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
}

// ─── Serialisable row types (Server → Client props) ───────────────────────────

export interface MissionRow {
  templateId:    string;
  action:        MissionAction;
  cadence:       MissionCadence;
  target:        number;
  progress:      number;
  xpReward:      number;
  clanXpReward:  number;
  label:         string;
  description:   string;
  icon:          string;
  completed:     boolean;
  claimedAt:     number | null;   // ms
}

export interface MissionsBundle {
  daily:                MissionRow[];
  weekly:               MissionRow | null;
  refreshDailyInMs:     number;
  refreshWeeklyInMs:    number;
}

// ─── Internals: build mission rows from a template list ───────────────────────

interface StoredMission {
  templateId:    string;
  action:        MissionAction;
  cadence:       MissionCadence;
  target:        number;
  progress:      number;
  xpReward:      number;
  clanXpReward:  number;
  label:         string;
  description:   string;
  icon:          string;
  completed:     boolean;
  claimedAt:     FirebaseFirestore.Timestamp | Date | null;
}

function templateToStoredMission(t: MissionTemplate): StoredMission {
  return {
    templateId:   t.id,
    action:       t.action,
    cadence:      t.cadence,
    target:       t.target,
    progress:     0,
    xpReward:     t.xpReward,
    clanXpReward: t.clanXpReward,
    label:        t.label,
    description:  t.description,
    icon:         t.icon,
    completed:    false,
    claimedAt:    null,
  };
}

function storedToRow(m: StoredMission): MissionRow {
  const claimed = m.claimedAt
    ? ((m.claimedAt as { toDate?: () => Date }).toDate?.() ?? (m.claimedAt as Date))
    : null;
  return {
    templateId:   m.templateId,
    action:       m.action,
    cadence:      m.cadence,
    target:       m.target,
    progress:     m.progress,
    xpReward:     m.xpReward,
    clanXpReward: m.clanXpReward,
    label:        m.label,
    description:  m.description,
    icon:         m.icon,
    completed:    m.completed,
    claimedAt:    claimed ? claimed.getTime() : null,
  };
}

// ─── Public: fetch (and lazily generate) today's & this week's missions ───────

export async function getDashboardMissions(
  uid: string,
): Promise<ActionResult<MissionsBundle>> {
  try {
    // IDOR — Audit Log §1.1. Each user reads only their own missions.
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");

    const now      = new Date();
    const dateKey  = dailyKey(now);
    const weekKey  = weeklyKey(now);

    const dailyRef  = adminDb.collection("profiles").doc(uid).collection("missions_daily").doc(dateKey);
    const weeklyRef = adminDb.collection("profiles").doc(uid).collection("missions_weekly").doc(weekKey);

    // Parallel read (existing daily + weekly). UI guidelines §2.1.
    const [dailySnap, weeklySnap] = await Promise.all([dailyRef.get(), weeklyRef.get()]);

    // Lazy generation: create today's daily doc if missing.
    // We also track whether THIS call was the one that generated it — if so,
    // it's the user's first dashboard open today and we fire the daily_login
    // mission action exactly once. The transaction's existence check guarantees
    // only one caller per day wins the generation race.
    let dailyMissions: StoredMission[];
    let dailyGeneratedThisCall = false;
    if (dailySnap.exists) {
      dailyMissions = (dailySnap.data()!.missions as StoredMission[]) ?? [];
    } else {
      const picked = selectDailyTemplates(uid, dateKey).map(templateToStoredMission);
      const txnResult = await adminDb.runTransaction(async tx => {
        const fresh = await tx.get(dailyRef);
        if (fresh.exists) {
          return { missions: (fresh.data()!.missions as StoredMission[]) ?? [], generated: false };
        }
        tx.set(dailyRef, {
          dateKey,
          generatedAt: now,
          missions:    picked,
        });
        return { missions: picked, generated: true };
      });
      dailyMissions          = txnResult.missions;
      dailyGeneratedThisCall = txnResult.generated;
    }

    // Same for the weekly doc.
    let weeklyMission: StoredMission | null;
    if (weeklySnap.exists) {
      weeklyMission = (weeklySnap.data()!.mission as StoredMission | undefined) ?? null;
    } else {
      const picked = templateToStoredMission(selectWeeklyTemplate(uid, weekKey));
      weeklyMission = await adminDb.runTransaction(async tx => {
        const fresh = await tx.get(weeklyRef);
        if (fresh.exists) return (fresh.data()!.mission as StoredMission) ?? null;
        tx.set(weeklyRef, {
          weekKey,
          generatedAt: now,
          mission:     picked,
        });
        return picked;
      });
    }

    // Fire the daily_login action exactly once per day, gated by whether the
    // daily doc was generated in THIS call. The trackMissionProgress call will
    // increment any matching daily mission (target=1, completes) and the weekly
    // streak mission (target=5, accumulates one day at a time). It's a separate
    // server-action call so its writes don't block the response — fire-and-
    // forget. We intentionally read freshly-generated state on the next render
    // rather than fold the increment into this response.
    if (dailyGeneratedThisCall) {
      // Schedule, don't await. A failure here must not break the dashboard.
      trackMissionProgress(uid, "daily_login").catch(err =>
        console.error("[getDashboardMissions→daily_login]", err),
      );
    }

    return {
      success: true,
      data: {
        daily:             dailyMissions.map(storedToRow),
        weekly:            weeklyMission ? storedToRow(weeklyMission) : null,
        refreshDailyInMs:  msUntilNextDailyRefresh(now),
        refreshWeeklyInMs: msUntilNextWeeklyRefresh(now),
      },
    };
  } catch (err) {
    console.error("[getDashboardMissions]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to load missions" };
  }
}

// ─── Public: advance progress on any matching mission ─────────────────────────
//
// Fire-and-forget from server actions or client event handlers AFTER a real
// event happens (post created, match won, tournament registered, etc.).
//
// The function:
//   1. Verifies a session exists (no uid equality — see §1.6 exception above).
//   2. Validates `action` against the MissionAction allowlist (§1.4).
//   3. Reads today's daily + this week's weekly doc.
//   4. For each mission whose action matches and isn't already completed,
//      increments progress by +1 in a transaction.
//   5. If a mission's progress crosses its target, marks it completed and
//      writes the completion timestamp atomically.
//   6. Outside the transaction, awards XP (and clan XP) via the snapshotted
//      reward amount. awardXp is once_per_target so re-firing is a no-op.

export async function trackMissionProgress(
  uid:    string,
  action: MissionAction,
): Promise<void> {
  if (!uid) return;

  try {
    // Session-exists gate only — same pattern as awardXp (§1.6).
    // Server actions like reportMatchResult call this on the WINNER's uid,
    // not the caller's. The MissionAction enum is the allowlist for what
    // can be tracked at all, so a stray call can only fire a known action.
    await getSessionUid();

    if (!isMissionAction(action)) return;

    const { adminDb } = await import("@/lib/firebase/admin");

    const now     = new Date();
    const dateKey = dailyKey(now);
    const weekKey = weeklyKey(now);

    const dailyRef  = adminDb.collection("profiles").doc(uid).collection("missions_daily").doc(dateKey);
    const weeklyRef = adminDb.collection("profiles").doc(uid).collection("missions_weekly").doc(weekKey);

    // Parallel read — missions may not exist if the user never opened the
    // dashboard today. That's fine; the action that finally generates them
    // will start at progress=0. We only increment EXISTING docs to keep this
    // fire-and-forget call cheap.
    const [dailySnap, weeklySnap] = await Promise.all([dailyRef.get(), weeklyRef.get()]);

    // ── Daily ────────────────────────────────────────────────────────────────
    const dailyCompletionsToReward: StoredMission[] = [];
    if (dailySnap.exists) {
      const dailyData = dailySnap.data() as { missions?: StoredMission[] } | undefined;
      const missions  = dailyData?.missions ?? [];
      const matchIdx  = missions.findIndex(m => m.action === action && !m.completed);

      if (matchIdx >= 0) {
        const updated = await adminDb.runTransaction(async tx => {
          const fresh = await tx.get(dailyRef);
          if (!fresh.exists) return null;
          const cur = (fresh.data()!.missions as StoredMission[]) ?? [];
          // Re-find inside the txn: state may have shifted.
          const idx = cur.findIndex(m => m.action === action && !m.completed);
          if (idx < 0) return null;
          const m   = cur[idx];
          const next: StoredMission = {
            ...m,
            progress: Math.min(m.target, (m.progress ?? 0) + 1),
          };
          if (next.progress >= next.target) {
            next.completed = true;
            next.claimedAt = now;
          }
          const newMissions = cur.slice();
          newMissions[idx]  = next;
          tx.update(dailyRef, { missions: newMissions });
          return next;
        });
        if (updated && updated.completed) dailyCompletionsToReward.push(updated);
      }
    }

    // ── Weekly ───────────────────────────────────────────────────────────────
    let weeklyCompletionToReward: StoredMission | null = null;
    if (weeklySnap.exists) {
      const data    = weeklySnap.data() as { mission?: StoredMission } | undefined;
      const mission = data?.mission;
      if (mission && mission.action === action && !mission.completed) {
        const updated = await adminDb.runTransaction(async tx => {
          const fresh = await tx.get(weeklyRef);
          if (!fresh.exists) return null;
          const cur = fresh.data()!.mission as StoredMission | undefined;
          if (!cur || cur.action !== action || cur.completed) return null;
          const next: StoredMission = {
            ...cur,
            progress: Math.min(cur.target, (cur.progress ?? 0) + 1),
          };
          if (next.progress >= next.target) {
            next.completed = true;
            next.claimedAt = now;
          }
          tx.update(weeklyRef, { mission: next });
          return next;
        });
        if (updated && updated.completed) weeklyCompletionToReward = updated;
      }
    }

    // ── Reward issuance (outside the transactions) ───────────────────────────
    // awardXp / awardClanXp are once_per_target so re-issuance is a no-op,
    // which means a slow webhook retry can't double-pay.
    if (dailyCompletionsToReward.length > 0 || weeklyCompletionToReward) {
      const { awardXp } = await import("./xp.actions");

      // Determine clan once for clan-XP awards.
      const profileSnap = await adminDb.collection("profiles").doc(uid).get();
      const clanId      = (profileSnap.data()?.clanId as string | null) ?? null;

      // Note: awardXp and awardClanXp re-read the per-user mission doc to
      // derive the actual reward amount. We just supply the targetId — the
      // amount comes from the SERVER-WRITTEN snapshot, not from this call.
      // (See xp.actions.ts and clan-xp.actions.ts for the validation.)

      // Daily completions
      for (const m of dailyCompletionsToReward) {
        const targetId = `mission:${uid}:${dateKey}:${m.templateId}`;
        try {
          await awardXp(uid, "daily_mission_complete", targetId);
        } catch (err) {
          console.error("[trackMissionProgress] daily awardXp failed", err);
        }
        if (clanId && m.clanXpReward > 0) {
          try {
            const { awardClanXp } = await import("./clan-xp.actions");
            await awardClanXp(clanId, "mission_contribute", uid, targetId);
          } catch (err) {
            console.error("[trackMissionProgress] daily awardClanXp failed", err);
          }
        }
      }

      // Weekly completion
      if (weeklyCompletionToReward) {
        const m = weeklyCompletionToReward;
        const targetId = `mission:${uid}:${weekKey}:${m.templateId}`;
        try {
          await awardXp(uid, "weekly_mission_complete", targetId);
        } catch (err) {
          console.error("[trackMissionProgress] weekly awardXp failed", err);
        }
        if (clanId && m.clanXpReward > 0) {
          try {
            const { awardClanXp } = await import("./clan-xp.actions");
            await awardClanXp(clanId, "mission_contribute", uid, targetId);
          } catch (err) {
            console.error("[trackMissionProgress] weekly awardClanXp failed", err);
          }
        }
      }
    }
  } catch (err) {
    // Non-fatal — mission tracking must never block the underlying action.
    console.error("[trackMissionProgress]", err);
  }
}

// ─── Re-export pool size for unit tests / future admin tooling ────────────────

export async function getMissionPoolSize(): Promise<ActionResult<{ daily: number; weekly: number }>> {
  return {
    success: true,
    data: {
      daily:  MISSION_TEMPLATES.filter(t => t.cadence === "daily").length,
      weekly: MISSION_TEMPLATES.filter(t => t.cadence === "weekly").length,
    },
  };
}
