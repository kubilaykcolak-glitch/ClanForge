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
import type { MissionAction } from "@/lib/missions";
import { getAdminUid, getSessionUid } from "./server-auth";

// Map clan-challenge event types to personal-mission action types.
// Only events that have a direct personal-mission analogue appear here.
const CHALLENGE_TO_MISSION_ACTION: Partial<Record<ChallengeType, MissionAction>> = {
  post_create:            "post_create",
  match_win:              "tournament_match_win",
  tournament_participate: "tournament_register",
};

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
    await getAdminUid();
    const { adminDb } = await import("@/lib/firebase/admin");
    const now = new Date();
    const status: ChallengeStatus =
      input.startAt > now ? "upcoming" : input.endAt < now ? "completed" : "active";

    const ref = await adminDb.collection("challenges").add({
      ...input,
      badgeReward:        input.badgeReward  ?? null,
      titleReward:        input.titleReward  ?? null,
      seasonId:           input.seasonId     ?? null,
      status,
      // First run. Bumped by reactivateChallenge so per-clan rewards on
      // subsequent runs aren't deduplicated against earlier completions.
      currentRunNumber:   1,
      lastReactivatedAt:  null,
      createdAt:          now,
      updatedAt:          now,
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
    await getAdminUid();
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

// ─── updateChallenge ─────────────────────────────────────────────────────────
//
// Edit any field on an existing challenge. Admin-only. Touches every editable
// column with a merge update so any unsupplied field stays at its current
// value (the form may legitimately omit reward fields that have been cleared).
//
// The challenge's `status` is NOT changed here — that path goes through
// updateChallengeStatus / reactivateChallenge, both of which apply their own
// validation. Editing fields on a `completed` or `cancelled` challenge is
// allowed (admin might want to clean up the title before reactivating).

// All CreateChallengeInput fields individually optional. Declared as a type
// alias (not an empty interface) to satisfy
// @typescript-eslint/no-empty-object-type.
export type UpdateChallengeInput = Partial<CreateChallengeInput>;

export async function updateChallenge(
  challengeId: string,
  input: UpdateChallengeInput,
): Promise<ActionResult> {
  try {
    await getAdminUid();
    const { adminDb } = await import("@/lib/firebase/admin");

    const ref = adminDb.collection("challenges").doc(challengeId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, error: "Challenge not found" };

    // Build the patch object explicitly so we only touch supplied fields
    // (rather than overwriting absent ones with `undefined`). Optional
    // fields normalise empty-string to null for consistency with create.
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title          !== undefined) patch.title          = input.title.trim();
    if (input.description    !== undefined) patch.description    = input.description.trim();
    if (input.type           !== undefined) patch.type           = input.type;
    if (input.duration       !== undefined) patch.duration       = input.duration;
    if (input.targetValue    !== undefined) patch.targetValue    = input.targetValue;
    if (input.pointValue     !== undefined) patch.pointValue     = input.pointValue;
    if (input.memberXpReward !== undefined) patch.memberXpReward = input.memberXpReward;
    if (input.clanXpReward   !== undefined) patch.clanXpReward   = input.clanXpReward;
    if (input.badgeReward    !== undefined) patch.badgeReward    = input.badgeReward || null;
    if (input.titleReward    !== undefined) patch.titleReward    = input.titleReward || null;
    if (input.seasonId       !== undefined) patch.seasonId       = input.seasonId    || null;
    if (input.startAt        !== undefined) patch.startAt        = input.startAt;
    if (input.endAt          !== undefined) patch.endAt          = input.endAt;

    await ref.update(patch);
    return { success: true };
  } catch (err) {
    console.error("[updateChallenge]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to update challenge" };
  }
}

// ─── reactivateChallenge ─────────────────────────────────────────────────────
//
// Bring a cancelled or completed challenge back to life. Computes the correct
// status from the current dates (same logic as createChallenge):
//
//   startAt > now           → "upcoming"
//   endAt   < now           → "completed" (challenge already ended — refuses
//                             to reactivate unless dates are updated first)
//   otherwise               → "active"
//
// Returns a clear error when the dates are entirely in the past so the admin
// knows to use Edit to push the endAt forward before retrying. Idempotent:
// reactivating an already-active challenge is a no-op success.

// ─── Anti-abuse: cooldown between reactivations of the same challenge ───────
//
// Primarily protects against accidental double-clicks / refresh-resubmits
// (each of which would bump the run number and wipe entries). One hour is
// short enough not to block a legitimate "I made a mistake, reactivate
// again" flow but long enough to give an admin time to notice that the
// previous reactivation already succeeded.

const REACTIVATION_COOLDOWN_MS = 60 * 60 * 1000;

export async function reactivateChallenge(
  challengeId: string,
): Promise<ActionResult<{ newStatus: ChallengeStatus; newRunNumber: number }>> {
  try {
    const sessionUid = await getAdminUid();
    const { adminDb } = await import("@/lib/firebase/admin");

    const ref = adminDb.collection("challenges").doc(challengeId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, error: "Challenge not found" };

    const data = snap.data() as Record<string, unknown>;

    // Firestore returns Timestamp objects (with toDate()). Sometimes the
    // field is already a plain Date if the server actions stamp it directly.
    // Normalise both shapes through a single helper.
    const toDate = (v: unknown): Date => {
      if (v instanceof Date) return v;
      const maybe = v as { toDate?: () => Date } | null | undefined;
      return maybe?.toDate?.() ?? new Date();
    };
    const startAt = toDate(data.startAt);
    const endAt   = toDate(data.endAt);
    const now     = new Date();

    if (endAt < now) {
      return {
        success: false,
        error: "Challenge dates are in the past. Edit the challenge to extend the end date before reactivating.",
      };
    }

    // ── Cooldown check ────────────────────────────────────────────────────
    const lastReactivatedAt = data.lastReactivatedAt
      ? toDate(data.lastReactivatedAt)
      : null;
    if (lastReactivatedAt && now.getTime() - lastReactivatedAt.getTime() < REACTIVATION_COOLDOWN_MS) {
      const remainingMs = REACTIVATION_COOLDOWN_MS - (now.getTime() - lastReactivatedAt.getTime());
      const remainingMin = Math.ceil(remainingMs / 60000);
      return {
        success: false,
        error: `This challenge was reactivated recently. Try again in ${remainingMin} minute${remainingMin === 1 ? "" : "s"}.`,
      };
    }

    const newStatus: ChallengeStatus = startAt > now ? "upcoming" : "active";
    const currentRunNumber = (data.currentRunNumber as number | undefined) ?? 1;
    const newRunNumber = currentRunNumber + 1;

    // ── Wipe every clan's entry for this challenge ───────────────────────
    //
    // Each entry doc represents one clan's progress on the current run.
    // Reactivation should let clans who already completed the previous run
    // win again from zero, so we delete the lot. Firestore batched-delete
    // caps at 500 ops; we paginate in case a popular challenge has more.
    const entriesCol = ref.collection("entries");
    let deletedTotal = 0;
    for (;;) {
      const page = await entriesCol.limit(400).get();
      if (page.empty) break;
      const batch = adminDb.batch();
      page.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      deletedTotal += page.size;
      if (page.size < 400) break;
    }

    // ── Apply the new state ──────────────────────────────────────────────
    await ref.update({
      status:             newStatus,
      currentRunNumber:   newRunNumber,
      lastReactivatedAt:  now,
      updatedAt:          now,
    });

    // ── Audit trail ──────────────────────────────────────────────────────
    // Best-effort: a write failure here mustn't prevent the reactivation
    // from being effective. The action is also captured indirectly by the
    // getAdminUid call earlier (which writes nothing itself, but every admin
    // server action is implicitly traceable via Vercel logs).
    try {
      const { writeAuditLog } = await import("@/lib/auth/audit-log");
      await writeAuditLog({
        actor:      sessionUid,
        actorRole:  null,    // legacy: callers using getAdminUid don't carry a role string
        action:     "challenge.reactivate",
        targetType: "post",  // best-fit existing AuditTargetType; could add "challenge"
        targetId:   challengeId,
        reason:     `Reactivated challenge (run ${currentRunNumber} → ${newRunNumber}, wiped ${deletedTotal} entries)`,
        metadata:   {
          previousRun: currentRunNumber,
          newRun:      newRunNumber,
          newStatus,
          entriesCleared: deletedTotal,
        },
        result:     "success",
      });
    } catch (auditErr) {
      console.error("[reactivateChallenge→audit]", auditErr);
    }

    return { success: true, data: { newStatus, newRunNumber } };
  } catch (err) {
    console.error("[reactivateChallenge]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to reactivate" };
  }
}

// ─── getChallengeById ────────────────────────────────────────────────────────
// Admin-only single-doc read for the edit page.

export async function getChallengeById(challengeId: string): Promise<ActionResult<ChallengeRow>> {
  try {
    await getAdminUid();
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb.collection("challenges").doc(challengeId).get();
    if (!snap.exists) return { success: false, error: "Challenge not found" };
    // mapChallenge expects a QueryDocumentSnapshot (its data() is non-
    // nullable). A DocumentSnapshot has the same shape; we just confirmed
    // snap.exists, so we can safely cast.
    return {
      success: true,
      data: mapChallenge(snap as FirebaseFirestore.QueryDocumentSnapshot),
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to fetch challenge" };
  }
}

export async function getAllChallenges(): Promise<ActionResult<ChallengeRow[]>> {
  try {
    await getAdminUid();
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
    await getSessionUid(); // must be authenticated
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

        // Fetch this clan's entry and top 5 entries in parallel
        const [entrySnap, topSnap] = await Promise.all([
          adminDb
            .collection("challenges")
            .doc(doc.id)
            .collection("entries")
            .doc(clanId)
            .get(),
          adminDb
            .collection("challenges")
            .doc(doc.id)
            .collection("entries")
            .orderBy("progress", "desc")
            .limit(5)
            .get(),
        ]);

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
  // amount is intentionally ignored — always increments by 1 to prevent
  // callers from inflating progress via a direct server-action call.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _amount:        number = 1,
): Promise<void> {
  if (!clanId || !contributorUid) return;

  try {
    // ── Security checks ──────────────────────────────────────────────────────
    // 1. Verify the session cookie — the caller must be the contributor.
    //    Prevents IDOR: an attacker cannot attribute progress to another user
    //    or call this action from outside the authenticated UI.
    const sessionUid = await getSessionUid();
    if (sessionUid !== contributorUid) return;

    const { adminDb } = await import("@/lib/firebase/admin");

    // 2. Verify the caller is an active member of the target clan.
    //    Prevents cross-clan manipulation: a member of Clan A cannot credit Clan B.
    const memberSnap = await adminDb
      .collection("clans").doc(clanId)
      .collection("members").doc(sessionUid).get();
    if (!memberSnap.exists) return;

    // After both checks pass: the event is legitimate. Chain personal mission
    // tracking for the same user. Using sessionUid (not contributorUid) is
    // belt-and-braces — they're already proven equal above. Awaited (not
    // fire-and-forget) so the request's session context is alive when
    // trackMissionProgress performs its own session check inside.
    const missionAction = CHALLENGE_TO_MISSION_ACTION[type];
    if (missionAction) {
      try {
        const { trackMissionProgress } = await import("./missions.actions");
        await trackMissionProgress(sessionUid, missionAction);
      } catch (err) {
        console.error("[trackChallengeProgress→missions]", err);
      }
    }

    // Always use 1 — the only legitimate unit for client-triggered events.
    const safeAmount = 1;

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

    await Promise.all(challengesSnap.docs.map(async (challengeDoc) => {
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
            progress:      safeAmount,
            completed:     false,
            completedAt:   null,
            pointsEarned:  0,
            contributors:  { [contributorUid]: safeAmount },
            updatedAt:     now,
          });
        } else {
          const current = entrySnap.data() as ClanChallengeEntry;
          if (current.completed) return; // already done, skip

          const newProgress = current.progress + safeAmount;
          const contribUpdate = {
            [`contributors.${contributorUid}`]: FieldValue.increment(safeAmount),
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
    }));
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

    // The current run number scopes XP / clan-XP dedup so a clan that
    // completed an earlier run can win the same challenge again after
    // it's reactivated. Existing challenges without the field behave
    // as run 1 (no suffix change from the previous targetId).
    const runNumber = (challenge.currentRunNumber as number | undefined) ?? 1;
    const runSuffix = runNumber > 1 ? `_run${runNumber}` : "";

    // 1. Award clan XP (routes through awardClanXp for level-up detection + audit log)
    if ((challenge.clanXpReward ?? 0) > 0) {
      const { awardClanXp } = await import("@/lib/actions/clan-xp.actions");
      await awardClanXp(clanId, "challenge_complete", contributorUid, `${challengeId}${runSuffix}`, challenge.clanXpReward);
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

    // 3. Award member XP to the contributor — targetId scoped by run so a
    //    clan that completed a previous run still receives XP on the new run.
    if ((challenge.memberXpReward ?? 0) > 0) {
      await awardXp(contributorUid, "challenge_complete", `${challengeId}_${clanId}${runSuffix}`);
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
