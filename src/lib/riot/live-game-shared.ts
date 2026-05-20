// ─── Live-game shared types + pure utilities ─────────────────────────────────
//
// Client-safe — no firebase-admin import here. The server-only logic
// (Firestore queries, spectator-v5 calls) lives in live-game.ts, which
// client files MUST NOT import.

import type { LolPlatformRegion } from "@/lib/riot/regions";

export interface LiveGameRow {
  uid:           string;
  displayName:   string;
  avatarUrl?:    string | null;
  riotIdGameName: string;
  riotIdTagline:  string;
  region:        LolPlatformRegion;
  championId:    number;
  /** Seconds since game start. Negative / 0 means champ select / loading. */
  gameLengthSec: number;
  gameMode:      string;
  queueId:       number;
}

/** Format a game length (seconds) as "12:34". */
export function formatGameLength(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
