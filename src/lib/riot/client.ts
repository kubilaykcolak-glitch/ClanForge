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
  summonerId: string,
  region: LolPlatformRegion,
): Promise<RiotLeagueEntry[]> {
  const url = `${platformHost(region)}/lol/league/v4/entries/by-summoner/${encodeURIComponent(summonerId)}`;
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

export { RiotApiError };
