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

/** Free-form chip tag — used for item rarity, weapon class, "found at" location,
 *  map filter, etc. Single namespace for all content types. */
export type ContentTag = string;

export interface ContentLink {
  label: string;
  url:   string;
}

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
  /** Additional images (item screenshots, multi-angle, heatmap layers). Max 8. */
  gallery?:      string[];
  /** Free-form chip tags shown above the body. Max 12 entries, 40 chars each. */
  tags?:         ContentTag[];
  /** Multiple labelled external links (wiki page, video guide, dev post). Max 6. */
  links?:        ContentLink[];
  /** Legacy single external link — kept for backward compatibility. New entries
   *  should prefer `links`. */
  externalUrl?:  string | null;

  // ─── Item-specific structured data (optional, items only) ────────────────
  stats?:    ItemStat[];
  crafting?: ItemCrafting;
  upgrades?: UpgradeTier[];
  status:        GameContentStatus;
  authorUid:     string;
  authorName:    string;
  createdAt:     Date;
  updatedAt:     Date;
  /** Set when status flips to 'published'. Drives the public list order. */
  publishedAt?:  Date | null;
}

// ─── Item-specific structured data (only relevant for type === "items") ─────
//
// Pulled from the source wiki at fetch time, not authored by hand. The
// renderer treats every field as optional — entries written before the
// schema extension still render correctly without these blocks.

export interface ItemStat {
  label: string;
  value: string;
}

export interface ItemMaterial {
  name: string;
  qty:  number;
}

export interface ItemCrafting {
  /** What the recipe produces, e.g. "Tempest I". */
  result?:    string;
  /** Required crafting station / trader rank, e.g. "Gunsmith 3". */
  station?:   string;
  /** Whether a blueprint must also be learned to craft. */
  blueprint?: boolean;
  materials:  ItemMaterial[];
}

export interface UpgradeTier {
  /** Display label — typically "I → II", "Level 2", etc. */
  label:     string;
  materials: ItemMaterial[];
  /** Free-form perk strings; renderer keeps line breaks. */
  perks?:    string[];
}

// Validation bounds — referenced by the server action and the form.
export const MAX_GALLERY  = 8;
export const MAX_TAGS     = 12;
export const MAX_TAG_LEN  = 40;
export const MAX_LINKS    = 6;
export const MAX_LINK_LABEL_LEN = 60;
export const MAX_STATS    = 20;
export const MAX_UPGRADES = 10;
export const MAX_MATERIALS_PER_RECIPE = 12;
export const MAX_PERKS_PER_TIER       = 6;

export const CONTENT_TYPE_LABELS: Record<GameContentType, { singular: string; plural: string }> = {
  guides:    { singular: "Guide",    plural: "Guides"    },
  items:     { singular: "Item",     plural: "Items"     },
  locations: { singular: "Location", plural: "Locations" },
  updates:   { singular: "Update",   plural: "Updates"   },
};
