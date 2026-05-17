// Riot platform regions (used by summoner-v4, league-v4, champion-mastery-v4)
// mapped to their regional routing value (used by account-v1, match-v5).
//
// Source: https://developer.riotgames.com/docs/lol

export const LOL_PLATFORM_REGIONS = [
  "na1", "euw1", "eun1", "kr",  "jp1",
  "br1", "la1",  "la2",  "oc1",
  "tr1", "ru",
  "ph2", "sg2",  "th2",  "tw2", "vn2",
] as const;

export type LolPlatformRegion = typeof LOL_PLATFORM_REGIONS[number];

export const PLATFORM_LABELS: Record<LolPlatformRegion, string> = {
  na1:  "North America",
  euw1: "Europe West",
  eun1: "Europe Nordic & East",
  kr:   "Korea",
  jp1:  "Japan",
  br1:  "Brazil",
  la1:  "LAN",
  la2:  "LAS",
  oc1:  "Oceania",
  tr1:  "Turkey",
  ru:   "Russia",
  ph2:  "Philippines",
  sg2:  "Singapore",
  th2:  "Thailand",
  tw2:  "Taiwan",
  vn2:  "Vietnam",
};

// Platform → Regional routing host for account-v1.
//
// account-v1 ONLY exists on americas / europe / asia hosts. Riot's `sea` host
// is a match-v5-only cluster — calling account-v1 against it 403s. So SEA
// platforms route to `asia` here.
const REGIONAL_MAP: Record<LolPlatformRegion, "americas" | "europe" | "asia"> = {
  na1:  "americas", br1: "americas", la1: "americas", la2: "americas",
  oc1:  "americas", // OCE historically routed to americas for account-v1
  euw1: "europe",   eun1: "europe", tr1: "europe",   ru:  "europe",
  kr:   "asia",     jp1: "asia",
  ph2:  "asia",     sg2: "asia",    th2: "asia",     tw2: "asia", vn2: "asia",
};

export function platformHost(region: LolPlatformRegion): string {
  return `https://${region}.api.riotgames.com`;
}

export function regionalHost(region: LolPlatformRegion): string {
  return `https://${REGIONAL_MAP[region]}.api.riotgames.com`;
}

export function isLolPlatformRegion(value: unknown): value is LolPlatformRegion {
  return typeof value === "string" && (LOL_PLATFORM_REGIONS as readonly string[]).includes(value);
}

// ─── Tournament-V5 region mapping ────────────────────────────────────────────
//
// Tournament-V5 uses a separate region enum from summoner-v4. PH/SG/TH/TW/VN
// are not supported by the Tournament service — those servers don't run
// tournament custom games. Returns null for unsupported platforms; callers
// must surface a clear "region not supported" error.
import type { TournamentRegion } from "./tournament";

const PLATFORM_TO_TOURNAMENT_REGION: Record<LolPlatformRegion, TournamentRegion | null> = {
  na1: "NA",  euw1: "EUW", eun1: "EUNE", kr: "KR",  jp1: "JP",
  br1: "BR",  la1:  "LAN", la2:  "LAS",  oc1: "OCE",
  tr1: "TR",  ru:   "RU",
  ph2: null,  sg2: null,   th2:  null,   tw2: null, vn2: null,
};

export function platformToTournamentRegion(p: LolPlatformRegion): TournamentRegion | null {
  return PLATFORM_TO_TOURNAMENT_REGION[p];
}

export const TOURNAMENT_REGION_LABELS: Record<TournamentRegion, string> = {
  NA: "North America",  EUW: "Europe West", EUNE: "Europe Nordic & East",
  KR: "Korea",          JP:  "Japan",
  BR: "Brazil",         LAN: "Latin America North", LAS: "Latin America South",
  OCE: "Oceania",       TR:  "Turkey",      RU: "Russia", PBE: "PBE",
};

export const TOURNAMENT_REGIONS: readonly TournamentRegion[] = [
  "NA", "EUW", "EUNE", "KR", "JP",
  "BR", "LAN", "LAS", "OCE", "TR", "RU",
] as const;
