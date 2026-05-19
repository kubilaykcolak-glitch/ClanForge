// ─── Shared match-result finalisation core ────────────────────────────────────
//
// Single source of truth for "a LoL match just ended; record the winner and
// fire every downstream side-effect". Both the Riot tournament webhook AND
// the admin simulate / manual-override actions call this so behaviour stays
// in lock-step regardless of how the result was sourced.
//
// IMPORTANT: this function does NOT enforce caller auth — the caller is
// responsible for it (webhook = HMAC-verified payload; admin actions =
// getAdminUid). It also does NOT re-verify metadata signatures; that's the
// webhook's job before invoking us.

"use server";

interface FinaliseInput {
  tournamentId: string;
  matchId:      string;
  winnerId:     string;
  scoreA:       number;
  scoreB:       number;
  resultSource: "manual" | "riot_callback" | "riot_poll" | "admin_override" | "admin_simulate";
  /** Verbatim Riot callback payload, if applicable. Kept for audit. */
  riotResultRaw?: Record<string, unknown> | null;
}

interface FinaliseResult {
  success: boolean;
  /** `idempotent` means the match was already complete when we tried to
   * finalise — caller can treat as success. */
  idempotent?: boolean;
  error?: string;
}

/**
 * Atomically transition a match to "complete" with the given winner and fire
 * all standard downstream effects:
 *   - awardXp(winner, "tournament_match_win", matchId)
 *   - awardClanXpForMember(winner, "tournament_win", matchId)
 *   - trackMissionProgress(winner, "tournament_match_win")
 *   - trackClanMissionProgress("tournament_match_win", winner)
 *   - trackClanMissionProgress("tournament_solo_streak", winner) iff their
 *     win-count in this tournament hits 3
 *
 * Returns silently with `idempotent: true` if the match is already complete.
 */
export async function finaliseTournamentMatch(input: FinaliseInput): Promise<FinaliseResult> {
  const { adminDb } = await import("@/lib/firebase/admin");

  const matchRef = adminDb
    .collection("tournaments").doc(input.tournamentId)
    .collection("matches").doc(input.matchId);

  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) return { success: false, error: "Match not found" };

  const match = matchSnap.data() as {
    status?:         string;
    participantAId?: string;
    participantBId?: string;
  };

  if (match.status === "complete") {
    return { success: true, idempotent: true };
  }

  if (input.winnerId !== match.participantAId && input.winnerId !== match.participantBId) {
    return { success: false, error: "Winner must be one of the match participants" };
  }

  await matchRef.update({
    scoreA:        input.scoreA,
    scoreB:        input.scoreB,
    winnerId:      input.winnerId,
    status:        "complete",
    completedAt:   new Date(),
    resultSource:  input.resultSource,
    ...(input.riotResultRaw ? { riotResultRaw: input.riotResultRaw } : {}),
  });

  // ── XP + missions ───────────────────────────────────────────────────────
  // All cross-user side-effects (the winner is often a different uid than
  // the caller) run inside a trusted-server context so the recently-added
  // same-uid guard on trackMissionProgress / trackClanMissionProgress
  // permits them. The boundary is safe: finaliseTournamentMatch is reached
  // only through reportMatchResult (participant role-gated upstream),
  // adminFinalizeMatch (admin/creator role-gated), or the Riot/Stripe
  // webhook handlers (already in webhook context).
  const { runInTrustedServerContext } = await import("@/lib/webhook-context");
  await runInTrustedServerContext(async () => {
    try {
      const { awardXp } = await import("@/lib/actions/xp.actions");
      await awardXp(input.winnerId, "tournament_match_win", input.matchId);
    } catch (err) {
      console.error("[finaliseTournamentMatch→awardXp]", err);
    }

    try {
      const { awardClanXpForMember } = await import("@/lib/actions/clan-xp.actions");
      await awardClanXpForMember(input.winnerId, "tournament_win", input.matchId);
    } catch (err) {
      console.error("[finaliseTournamentMatch→awardClanXpForMember]", err);
    }

    try {
      const { trackMissionProgress } = await import("@/lib/actions/missions.actions");
      await trackMissionProgress(input.winnerId, "tournament_match_win");
    } catch (err) {
      console.error("[finaliseTournamentMatch→trackMissionProgress]", err);
    }

    try {
      const cm = await import("@/lib/actions/clan-missions.actions");
      await cm.trackClanMissionProgress("tournament_match_win", input.winnerId);

      const winsSnap = await adminDb
        .collection("tournaments").doc(input.tournamentId)
        .collection("matches")
        .where("winnerId", "==", input.winnerId)
        .where("status",  "==", "complete")
        .get();
      if (winsSnap.size === 3) {
        await cm.trackClanMissionProgress("tournament_solo_streak", input.winnerId);
      }
    } catch (err) {
      console.error("[finaliseTournamentMatch→clan-missions]", err);
    }
  });

  // ── Bracket advancement ────────────────────────────────────────────────
  // If finishing this match completes the current round, lazy-create the
  // next round (or finalise the tournament if this was the final). Best-
  // effort — a failure here leaves the match marked complete but the
  // bracket frozen, which an admin can resolve via the per-match panel or
  // a re-call of any subsequent action.
  try {
    await advanceBracketIfReady(input.tournamentId);
  } catch (err) {
    console.error("[finaliseTournamentMatch→advanceBracketIfReady]", err);
  }

  return { success: true };
}

// ─── advanceBracketIfReady ──────────────────────────────────────────────────
//
// Lazy bracket advancement: when a match completes, check if all matches in
// the current highest round are also complete. If yes, build the next round
// from the winners. If only one winner remains, mark the tournament complete.
//
// Idempotent: safe to call repeatedly. If the next round already exists, or
// no round is fully complete, we return without doing anything.
//
// Format note: implements single-elimination. The current bracket generator
// only ships single-elim, so this matches. If/when double-elim or round-robin
// are wired up, this helper will need a format-aware branch.

interface BracketMatch {
  id:             string;
  round:          number;
  matchNumber:    number;
  participantAId: string;
  participantBId: string;
  winnerId?:      string | null;
  status:         string;
}

export async function advanceBracketIfReady(tournamentId: string): Promise<void> {
  const { adminDb } = await import("@/lib/firebase/admin");

  const tournRef = adminDb.collection("tournaments").doc(tournamentId);
  const [tournSnap, matchesSnap] = await Promise.all([
    tournRef.get(),
    tournRef.collection("matches").get(),
  ]);
  if (!tournSnap.exists) return;
  const tourn = tournSnap.data() as { status?: string; gameProvider?: string };
  if (tourn.status === "complete" || tourn.status === "cancelled") return;

  const matches: BracketMatch[] = matchesSnap.docs.map(d => {
    const data = d.data();
    return {
      id:             d.id,
      round:          data.round as number,
      matchNumber:    data.matchNumber as number,
      participantAId: data.participantAId as string,
      participantBId: data.participantBId as string,
      winnerId:       data.winnerId as string | undefined,
      status:         data.status as string,
    };
  });

  if (matches.length === 0) return;

  // Highest round that exists.
  const maxRound = matches.reduce((m, x) => Math.max(m, x.round), 1);
  const currentRound = matches.filter(m => m.round === maxRound);

  // Are all matches in the current top round complete?
  const allComplete = currentRound.every(m => m.status === "complete");
  if (!allComplete) return;

  // Winners in match-number order (canonical bracket layout — winner of
  // match 1 plays winner of match 2 in the next round, etc).
  const winners = currentRound
    .slice()
    .sort((a, b) => a.matchNumber - b.matchNumber)
    .map(m => m.winnerId ?? "")
    .filter(w => w !== "");

  // Sanity: every complete match should have a winner. If somehow not, abort
  // rather than create a broken next round.
  if (winners.length !== currentRound.length) {
    console.warn("[advanceBracketIfReady] incomplete winners list", { tournamentId, round: maxRound });
    return;
  }

  // If exactly one winner remains, the tournament is over.
  if (winners.length === 1) {
    await tournRef.update({ status: "complete" });
    return;
  }

  // Build the next round. Same pairing logic as generateBracket: pair sequential
  // winners, last unpaired participant gets a bye and auto-completes.
  const nextRound = maxRound + 1;
  const batch       = adminDb.batch();
  const matchesRef  = tournRef.collection("matches");
  const newMatchIds: string[] = [];
  let nextMatchNumber = 1;

  for (let i = 0; i < winners.length; i += 2) {
    const participantAId = winners[i];
    const participantBId = winners[i + 1] ?? "BYE";
    const isBye = participantBId === "BYE";

    const matchRef = matchesRef.doc();
    batch.set(matchRef, {
      round:          nextRound,
      matchNumber:    nextMatchNumber,
      participantAId,
      participantBId,
      scoreA:         0,
      scoreB:         0,
      winnerId:       isBye ? participantAId : null,
      status:         isBye ? "complete" : "pending",
      scheduledAt:    null,
      completedAt:    isBye ? new Date() : null,
    });
    if (!isBye) newMatchIds.push(matchRef.id);
    nextMatchNumber++;
  }

  await batch.commit();

  // LoL: mint a Riot tournament code for each new non-bye match.
  if (tourn.gameProvider === "league") {
    try {
      const { mintMatchCode } = await import("@/lib/actions/riot-tournament.actions");
      for (const matchId of newMatchIds) {
        try {
          await mintMatchCode(tournamentId, matchId);
        } catch (err) {
          console.error("[advanceBracketIfReady→mintMatchCode]", matchId, err);
        }
      }
    } catch (err) {
      console.error("[advanceBracketIfReady→codes import]", err);
    }
  }

  // If the new round contains an all-bye situation (rare: single winner via
  // a bye chain), recurse so the tournament finalises immediately.
  if (winners.length === 2 && newMatchIds.length === 0) {
    // Both were byes? Not possible — we built the round from real winners.
    // No-op fallback.
    return;
  }

  // The new round may itself be entirely complete (e.g. odd-winner-count
  // produced a bye that auto-completed AND we only had 1 other winner — but
  // that case is caught earlier as winners.length === 1). For full bye-only
  // rounds, re-run to advance again.
  const newRoundMatches = await tournRef.collection("matches").where("round", "==", nextRound).get();
  const newAllComplete  = newRoundMatches.docs.every(d => (d.data() as { status?: string }).status === "complete");
  if (newAllComplete) {
    await advanceBracketIfReady(tournamentId);
  }
}
