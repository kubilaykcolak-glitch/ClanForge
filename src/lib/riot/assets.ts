// Champion icons via CommunityDragon — a community-maintained CDN backed by
// Riot's data files. It serves icons directly by championId, so we don't have
// to ship a championId→key map on the client.
//
// Docs: https://www.communitydragon.org/
export function championIconUrl(championId: number): string {
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${championId}.png`;
}

// Profile icon via Data Dragon (Riot's official CDN).
export function profileIconUrl(version: string, iconId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${iconId}.png`;
}

// ─── Rank tier colour palette ────────────────────────────────────────────────
// Drives the rank-chip tint on the LinkedGameCard. Kept close to canonical
// Riot client colours but biased slightly to match the Arena palette.
export const TIER_COLOURS: Record<string, string> = {
  IRON:        "#6e4a3e",
  BRONZE:      "#cd7f32",
  SILVER:      "#c0c0c0",
  GOLD:        "#fbbf24",
  PLATINUM:    "#22d3ee",
  EMERALD:     "#50c878",
  DIAMOND:     "#8b5cf6",
  MASTER:      "#e879f9",
  GRANDMASTER: "#ef4444",
  CHALLENGER:  "#fde047",
};

export function tierColour(tier: string | undefined | null): string {
  if (!tier) return "var(--text-muted)";
  return TIER_COLOURS[tier.toUpperCase()] ?? "var(--text-muted)";
}

export function formatRank(tier: string, division: string): string {
  const t = tier.charAt(0) + tier.slice(1).toLowerCase();
  // Master, Grandmaster, Challenger don't carry a division.
  if (["MASTER", "GRANDMASTER", "CHALLENGER"].includes(tier.toUpperCase())) return t;
  return division ? `${t} ${division}` : t;
}
