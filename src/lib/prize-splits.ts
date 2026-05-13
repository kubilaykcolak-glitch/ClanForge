// ─── Prize-split presets ──────────────────────────────────────────────────────
//
// Pure logic, no I/O. The presets and helpers here are used by:
//   - the tournament create page (dropdown options + preview)
//   - the tournament detail page (prize-pool breakdown display)
//   - the finalize/payout server actions (actual money amounts)

import type { PrizeSplit } from "@/types";

export interface PrizeSplitPreset {
  id:          PrizeSplit;
  label:       string;
  /** Percentage of the prize pool each placement receives, in order. */
  percentages: readonly number[];
}

export const PRIZE_SPLIT_PRESETS: readonly PrizeSplitPreset[] = [
  { id: "winner_takes_all", label: "Winner takes all",         percentages: [100] },
  { id: "top_3",            label: "Top 3 — 50 / 30 / 20",     percentages: [50, 30, 20] },
  { id: "top_4",            label: "Top 4 — 40 / 30 / 20 / 10", percentages: [40, 30, 20, 10] },
  { id: "top_5",            label: "Top 5 — 40 / 25 / 15 / 12 / 8", percentages: [40, 25, 15, 12, 8] },
] as const;

const SPLIT_MAP: Record<PrizeSplit, readonly number[]> = PRIZE_SPLIT_PRESETS.reduce(
  (acc, p) => ({ ...acc, [p.id]: p.percentages }),
  {} as Record<PrizeSplit, readonly number[]>,
);

// ─── Compute payouts ──────────────────────────────────────────────────────────

export interface ComputedPayout {
  position:   number;     // 1-indexed
  percentage: number;
  /** Amount in pence. */
  amount:     number;
}

/**
 * Given a prize pool (in pence) and a preset, returns one payout entry per
 * position. Amounts use floor() to stay safely within the pool; any rounding
 * remainder stays in the platform account.
 *
 * Examples:
 *   computePayouts(10000, "winner_takes_all") → [{position:1, percentage:100, amount:10000}]
 *   computePayouts(10000, "top_3")            → [{1,50,5000},{2,30,3000},{3,20,2000}]
 */
export function computePayouts(prizePoolPence: number, preset: PrizeSplit): ComputedPayout[] {
  const pct = SPLIT_MAP[preset];
  return pct.map((p, i) => ({
    position:   i + 1,
    percentage: p,
    amount:     Math.floor((prizePoolPence * p) / 100),
  }));
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export function positionLabel(position: number): string {
  if (position === 1) return "1st";
  if (position === 2) return "2nd";
  if (position === 3) return "3rd";
  return `${position}th`;
}

export function getPresetLabel(preset: PrizeSplit): string {
  return PRIZE_SPLIT_PRESETS.find(p => p.id === preset)?.label ?? preset;
}

export function getPresetPositionsCount(preset: PrizeSplit): number {
  return SPLIT_MAP[preset]?.length ?? 1;
}

// ─── Money formatting ─────────────────────────────────────────────────────────

/**
 * Format a pence value as a £-prefixed string with the right precision.
 *   formatPence(500)   → "£5"        (whole pounds shown without pence)
 *   formatPence(550)   → "£5.50"     (pence shown to 2 d.p.)
 *   formatPence(0)     → "£0"
 */
export function formatPence(pence: number): string {
  if (!Number.isFinite(pence) || pence <= 0) return "£0";
  const pounds = pence / 100;
  return pence % 100 === 0
    ? `£${Math.floor(pounds)}`
    : `£${pounds.toFixed(2)}`;
}

// ─── Money math constants (single source of truth) ────────────────────────────

export const DEFAULT_PLATFORM_FEE_PCT = 10;

/** Hard bounds enforced by the UI and server actions. Stored in PENCE. */
export const ENTRY_FEE_MIN_PENCE = 100;     // £1
export const ENTRY_FEE_MAX_PENCE = 50000;   // £500

/**
 * Given an entry fee (pence) and platform-fee %, returns how much of each
 * paid entry flows into the prize pool. The remainder is the platform cut.
 */
export function prizePoolDeltaForEntry(entryFeePence: number, platformFeePct: number): number {
  const cut = Math.floor((entryFeePence * platformFeePct) / 100);
  return entryFeePence - cut;
}
