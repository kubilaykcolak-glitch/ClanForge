// ─── Tournament-V5 client ────────────────────────────────────────────────────
//
// Wraps Riot's Tournament API for creating providers, registering tournaments,
// generating tournament codes, and reading match results.
//
// We default to Tournament-Stub-V5 in development — it works on a regular
// dev key without separate approval, returns the same response shapes as the
// production API, but does NOT actually run callbacks (no real games exist).
// Flip the RIOT_TOURNAMENT_USE_STUB env to "false" once Riot grants
// Tournament API production access.
//
// All Tournament endpoints live on the AMERICAS regional cluster — Riot
// hosts the tournament service in a single region globally, regardless of
// where players actually queue from.

const REGIONAL_HOST = "https://americas.api.riotgames.com";

function basePath(): string {
  return process.env.RIOT_TOURNAMENT_USE_STUB === "false"
    ? "/lol/tournament/v5"
    : "/lol/tournament-stub/v5";
}

class RiotTournamentError extends Error {
  constructor(public status: number, public body: string) {
    super(`Riot Tournament API ${status}: ${body.slice(0, 200)}`);
  }
}

async function riotFetch<T>(
  path: string,
  init: RequestInit & { method?: "GET" | "POST" } = {},
): Promise<T> {
  const key = process.env.RIOT_API_KEY;
  if (!key) throw new Error("RIOT_API_KEY not configured");

  const res = await fetch(`${REGIONAL_HOST}${path}`, {
    ...init,
    headers: {
      "X-Riot-Token": key,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new RiotTournamentError(res.status, body);
  }
  // Some endpoints return raw numbers / strings; parse defensively.
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Riot platform regions in the Tournament API enumeration. Differs slightly
 * from the lol-summoner platform enum — Tournament uses the older BR/EUNE/EUW
 * style.
 */
export type TournamentRegion =
  | "BR" | "EUNE" | "EUW" | "JP" | "LAN" | "LAS"
  | "NA" | "OCE" | "PBE" | "RU" | "TR" | "KR";

export interface ProviderRegistration {
  region: TournamentRegion;
  url: string;
}

export interface TournamentRegistration {
  providerId: number;
  name: string;
}

export interface CodeParameters {
  /** Map. Currently only "SUMMONERS_RIFT" is supported by Riot for codes. */
  mapType: "SUMMONERS_RIFT" | "HOWLING_ABYSS" | "TWISTED_TREELINE";
  pickType: "BLIND_PICK" | "DRAFT_MODE" | "ALL_RANDOM" | "TOURNAMENT_DRAFT";
  spectatorType: "NONE" | "LOBBYONLY" | "ALL";
  teamSize: number;          // 1..5
  enoughPlayers: boolean;    // if true, lobby auto-starts when full
  /** Optional whitelist of allowed PUUIDs. Leave undefined to let any player join. */
  allowedParticipants?: string[];
  /** Free-form string echoed back verbatim by the result callback. */
  metadata?: string;
}

/** Tournament code result returned by GET /codes/{code}. */
export interface TournamentCodeInfo {
  code: string;
  providerId: number;
  tournamentId: number;
  metaData: string;
  spectators: CodeParameters["spectatorType"];
  pickType:   CodeParameters["pickType"];
  mapType:    CodeParameters["mapType"];
  teamSize:   number;
  participants: string[];
}

/** A lobby/game lifecycle event for a single tournament code. */
export interface LobbyEvent {
  eventType: string;          // e.g. "PracticeGameCreatedEvent"
  puuid?:    string;
  timestamp: string;
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

/**
 * Register a provider — i.e. tell Riot which URL to POST match results to.
 * Done ONCE per ClanForge deployment per region. Provider ID is then reused
 * for every tournament we create with that region.
 */
export async function registerProvider(
  data: ProviderRegistration,
): Promise<number> {
  return riotFetch<number>(`${basePath()}/providers`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Register a tournament under an existing provider. Returns a tournamentId
 * we then attach to every code we generate for this tournament.
 */
export async function registerTournament(
  data: TournamentRegistration,
): Promise<number> {
  return riotFetch<number>(`${basePath()}/tournaments`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Generate one or more tournament codes for a given tournament. Each code
 * configures a custom lobby that players join from the LoL client.
 */
export async function createTournamentCodes(
  tournamentId: number,
  count: number,
  params: CodeParameters,
): Promise<string[]> {
  return riotFetch<string[]>(
    `${basePath()}/codes?count=${count}&tournamentId=${tournamentId}`,
    {
      method: "POST",
      body: JSON.stringify(params),
    },
  );
}

/** Fetch the configuration of an existing tournament code. */
export async function getTournamentCode(code: string): Promise<TournamentCodeInfo> {
  return riotFetch<TournamentCodeInfo>(`${basePath()}/codes/${encodeURIComponent(code)}`);
}

/**
 * Fetch the lifecycle events (lobby created, game started, etc) for a code.
 * Used by the polling fallback to detect a finished game even if the callback
 * never reached us.
 */
export async function getLobbyEvents(code: string): Promise<{ eventList: LobbyEvent[] }> {
  return riotFetch<{ eventList: LobbyEvent[] }>(
    `${basePath()}/lobby-events/by-code/${encodeURIComponent(code)}`,
  );
}

export { RiotTournamentError };
