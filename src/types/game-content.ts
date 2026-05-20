// ─── Game content (Arc Raiders Guides / Items / Locations / Updates) ────────
//
// One shared collection /game_content/{id} carries every CMS-style entry for
// every game. The (gameSlug, type, status) triple narrows the read; the body
// renders as plain text with preserved line breaks (no markdown engine — yet).
// Server actions in src/lib/actions/game-content.actions.ts are the only
// write path; rules forbid client writes.

import type { GameSlug } from "@/lib/games/types";

export type GameContentType = "guides" | "items" | "locations" | "updates";

export type GameContentStatus = "draft" | "published";

export interface GameContent {
  id?:           string;
  gameSlug:      GameSlug;
  type:          GameContentType;
  /** URL-safe slug, unique per (gameSlug, type). Used for deep-linking. */
  slug:          string;
  title:         string;
  /** One-line teaser shown in the card list. */
  summary:       string;
  /** Plain text body, line breaks preserved on render. Capped at 8000 chars. */
  body:          string;
  heroImageUrl?: string | null;
  /** External link (e.g. Riot/dev blog for updates). Optional. */
  externalUrl?:  string | null;
  status:        GameContentStatus;
  authorUid:     string;
  authorName:    string;
  createdAt:     Date;
  updatedAt:     Date;
  /** Set when status flips to 'published'. Drives the public list order. */
  publishedAt?:  Date | null;
}

export const CONTENT_TYPE_LABELS: Record<GameContentType, { singular: string; plural: string }> = {
  guides:    { singular: "Guide",    plural: "Guides"    },
  items:     { singular: "Item",     plural: "Items"     },
  locations: { singular: "Location", plural: "Locations" },
  updates:   { singular: "Update",   plural: "Updates"   },
};
