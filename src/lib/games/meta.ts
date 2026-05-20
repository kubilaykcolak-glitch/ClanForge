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

/** Visual theme tokens consumed by GameHubBanner. Designed so each game can
 *  declare its own palette + decorative motif without the banner needing a
 *  switch statement. All optional fields fall back to neutral defaults. */
export interface GameTheme {
  /** Base dark-mode tint that anchors the banner background. */
  bgBase:    string;
  /** Lighter mid-tone used for the gradient sweep. */
  bgMid:     string;
  /** Primary accent — used for the top stripe + logo tile + heading glow. */
  accent:    string;
  /** Secondary accent — used for the decorative motif + sub-headings. */
  secondary: string;
  /** Subtitle hue — keep it readable against bgMid. */
  subtitle:  string;
  /** Decorative motif rendered as a low-opacity SVG overlay on the banner. */
  motif:     "hex" | "scanlines" | "none";
}

export interface GameMeta {
  slug:        GameSlug;
  name:        string;
  shortName:   string;
  bannerSrc:   string;
  logoSrc:     string;
  accentColor: string;
  tagline:     string;
  theme:       GameTheme;
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
    theme: {
      bgBase:    "#091428",   // hextech deep navy
      bgMid:     "#0a1f3d",
      accent:    "#c89b3c",   // Riot gold
      secondary: "#0ac8b9",   // hextech cyan
      subtitle:  "#a09b8c",
      motif:     "hex",
    },
  },
  "arc-raiders": {
    slug:        "arc-raiders",
    name:        "Arc Raiders",
    shortName:   "Arc Raiders",
    bannerSrc:   "/games/arc-raiders/banner.webp",
    logoSrc:     "/games/arc-raiders/logo.webp",
    accentColor: "#f59e0b",
    tagline:     "Squad up, raid the surface, and stay off the bounty list.",
    theme: {
      bgBase:    "#171410",   // burnt-earth charcoal
      bgMid:     "#2a2520",
      accent:    "#f59e0b",   // raider amber
      secondary: "#d97706",
      subtitle:  "#b8a99a",
      motif:     "scanlines",
    },
  },
};

export function listGameMeta(): GameMeta[] {
  return Object.values(GAMES_META);
}
