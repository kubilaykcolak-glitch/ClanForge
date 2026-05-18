// ─── Client-safe game metadata ────────────────────────────────────────────────
//
// Static record of every supported game's display metadata — slug, name,
// accent colour, tagline, banner / logo paths. Contains NO section loaders,
// so it can be imported into client components (sidebar, future game pickers)
// without pulling server-only modules into the client bundle.
//
// `src/lib/games/registry.ts` composes this with the section-loader arrays.
// Keep the two in sync: every entry here MUST have a matching entry in the
// registry.

import type { GameSlug } from "./types";

export interface GameMeta {
  slug:        GameSlug;
  name:        string;
  shortName:   string;
  bannerSrc:   string;
  logoSrc:     string;
  accentColor: string;
  tagline:     string;
}

export const GAMES_META: Record<GameSlug, GameMeta> = {
  "league-of-legends": {
    slug:        "league-of-legends",
    name:        "League of Legends",
    shortName:   "LoL",
    bannerSrc:   "/games/league-of-legends/banner.webp",
    logoSrc:     "/games/league-of-legends/logo.webp",
    accentColor: "#c89b3c",
    tagline:     "Tournaments, ladders, and clan competition on the Rift.",
  },
  "arc-raiders": {
    slug:        "arc-raiders",
    name:        "Arc Raiders",
    shortName:   "Arc Raiders",
    bannerSrc:   "/games/arc-raiders/banner.webp",
    logoSrc:     "/games/arc-raiders/logo.webp",
    accentColor: "#f59e0b",
    tagline:     "Squad up, raid the surface, and stay off the bounty list.",
  },
};

export function listGameMeta(): GameMeta[] {
  return Object.values(GAMES_META);
}
