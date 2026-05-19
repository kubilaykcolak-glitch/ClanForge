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

// ─── Rank tier ordering ──────────────────────────────────────────────────────
// Numeric rank used for tournament rank-restriction comparisons. Higher number
// = higher tier. "UNRANKED" sentinel sits below Iron so a restriction with a
// minTier of Iron can still allow unranked players via an explicit opt-in.

export const TIER_RANK: Record<string, number> = {
  UNRANKED:    0,
  IRON:        1,
  BRONZE:      2,
  SILVER:      3,
  GOLD:        4,
  PLATINUM:    5,
  EMERALD:     6,
  DIAMOND:     7,
  MASTER:      8,
  GRANDMASTER: 9,
  CHALLENGER:  10,
};

/** Tier strings the UI offers for the restriction picker (excludes UNRANKED). */
export const PICKABLE_TIERS: readonly string[] = [
  "IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD",
  "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER",
];

/** Title-cased label for a tier, e.g. "GOLD" → "Gold". */
export function tierLabel(tier: string): string {
  if (!tier) return "Any";
  return tier.charAt(0) + tier.slice(1).toLowerCase();
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

// ─── Item / summoner-spell / queue helpers ───────────────────────────────────
//
// All served from CommunityDragon's `latest` channel. We accept a fallback
// asset path on the client so a missing item (e.g. retired item id, empty
// slot) just renders a placeholder rather than a broken image.

export function itemIconUrl(itemId: number): string | null {
  if (!itemId || itemId === 0) return null;
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/item-icons/${itemId}.png`;
}

export function summonerSpellIconUrl(spellId: number): string | null {
  if (!spellId) return null;
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/data/spells/icons2d/summoner_${SUMMONER_SPELL_KEYS[spellId] ?? "unknown"}.png`;
}

// Riot's spell IDs → asset filename stems used by CommunityDragon's
// `data/spells/icons2d/summoner_<key>.png` route.
const SUMMONER_SPELL_KEYS: Record<number, string> = {
  1:  "boost",     // Cleanse
  3:  "exhaust",
  4:  "flash",
  6:  "haste",     // Ghost
  7:  "heal",
  11: "smite",
  12: "teleport",
  13: "mana",      // Clarity
  14: "dot",       // Ignite
  21: "barrier",
  32: "mark",      // Snowball / Mark (ARAM)
  39: "snowurfsnowball",
};

// Trimmed queue-id → display label map. Anything not listed falls back to
// the raw `gameMode` from the match doc.
const QUEUE_LABELS: Record<number, string> = {
  400:  "Normal Draft",
  420:  "Ranked Solo/Duo",
  430:  "Normal Blind",
  440:  "Ranked Flex",
  450:  "ARAM",
  490:  "Quickplay",
  700:  "Clash",
  720:  "ARAM Clash",
  830:  "Co-op vs AI Intro",
  840:  "Co-op vs AI Beginner",
  850:  "Co-op vs AI Intermediate",
  900:  "URF",
  1010: "Snow URF",
  1020: "One for All",
  1300: "Nexus Blitz",
  1400: "Ultimate Spellbook",
  1700: "Arena",
  1900: "URF",
};

export function queueLabel(queueId: number, fallback?: string): string {
  return QUEUE_LABELS[queueId] ?? fallback ?? `Queue ${queueId}`;
}

// ─── "x minutes/hours/days ago" — small, locale-agnostic ─────────────────────
//
// Same shape OP.GG-style cards use. Keeps the UI compact (single label,
// no seconds precision past the minute). Falls back to a date string for
// matches older than 30 days.

export function timeAgoCompact(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const min = Math.floor(diff / 60_000);
  if (min < 1)  return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7)   return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 4)   return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return new Date(ms).toLocaleDateString();
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}
