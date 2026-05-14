"use server";

// ─── Challenge server actions ──────────────────────────────────────────────────
//
// Core challenge engine:
//   - CRUD for challenge documents (admin)
//   - trackChallengeProgress: called from client components after relevant events
//   - completeClanChallenge: awards XP, badges, points, notifications
//   - getClanActiveChallenges: used by the clan page widget
//   - getChallengeLeaderboard: top clans for a specific challenge

import { FieldValue } from "firebase-admin/firestore";
import type { ChallengeType, ChallengeStatus, ClanChallenge, ClanChallengeEntry } from "@/types";

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
}

// ── Serialisable row types (dates → ms) ───────────────────────────────────────

export interface ChallengeRow {
  id:             string;
  title:          string;
  description:    string;
  type:           ChallengeType;
  duration:       string;
  targetValue:    number;
  pointValue:     number;
  memberXpReward: number;
  clanXpReward:   number;
  badgeReward:    string | null;
  titleReward:    string | null;
  seasonId:       string | null;
  startAt:        number;
  endAt:          number;
  status:         ChallengeStatus;
  createdBy:      string;
  createdAt:      number;
}

export interface ChallengeEntryRow {
  clanId:         string;
  clanName:       string;
  clanSlug:       string;
  clanAvatarUrl:  string | null;
  clanTag:        string | null;
  progress:       number;
  targetValue:    number;
  completed:      boolean;
  completedAt:    number | null;
  pointsEarned:   number;
  rank?:          number;
}

const toMs = (v: unknown) =>
  (v as { toDate?: () => Date } | undefined)?.toDate?.().getTime() ?? Date.now();

function mapChallenge(d: FirebaseFirestore.QueryDocumentSnapshot): ChallengeRow {
  const data = d.data();
  return {
    id:             d.id,
    title:          (data.title          as string) ?? "",
    description:    (data.description    as string) ?? "",
    type:           (data.type           as ChallengeType),
    duration:       (data.duration       as string) ?? "weekly",
    targetValue:    (data.targetValue    as number) ?? 1,
    pointValue:     (data.pointValue     as number) ?? 0,
    memberXpReward: (data.memberXpReward as number) ?? 0,
    clanXpReward:   (data.clanXpReward   as number) ?? 0,
    badgeReward:    (data.badgeReward    as string | null) ?? null,
    titleReward:    (data.titleReward    as string | null) ?? null,
    seasonId:       (data.seasonId       as string | null) ?? null,
    startAt:        toMs(data.startAt),
    endAt:          toMs(data.endAt),
    status:         (data.status         as ChallengeStatus) ?? "upcoming",
    createdBy:      (data.createdBy      as string) ?? "",
    createdAt:      toMs(data.createdAt),
  };
}

// ── ISO week / month key helpers (for leaderboard reset detection) ────────────

function weekKey(d: Date): string {
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  const week = Math.ceil((dayOfYear + jan4.getDay()) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export interface CreateChallengeInput {
  title:          string;
  description:    string;
  type:           ChallengeType;
  duration:       string;
  targetValue:    number;
  pointValue:     number;
  memberXpReward: number;
  clanXpReward:   number;
  badgeReward?:   string;
  titleReward?:   string;
  seasonId?:      string;
  startAt:        Date;
  endAt:          Date;
  createdBy:      string;
}

export async function createChallenge(
  input: CreateChallengeInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const now = new Date();
    const status: ChallengeStatus =
      input.startAt > now ? "upcoming" : input.endAt < now ? "completed" : "active";

    const ref = await adminDb.collection("challenges").add({
      ...input,
      badgeReward:  input.badgeReward  ?? null,
      titleReward:  input.titleReward  ?? null,
      seasonId:     input.seasonId     ?? null,
      status,
      createdAt:    now,
      updatedAt:    now,
    });

    return { success: true, data: { id: ref.id } };
  } catch (err) {
    console.error("[createChallenge]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to create challenge" };
  }
}

export async function updateChallengeStatus(
  challengeId: string,
  status:      ChallengeStatus,
): Promise<ActionResult> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    await adminDb.collection("challenges").doc(challengeId).update({
      status,
      updatedAt: new Date(),
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to update" };
  }
}

export async function getAllChallenges(): Promise<ActionResult<ChallengeRow[]>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb
      .collection("challenges")
      .orderBy("startAt", "desc")
      .limit(100)
      .get();
    return { success: true, data: snap.docs.map(mapChallenge) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to fetch" };
  }
}

// ── Widget data ───────────────────────────────────────────────────────────────

export interface ClanChallengeWidgetData {
  challenge:  ChallengeRow;
  entry:      ChallengeEntryRow | null;
  topEntries: ChallengeEntryRow[];
}

export async function getClanActiveChallenges(
  clanId: string,
): Promise<ActionResult<ClanChallengeWidgetData[]>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");

    const challengesSnap = await adminDb
      .collection("challenges")
      .where("status", "==", "active")
      .orderBy("endAt", "asc")
      .limit(5)
      .get();

    if (challengesSnap.empty) return { success: true, data: [] };

    const results: ClanChallengeWidgetData[] = await Promise.all(
      challengesSnap.docs.map(async (doc) => {
        const challenge = mapChallenge(doc);

        // Fetch this clan's entry
        const entrySnap = await adminDb
          .collection("challenges")
          .doc(doc.id)
          .collection("entries")
          .doc(clanId)
          .get();

        const entry: ChallengeEntryRow | null = entrySnap.exists
          ? {
              clanId,
              clanName:        (entrySnap.data()!.clanName        as string) ?? "",
              clanSlug:        (entrySnap.data()!.clanSlug        as string) ?? "",
              clanAvatarUrl:   (entrySnap.data()!.clanAvatarUrl   as string | null) ?? null,
              clanTag:         (entrySnap.data()!.clanTag         as string | null) ?? null,
              progress:        (entrySnap.data()!.progress        as number) ?? 0,
              targetValue:     challenge.targetValue,
              completed:       (entrySnap.data()!.completed       as boolean) ?? false,
              completedAt:     entrySnap.data()!.completedAt ? toMs(entrySnap.data()!.completedAt) : null,
              pointsEarned:    (entrySnap.data()!.pointsEarned    as number) ?? 0,
            }
          : null;

        // Fetch top 5 entries for the mini-leaderboard
        const topSnap = await adminDb
          .collection("challenges")
          .doc(doc.id)
          .collection("entries")
          .orderBy("progress", "desc")
          .limit(5)
          .get();

        const topEntries: ChallengeEntryRow[] = topSnap.docs.map((e, i) => ({
          clanId:       (e.data().clanId       as string) ?? "",
          clanName:     (e.data().clanName     as string) ?? "",
          clanSlug:     (e.data().clanSlug     as string) ?? "",
          clanAvatarUrl:(e.data().clanAvatarUrl as string | null) ?? null,
          clanTag:      (e.data().clanTag      as string | null) ?? null,
          progress:     (e.data().progress     as number) ?? 0,
          targetValue:  challenge.targetValue,
          completed:    (e.data().completed    as boolean) ?? false,
          completedAt:  e.data().completedAt ? toMs(e.data().completedAt) : null,
          pointsEarned: (e.data().pointsEarned as number) ?? 0,
          rank:         i + 1,
        }));

        return { challenge, entry, topEntries };
      }),
    );

    return { success: true, data: results };
  } catch (err) {
    console.error("[getClanActiveChallenges]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to load challenges" };
  }
}

// ── Progress tracking ─────────────────────────────────────────────────────────
//
// Fire-and-forget from client components. Finds all active challenges of the
// given type, increments this clan's entry, and triggers completion if met.

export async function trackChallengeProgress(
  clanId:         string,
  type:           ChallengeType,
  contributorUid: string,
  amount:         number = 1,
): Promise<void> {
  if (!clanId || !contributorUid) return;

  try {
    const { adminDb } = await import("@/lib/firebase/admin");

    // Fetch clan metadata (needed for entry denormalization)
    const [challengesSnap, clanSnap] = await Promise.all([
      adminDb
        .collection("challenges")
        .where("status", "==", "active")
        .where("type", "==", type)
        .get(),
      adminDb.collection("clans").doc(clanId).get(),
    ]);

    if (challengesSnap.empty) return;
    if (!clanSnap.exists) return;

    const clanData = clanSnap.data()!;

    for (const challengeDoc of challengesSnap.docs) {
      const entryRef = adminDb
        .collection("challenges")
        .doc(challengeDoc.id)
        .collection("entries")
        .doc(clanId);

      await adminDb.runTransaction(async (tx) => {
        const entrySnap = await tx.get(entryRef);
        const now = new Date();

        if (!entrySnap.exists) {
          // Create entry
          tx.set(entryRef, {
            clanId,
            clanName:      clanData.name        ?? "",
            clanSlug:      clanData.slug        ?? "",
            clanAvatarUrl: clanData.avatarUrl   ?? null,
            clanTag:       clanData.clanTag     ?? null,
            progress:      amount,
            completed:     false,
            completedAt:   null,
            pointsEarned:  0,
            contributors:  { [contributorUid]: amount },
            updatedAt:     now,
          });
        } else {
          const current = entrySnap.data() as ClanChallengeEntry;
          if (current.completed) return; // already done, skip

          const newProgress = current.progress + amount;
          const contribUpdate = {
            [`contributors.${contributorUid}`]: FieldValue.increment(amount),
          };

          tx.update(entryRef, {
            progress:  newProgress,
            updatedAt: now,
            ...contribUpdate,
          });

          // Fire completion if threshold reached
          if (newProgress >= challengeDoc.data().targetValue) {
            tx.update(entryRef, {
              completed:    true,
              completedAt:  now,
              pointsEarned: challengeDoc.data().pointValue,
            });
          }
        }
      });

      // After transaction: check if now completed and award rewards
      const updatedEntry = await entryRef.get();
      if (updatedEntry.exists && updatedEntry.data()!.completed && !updatedEntry.data()!.rewardsIssued) {
        await _issueCompletionRewards(
          challengeDoc.id,
          challengeDoc.data() as ClanChallenge,
          clanId,
          clanData,
          contributorUid,
        );
      }
    }
  } catch (err) {
    console.error("[trackChallengeProgress]", err);
    // Non-fatal — don't surface to user
  }
}

// ── Reward issuance (called once per clan per challenge on completion) ─────────

async function _issueCompletionRewards(
  challengeId:    string,
  challenge:      ClanChallenge,
  clanId:         string,
  clanData:       FirebaseFirestore.DocumentData,
  contributorUid: string,
): Promise<void> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const { FieldValue: FV } = await import("firebase-admin/firestore");
    const { awardXp } = await import("@/lib/actions/xp.actions");
    const now = new Date();

    // Guard: mark rewardsIssued atomically
    const entryRef = adminDb
      .collection("challenges").doc(challengeId)
      .collection("entries").doc(clanId);

    const alreadyIssued = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(entryRef);
      if (!snap.exists || snap.data()!.rewardsIssued) return true;
      tx.update(entryRef, { rewardsIssued: true });
      return false;
    });

    if (alreadyIssued) return;

    // 1. Award clan XP (routes through awardClanXp for level-up detection + audit log)
    if ((challenge.clanXpReward ?? 0) > 0) {
      const { awardClanXp } = await import("@/lib/actions/clan-xp.actions");
      await awardClanXp(clanId, "challenge_complete", contributorUid, challengeId, challenge.clanXpReward);
    }

    // 2. Update clan_points leaderboard doc (create if absent)
    const pointsRef = adminDb.collection("clan_points").doc(clanId);
    const currentWeek  = weekKey(now);
    const currentMonth = monthKey(now);

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(pointsRef);
      const pts  = challenge.pointValue;

      if (!snap.exists) {
        tx.set(pointsRef, {
          clanId,
          clanName:      clanData.name      ?? "",
          clanSlug:      clanData.slug      ?? "",
          clanAvatarUrl: clanData.avatarUrl ?? null,
          clanTag:       clanData.clanTag   ?? null,
          memberCount:   clanData.memberCount ?? 0,
          totalPoints:   pts,
          weeklyPoints:  pts,
          monthlyPoints: pts,
          seasonPoints:  challenge.seasonId ? { [challenge.seasonId]: pts } : {},
          currentWeekKey:  currentWeek,
          currentMonthKey: currentMonth,
          updatedAt:       now,
        });
      } else {
        const existing = snap.data()!;
        const updates: Record<string, unknown> = {
          totalPoints: FV.increment(pts),
          updatedAt:   now,
          // Keep display fields fresh
          clanName:      clanData.name      ?? existing.clanName,
          clanSlug:      clanData.slug      ?? existing.clanSlug,
          clanAvatarUrl: clanData.avatarUrl ?? existing.clanAvatarUrl,
          clanTag:       clanData.clanTag   ?? existing.clanTag,
          memberCount:   clanData.memberCount ?? existing.memberCount,
        };

        // Lazy weekly reset
        if (existing.currentWeekKey !== currentWeek) {
          updates.weeklyPoints   = pts;
          updates.currentWeekKey = currentWeek;
        } else {
          updates.weeklyPoints = FV.increment(pts);
        }

        // Lazy monthly reset
        if (existing.currentMonthKey !== currentMonth) {
          updates.monthlyPoints   = pts;
          updates.currentMonthKey = currentMonth;
        } else {
          updates.monthlyPoints = FV.increment(pts);
        }

        // Season points
        if (challenge.seasonId) {
          updates[`seasonPoints.${challenge.seasonId}`] = FV.increment(pts);
        }

        tx.update(pointsRef, updates);
      }
    });

    // 3. Award member XP to the contributor
    if ((challenge.memberXpReward ?? 0) > 0) {
      await awardXp(contributorUid, "challenge_complete", challengeId + "_" + clanId);
    }

    // 4. Award badge to contributor (and all members who contributed)
    if (challenge.badgeReward) {
      const badge = challenge.badgeReward;
      await adminDb.collection("profiles").doc(contributorUid).update({
        badges:    FV.arrayUnion(badge),
        updatedAt: now,
      });
    }

    // 5. Award title to contributor
    if (challenge.titleReward) {
      await adminDb.collection("profiles").doc(contributorUid).update({
        title:     challenge.titleReward,
        updatedAt: now,
      });
    }

    // 6. Send notifications to clan members (leader + officers to keep fan-out small)
    const membersSnap = await adminDb
      .collection("clans").doc(clanId)
      .collection("members")
      .where("role", "in", ["leader", "officer"])
      .limit(10)
      .get();

    const notifPromises = membersSnap.docs.map((m) => {
      const uid = m.id;
      return adminDb
        .collection("notifications").doc(uid)
        .collection("items")
        .add({
          type:        "challenge_completed",
          title:       "Challenge Complete! 🏆",
          body:        `Your clan completed "${challenge.title}" and earned ${challenge.pointValue} pts.`,
          read:        false,
          href:        `/clans/${clanData.slug}`,
          clanId,
          challengeId,
          createdAt:   now,
        });
    });

    await Promise.allSettled(notifPromises);
  } catch (err) {
    console.error("[_issueCompletionRewards]", err);
  }
}

// ── Dashboard summary ─────────────────────────────────────────────────────────

export interface DashboardChallengeItem {
  challenge:   ChallengeRow;
  entry:       ChallengeEntryRow | null;
  percentDone: number;
}

export async function getDashboardChallenges(
  clanId: string | null,
): Promise<ActionResult<DashboardChallengeItem[]>> {
  if (!clanId) return { success: true, data: [] };

  try {
    const result = await getClanActiveChallenges(clanId);
    if (!result.success || !result.data) return { success: true, data: [] };

    const items: DashboardChallengeItem[] = result.data.slice(0, 3).map(({ challenge, entry }) => ({
      challenge,
      entry,
      percentDone: entry ? Math.min(100, Math.round((entry.progress / challenge.targetValue) * 100)) : 0,
    }));

    return { success: true, data: items };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load" };
  }
}
