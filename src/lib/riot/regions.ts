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

// Platform → Regional routing host for account-v1 / match-v5.
const REGIONAL_MAP: Record<LolPlatformRegion, "americas" | "europe" | "asia" | "sea"> = {
  na1: "americas", br1: "americas", la1: "americas", la2: "americas", oc1: "sea",
  euw1: "europe", eun1: "europe", tr1: "europe", ru: "europe",
  kr: "asia", jp1: "asia",
  ph2: "sea", sg2: "sea", th2: "sea", tw2: "sea", vn2: "sea",
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
