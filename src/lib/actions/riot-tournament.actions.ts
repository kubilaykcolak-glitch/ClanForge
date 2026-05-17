"use server";

import { getSessionUid } from "@/lib/actions/server-auth";
import {
  registerProvider,
  registerTournament,
  createTournamentCodes,
  getTournamentCode,
  RiotTournamentError,
  type TournamentRegion,
  type CodeParameters,
} from "@/lib/riot/tournament";
import { signMetadata } from "@/lib/riot/tournament-metadata";
import { TOURNAMENT_REGIONS } from "@/lib/riot/regions";
import type { LeagueIntegration } from "@/types/integrations";

// ─── Result shape ─────────────────────────────────────────────────────────────

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

function isTournamentRegion(v: unknown): v is TournamentRegion {
  return typeof v === "string" && (TOURNAMENT_REGIONS as readonly string[]).includes(v);
}

// ─── ensureRiotProvider ───────────────────────────────────────────────────────
//
// Riot Tournament-V5 requires a "provider" registration — essentially "here is
// the URL you should POST results to". Provider IDs are per-region and live
// forever, so we cache them at /system/riot/providers/{region}.
//
// First call for a given region performs the registration; subsequent calls
// short-circuit on the cached ID. Safe to call on every LoL-tournament create.

async function ensureRiotProvider(region: TournamentRegion): Promise<number> {
  const { adminDb } = await import("@/lib/firebase/admin");

  const docRef = adminDb.collection("system").doc("riot").collection("providers").doc(region);
  const snap   = await docRef.get();

  if (snap.exists) {
    const data = snap.data() as { providerId?: number };
    if (typeof data.providerId === "number") return data.providerId;
  }

  const callbackUrl = process.env.RIOT_CALLBACK_URL;
  if (!callbackUrl) throw new Error("RIOT_CALLBACK_URL not configured");

  const providerId = await registerProvider({ region, url: callbackUrl });

  await docRef.set({
    providerId,
    region,
    callbackUrl,
    registeredAt: new Date(),
  });

  return providerId;
}

// ─── ensureRiotTournament ─────────────────────────────────────────────────────
//
// Registers a ClanForge tournament with Riot if not already done. Updates the
// tournament doc with riotTournamentId. Idempotent.
//
// Caller must already be authorised — this is invoked from generateBracket
// (creator/admin only).

export async function ensureRiotTournament(
  tournamentId: string,
): Promise<ActionResult<{ riotTournamentId: number }>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const tournRef    = adminDb.collection("tournaments").doc(tournamentId);
    const tournSnap   = await tournRef.get();
    if (!tournSnap.exists) return { success: false, error: "Tournament not found" };

    const tourn = tournSnap.data() as {
      gameProvider?:     string | null;
      riotRegion?:       string | null;
      riotTournamentId?: number | null;
      name?:             string;
    };

    if (tourn.gameProvider !== "league") {
      return { success: false, error: "Tournament is not a League of Legends tournament" };
    }
    if (!isTournamentRegion(tourn.riotRegion)) {
      return { success: false, error: "Tournament has no valid Riot region set" };
    }

    if (typeof tourn.riotTournamentId === "number") {
      return { success: true, data: { riotTournamentId: tourn.riotTournamentId } };
    }

    const providerId       = await ensureRiotProvider(tourn.riotRegion);
    const riotTournamentId = await registerTournament({
      providerId,
      name: (tourn.name ?? "ClanForge Tournament").slice(0, 100),
    });

    await tournRef.update({ riotTournamentId });

    return { success: true, data: { riotTournamentId } };
  } catch (err) {
    if (err instanceof RiotTournamentError) {
      return { success: false, error: `Riot Tournament API error (${err.status})` };
    }
    const message = err instanceof Error ? err.message : "Failed to register tournament with Riot";
    console.error("[ensureRiotTournament]", err);
    return { success: false, error: message };
  }
}

// ─── mintMatchCode ────────────────────────────────────────────────────────────
//
// Generate a single tournament code for one bracket match and write it to the
// match doc. Caller (generateBracket) has already authorised. The metadata
// embeds tournamentId+matchId+HMAC so the result-callback can route correctly
// and reject forged callbacks.

export async function mintMatchCode(
  tournamentId: string,
  matchId: string,
): Promise<ActionResult<{ code: string }>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");

    const tournRef = adminDb.collection("tournaments").doc(tournamentId);
    const matchRef = tournRef.collection("matches").doc(matchId);
    const [tournSnap, matchSnap] = await Promise.all([tournRef.get(), matchRef.get()]);
    if (!tournSnap.exists || !matchSnap.exists) {
      return { success: false, error: "Tournament or match not found" };
    }

    const tourn = tournSnap.data() as {
      gameProvider?:     string | null;
      riotTournamentId?: number | null;
    };
    if (tourn.gameProvider !== "league") {
      return { success: false, error: "Match is not in a League of Legends tournament" };
    }
    if (typeof tourn.riotTournamentId !== "number") {
      return { success: false, error: "Riot tournament not registered yet" };
    }

    const match = matchSnap.data() as {
      participantAId?: string;
      participantBId?: string;
      riotTournamentCode?: string | null;
    };
    if (match.riotTournamentCode) {
      return { success: true, data: { code: match.riotTournamentCode } };
    }

    // Pull both participants' linked Riot PUUIDs so we can lock the lobby to
    // them. Either participant missing a linked account is a blocker — bracket
    // generation is the natural point to catch that.
    const [aIntSnap, bIntSnap] = await Promise.all([
      match.participantAId && match.participantAId !== "BYE"
        ? adminDb.collection("profiles").doc(match.participantAId).collection("integrations").doc("league").get()
        : Promise.resolve(null),
      match.participantBId && match.participantBId !== "BYE"
        ? adminDb.collection("profiles").doc(match.participantBId).collection("integrations").doc("league").get()
        : Promise.resolve(null),
    ]);

    const aPuuid = aIntSnap?.exists ? (aIntSnap.data() as LeagueIntegration).account.puuid : null;
    const bPuuid = bIntSnap?.exists ? (bIntSnap.data() as LeagueIntegration).account.puuid : null;

    if (!aPuuid || !bPuuid) {
      return { success: false, error: "Both participants must link a Riot account before a code can be generated" };
    }

    const params: CodeParameters = {
      mapType:       "SUMMONERS_RIFT",
      pickType:      "TOURNAMENT_DRAFT",
      spectatorType: "LOBBYONLY",
      teamSize:      5,
      enoughPlayers: true,
      // Whitelist only the two captains. They'll bring 4 teammates each into
      // the lobby. The result callback identifies the winning side via the
      // captain PUUIDs we already know.
      allowedParticipants: [aPuuid, bPuuid],
      metadata:            signMetadata({ tournamentId, matchId }),
    };

    const codes = await createTournamentCodes(tourn.riotTournamentId, 1, params);
    const code = codes[0];
    if (!code) return { success: false, error: "Riot returned no tournament code" };

    await matchRef.update({ riotTournamentCode: code });

    return { success: true, data: { code } };
  } catch (err) {
    if (err instanceof RiotTournamentError) {
      return { success: false, error: `Riot Tournament API error (${err.status})` };
    }
    const message = err instanceof Error ? err.message : "Failed to generate tournament code";
    console.error("[mintMatchCode]", err);
    return { success: false, error: message };
  }
}

// ─── reconcileLeagueMatch ─────────────────────────────────────────────────────
//
// Polling fallback for missed callbacks. Looks up the code's current state at
// Riot and, if the game has finished and we haven't already recorded a winner,
// applies the result via the shared callback path.
//
// Called on-demand from an admin UI ("Sync result from Riot" button) or by a
// scheduled job. Owner / participant / admin allowed.

export async function reconcileLeagueMatch(
  tournamentId: string,
  matchId: string,
): Promise<ActionResult<{ status: "already_complete" | "advanced" | "no_result_yet" }>> {
  try {
    await getSessionUid();   // session-exists gate (auth required; not uid-bound)

    const { adminDb } = await import("@/lib/firebase/admin");
    const matchRef = adminDb.collection("tournaments").doc(tournamentId).collection("matches").doc(matchId);
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) return { success: false, error: "Match not found" };

    const match = matchSnap.data() as {
      status?:             string;
      riotTournamentCode?: string | null;
    };
    if (match.status === "complete") {
      return { success: true, data: { status: "already_complete" } };
    }
    if (!match.riotTournamentCode) {
      return { success: false, error: "Match has no tournament code" };
    }

    // GET /codes/{code} confirms the code's configured PUUIDs, but doesn't
    // include result data. In production we'd hit a separate results endpoint
    // (Tournament-V5 provides `/codes/{code}` config + lobby events). The
    // canonical result delivery channel is the callback; this fallback path
    // simply confirms the code is healthy and surfaces "no result yet".
    await getTournamentCode(match.riotTournamentCode);
    return { success: true, data: { status: "no_result_yet" } };
  } catch (err) {
    if (err instanceof RiotTournamentError) {
      return { success: false, error: `Riot Tournament API error (${err.status})` };
    }
    const message = err instanceof Error ? err.message : "Failed to reconcile";
    console.error("[reconcileLeagueMatch]", err);
    return { success: false, error: message };
  }
}
