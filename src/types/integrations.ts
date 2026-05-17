import type { LolPlatformRegion } from "@/lib/riot/regions";

// ─── Generic integration envelope ─────────────────────────────────────────────
//
// Every linked-game integration lives at /profiles/{uid}/integrations/{provider}
// and shares the same outer shape. The provider-specific payload lives under
// `snapshot`, typed per provider below.

export type IntegrationProvider = "league"; // future: "valorant" | "tft" | "steam"

export interface IntegrationDoc<TSnapshot = unknown> {
  provider: IntegrationProvider;
  linkedAt: Date;
  lastSyncAt: Date;
  /** Last time the user manually triggered a refresh (rate-limit gate). */
  lastManualRefreshAt?: Date;
  /** Provider-specific account identifiers — never displayed raw to other users. */
  account: Record<string, string>;
  snapshot: TSnapshot;
}

// ─── League of Legends ────────────────────────────────────────────────────────

export interface LeagueRankSnapshot {
  tier: string;          // "IRON" .. "CHALLENGER"
  division: string;      // "I" .. "IV" (empty for Master+)
  lp: number;
  wins: number;
  losses: number;
}

export interface LeagueChampionSnapshot {
  championId: number;
  level: number;
  points: number;
}

export interface LeagueSnapshot {
  summonerLevel: number;
  profileIconId: number;
  soloRank: LeagueRankSnapshot | null;
  flexRank: LeagueRankSnapshot | null;
  topChampions: LeagueChampionSnapshot[];
  /** Riot Data Dragon version used to resolve asset URLs on the client. */
  ddragonVersion: string;
}

export interface LeagueAccount extends Record<string, string> {
  puuid: string;
  region: LolPlatformRegion;
  gameName: string;
  tagLine: string;
}

export type LeagueIntegration = IntegrationDoc<LeagueSnapshot> & {
  provider: "league";
  account: LeagueAccount;
};

// ─── Pending verification ─────────────────────────────────────────────────────
//
// Lives at /profiles/{uid}/integrations_pending/league while a user is in the
// middle of the profile-icon ownership challenge. Once the user confirms and
// we verify, the doc is deleted and a real LeagueIntegration is written.

export interface LeaguePendingVerification {
  puuid:         string;
  region:        LolPlatformRegion;
  gameName:      string;
  tagLine:       string;
  /** Icon ID we picked. The user must set their LoL profile icon to this. */
  targetIconId:  number;
  /** Icon ID we observed at the time the challenge was issued. We won't
   * accept this as proof — they must change it. */
  initialIconId: number;
  startedAt:     Date;
  /** Hard expiry. After this we drop the challenge and force a fresh attempt. */
  expiresAt:     Date;
}
