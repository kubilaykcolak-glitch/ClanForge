"use server";

// ─── Tournament creation rate limits ──────────────────────────────────────────
//
// Anti-spam gate called by the tournament create page. Three checks:
//   1. Account must be at least MIN_ACCOUNT_AGE_HOURS old (filters drive-by spam)
//   2. User must have fewer than MAX_ACTIVE_PER_USER open/locked/live tournaments
//   3. User must have created fewer than MAX_PER_7_DAYS in the rolling 7-day window
//
// This is a Firestore-level precheck, not Firestore security rules. A
// determined client could bypass it. For production hardening, also add
// equivalent rules to firestore.rules. Stops 95%+ of casual abuse today.

import type { TournamentStatus } from "@/types";

const MIN_ACCOUNT_AGE_HOURS = 24;
const MAX_ACTIVE_PER_USER   = 3;
const MAX_PER_7_DAYS        = 5;

const ACTIVE_STATUSES: ReadonlyArray<TournamentStatus> = ["open", "locked", "live"];

interface CheckResult {
  allowed: boolean;
  /** When allowed === false, a user-facing reason string. */
  reason?: string;
}

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
}

export async function canCreateTournament(uid: string): Promise<ActionResult<CheckResult>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");

    // ── Account-age check ────────────────────────────────────────────────────
    const profileSnap = await adminDb.collection("profiles").doc(uid).get();
    if (!profileSnap.exists) {
      return {
        success: true,
        data:    { allowed: false, reason: "Complete your profile first before creating a tournament." },
      };
    }

    const profile  = profileSnap.data()!;
    const createdAt = profile.createdAt?.toDate?.() ?? new Date();
    const ageHours = (Date.now() - createdAt.getTime()) / (60 * 60 * 1000);

    if (ageHours < MIN_ACCOUNT_AGE_HOURS) {
      const hoursLeft = Math.ceil(MIN_ACCOUNT_AGE_HOURS - ageHours);
      return {
        success: true,
        data: {
          allowed: false,
          reason: `Your account is too new — please wait about ${hoursLeft}h before creating tournaments. This is a one-time anti-spam check.`,
        },
      };
    }

    // ── Single-field query: all tournaments by this creator ──────────────────
    // Pulled once and filtered in JS so we don't need composite indexes for
    // (creatorId + status) and (creatorId + createdAt). At rate-limit volumes
    // (≤ 5 per 7 days, ≤ 3 active) this is trivially small per user.
    const minePsnap = await adminDb
      .collection("tournaments")
      .where("creatorId", "==", uid)
      .get();

    const activeCount = minePsnap.docs.filter(d =>
      ACTIVE_STATUSES.includes(d.data().status as TournamentStatus),
    ).length;

    if (activeCount >= MAX_ACTIVE_PER_USER) {
      return {
        success: true,
        data: {
          allowed: false,
          reason: `You already have ${MAX_ACTIVE_PER_USER} active tournaments. Finish, cancel, or complete one before creating another.`,
        },
      };
    }

    const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentCount = minePsnap.docs.filter(d => {
      const ca = d.data().createdAt?.toDate?.()?.getTime?.() ?? 0;
      return ca >= sevenDaysAgoMs;
    }).length;

    if (recentCount >= MAX_PER_7_DAYS) {
      return {
        success: true,
        data: {
          allowed: false,
          reason: `You've created ${MAX_PER_7_DAYS} tournaments in the last 7 days. Please wait before adding another.`,
        },
      };
    }

    return { success: true, data: { allowed: true } };
  } catch (err) {
    console.error("[canCreateTournament]", err);
    const message = err instanceof Error ? err.message : "Failed to check creation limits";
    return { success: false, error: message };
  }
}
