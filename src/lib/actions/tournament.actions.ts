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
  // ─── Args kept for backward compat; values are IGNORED. ─────────────────
  // displayName/avatarUrl are hydrated server-side from /profiles/{uid} so
  // a malicious client can't forge an alternative identity on the
  // participant doc (which is rendered to other users in the bracket and
  // participant lists). See security-guidelines §1.3.
  _displayName?: string,
  _avatarUrl?: string,
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
      const profileRef     = adminDb.collection("profiles").doc(uid);

      const [tournSnap, participantSnap, profileSnap] = await Promise.all([
        tx.get(tournRef),
        tx.get(participantRef),
        tx.get(profileRef),
      ]);

      if (!tournSnap.exists) throw new Error("Tournament not found");
      if (!profileSnap.exists) throw new Error("Profile not found — complete onboarding first");

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

      // ── LoL provider guard ────────────────────────────────────────────
      //
      // Tournaments using Riot's Tournament API need every participant's
      // PUUID to lock the lobby + identify match winners. The cleanest
      // place to enforce that is here, at registration, so anyone who
      // gets through has a linked account by the time bracket generation
      // mints codes.
      //
      // Rank restriction is also enforced here when set on the tournament.
      // We read soloRank from the linked-account snapshot; flex rank is
      // ignored for v1 (most ranked LoL competition is solo/duo anyway).
      if (tourn.gameProvider === "league") {
        const intSnap = await tx.get(
          adminDb.collection("profiles").doc(uid).collection("integrations").doc("league"),
        );
        if (!intSnap.exists) {
          throw new Error("Link your Riot account on your profile before registering for a League of Legends tournament");
        }

        const restriction = tourn.riotRankRestriction as {
          minTier?: string | null;
          maxTier?: string | null;
          allowUnranked?: boolean;
        } | null | undefined;

        if (restriction && (restriction.minTier || restriction.maxTier)) {
          const intData = intSnap.data() as {
            snapshot?: { soloRank?: { tier?: string } | null };
          };
          const playerTier = intData.snapshot?.soloRank?.tier?.toUpperCase() ?? null;

          const { TIER_RANK, tierLabel } = await import("@/lib/riot/assets");

          if (!playerTier) {
            // Unranked player attempting to register.
            if (!restriction.allowUnranked) {
              throw new Error(
                "This tournament requires a ranked solo/duo placement. Play your placement matches first or pick a different tournament.",
              );
            }
          } else {
            const playerRank = TIER_RANK[playerTier] ?? 0;
            if (restriction.minTier) {
              const minRank = TIER_RANK[restriction.minTier.toUpperCase()] ?? 0;
              if (playerRank < minRank) {
                throw new Error(
                  `This tournament requires ${tierLabel(restriction.minTier)} or higher. You're ${tierLabel(playerTier)}.`,
                );
              }
            }
            if (restriction.maxTier) {
              const maxRank = TIER_RANK[restriction.maxTier.toUpperCase()] ?? 99;
              if (playerRank > maxRank) {
                throw new Error(
                  `This tournament is capped at ${tierLabel(restriction.maxTier)} or lower. You're ${tierLabel(playerTier)}.`,
                );
              }
            }
          }
        }
      }

      const seed = (tourn.participantCount as number) + 1;
      const prof = profileSnap.data() as { displayName?: string; username?: string; avatarUrl?: string };

      tx.set(participantRef, {
        userId:       uid,
        // Server-resolved identity — cannot be spoofed by the caller.
        displayName:  prof.displayName ?? prof.username ?? "Player",
        avatarUrl:    prof.avatarUrl ?? null,
        seed,
        status:       "registered",
        registeredAt: new Date(),
      });
      tx.update(tournRef, { participantCount: FieldValue.increment(1) });
    });

    // XP + mission progress. Both are gated on whether awardXp actually
    // granted XP (i.e. this is the user's FIRST register for this tournament).
    // Re-registering after withdrawing the same tournament is a no-op for
    // both XP and mission progress — closes the farm loop.
    //
    // awardXp uses once_per_target dedup on tournamentId, so it returns
    // `awarded: 0` on the second register attempt. We use that as the
    // first-time signal for mission tracking + clan XP.
    try {
      const { awardXp } = await import("@/lib/actions/xp.actions");
      const xpResult = await awardXp(uid, "tournament_register", tournamentId);
      const isFirstTime = xpResult.success && (xpResult.data?.awarded ?? 0) > 0;

      if (isFirstTime) {
        try {
          const { trackMissionProgress } = await import("@/lib/actions/missions.actions");
          await trackMissionProgress(uid, "tournament_register");
        } catch (err) {
          console.error("[registerForTournament→missions]", err);
        }
        try {
          const { awardClanXpForMember } = await import("@/lib/actions/clan-xp.actions");
          await awardClanXpForMember(uid, "tournament_participate", tournamentId);
        } catch (err) {
          console.error("[registerForTournament→clan-xp]", err);
        }
      }
    } catch (err) {
      console.error("[registerForTournament→xp]", err);
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
// Manual-report entry on non-LoL tournaments. Per audit fix H4, a single
// participant CAN NO LONGER finalise the match on their own — the loser
// could otherwise claim victory by being first to report.
//
// Behaviour now:
//   - First report puts the match into `pending_confirmation` with the
//     claimed winner + scores stamped on the doc. The OPPONENT must then
//     call confirmMatchResult to finalise OR disputeMatch to send it to
//     the admin queue. A 24h deadline is recorded for future auto-dispute
//     (lazy or cron — see CONFIRMATION_WINDOW_MS below).
//   - The reporter may overwrite their own pending claim (re-submitting
//     corrects a typo) up until the opponent acts.
//
// LoL tournaments are NOT touched by this path — they auto-finalise via
// the Riot tournament-V5 callback, which calls finaliseTournamentMatch
// directly. The Riot callback bypasses any pending_confirmation state.

const CONFIRMATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function reportMatchResult(
  uid: string,
  tournamentId: string,
  matchId: string,
  scoreA: number,
  scoreB: number,
  winnerId: string,
): Promise<ActionResult<{ awaitingConfirmation: boolean }>> {
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

    if (match.participantAId !== uid && match.participantBId !== uid) {
      return { success: false, error: "You are not a participant in this match" };
    }
    if (winnerId !== match.participantAId && winnerId !== match.participantBId) {
      return { success: false, error: "Winner must be one of the match participants" };
    }
    if (match.status === "complete") {
      return { success: false, error: "This match has already been completed" };
    }
    if (match.status === "disputed") {
      return { success: false, error: "This match is disputed — an admin needs to resolve it" };
    }

    // Sanity check on numeric inputs.
    if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB) || scoreA < 0 || scoreB < 0 || scoreA > 99 || scoreB > 99) {
      return { success: false, error: "Invalid score" };
    }

    const now = new Date();

    // Manual-report path → stage as pending_confirmation. Finalisation
    // happens only when the OPPONENT calls confirmMatchResult. If the
    // reporter is overwriting their own prior claim, that's allowed
    // (correcting a typo) up to the deadline.
    await matchRef.update({
      status:               "pending_confirmation",
      reportedBy:           uid,
      reportedAt:           now,
      reportedWinnerId:     winnerId,
      reportedScoreA:       scoreA,
      reportedScoreB:       scoreB,
      confirmationDeadline: new Date(now.getTime() + CONFIRMATION_WINDOW_MS),
    });

    return { success: true, data: { awaitingConfirmation: true } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to report result";
    console.error("[reportMatchResult]", err);
    return { success: false, error: message };
  }
}

// ── confirmMatchResult ───────────────────────────────────────────────────────
// The OPPONENT (i.e. not the original reporter) accepts the claimed result.
// This is what actually finalises the match and fans out XP / clan-XP /
// mission progress / bracket advancement via finaliseTournamentMatch.

export async function confirmMatchResult(
  tournamentId: string,
  matchId:      string,
): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    const { adminDb } = await import("@/lib/firebase/admin");

    const matchRef = adminDb
      .collection("tournaments").doc(tournamentId)
      .collection("matches").doc(matchId);
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) {
      return { success: false, error: "Match not found" };
    }

    const match = matchSnap.data()!;
    if (match.status !== "pending_confirmation") {
      return { success: false, error: "Nothing to confirm — no result pending on this match" };
    }
    if (match.participantAId !== sessionUid && match.participantBId !== sessionUid) {
      return { success: false, error: "You are not a participant in this match" };
    }
    if (match.reportedBy === sessionUid) {
      return { success: false, error: "Your opponent has to confirm — you submitted this result" };
    }

    const reportedWinnerId = match.reportedWinnerId as string | undefined;
    const reportedScoreA   = match.reportedScoreA   as number | undefined;
    const reportedScoreB   = match.reportedScoreB   as number | undefined;
    if (!reportedWinnerId || reportedScoreA === undefined || reportedScoreB === undefined) {
      return { success: false, error: "Reported result is malformed — please dispute and let an admin resolve" };
    }

    // Finalisation runs through the shared core so XP / missions / bracket
    // advancement all happen exactly as they do on the Riot / admin paths.
    const { finaliseTournamentMatch } = await import("@/lib/actions/_match-result-core");
    const fin = await finaliseTournamentMatch({
      tournamentId,
      matchId,
      winnerId:     reportedWinnerId,
      scoreA:       reportedScoreA,
      scoreB:       reportedScoreB,
      resultSource: "manual",
    });
    if (!fin.success) {
      return { success: false, error: fin.error ?? "Failed to finalise" };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to confirm match result";
    console.error("[confirmMatchResult]", err);
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

    const trimmed = reason.trim();
    if (!trimmed) {
      return { success: false, error: "Dispute reason is required" };
    }
    // Bound the reason length — without a cap a participant could write
    // an enormous payload that bloats every match doc and inflates every
    // subsequent read (audit finding L7).
    if (trimmed.length > 500) {
      return { success: false, error: "Dispute reason must be 500 characters or fewer" };
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
      disputeReason: trimmed,
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

    // For LoL tournaments we register with Riot (if not already done) BEFORE
    // creating matches — minting codes needs `riotTournamentId`.
    const isLol = tourn.gameProvider === "league";
    if (isLol) {
      const { ensureRiotTournament } = await import("@/lib/actions/riot-tournament.actions");
      const ensured = await ensureRiotTournament(tournamentId);
      if (!ensured.success) {
        return { success: false, error: ensured.error ?? "Could not register tournament with Riot" };
      }
    }

    const participantIds = shuffle(participantsSnap.docs.map(d => d.id));

    // Build match documents in a batch (Firestore batch limit is 500 writes)
    const batch       = adminDb.batch();
    const matchesRef  = adminDb.collection("tournaments").doc(tournamentId).collection("matches");
    let matchNumber   = 1;
    let matchesCreated = 0;
    const newMatchIds: string[] = [];

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
      if (!isBye) newMatchIds.push(matchRef.id);

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

    // ── Mint Riot tournament codes for LoL matches ─────────────────────────
    //
    // Run AFTER the batch commit because the codes are stored on the match
    // docs we just created. Errors here don't roll back the bracket — the
    // creator can hit "Sync codes" later (or polling reconcile picks it up).
    // Sequential not parallel: Tournament-V5 stub returns one code per POST;
    // 8 matches = 8 calls which is well within per-app rate limits.
    if (isLol) {
      const { mintMatchCode } = await import("@/lib/actions/riot-tournament.actions");
      for (const matchId of newMatchIds) {
        try {
          await mintMatchCode(tournamentId, matchId);
        } catch (err) {
          console.error("[generateBracket→mintMatchCode]", matchId, err);
        }
      }
    }

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
