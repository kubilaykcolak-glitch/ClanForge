"use server";

// ─── Lightweight clan-collaborative missions ──────────────────────────────────
//
// Each clan gets:
//   • 3 daily missions, refreshed at UTC midnight, stored at
//     /clans/{clanId}/clan_missions_daily/{YYYY-MM-DD}
//   • 1 weekly mission, refreshed Monday 00:00 UTC, stored at
//     /clans/{clanId}/clan_missions_weekly/{YYYY-W##}
//
// Member contributions are tracked via a `contributors` map (uid → count) on
// each mission. On completion:
//   • The clan receives the snapshotted clanXpReward (via awardClanXp with
//     reason "clan_mission_complete").
//   • EVERY contributor receives the snapshotted memberXpReward (via awardXp
//     with reason "clan_mission_contribute"). Both reasons re-read the
//     server-only-written mission doc to derive amounts — see xp.actions.ts
//     and clan-xp.actions.ts for the validation blocks.
//
// Action pool is deliberately high-effort and externally validated. No
// likes / posts / comments — see docs/security-guidelines.md §1.5.
//
// Security notes — cross-reference docs/security-guidelines.md:
//   • getClanMissions: sessionUid === uid AND uid is an active clan member
//     (Audit Log §1.1 + cross-clan IDOR defence).
//   • trackClanMissionProgress: session-exists gate (§1.6 cross-user, same as
//     awardXp) PLUS verification that contributorUid is a member of clanId so
//     no one can credit-spam another clan.
//   • action parameter validated against ClanMissionAction enum (§1.4).
//   • Progress always increments by +1 (§1.5).
//   • Webhook-reachable callers wrap this in try/catch (§1.7).

import {
  dailyKey,
  weeklyKey,
  msUntilNextDailyRefresh,
  msUntilNextWeeklyRefresh,
  selectDailyTemplates,
  selectWeeklyTemplate,
  isClanMissionAction,
  type ClanMissionAction,
  type ClanMissionCadence,
  type ClanMissionTemplate,
} from "@/lib/clan-missions";
import { getSessionUid, requireAuthContext } from "./server-auth";

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
}

// ─── Serialisable row types ───────────────────────────────────────────────────

export interface ClanMissionRow {
  templateId:     string;
  action:         ClanMissionAction;
  cadence:        ClanMissionCadence;
  target:         number;
  progress:       number;
  clanXpReward:   number;
  memberXpReward: number;
  label:          string;
  description:    string;
  icon:           string;
  completed:      boolean;
  completedAt:    number | null;
  contributorCount: number;        // how many unique members have contributed
}

export interface ClanMissionsBundle {
  daily:                ClanMissionRow[];
  weekly:               ClanMissionRow | null;
  refreshDailyInMs:     number;
  refreshWeeklyInMs:    number;
}

// ─── Internal stored shape ────────────────────────────────────────────────────

interface StoredClanMission {
  templateId:     string;
  action:         ClanMissionAction;
  cadence:        ClanMissionCadence;
  target:         number;
  progress:       number;
  clanXpReward:   number;
  memberXpReward: number;
  label:          string;
  description:    string;
  icon:           string;
  completed:      boolean;
  completedAt:    FirebaseFirestore.Timestamp | Date | null;
  /** uid → number of contributions. Map written via FieldValue.increment. */
  contributors:   Record<string, number>;
}

function templateToStored(t: ClanMissionTemplate): StoredClanMission {
  return {
    templateId:     t.id,
    action:         t.action,
    cadence:        t.cadence,
    target:         t.target,
    progress:       0,
    clanXpReward:   t.clanXpReward,
    memberXpReward: t.memberXpReward,
    label:          t.label,
    description:    t.description,
    icon:           t.icon,
    completed:      false,
    completedAt:    null,
    contributors:   {},
  };
}

function storedToRow(m: StoredClanMission): ClanMissionRow {
  const completedAt = m.completedAt
    ? ((m.completedAt as { toDate?: () => Date }).toDate?.() ?? (m.completedAt as Date))
    : null;
  return {
    templateId:       m.templateId,
    action:           m.action,
    cadence:          m.cadence,
    target:           m.target,
    progress:         m.progress,
    clanXpReward:     m.clanXpReward,
    memberXpReward:   m.memberXpReward,
    label:            m.label,
    description:      m.description,
    icon:             m.icon,
    completed:        m.completed,
    completedAt:      completedAt ? completedAt.getTime() : null,
    contributorCount: Object.keys(m.contributors ?? {}).length,
  };
}

// ─── Internal: verify the caller is an active member of the clan ──────────────

async function _assertMember(adminDb: FirebaseFirestore.Firestore, clanId: string, uid: string): Promise<boolean> {
  const memberSnap = await adminDb.collection("clans").doc(clanId).collection("members").doc(uid).get();
  return memberSnap.exists;
}

// ─── Lazy-generation helpers (race-safe via transaction) ──────────────────────
// trackClanMissionProgress must NEVER silently no-op because a mission doc
// doesn't exist yet. If a clan member wins a match before any member has
// opened the clan page today, the daily doc wouldn't exist — and the action
// would have been lost. These helpers ensure the doc exists, generating from
// the deterministic seeded shuffle if needed.

async function _ensureClanDailyDoc(
  adminDb: FirebaseFirestore.Firestore,
  clanId:  string,
  dateKey: string,
  now:     Date,
): Promise<StoredClanMission[]> {
  const dailyRef = adminDb.collection("clans").doc(clanId).collection("clan_missions_daily").doc(dateKey);
  const snap = await dailyRef.get();
  if (snap.exists) return (snap.data()!.missions as StoredClanMission[]) ?? [];

  const picked = selectDailyTemplates(clanId, dateKey).map(templateToStored);
  return adminDb.runTransaction(async tx => {
    const fresh = await tx.get(dailyRef);
    if (fresh.exists) return (fresh.data()!.missions as StoredClanMission[]) ?? [];
    tx.set(dailyRef, { dateKey, generatedAt: now, missions: picked });
    return picked;
  });
}

async function _ensureClanWeeklyDoc(
  adminDb: FirebaseFirestore.Firestore,
  clanId:  string,
  weekKey: string,
  now:     Date,
): Promise<StoredClanMission | null> {
  const weeklyRef = adminDb.collection("clans").doc(clanId).collection("clan_missions_weekly").doc(weekKey);
  const snap = await weeklyRef.get();
  if (snap.exists) return (snap.data()!.mission as StoredClanMission | undefined) ?? null;

  const picked = templateToStored(selectWeeklyTemplate(clanId, weekKey));
  return adminDb.runTransaction(async tx => {
    const fresh = await tx.get(weeklyRef);
    if (fresh.exists) return (fresh.data()!.mission as StoredClanMission) ?? null;
    tx.set(weeklyRef, { weekKey, generatedAt: now, mission: picked });
    return picked;
  });
}

// ─── Public: fetch (and lazily generate) the clan's daily + weekly missions ───

export async function getClanMissions(
  clanId: string,
  uid:    string,
): Promise<ActionResult<ClanMissionsBundle>> {
  try {
    // §1.1 IDOR — caller must be the user they claim.
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");

    // Cross-clan IDOR defence — only members can read the clan's mission doc.
    const isMember = await _assertMember(adminDb, clanId, uid);
    if (!isMember) return { success: false, error: "Forbidden" };

    const now      = new Date();
    const dateKey  = dailyKey(now);
    const weekKey  = weeklyKey(now);

    // Parallel ensure-exists. UI guidelines §2.1.
    let [dailyMissions, weeklyMission] = await Promise.all([
      _ensureClanDailyDoc(adminDb, clanId, dateKey, now),
      _ensureClanWeeklyDoc(adminDb, clanId, weekKey, now),
    ]);

    // ── Member-active-day fire point ─────────────────────────────────────────
    // Dedup per (uid, dateKey) via a `lastClanActiveDate` field on the profile.
    // Each member can advance at most once per day regardless of how many times
    // they refresh the page. Awaited (not fire-and-forget) so the session
    // context is alive when trackClanMissionProgress runs its own session check.
    const profileRef = adminDb.collection("profiles").doc(uid);
    const shouldFireActive = await adminDb.runTransaction(async tx => {
      const snap = await tx.get(profileRef);
      const last = (snap.data()?.lastClanActiveDate as string | undefined) ?? null;
      if (last === dateKey) return false;
      tx.update(profileRef, { lastClanActiveDate: dateKey });
      return true;
    });
    if (shouldFireActive) {
      try {
        await trackClanMissionProgress("member_active_day", uid, clanId);
        // Re-read so the response reflects the increment immediately.
        [dailyMissions, weeklyMission] = await Promise.all([
          _ensureClanDailyDoc(adminDb, clanId, dateKey, now),
          _ensureClanWeeklyDoc(adminDb, clanId, weekKey, now),
        ]);
      } catch (err) {
        console.error("[getClanMissions→member_active_day]", err);
      }
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
    console.error("[getClanMissions]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to load clan missions" };
  }
}

// ─── Public: advance progress on a matching mission ───────────────────────────
//
// Called from existing server actions AFTER a real event happens. Each call:
//   1. Session-exists gate (§1.6 cross-user).
//   2. Validates `action` against the enum allowlist (§1.4).
//   3. If clanId is omitted, derives it from the contributor's profile.
//   4. Verifies the contributor is a member of the resolved clan (anti
//      cross-clan abuse).
//   5. For each matching, not-yet-completed mission (daily + weekly):
//      a. In a transaction, increments progress by +1 and adds the contributor
//         to the `contributors` map (FieldValue.increment, per-uid).
//      b. If progress crosses the target, marks completed + completedAt.
//   6. Outside the transaction, awards rewards:
//      - Clan XP via awardClanXp (clan_mission_complete) — once per mission.
//      - Member XP via awardXp (clan_mission_contribute) — one per contributor.
//      Both rewards are once_per_target so re-firing is a no-op.

export async function trackClanMissionProgress(
  action:         ClanMissionAction,
  contributorUid: string,
  clanId?:        string,
): Promise<void> {
  if (!contributorUid) return;

  try {
    // Auth-exists gate (§1.6): signed-in user OR webhook context. See
    // trackMissionProgress for the same reasoning.
    await requireAuthContext();
    if (!isClanMissionAction(action)) return;

    const { adminDb } = await import("@/lib/firebase/admin");

    // Resolve clanId if not passed in.
    let resolvedClanId = clanId;
    if (!resolvedClanId) {
      const profileSnap = await adminDb.collection("profiles").doc(contributorUid).get();
      const fromProfile = (profileSnap.data()?.clanId as string | null) ?? null;
      if (!fromProfile) return;
      resolvedClanId = fromProfile;
    }

    // Anti-cross-clan: contributor must actually be a member of the resolved clan.
    const member = await _assertMember(adminDb, resolvedClanId, contributorUid);
    if (!member) return;

    const now     = new Date();
    const dateKey = dailyKey(now);
    const weekKey = weeklyKey(now);

    const dailyRef  = adminDb.collection("clans").doc(resolvedClanId).collection("clan_missions_daily").doc(dateKey);
    const weeklyRef = adminDb.collection("clans").doc(resolvedClanId).collection("clan_missions_weekly").doc(weekKey);

    // Lazy-generate both docs if missing. Critical: previously this function
    // only acted on existing docs, so any event (match win, top place, etc.)
    // firing BEFORE any clan member opened the clan page that day would be
    // silently dropped. We now always ensure the doc exists before incrementing.
    await Promise.all([
      _ensureClanDailyDoc(adminDb, resolvedClanId, dateKey, now),
      _ensureClanWeeklyDoc(adminDb, resolvedClanId, weekKey, now),
    ]);

    const [dailySnap, weeklySnap] = await Promise.all([dailyRef.get(), weeklyRef.get()]);

    // ── Daily ────────────────────────────────────────────────────────────────
    const dailyCompletions: { mission: StoredClanMission; templateId: string }[] = [];
    if (dailySnap.exists) {
      const dailyData = dailySnap.data() as { missions?: StoredClanMission[] } | undefined;
      const idx = (dailyData?.missions ?? []).findIndex(m => m.action === action && !m.completed);
      if (idx >= 0) {
        const updated = await adminDb.runTransaction(async tx => {
          const fresh = await tx.get(dailyRef);
          if (!fresh.exists) return null;
          const cur = (fresh.data()!.missions as StoredClanMission[]) ?? [];
          const curIdx = cur.findIndex(m => m.action === action && !m.completed);
          if (curIdx < 0) return null;
          const m = cur[curIdx];
          const newMissions = cur.slice();
          const nextProgress = Math.min(m.target, (m.progress ?? 0) + 1);
          const next: StoredClanMission = {
            ...m,
            progress:     nextProgress,
            contributors: { ...(m.contributors ?? {}), [contributorUid]: ((m.contributors ?? {})[contributorUid] ?? 0) + 1 },
          };
          if (nextProgress >= m.target) {
            next.completed   = true;
            next.completedAt = now;
          }
          newMissions[curIdx] = next;
          tx.update(dailyRef, { missions: newMissions });
          return next;
        });
        if (updated && updated.completed) {
          dailyCompletions.push({ mission: updated, templateId: updated.templateId });
        }
      }
    }

    // ── Weekly ───────────────────────────────────────────────────────────────
    let weeklyCompletion: { mission: StoredClanMission; templateId: string } | null = null;
    if (weeklySnap.exists) {
      const data    = weeklySnap.data() as { mission?: StoredClanMission } | undefined;
      const mission = data?.mission;
      if (mission && mission.action === action && !mission.completed) {
        const updated = await adminDb.runTransaction(async tx => {
          const fresh = await tx.get(weeklyRef);
          if (!fresh.exists) return null;
          const cur = fresh.data()!.mission as StoredClanMission | undefined;
          if (!cur || cur.action !== action || cur.completed) return null;
          const nextProgress = Math.min(cur.target, (cur.progress ?? 0) + 1);
          const next: StoredClanMission = {
            ...cur,
            progress:     nextProgress,
            contributors: { ...(cur.contributors ?? {}), [contributorUid]: ((cur.contributors ?? {})[contributorUid] ?? 0) + 1 },
          };
          if (nextProgress >= cur.target) {
            next.completed   = true;
            next.completedAt = now;
          }
          tx.update(weeklyRef, { mission: next });
          return next;
        });
        if (updated && updated.completed) {
          weeklyCompletion = { mission: updated, templateId: updated.templateId };
        }
      }
    }

    // ── Reward issuance (outside transactions) ───────────────────────────────
    // Clan XP fires once per mission completion. Member XP fires once per
    // (mission, contributor) tuple. awardXp / awardClanXp re-read the
    // server-only-written mission doc to derive amounts — caller-supplied
    // amounts are not accepted (see docs/security-guidelines.md §1.5).
    if (dailyCompletions.length > 0 || weeklyCompletion) {
      const { awardXp }      = await import("./xp.actions");
      const { awardClanXp }  = await import("./clan-xp.actions");

      for (const { mission, templateId } of dailyCompletions) {
        const targetId = `clan_mission:${resolvedClanId}:${dateKey}:${templateId}`;
        try {
          await awardClanXp(resolvedClanId, "clan_mission_complete", contributorUid, targetId);
        } catch (err) {
          console.error("[trackClanMissionProgress] daily awardClanXp failed", err);
        }
        // Member XP to every contributor — one event per contributor.
        const contributors = Object.keys(mission.contributors ?? {});
        for (const contribUid of contributors) {
          const memberTargetId = `clan_mission:${resolvedClanId}:${dateKey}:${templateId}:${contribUid}`;
          try {
            await awardXp(contribUid, "clan_mission_contribute", memberTargetId);
          } catch (err) {
            console.error("[trackClanMissionProgress] daily contributor awardXp failed", err);
          }
        }
      }

      if (weeklyCompletion) {
        const { mission, templateId } = weeklyCompletion;
        const targetId = `clan_mission:${resolvedClanId}:${weekKey}:${templateId}`;
        try {
          await awardClanXp(resolvedClanId, "clan_mission_complete", contributorUid, targetId);
        } catch (err) {
          console.error("[trackClanMissionProgress] weekly awardClanXp failed", err);
        }
        const contributors = Object.keys(mission.contributors ?? {});
        for (const contribUid of contributors) {
          const memberTargetId = `clan_mission:${resolvedClanId}:${weekKey}:${templateId}:${contribUid}`;
          try {
            await awardXp(contribUid, "clan_mission_contribute", memberTargetId);
          } catch (err) {
            console.error("[trackClanMissionProgress] weekly contributor awardXp failed", err);
          }
        }
      }
    }
  } catch (err) {
    console.error("[trackClanMissionProgress]", err);
  }
}

