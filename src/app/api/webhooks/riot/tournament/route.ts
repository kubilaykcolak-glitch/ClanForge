// ─── Riot Tournament-V5 callback receiver ────────────────────────────────────
//
// When a tournament-code custom game finishes, Riot's servers POST the result
// to this URL. We:
//   1. Verify the embedded HMAC metaData (forged callbacks are rejected)
//   2. Look up the match in our DB and check idempotency (callbacks can fire
//      multiple times for the same game)
//   3. Identify the winning ClanForge participant by matching the winning
//      team's PUUIDs against our linked-account records
//   4. Hand the result to reportMatchResult via the existing webhook context
//      so all downstream XP / mission tracking fires exactly as it does for
//      manually reported results
//
// Security notes:
//   • The metaData signature is the primary authenticity check. Even if an
//     attacker knew the callback URL, they can't fake a metaData without the
//     server-only RIOT_METADATA_SECRET.
//   • As a second layer, we cross-check that the claimed code is the one we
//     stored on the match doc.
//   • We accept the callback without IP allowlisting because Riot does not
//     publish stable IPs for tournament callbacks; metaData is the contract.

import { NextRequest, NextResponse } from "next/server";
import { runInWebhookContext } from "@/lib/webhook-context";
import { verifyMetadata } from "@/lib/riot/tournament-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RiotCallbackPayload {
  shortCode?:      string;
  tournamentCode?: string;
  metaData?:       string;
  gameId?:         number | string;
  region?:         string;
  winningTeam?:    Array<{ puuid: string; summonerName?: string }>;
  losingTeam?:     Array<{ puuid: string; summonerName?: string }>;
}

export async function POST(req: NextRequest) {
  let body: RiotCallbackPayload;
  try {
    body = (await req.json()) as RiotCallbackPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── 1. Verify the embedded HMAC ──────────────────────────────────────────
  const verified = verifyMetadata(body.metaData ?? "");
  if (!verified) {
    console.warn("[riot webhook] rejected: bad/missing metaData signature");
    return NextResponse.json({ error: "Invalid metaData" }, { status: 401 });
  }

  // Run all DB work inside the webhook AsyncLocalStorage context so
  // reportMatchResult's downstream awardXp / mission tracking can bypass the
  // (absent) session cookie check — same pattern as the Stripe webhook.
  return runInWebhookContext(async () => {
    try {
      const { adminDb } = await import("@/lib/firebase/admin");

      const matchRef = adminDb
        .collection("tournaments")
        .doc(verified.tournamentId)
        .collection("matches")
        .doc(verified.matchId);

      const matchSnap = await matchRef.get();
      if (!matchSnap.exists) {
        console.warn("[riot webhook] match not found", verified);
        return NextResponse.json({ error: "Match not found" }, { status: 404 });
      }

      const match = matchSnap.data() as {
        status?:             string;
        winnerId?:           string | null;
        participantAId?:     string;
        participantBId?:     string;
        riotTournamentCode?: string | null;
      };

      // Idempotency — callbacks can fire multiple times. We accept the first
      // and ignore subsequent ones rather than 500-ing.
      if (match.status === "complete") {
        return NextResponse.json({ received: true, idempotent: true });
      }

      // Cross-check that the code Riot is referencing is the one we minted.
      // Protects against an attacker who somehow got a valid HMAC but tries
      // to point it at a different game.
      const claimedCode = body.shortCode ?? body.tournamentCode;
      if (claimedCode && match.riotTournamentCode && claimedCode !== match.riotTournamentCode) {
        console.warn(
          "[riot webhook] code mismatch",
          { claimed: claimedCode, stored: match.riotTournamentCode },
        );
        return NextResponse.json({ error: "Code mismatch" }, { status: 401 });
      }

      // ── 2. Identify the winning ClanForge participant ────────────────────
      //
      // We resolve via /profiles/{uid}/integrations/league.account.puuid for
      // both A and B, then check which side contains the winning team's
      // captain PUUID (only captains are whitelisted in allowedParticipants
      // when we mint codes — non-captain teammates are not on the doc).
      const [aPuuid, bPuuid] = await Promise.all([
        match.participantAId && match.participantAId !== "BYE"
          ? adminDb.collection("profiles").doc(match.participantAId).collection("integrations").doc("league").get().then(s => (s.exists ? (s.data() as { account?: { puuid?: string } }).account?.puuid ?? null : null))
          : Promise.resolve(null),
        match.participantBId && match.participantBId !== "BYE"
          ? adminDb.collection("profiles").doc(match.participantBId).collection("integrations").doc("league").get().then(s => (s.exists ? (s.data() as { account?: { puuid?: string } }).account?.puuid ?? null : null))
          : Promise.resolve(null),
      ]);

      const winningPuuids = new Set((body.winningTeam ?? []).map(p => p.puuid).filter(Boolean));

      let winnerId: string | null = null;
      if (aPuuid && winningPuuids.has(aPuuid)) winnerId = match.participantAId ?? null;
      if (bPuuid && winningPuuids.has(bPuuid)) winnerId = match.participantBId ?? null;

      if (!winnerId) {
        // Neither captain is on the winning team — record the raw payload for
        // admin review but don't auto-finalize.
        await matchRef.update({
          status:        "disputed",
          disputeReason: "Riot callback: neither captain found on winning team",
          riotResultRaw: body as Record<string, unknown>,
          completedAt:   new Date(),
        });
        return NextResponse.json({ received: true, action: "flagged" });
      }

      // ── 3. Write the result via the same path as a manual report ─────────
      //
      // reportMatchResult enforces participant-only auth via getSessionUid,
      // which we don't have here. So we mirror its DB writes + side-effects
      // inline. The webhook context flag lets the XP / mission helpers run
      // without session.
      await matchRef.update({
        scoreA:        winnerId === match.participantAId ? 1 : 0,
        scoreB:        winnerId === match.participantBId ? 1 : 0,
        winnerId,
        status:        "complete",
        completedAt:   new Date(),
        riotResultRaw: body as Record<string, unknown>,
        resultSource:  "riot_callback",
      });

      try {
        const { awardXp } = await import("@/lib/actions/xp.actions");
        await awardXp(winnerId, "tournament_match_win", matchSnap.id);
      } catch (err) {
        console.error("[riot webhook→awardXp]", err);
      }

      try {
        const { awardClanXpForMember } = await import("@/lib/actions/clan-xp.actions");
        await awardClanXpForMember(winnerId, "tournament_win", matchSnap.id);
      } catch (err) {
        console.error("[riot webhook→awardClanXpForMember]", err);
      }

      try {
        const { trackMissionProgress } = await import("@/lib/actions/missions.actions");
        await trackMissionProgress(winnerId, "tournament_match_win");
      } catch (err) {
        console.error("[riot webhook→trackMissionProgress]", err);
      }

      try {
        const cm = await import("@/lib/actions/clan-missions.actions");
        await cm.trackClanMissionProgress("tournament_match_win", winnerId);
        // Solo-streak: re-count this user's wins in this tournament. Same
        // logic as reportMatchResult.
        const winsSnap = await adminDb
          .collection("tournaments").doc(verified.tournamentId)
          .collection("matches")
          .where("winnerId", "==", winnerId)
          .where("status",  "==", "complete")
          .get();
        if (winsSnap.size === 3) {
          await cm.trackClanMissionProgress("tournament_solo_streak", winnerId);
        }
      } catch (err) {
        console.error("[riot webhook→clan-missions]", err);
      }

      return NextResponse.json({ received: true, winnerId });
    } catch (err) {
      console.error("[riot webhook] handler failed:", err);
      // 500 so Riot retries with backoff.
      return NextResponse.json({ error: "Handler failed" }, { status: 500 });
    }
  });
}
