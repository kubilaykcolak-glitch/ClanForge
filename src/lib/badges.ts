// ─── Badge definitions ────────────────────────────────────────────────────────
//
// Single source of truth for all earnable badges. Badge slugs are stored in
// profile.badges[] and clan challenge reward configs. The emoji is used for
// display; the label is used in toasts and profile cards.

export interface BadgeDefinition {
  slug:        string;
  label:       string;
  emoji:       string;
  description: string;
  /** "challenge" | "tournament" | "social" | "special" */
  category:    string;
}

export const BADGE_DEFINITIONS: Record<string, BadgeDefinition> = {
  // ── Challenge badges ────────────────────────────────────────────────────────
  first_challenge: {
    slug: "first_challenge", label: "First Blood",
    emoji: "⚔️", category: "challenge",
    description: "Completed your first clan challenge",
  },
  challenge_champion: {
    slug: "challenge_champion", label: "Challenge Champion",
    emoji: "🏆", category: "challenge",
    description: "Completed 10 clan challenges",
  },
  weekly_warrior: {
    slug: "weekly_warrior", label: "Weekly Warrior",
    emoji: "🛡️", category: "challenge",
    description: "Completed a weekly clan challenge",
  },
  post_legend: {
    slug: "post_legend", label: "Post Legend",
    emoji: "📣", category: "social",
    description: "Contributed to a posting challenge",
  },
  recruiter: {
    slug: "recruiter", label: "Recruiter",
    emoji: "🎯", category: "social",
    description: "Contributed to a recruitment challenge",
  },
  tournament_hunter: {
    slug: "tournament_hunter", label: "Tournament Hunter",
    emoji: "🎮", category: "tournament",
    description: "Contributed to a tournament participation challenge",
  },
  season_1_champion: {
    slug: "season_1_champion", label: "Season 1 Champion",
    emoji: "👑", category: "special",
    description: "Ranked #1 in Season 1",
  },
  top_3_season: {
    slug: "top_3_season", label: "Podium Finish",
    emoji: "🥉", category: "special",
    description: "Finished in the top 3 of a season",
  },
};

export function getBadge(slug: string): BadgeDefinition | null {
  return BADGE_DEFINITIONS[slug] ?? null;
}
