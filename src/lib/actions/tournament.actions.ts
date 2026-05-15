"use server";

import { FieldValue } from "firebase-admin/firestore";
import type { Tournament } from "@/types";
import { getSessionUid } from "./server-auth";

// ── Response shape ────────────────────────────────────────────────────────────

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fisher-Yates in-place shuffle (server-safe, no window dependency). */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── createTournament ──────────────────────────────────────────────────────────

export async function createTournament(
  uid: string,
  data: Omit<
    Tournament,
    "id" | "creatorId" | "status" | "participantCount" | "createdAt"
  >,
): Promise<ActionResult<{ tournamentId: string }>> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");

    const ref = await adminDb.collection("tournaments").add({
      ...data,
      creatorId:        uid,
      status:           "open",
      participantCount: 0,
      createdAt:        new Date(),
    });

    return { success: true, data: { tournamentId: ref.id } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create tournament";
    console.error("[createTournament]", err);
    return { success: false, error: message };
  }
}

// ── registerForTournament ─────────────────────────────────────────────────────
// Uses a transaction to guard all checks atomically.
// Participant doc is keyed by uid for O(1) existence checks.

export async function registerForTournament(
  uid: string,
  tournamentId: string,
  displayName: string,
  avatarUrl?: string,
): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");

    await adminDb.runTransaction(async tx => {
      const tournRef       = adminDb.collection("tournaments").doc(tournamentId);
      const participantRef = adminDb
        .collection("tournaments")
        .doc(tournamentId)
        .collection("participants")
        .doc(uid);

      const [tournSnap, participantSnap] = await Promise.all([
        tx.get(tournRef),
        tx.get(participantRef),
      ]);

      if (!tournSnap.exists) throw new Error("Tournament not found");

      const tourn = tournSnap.data()!;
      if (tourn.status !== "open") {
        throw new Error("Registration is not open for this tournament");
      }
      if ((tourn.participantCount as number) >= (tourn.maxParticipants as number)) {
        throw new Error("Tournament is full");
      }
      if (participantSnap.exists) {
        throw new Error("You are already registered for this tournament");
      }

      const seed = (tourn.participantCount as number) + 1;

      tx.set(participantRef, {
        userId:       uid,
        displayName:  displayName,
        avatarUrl:    avatarUrl ?? null,
        seed,
        status:       "registered",
        registeredAt: new Date(),
      });
      tx.update(tournRef, { participantCount: FieldValue.increment(1) });
    });

    // Personal-mission progress for free tournament registration. The paid
    // path is tracked separately from confirmPaidParticipant (webhook).
    // sessionUid === uid is already enforced at the top of this action.
    // Awaited (not fire-and-forget) so the request's session context is still
    // alive when trackMissionProgress performs its own session check inside.
    try {
      const { trackMissionProgress } = await import("@/lib/actions/missions.actions");
      await trackMissionProgress(uid, "tournament_register");
    } catch (err) {
      console.error("[registerForTournament→missions]", err);
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to register";
    console.error("[registerForTournament]", err);
    return { success: false, error: message };
  }
}

// ── withdrawFromTournament ────────────────────────────────────────────────────
// Only permitted while registration is still open.

export async function withdrawFromTournament(
  uid: string,
  tournamentId: string,
): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");

    await adminDb.runTransaction(async tx => {
      const tournRef       = adminDb.collection("tournaments").doc(tournamentId);
      const participantRef = adminDb
        .collection("tournaments")
        .doc(tournamentId)
        .collection("participants")
        .doc(uid);

      const [tournSnap, participantSnap] = await Promise.all([
        tx.get(tournRef),
        tx.get(participantRef),
      ]);

      if (!tournSnap.exists) throw new Error("Tournament not found");
      if (tournSnap.data()!.status !== "open") {
        throw new Error("Withdrawals are only allowed while registration is open");
      }
      if (!participantSnap.exists) {
        throw new Error("You are not registered for this tournament");
      }

      tx.delete(participantRef);
      tx.update(tournRef, { participantCount: FieldValue.increment(-1) });
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to withdraw";
    console.error("[withdrawFromTournament]", err);
    return { success: false, error: message };
  }
}

// ── reportMatchResult ─────────────────────────────────────────────────────────
// Either participant may submit the result. Scores are recorded together with
// the winner; the match moves to 'complete'.

export async function reportMatchResult(
  uid: string,
  tournamentId: string,
  matchId: string,
  scoreA: number,
  scoreB: number,
  winnerId: string,
): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");

    const matchRef = adminDb
      .collection("tournaments")
      .doc(tournamentId)
      .collection("matches")
      .doc(matchId);

    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) {
      return { success: false, error: "Match not found" };
    }

    const match = matchSnap.data()!;

    // Verify the reporter is one of the participants
    if (match.participantAId !== uid && match.participantBId !== uid) {
      return { success: false, error: "You are not a participant in this match" };
    }

    // Winner must be one of the participants
    if (winnerId !== match.participantAId && winnerId !== match.participantBId) {
      return { success: false, error: "Winner must be one of the match participants" };
    }

    if (match.status === "complete") {
      return { success: false, error: "This match has already been completed" };
    }

    await matchRef.update({
      scoreA,
      scoreB,
      winnerId,
      status:      "complete",
      completedAt: new Date(),
    });

    // Award match-win XP to whoever won. Once-per-target (matchId) so a
    // late re-report can't double-award.
    const { awardXp } = await import("@/lib/actions/xp.actions");
    await awardXp(winnerId, "tournament_match_win", matchId);

    // Award clan XP for the win. Awaited so we maintain session context for
    // the inner awardClanXp call's auth check.
    try {
      const { awardClanXpForMember } = await import("@/lib/actions/clan-xp.actions");
      await awardClanXpForMember(winnerId, "tournament_win", matchId);
    } catch (err) {
      console.error("[reportMatchResult→awardClanXpForMember]", err);
    }

    // Personal-mission progress for the winner (cross-user §1.6 — same pattern
    // as the awardXp call above: the caller is one of the participants, the
    // winnerId is validated against match.participantAId/BId, and the inner
    // function uses once_per_target dedup keyed by mission target so late
    // re-reports cannot double-credit.
    try {
      const { trackMissionProgress } = await import("@/lib/actions/missions.actions");
      await trackMissionProgress(winnerId, "tournament_match_win");
    } catch (err) {
      console.error("[reportMatchResult→trackMissionProgress]", err);
    }

    // Clan-mission progress for the winner's clan. Two fires:
    //   1. tournament_match_win — every win, dedup'd via the contributors map.
    //   2. tournament_solo_streak — fires ONCE when the winner's match-win
    //      count in THIS tournament reaches 3. We re-query the matches
    //      subcollection to count their wins (deterministic, no new state).
    //      Once-per-(tournament, uid) dedup is provided by the mission
    //      doc's `completed` flag plus the contributors map.
    try {
      const cm = await import("@/lib/actions/clan-missions.actions");
      try {
        await cm.trackClanMissionProgress("tournament_match_win", winnerId);
      } catch (err) {
        console.error("[reportMatchResult→clan match_win]", err);
      }
      try {
        const winsSnap = await adminDb
          .collection("tournaments").doc(tournamentId)
          .collection("matches")
          .where("winnerId", "==", winnerId)
          .where("status",  "==", "complete")
          .get();
        if (winsSnap.size === 3) {
          await cm.trackClanMissionProgress("tournament_solo_streak", winnerId);
        }
      } catch (err) {
        console.error("[reportMatchResult→solo_streak]", err);
      }
    } catch (err) {
      console.error("[reportMatchResult→clan-missions]", err);
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to report match result";
    console.error("[reportMatchResult]", err);
    return { success: false, error: message };
  }
}

// ── disputeMatch ──────────────────────────────────────────────────────────────
// Either participant may raise a dispute; an admin resolves it manually.

export async function disputeMatch(
  uid: string,
  tournamentId: string,
  matchId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    if (!reason.trim()) {
      return { success: false, error: "Dispute reason is required" };
    }

    const { adminDb } = await import("@/lib/firebase/admin");

    const matchRef  = adminDb
      .collection("tournaments")
      .doc(tournamentId)
      .collection("matches")
      .doc(matchId);

    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) {
      return { success: false, error: "Match not found" };
    }

    const match = matchSnap.data()!;
    if (match.participantAId !== uid && match.participantBId !== uid) {
      return { success: false, error: "You are not a participant in this match" };
    }

    await matchRef.update({
      status:        "disputed",
      disputeReason: reason.trim(),
      disputedBy:    uid,
      disputedAt:    new Date(),
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to dispute match";
    console.error("[disputeMatch]", err);
    return { success: false, error: message };
  }
}

// ── generateBracket ───────────────────────────────────────────────────────────
// Fetches all registered participants, randomly seeds them, and creates round-1
// match documents. If the participant count is odd, the last player gets a bye
// (they advance automatically — their match has participantBId = 'BYE').
// Updates tournament status to 'live'.

export async function generateBracket(
  uid: string,
  tournamentId: string,
): Promise<ActionResult<{ matchesCreated: number }>> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");

    const tournRef = adminDb.collection("tournaments").doc(tournamentId);
    const tournSnap = await tournRef.get();

    if (!tournSnap.exists) {
      return { success: false, error: "Tournament not found" };
    }

    const tourn = tournSnap.data()!;

    if (tourn.creatorId !== uid) {
      // Also allow platform admins
      const profileSnap = await adminDb.collection("profiles").doc(uid).get();
      if (!profileSnap.data()?.isAdmin) {
        return { success: false, error: "Only the tournament creator can generate the bracket" };
      }
    }

    if (tourn.status === "live" || tourn.status === "complete") {
      return { success: false, error: "Bracket has already been generated" };
    }

    // Fetch all registered participants
    const participantsSnap = await adminDb
      .collection("tournaments")
      .doc(tournamentId)
      .collection("participants")
      .where("status", "==", "registered")
      .get();

    if (participantsSnap.empty) {
      return { success: false, error: "No registered participants to bracket" };
    }

    const participantIds = shuffle(participantsSnap.docs.map(d => d.id));

    // Build match documents in a batch (Firestore batch limit is 500 writes)
    const batch       = adminDb.batch();
    const matchesRef  = adminDb.collection("tournaments").doc(tournamentId).collection("matches");
    let matchNumber   = 1;
    let matchesCreated = 0;

    for (let i = 0; i < participantIds.length; i += 2) {
      const participantAId = participantIds[i];
      const participantBId = participantIds[i + 1] ?? "BYE";
      const isBye          = participantBId === "BYE";

      const matchRef = matchesRef.doc();
      batch.set(matchRef, {
        round:          1,
        matchNumber,
        participantAId,
        participantBId,
        scoreA:         0,
        scoreB:         0,
        winnerId:       isBye ? participantAId : null,  // auto-advance on bye
        status:         isBye ? "complete" : "pending",
        scheduledAt:    null,
        completedAt:    isBye ? new Date() : null,
      });

      // Update participant seed to reflect their shuffled position
      const participantRef = adminDb
        .collection("tournaments")
        .doc(tournamentId)
        .collection("participants")
        .doc(participantAId);
      batch.update(participantRef, { seed: matchNumber });

      matchNumber++;
      matchesCreated++;
    }

    // Flip tournament to live
    batch.update(tournRef, { status: "live" });

    await batch.commit();

    return { success: true, data: { matchesCreated } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate bracket";
    console.error("[generateBracket]", err);
    return { success: false, error: message };
  }
}

// ── lockTournament ────────────────────────────────────────────────────────────
// Closes registration early. Creator or platform admin only.

export async function lockTournament(
  uid: string,
  tournamentId: string,
): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");

    const tournSnap = await adminDb.collection("tournaments").doc(tournamentId).get();
    if (!tournSnap.exists) {
      return { success: false, error: "Tournament not found" };
    }

    const tourn = tournSnap.data()!;

    // Authorise: creator OR admin
    if (tourn.creatorId !== uid) {
      const profileSnap = await adminDb.collection("profiles").doc(uid).get();
      if (!profileSnap.data()?.isAdmin) {
        return { success: false, error: "Only the tournament creator or an admin can lock this tournament" };
      }
    }

    if (tourn.status !== "open") {
      return { success: false, error: `Tournament is already '${tourn.status as string}'` };
    }

    await adminDb.collection("tournaments").doc(tournamentId).update({
      status: "locked",
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to lock tournament";
    console.error("[lockTournament]", err);
    return { success: false, error: message };
  }
}
