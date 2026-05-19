// ─── Match-stats derivation ──────────────────────────────────────────────────
//
// Pure aggregation over a cached MatchSummaryDoc[] from the viewer's
// perspective. No React, no I/O — safe to call from both server components
// and client components. Two surfaces consume the result today:
//
//   - LeagueMatchesClient (the My Profile section's filterable list)
//   - OverviewSection      (the LoL hub Overview card)
//
// Adding a new consumer is just an import — the helper has no React deps.

import type { MatchSummaryDoc } from "@/types/match-history";

export interface DerivedStats {
  total:        number;
  wins:         number;
  losses:       number;
  winPct:       number;
  avgKills:     number;
  avgDeaths:    number;
  avgAssists:   number;
  kda:          number;
  /** Average P/Kill across matches where the team's total kill count was > 0. */
  pKill:        number;
  topChamps:    Array<{
    championId:   number;
    championName: string;
    games:        number;
    wins:         number;
    winPct:       number;
  }>;
  roles:        Array<{
    key:   string;
    label: string;
    games: number;
    pct:   number;
  }>;
}

const ROLE_LABELS: Record<string, string> = {
  TOP:     "Top",
  JUNGLE:  "Jungle",
  MIDDLE:  "Mid",
  BOTTOM:  "Bot",
  UTILITY: "Support",
};

export function deriveStats(
  matches:     MatchSummaryDoc[],
  viewerPuuid: string,
): DerivedStats {
  let wins = 0, losses = 0;
  let totalK = 0, totalD = 0, totalA = 0;
  let totalPKillNum = 0;
  let pKillSamples  = 0;

  const champAgg = new Map<number, { name: string; games: number; wins: number }>();
  const roleAgg  = new Map<string, number>();

  for (const m of matches) {
    const me = m.participants.find(p => p.puuid === viewerPuuid);
    if (!me) continue;
    if (me.win) wins++; else losses++;
    totalK += me.kills;
    totalD += me.deaths;
    totalA += me.assists;

    const teamKills = m.participants
      .filter(p => p.teamId === me.teamId)
      .reduce((s, p) => s + p.kills, 0);
    if (teamKills > 0) {
      totalPKillNum += (me.kills + me.assists) / teamKills;
      pKillSamples++;
    }

    const c = champAgg.get(me.championId) ?? { name: me.championName, games: 0, wins: 0 };
    c.games++;
    if (me.win) c.wins++;
    champAgg.set(me.championId, c);

    if (me.teamPosition && me.teamPosition.length > 0) {
      roleAgg.set(me.teamPosition, (roleAgg.get(me.teamPosition) ?? 0) + 1);
    }
  }

  const total  = wins + losses;
  const winPct = total > 0 ? Math.round((wins / total) * 100) : 0;
  const kda    = totalD === 0 ? totalK + totalA : (totalK + totalA) / totalD;

  const topChamps = Array.from(champAgg.entries())
    .map(([championId, v]) => ({
      championId,
      championName: v.name,
      games:        v.games,
      wins:         v.wins,
      winPct:       v.games > 0 ? Math.round((v.wins / v.games) * 100) : 0,
    }))
    .sort((a, b) => b.games - a.games || b.winPct - a.winPct)
    .slice(0, 5);

  const roleTotal = Array.from(roleAgg.values()).reduce((s, v) => s + v, 0);
  const roles = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"].map(key => {
    const games = roleAgg.get(key) ?? 0;
    return {
      key,
      label: ROLE_LABELS[key] ?? key,
      games,
      pct:   roleTotal > 0 ? Math.round((games / roleTotal) * 100) : 0,
    };
  });

  return {
    total, wins, losses, winPct,
    avgKills:   total > 0 ? totalK / total : 0,
    avgDeaths:  total > 0 ? totalD / total : 0,
    avgAssists: total > 0 ? totalA / total : 0,
    kda,
    pKill:      pKillSamples > 0 ? Math.round((totalPKillNum / pKillSamples) * 100) : 0,
    topChamps,
    roles,
  };
}
