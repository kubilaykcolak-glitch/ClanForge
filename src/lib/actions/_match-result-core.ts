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
  // All await'd so caller's session/webhook context propagates correctly.
  // Each in its own try so one failure doesn't block the rest — the same
  // pattern reportMatchResult already uses.
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

  return { success: true };
}
