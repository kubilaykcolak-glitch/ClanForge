// ─── Clan Level System ─────────────────────────────────────────────────────────
//
// Single source of truth for clan leveling.  Pure data — no I/O.
// awardClanXp (clan-xp.actions.ts) reads from here to detect level-ups.

export type ClanTier =
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "diamond"
  | "legendary";

export type ClanPerkType =
  | "member_cap"   // recommended member-limit increase
  | "badge"        // badge slug unlocked for the clan identity
  | "cosmetic"     // cosmetic feature unlocked
  | "visibility"   // directory/search visibility boost
  | "tournament";  // access to exclusive tournaments

export interface ClanPerk {
  type:        ClanPerkType;
  description: string;
  /** Numeric value for member_cap perks; badge slug for badge perks. */
  value?:      string | number;
}

export interface ClanLevelDef {
  level:       number;
  xpRequired:  number;
  tier:        ClanTier;
  /** Display name shown in badges and notifications. */
  name:        string;
  /** Emoji icon for this tier. */
  icon:        string;
  perks:       ClanPerk[];
}

// ── Level table ───────────────────────────────────────────────────────────────

export const CLAN_LEVELS: ClanLevelDef[] = [
  {
    level:      1,
    xpRequired: 0,
    tier:       "bronze",
    name:       "Recruit",
    icon:       "🥉",
    perks:      [],
  },
  {
    level:      2,
    xpRequired: 1_000,
    tier:       "bronze",
    name:       "Established",
    icon:       "🥉",
    perks: [
      { type: "member_cap",  description: "Expand roster to 25 members",      value: 25 },
      { type: "badge",       description: "Established Clan badge",            value: "established_clan" },
    ],
  },
  {
    level:      3,
    xpRequired: 2_500,
    tier:       "silver",
    name:       "Rising",
    icon:       "🥈",
    perks: [
      { type: "member_cap",  description: "Expand roster to 30 members",      value: 30 },
      { type: "cosmetic",    description: "Custom clan banner upload",         value: "clan_banner" },
    ],
  },
  {
    level:      4,
    xpRequired: 5_000,
    tier:       "silver",
    name:       "Proven",
    icon:       "🥈",
    perks: [
      { type: "member_cap",  description: "Expand roster to 35 members",      value: 35 },
      { type: "cosmetic",    description: "Profile border for all members",    value: "profile_border_silver" },
    ],
  },
  {
    level:      5,
    xpRequired: 10_000,
    tier:       "gold",
    name:       "Veteran",
    icon:       "🥇",
    perks: [
      { type: "member_cap",  description: "Expand roster to 40 members",      value: 40 },
      { type: "badge",       description: "Veterans badge",                    value: "clan_veterans" },
      { type: "cosmetic",    description: "Clan emoji in tag",                 value: "clan_emoji" },
    ],
  },
  {
    level:      6,
    xpRequired: 18_000,
    tier:       "gold",
    name:       "Elite",
    icon:       "🥇",
    perks: [
      { type: "member_cap",  description: "Expand roster to 50 members",      value: 50 },
      { type: "visibility",  description: "Featured placement in clan directory" },
    ],
  },
  {
    level:      7,
    xpRequired: 30_000,
    tier:       "platinum",
    name:       "Champion",
    icon:       "💎",
    perks: [
      { type: "member_cap",  description: "Expand roster to 60 members",      value: 60 },
      { type: "tournament",  description: "Exclusive Champion-tier tournaments" },
    ],
  },
  {
    level:      8,
    xpRequired: 50_000,
    tier:       "platinum",
    name:       "Legend",
    icon:       "💎",
    perks: [
      { type: "member_cap",  description: "Expand roster to 75 members",      value: 75 },
      { type: "badge",       description: "Elite Clan badge",                  value: "clan_elite" },
    ],
  },
  {
    level:      9,
    xpRequired: 80_000,
    tier:       "diamond",
    name:       "Titan",
    icon:       "👑",
    perks: [
      { type: "member_cap",  description: "Expand roster to 90 members",      value: 90 },
      { type: "cosmetic",    description: "Profile border for all members",    value: "profile_border_diamond" },
    ],
  },
  {
    level:      10,
    xpRequired: 120_000,
    tier:       "legendary",
    name:       "Mythic",
    icon:       "🌟",
    perks: [
      { type: "member_cap",  description: "Maximum 100-member roster",        value: 100 },
      { type: "badge",       description: "Mythic Clan badge",                 value: "clan_mythic" },
      { type: "visibility",  description: "Permanent featured placement" },
      { type: "tournament",  description: "All exclusive tournament access" },
    ],
  },
];

// ── Tier colour tokens (CSS variable keys) ────────────────────────────────────

export const TIER_COLORS: Record<ClanTier, { bg: string; text: string; border: string }> = {
  bronze:    { bg: "rgba(180,120,60,0.15)",  text: "#b4783c", border: "rgba(180,120,60,0.3)"  },
  silver:    { bg: "rgba(160,170,180,0.15)", text: "#a0aab4", border: "rgba(160,170,180,0.3)" },
  gold:      { bg: "rgba(234,179,8,0.15)",   text: "#eab308", border: "rgba(234,179,8,0.3)"   },
  platinum:  { bg: "rgba(148,163,184,0.15)", text: "#94a3b8", border: "rgba(148,163,184,0.3)" },
  diamond:   { bg: "rgba(56,189,248,0.15)",  text: "#38bdf8", border: "rgba(56,189,248,0.3)"  },
  legendary: { bg: "rgba(168,85,247,0.18)",  text: "#a855f7", border: "rgba(168,85,247,0.35)" },
};

// ── Utility functions ─────────────────────────────────────────────────────────

/** Returns the ClanLevelDef for a given XP total. */
export function getClanLevel(xp: number): ClanLevelDef {
  let current = CLAN_LEVELS[0];
  for (const def of CLAN_LEVELS) {
    if (xp >= def.xpRequired) {
      current = def;
    } else {
      break;
    }
  }
  return current;
}

export interface ClanLevelProgress {
  /** Current level definition. */
  current:     ClanLevelDef;
  /** Next level definition, null if max level. */
  next:        ClanLevelDef | null;
  /** XP accumulated within the current level (0 → xpToNext). */
  xpIntoLevel: number;
  /** XP needed to reach the next level, 0 at max level. */
  xpToNext:    number;
  /** 0–100 percentage progress to next level. */
  percentDone: number;
}

export function getClanLevelProgress(xp: number): ClanLevelProgress {
  const current  = getClanLevel(xp);
  const nextIdx  = CLAN_LEVELS.findIndex(d => d.level === current.level + 1);
  const next     = nextIdx === -1 ? null : CLAN_LEVELS[nextIdx];

  if (!next) {
    return { current, next: null, xpIntoLevel: 0, xpToNext: 0, percentDone: 100 };
  }

  const xpIntoLevel = xp - current.xpRequired;
  const xpSpan      = next.xpRequired - current.xpRequired;
  const percentDone = Math.min(100, Math.round((xpIntoLevel / xpSpan) * 100));

  return { current, next, xpIntoLevel, xpToNext: xpSpan - xpIntoLevel, percentDone };
}
