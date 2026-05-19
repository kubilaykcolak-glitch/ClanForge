"use client";

// ─── LoL hub: client-side filter + stats + match list ─────────────────────────
//
// Owns three pieces of UI that all derive from the same cached match array:
//   1. Queue-type filter tabs (All / Ranked Solo / Ranked Flex / ARAM)
//   2. Champion search input (filters the visible list)
//   3. Stats overview (W/L summary, KDA, P/Kill, top champs, role bars)
//   4. Recent-games list itself
//
// Filtering is client-only — we cache at most 20 matches per user, which is
// small enough to filter in memory. Saves a round-trip per tab click and
// keeps the response instant. The server component upstream fetches the
// full array and passes it once.

import { useMemo, useState } from "react";
import { Search, Trophy } from "lucide-react";
import {
  championIconUrl,
  formatDuration,
  itemIconUrl,
  queueLabel,
  summonerSpellIconUrl,
  timeAgoCompact,
} from "@/lib/riot/assets";
import { RefreshMatchHistoryButton } from "./RefreshMatchHistoryButton";
import type { MatchSummaryDoc } from "@/types/match-history";

// ─── Queue filter tabs ────────────────────────────────────────────────────────

type QueueFilter = "all" | "solo" | "flex" | "aram";

const TAB_DEFS: Array<{ key: QueueFilter; label: string; queueIds: number[] | null }> = [
  { key: "all",  label: "All",             queueIds: null },
  { key: "solo", label: "Ranked Solo/Duo", queueIds: [420] },
  { key: "flex", label: "Ranked Flex",     queueIds: [440] },
  { key: "aram", label: "ARAM",            queueIds: [450, 720] },
];

// ─── Derived stats over a filtered match set ─────────────────────────────────

interface DerivedStats {
  total:        number;
  wins:         number;
  losses:       number;
  winPct:       number;
  avgKills:     number;
  avgDeaths:    number;
  avgAssists:   number;
  kda:          number;
  pKill:        number;        // average across matches
  topChamps:    Array<{ championId: number; championName: string; games: number; wins: number; winPct: number }>;
  roles:        Array<{ key: string; label: string; games: number; pct: number }>;
}

const ROLE_LABELS: Record<string, string> = {
  TOP:     "Top",
  JUNGLE:  "Jungle",
  MIDDLE:  "Mid",
  BOTTOM:  "Bot",
  UTILITY: "Support",
};

function deriveStats(
  matches:    MatchSummaryDoc[],
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
      pct: roleTotal > 0 ? Math.round((games / roleTotal) * 100) : 0,
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

// ─── Component ────────────────────────────────────────────────────────────────

export function LeagueMatchesClient({
  matches,
  viewerPuuid,
}: {
  matches:    MatchSummaryDoc[];
  viewerPuuid: string;
}) {
  const [queue,  setQueue]  = useState<QueueFilter>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const tab = TAB_DEFS.find(t => t.key === queue);
    const q   = search.trim().toLowerCase();
    return matches.filter(m => {
      if (tab?.queueIds && !tab.queueIds.includes(m.queueId)) return false;
      if (q.length > 0) {
        const me = m.participants.find(p => p.puuid === viewerPuuid);
        if (!me) return false;
        if (!me.championName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [matches, queue, search, viewerPuuid]);

  const stats = useMemo(() => deriveStats(filtered, viewerPuuid), [filtered, viewerPuuid]);

  return (
    <section className="space-y-4">

      {/* ── Header: filter tabs + search + refresh ───────────────────── */}
      <div
        className="rounded-xl p-3"
        style={{
          background: "var(--bg-surface)",
          border:     "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1 -mx-1 px-1 overflow-x-auto" role="tablist">
            {TAB_DEFS.map(t => {
              const isActive = t.key === queue;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setQueue(t.key)}
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap"
                  style={
                    isActive
                      ? { background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }
                      : { color: "var(--text-muted)", border: "1px solid transparent" }
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <div
              className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs"
              style={{
                background: "var(--bg-elevated)",
                border:     "1px solid var(--border-default)",
                color:      "var(--text-secondary)",
              }}
            >
              <Search size={12} style={{ color: "var(--text-muted)" }} />
              <input
                type="search"
                placeholder="Search champion"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-transparent outline-none border-0 text-xs w-32"
                aria-label="Filter by champion"
              />
            </div>
            <RefreshMatchHistoryButton />
          </div>
        </div>
      </div>

      {/* ── Stats overview ────────────────────────────────────────────── */}
      <StatsOverview stats={stats} />

      {/* ── Match list ────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <FilteredEmpty queue={queue} search={search} />
      ) : (
        <div className="space-y-2">
          {filtered.map(m => (
            <MatchRow key={m.matchId} match={m} viewerPuuid={viewerPuuid} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Stats overview block ────────────────────────────────────────────────────

function StatsOverview({ stats }: { stats: DerivedStats }) {
  if (stats.total === 0) {
    return (
      <div
        className="rounded-xl py-6 px-4 text-center"
        style={{
          background: "var(--bg-surface)",
          border:     "1px solid var(--border-subtle)",
        }}
      >
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          No games match this filter.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-6"
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-subtle)",
      }}
    >
      {/* W/L + KDA pillar */}
      <div className="flex items-center gap-4">
        <WinRateRing winPct={stats.winPct} />
        <div>
          <p className="text-sm font-display font-bold" style={{ color: "var(--text-primary)" }}>
            {stats.wins}W <span style={{ color: "var(--text-muted)" }}>·</span> {stats.losses}L
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {stats.avgKills.toFixed(1)} / <span style={{ color: "var(--danger)" }}>{stats.avgDeaths.toFixed(1)}</span> / {stats.avgAssists.toFixed(1)}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>{stats.kda.toFixed(2)} KDA</strong>
            <span className="opacity-60"> · P/Kill {stats.pKill}%</span>
          </p>
        </div>
      </div>

      {/* Top champions pillar */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
          Top champions
        </p>
        {stats.topChamps.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>—</p>
        ) : (
          <div className="space-y-1.5">
            {stats.topChamps.slice(0, 3).map(c => (
              <div key={c.championId} className="flex items-center gap-2">
                <div className="w-7 h-7 rounded overflow-hidden shrink-0" style={{ background: "var(--bg-overlay)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={championIconUrl(c.championId)} alt={c.championName} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0 text-[11px]">
                  <p className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                    {c.championName}
                  </p>
                  <p style={{ color: "var(--text-muted)" }}>
                    {c.wins}W {c.games - c.wins}L
                    <span style={{ color: c.winPct >= 50 ? "var(--success)" : "var(--danger)" }}> · {c.winPct}%</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Role distribution pillar */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
          Preferred role
        </p>
        <div className="space-y-1.5">
          {stats.roles.map(r => (
            <div key={r.key} className="flex items-center gap-2 text-[11px]">
              <span className="w-12 shrink-0" style={{ color: "var(--text-muted)" }}>{r.label}</span>
              <div
                className="flex-1 h-2 rounded-full overflow-hidden"
                style={{ background: "var(--bg-overlay)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${r.pct}%`, background: "var(--accent)" }}
                />
              </div>
              <span className="w-8 text-right shrink-0" style={{ color: "var(--text-secondary)" }}>
                {r.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// SVG win-rate ring — small, no dep on chart libs.
function WinRateRing({ winPct }: { winPct: number }) {
  const size   = 64;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circ   = 2 * Math.PI * radius;
  const offset = circ * (1 - winPct / 100);
  const colour = winPct >= 50 ? "var(--success)" : "var(--danger)";

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--bg-overlay)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={colour}
        strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dy="0.35em"
        fontSize={14}
        fontWeight={700}
        fill="var(--text-primary)"
      >
        {winPct}%
      </text>
    </svg>
  );
}

// ─── Match row (client variant of the server one in #2a) ─────────────────────

function MatchRow({ match, viewerPuuid }: { match: MatchSummaryDoc; viewerPuuid: string }) {
  const me = match.participants.find(p => p.puuid === viewerPuuid);
  if (!me) return null;

  const win        = me.win;
  const kda        = me.deaths === 0 ? me.kills + me.assists : (me.kills + me.assists) / me.deaths;
  const teamKills  = match.participants.filter(p => p.teamId === me.teamId).reduce((s, p) => s + p.kills, 0);
  const pKill      = teamKills > 0 ? Math.round(((me.kills + me.assists) / teamKills) * 100) : 0;
  const csPerMin   = match.durationSec > 0 ? (me.cs / (match.durationSec / 60)).toFixed(1) : "0.0";
  const multikill  = me.pentaKills > 0 ? "Penta Kill"
                   : me.quadraKills > 0 ? "Quadra Kill"
                   : me.tripleKills > 0 ? "Triple Kill"
                   : me.doubleKills > 1 ? "Multi Kill"
                   : null;
  const tint   = win ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)";
  const border = win ? "rgba(34,197,94,0.20)" : "rgba(239,68,68,0.20)";
  const accent = win ? "var(--success)" : "var(--danger)";

  return (
    <div
      className="rounded-xl p-3 flex items-stretch gap-3 flex-wrap sm:flex-nowrap"
      style={{ background: tint, border: `1px solid ${border}` }}
    >
      <div className="flex flex-col justify-between pr-3 shrink-0" style={{ minWidth: 96 }}>
        <div>
          <p className="text-[11px] font-semibold uppercase" style={{ color: "var(--text-muted)" }}>
            {queueLabel(match.queueId, match.gameMode)}
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {timeAgoCompact(match.gameStartAt)}
          </p>
        </div>
        <div>
          <p className="text-sm font-display font-bold" style={{ color: accent }}>
            {win ? "Victory" : "Defeat"}
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {formatDuration(match.durationSec)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="relative w-12 h-12 rounded-lg overflow-hidden" style={{ background: "var(--bg-overlay)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={championIconUrl(me.championId)} alt={me.championName} className="w-full h-full object-cover" />
          <span
            className="absolute bottom-0 right-0 text-[9px] font-bold px-1 rounded-tl"
            style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}
          >
            {me.champLevel}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <SpellIcon id={me.summoner1Id} />
          <SpellIcon id={me.summoner2Id} />
        </div>
      </div>

      <div
        className="shrink-0 flex flex-col justify-center pr-3 border-r"
        style={{ borderColor: "var(--border-subtle)", minWidth: 100 }}
      >
        <p className="text-sm font-display font-bold" style={{ color: "var(--text-primary)" }}>
          {me.kills}
          <span style={{ color: "var(--text-muted)" }}> / </span>
          <span style={{ color: "var(--danger)" }}>{me.deaths}</span>
          <span style={{ color: "var(--text-muted)" }}> / </span>
          {me.assists}
        </p>
        <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
          {kda.toFixed(2)} KDA
        </p>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          P/Kill {pKill}% · CS {me.cs} ({csPerMin})
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {me.items.slice(0, 6).map((id, idx) => (
          <ItemIcon key={idx} id={id} />
        ))}
        <span className="w-px h-6 mx-1" style={{ background: "var(--border-subtle)" }} />
        <ItemIcon id={me.items[6] ?? 0} />
      </div>

      {multikill && (
        <div className="flex items-center shrink-0">
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded"
            style={{
              background: "rgba(251,191,36,0.15)",
              color:      "#fbbf24",
              border:     "1px solid rgba(251,191,36,0.30)",
            }}
          >
            {multikill}
          </span>
        </div>
      )}

      <div className="hidden lg:flex flex-col flex-1 min-w-0 text-[10px]" style={{ color: "var(--text-muted)" }}>
        <div className="grid grid-cols-2 gap-x-3">
          {match.participants.slice(0, 10).map(p => (
            <div key={p.puuid} className="flex items-center gap-1 truncate">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: p.teamId === me.teamId ? "var(--accent)" : "var(--danger)" }}
                aria-hidden
              />
              <span className="truncate" style={{ color: p.puuid === viewerPuuid ? "var(--text-primary)" : undefined }}>
                {p.riotIdGameName ?? p.summonerName ?? "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SpellIcon({ id }: { id: number }) {
  const src = summonerSpellIconUrl(id);
  return (
    <div className="w-5 h-5 rounded overflow-hidden" style={{ background: "var(--bg-overlay)" }} aria-hidden>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="w-full h-full object-cover" />
      )}
    </div>
  );
}

function ItemIcon({ id }: { id: number }) {
  const src = itemIconUrl(id);
  return (
    <div
      className="w-6 h-6 rounded overflow-hidden"
      style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-subtle)" }}
      aria-hidden
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="w-full h-full object-cover" />
      )}
    </div>
  );
}

// ─── Filtered empty state ────────────────────────────────────────────────────

function FilteredEmpty({ queue, search }: { queue: QueueFilter; search: string }) {
  const reason = search.trim().length > 0
    ? `No matches with champion "${search.trim()}"`
    : queue === "all"
      ? "No cached matches yet"
      : `No matches in ${TAB_DEFS.find(t => t.key === queue)?.label ?? "this queue"}`;
  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-subtle)",
      }}
    >
      <Trophy size={28} style={{ color: "var(--text-muted)" }} className="mx-auto mb-3 opacity-40" />
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {reason}
      </p>
      <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
        Try a different filter or refresh to pull more recent games.
      </p>
    </div>
  );
}
