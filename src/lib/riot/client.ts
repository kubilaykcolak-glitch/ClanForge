import { platformHost, regionalHost, type LolPlatformRegion } from "./regions";

// ─── Internal fetch wrapper ───────────────────────────────────────────────────
//
// Riot expects the API key in the X-Riot-Token header. Never log this header
// and never send any caller-supplied value into it — it is sourced once from
// the server environment.

class RiotApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`Riot API ${status}: ${body.slice(0, 200)}`);
  }
}

async function riotFetch<T>(url: string): Promise<T> {
  const key = process.env.RIOT_API_KEY;
  if (!key) throw new Error("RIOT_API_KEY not configured");

  const res = await fetch(url, {
    headers: { "X-Riot-Token": key },
    // Riot data updates infrequently; we cache at the Firestore layer ourselves.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new RiotApiError(res.status, body);
  }
  return res.json() as Promise<T>;
}

// ─── Response shapes (only the fields we use) ────────────────────────────────

interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

interface RiotSummoner {
  id: string;            // encrypted summonerId — used by league-v4
  puuid: string;
  profileIconId: number;
  summonerLevel: number;
}

interface RiotLeagueEntry {
  queueType: string;     // "RANKED_SOLO_5x5" | "RANKED_FLEX_SR" | …
  tier: string;          // "IRON" .. "CHALLENGER"
  rank: string;          // "I" .. "IV"
  leaguePoints: number;
  wins: number;
  losses: number;
}

interface RiotChampionMastery {
  championId: number;
  championLevel: number;
  championPoints: number;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function fetchAccountByRiotId(
  gameName: string,
  tagLine: string,
  region: LolPlatformRegion,
): Promise<RiotAccount> {
  const url = `${regionalHost(region)}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  return riotFetch<RiotAccount>(url);
}

export async function fetchSummonerByPuuid(
  puuid: string,
  region: LolPlatformRegion,
): Promise<RiotSummoner> {
  const url = `${platformHost(region)}/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`;
  return riotFetch<RiotSummoner>(url);
}

export async function fetchLeagueEntries(
  puuid: string,
  region: LolPlatformRegion,
): Promise<RiotLeagueEntry[]> {
  // Riot deprecated /entries/by-summoner/{summonerId} in favour of by-puuid
  // as part of their broader PUUID migration. Always use by-puuid here.
  const url = `${platformHost(region)}/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`;
  return riotFetch<RiotLeagueEntry[]>(url);
}

export async function fetchTopMastery(
  puuid: string,
  region: LolPlatformRegion,
  count = 3,
): Promise<RiotChampionMastery[]> {
  const url = `${platformHost(region)}/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(puuid)}/top?count=${count}`;
  return riotFetch<RiotChampionMastery[]>(url);
}

// ─── match-v5 (regional routing) ─────────────────────────────────────────────

export async function fetchMatchIdsByPuuid(
  puuid: string,
  region: LolPlatformRegion,
  opts: { count?: number; start?: number; queue?: number; type?: string } = {},
): Promise<string[]> {
  const q = new URLSearchParams();
  q.set("count", String(opts.count ?? 20));
  if (opts.start !== undefined) q.set("start", String(opts.start));
  if (opts.queue !== undefined) q.set("queue", String(opts.queue));
  if (opts.type)                q.set("type",  opts.type);
  const url = `${regionalHost(region)}/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${q.toString()}`;
  return riotFetch<string[]>(url);
}

// Subset of the match-v5 `/matches/{matchId}` shape — we only persist the
// fields the UI actually renders. Anything we don't list here is discarded
// at the boundary, keeping our cached docs lean.
export interface RiotMatchParticipant {
  puuid:                 string;
  riotIdGameName?:       string;
  riotIdTagline?:        string;
  summonerName?:         string;
  championId:            number;
  championName:          string;
  champLevel:            number;
  teamId:                number;
  teamPosition?:         string;
  kills:                 number;
  deaths:                number;
  assists:               number;
  totalMinionsKilled:    number;
  neutralMinionsKilled:  number;
  win:                   boolean;
  summoner1Id:           number;
  summoner2Id:           number;
  item0:                 number;
  item1:                 number;
  item2:                 number;
  item3:                 number;
  item4:                 number;
  item5:                 number;
  item6:                 number;
  doubleKills:           number;
  tripleKills:           number;
  quadraKills:           number;
  pentaKills:            number;
  visionScore:           number;
  goldEarned:            number;
  totalDamageDealtToChampions: number;
}

export interface RiotMatchInfo {
  gameId:        number;
  gameCreation:  number; // ms epoch
  gameStartTimestamp?: number;
  gameDuration:  number; // seconds (or ms — depends on patch; account for both)
  gameMode:      string;
  gameType:      string;
  gameVersion:   string;
  queueId:       number;
  mapId:         number;
  platformId:    string;
  participants:  RiotMatchParticipant[];
}

export interface RiotMatch {
  metadata: { matchId: string; dataVersion: string; participants: string[] };
  info:     RiotMatchInfo;
}

export async function fetchMatchById(
  matchId: string,
  region: LolPlatformRegion,
): Promise<RiotMatch> {
  const url = `${regionalHost(region)}/lol/match/v5/matches/${encodeURIComponent(matchId)}`;
  return riotFetch<RiotMatch>(url);
}

// ─── spectator-v5 ────────────────────────────────────────────────────────────
// Returns the active game for a puuid, or null if the player is not currently
// in a game. 404 is the documented "not in game" signal; we swallow it.

export interface RiotActiveGameParticipant {
  puuid:         string;
  riotId?:       string;
  championId:    number;
  teamId:        number;
  spell1Id:      number;
  spell2Id:      number;
}

export interface RiotActiveGame {
  gameId:         number;
  gameMode:       string;
  gameType:       string;
  gameQueueConfigId: number;
  mapId:          number;
  gameStartTime:  number; // ms epoch (0 while in champ select)
  gameLength:     number; // seconds
  platformId:     string;
  participants:   RiotActiveGameParticipant[];
}

export async function fetchActiveGameByPuuid(
  puuid: string,
  region: LolPlatformRegion,
): Promise<RiotActiveGame | null> {
  const url = `${platformHost(region)}/lol/spectator/v5/active-games/by-summoner/${encodeURIComponent(puuid)}`;
  try {
    return await riotFetch<RiotActiveGame>(url);
  } catch (err) {
    if (err instanceof RiotApiError && err.status === 404) return null;
    throw err;
  }
}

export { RiotApiError };
