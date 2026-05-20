// ─── Game registry types ─────────────────────────────────────────────────────
//
// The /games hub is registry-driven. Each game declares its own ordered list
// of sections. Routing validates that the requested (gameSlug, sectionSlug)
// pair exists AND is marked `live` — anything `hidden` 404s rather than
// rendering a "coming soon" placeholder. Adding a new section to a game is a
// one-line edit to that game's `sections` array plus the component file.

import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { GameTheme } from "./meta";

// Allow-listed game slugs. Adding a new game = add a new union member here
// AND a new entry in `GAMES`. The router refuses anything outside this set.
export type GameSlug = "league-of-legends" | "arc-raiders";

export const GAME_SLUGS: GameSlug[] = ["league-of-legends", "arc-raiders"];

export function isGameSlug(slug: string): slug is GameSlug {
  return (GAME_SLUGS as string[]).includes(slug);
}

export interface GameSectionProps {
  gameSlug:    GameSlug;
  /** Human-readable name as stored on tournament/clan documents. */
  gameName:    string;
}

export interface GameSection {
  slug:   string;
  label:  string;
  icon:   LucideIcon;
  /** `hidden` sections are pre-registered but render-gated until a follow-up
   * spec wires their real component. Hidden sections do not appear in the
   * tab nav and 404 if linked directly. */
  status: "live" | "hidden";
  /** Dynamic import for the section component — produces its own JS chunk
   * so visiting a game hub only ships the chunks of `live` sections the
   * user actually clicks into. Server components by default. */
  loader: () => Promise<{ default: ComponentType<GameSectionProps> }>;
}

export interface GameDefinition {
  slug:        GameSlug;
  /** Display name. Also used as the equality filter against the existing
   * `tournaments.game` and `clans.gameFocus` fields, so it MUST match
   * whatever the tournament/clan creation forms write. */
  name:        string;
  shortName:   string;
  /** Path under /public — banner shown across the top of the game hub. */
  bannerSrc:   string;
  /** Path under /public — small square logo used in tabs/cards. */
  logoSrc:     string;
  /** Either a CSS color or a `var(--…)` token. Powers the accent stripe,
   * active-tab underline, and game-tile border. */
  accentColor: string;
  /** Short blurb under the title on the hub banner. */
  tagline:     string;
  /** Ordered — first section is the default landing (rendered at
   * /games/[gameSlug]). Only `live` sections appear in the tab nav. */
  sections:    GameSection[];
  /** Per-game visual theme tokens used by GameHubBanner / sidebar. */
  theme:       GameTheme;
}
