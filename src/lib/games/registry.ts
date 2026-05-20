// ─── Game registry ────────────────────────────────────────────────────────────
//
// Source of truth for which games exist, what they're called, and what
// sections their hub exposes. Static — no DB calls. The router and the
// sidebar both read from here.
//
// Adding a section to a game:
//   1. Write the section component under `src/components/games/sections/`
//      (server component, accepts `GameSectionProps`).
//   2. Add a new entry to that game's `sections` array below, pointing the
//      `loader` at the component.
//   3. Status `hidden` keeps the route 404 but pre-reserves the slug for a
//      later launch — flip to `live` to ship.

import { Activity, Crosshair, FileText, Flag, MapPin, MessagesSquare,
  Newspaper, Shield, Sparkles, Sword, Swords, Target, Trophy, Users } from "lucide-react";
import type { GameDefinition, GameSlug } from "./types";
import { GAMES_META } from "./meta";

// Shared sections — same component for every game, filtered by gameName.
const overviewSection = {
  slug:   "overview",
  label:  "Overview",
  icon:   Sparkles,
  status: "live" as const,
  loader: () => import("@/components/games/sections/OverviewSection"),
};

const tournamentsSection = {
  slug:   "tournaments",
  label:  "Tournaments",
  icon:   Trophy,
  status: "live" as const,
  loader: () => import("@/components/games/sections/TournamentsSection"),
};

const matchmakingSection = {
  slug:   "matchmaking",
  label:  "Matchmaking",
  icon:   Users,
  status: "live" as const,
  loader: () => import("@/components/games/sections/MatchmakingSection"),
};

const clansSection = {
  slug:   "clans",
  label:  "Clans",
  icon:   Shield,
  status: "live" as const,
  loader: () => import("@/components/games/sections/ClansSection"),
};

const challengesSection = {
  slug:   "challenges",
  label:  "Challenges",
  icon:   Target,
  status: "live" as const,
  loader: () => import("@/components/games/sections/ChallengesSection"),
};

// Game-specific hidden sections — pre-reserved routes are wired with their
// real component once they ship; nothing is currently hidden. If a future
// section needs to be pre-reserved without a component, point it at
// `@/components/games/sections/HiddenSection`.

export const GAMES: Record<GameSlug, GameDefinition> = {
  "league-of-legends": {
    ...GAMES_META["league-of-legends"],
    sections: [
      overviewSection,
      tournamentsSection,
      matchmakingSection,
      clansSection,
      challengesSection,
      // ── Spec #2a (My Profile) is live; Ladder and Live Now stay hidden
      //    until their own follow-ups land. ──
      { slug: "profile",  label: "My Profile",  icon: Activity, status: "live",   loader: () => import("@/components/games/sections/LeagueProfileSection") },
      { slug: "ladder",   label: "Ladder",      icon: Trophy,   status: "live",   loader: () => import("@/components/games/sections/LeagueLadderSection") },
      { slug: "live-now", label: "Live Now",    icon: Swords,   status: "live",   loader: () => import("@/components/games/sections/LeagueLiveNowSection") },
    ],
  },
  "arc-raiders": {
    ...GAMES_META["arc-raiders"],
    sections: [
      overviewSection,
      tournamentsSection,
      matchmakingSection,
      clansSection,
      challengesSection,
      { slug: "wanted",    label: "Wanted",      icon: Crosshair,      status: "live",   loader: () => import("@/components/games/sections/ArcRaidersWantedSection") },
      // ── Content sections live (admin authors via /admin/game-content) ──
      { slug: "guides",    label: "Guides",      icon: FileText,       status: "live",   loader: () => import("@/components/games/sections/ArcRaidersGuidesSection") },
      { slug: "items",     label: "Items",       icon: Sword,          status: "live",   loader: () => import("@/components/games/sections/ArcRaidersItemsSection") },
      { slug: "locations", label: "Locations",   icon: MapPin,         status: "live",   loader: () => import("@/components/games/sections/ArcRaidersLocationsSection") },
      { slug: "updates",   label: "Updates",     icon: Newspaper,      status: "live",   loader: () => import("@/components/games/sections/ArcRaidersUpdatesSection") },
    ],
  },
};

// Suppress unused-import warnings for icons we wired into hidden entries —
// they ARE used above, this just helps linters that mis-trace them.
void [MessagesSquare, Flag];

export function getGame(slug: string): GameDefinition | null {
  return (GAMES as Record<string, GameDefinition | undefined>)[slug] ?? null;
}

export function getLiveSection(game: GameDefinition, sectionSlug: string) {
  const section = game.sections.find(s => s.slug === sectionSlug);
  if (!section || section.status !== "live") return null;
  return section;
}

export function getDefaultSection(game: GameDefinition) {
  return game.sections.find(s => s.status === "live") ?? null;
}

export function getLiveSections(game: GameDefinition) {
  return game.sections.filter(s => s.status === "live");
}

export function listGames(): GameDefinition[] {
  return Object.values(GAMES);
}
