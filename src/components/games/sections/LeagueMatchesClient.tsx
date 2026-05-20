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
import { Search, Trophy, ChevronDown } from "lucide-react";
import {
  championIconUrl,
  formatDuration,
  itemIconUrl,
  queueLabel,
  summonerSpellIconUrl,
  timeAgoCompact,
} from "@/lib/riot/assets";
import { deriveStats } from "@/lib/riot/match-stats";
import { LeagueStatsOverview } from "./LeagueStatsOverview";
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

// `deriveStats` + `DerivedStats` live in @/lib/riot/match-stats so the LoL
// hub Overview card can reuse the same aggregation. The presentational
// `LeagueStatsOverview` lives in its own file and is rendered below.

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
      <LeagueStatsOverview stats={stats} />

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

// ─── Match row (client variant of the server one in #2a) ─────────────────────

function MatchRow({ match, viewerPuuid }: { match: MatchSummaryDoc; viewerPuuid: string }) {
  const [expanded, setExpanded] = useState(false);
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
      className="rounded-xl overflow-hidden"
      style={{ background: tint, border: `1px solid ${border}` }}
    >
    <button
      type="button"
      onClick={() => setExpanded(v => !v)}
      aria-expanded={expanded}
      className="w-full p-3 flex items-stretch gap-3 flex-wrap sm:flex-nowrap text-left cursor-pointer transition-colors"
      style={{ background: "transparent" }}
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

      <div className="flex-1 flex items-center justify-end">
        <ChevronDown
          size={16}
          style={{
            color: "var(--text-muted)",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 150ms ease",
          }}
          aria-hidden
        />
      </div>
    </button>

    {expanded && <MatchDetailsPanel match={match} viewerPuuid={viewerPuuid} accent={accent} />}
    </div>
  );
}

// ─── Match details panel (expanded drill-down) ───────────────────────────────
//
// Renders both teams side-by-side with full per-player breakdown: champion,
// summoner name, KDA, items, CS, gold, damage-to-champs, vision. Reuses the
// already-cached MatchSummaryDoc — no extra Firestore reads, no extra Riot
// API calls. Damage bars are computed against the highest damage value in
// the match so the scale is comparable across players.

function MatchDetailsPanel({
  match,
  viewerPuuid,
  accent,
}: {
  match:       MatchSummaryDoc;
  viewerPuuid: string;
  accent:      string;
}) {
  const teamA = match.participants.filter(p => p.teamId === 100);
  const teamB = match.participants.filter(p => p.teamId === 200);
  const maxDamage = Math.max(1, ...match.participants.map(p => p.damageToChamps));
  const teamAWon = teamA[0]?.win ?? false;

  return (
    <div
      className="px-3 pb-3 pt-1 border-t"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <TeamBlock
        label="Team 1"
        won={teamAWon}
        participants={teamA}
        viewerPuuid={viewerPuuid}
        maxDamage={maxDamage}
        durationSec={match.durationSec}
      />
      <div className="h-2" />
      <TeamBlock
        label="Team 2"
        won={!teamAWon}
        participants={teamB}
        viewerPuuid={viewerPuuid}
        maxDamage={maxDamage}
        durationSec={match.durationSec}
      />
      <p className="mt-2 text-[10px] text-right" style={{ color: "var(--text-muted)" }}>
        Match ID <span className="font-mono">{match.matchId}</span> · patch {match.gameVersion}
        {accent ? "" : ""}
      </p>
    </div>
  );
}

function TeamBlock({
  label,
  won,
  participants,
  viewerPuuid,
  maxDamage,
  durationSec,
}: {
  label:        string;
  won:          boolean;
  participants: MatchSummaryDoc["participants"];
  viewerPuuid:  string;
  maxDamage:    number;
  durationSec:  number;
}) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background:  won ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.04)",
        border:      `1px solid ${won ? "rgba(34,197,94,0.20)" : "rgba(239,68,68,0.20)"}`,
      }}
    >
      <div
        className="flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
        style={{
          background: won ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)",
          color:      won ? "var(--success)" : "var(--danger)",
        }}
      >
        <span>{label}</span>
        <span>{won ? "Victory" : "Defeat"}</span>
      </div>
      <div>
        {participants.map(p => {
          const csPerMin = durationSec > 0 ? (p.cs / (durationSec / 60)).toFixed(1) : "0.0";
          const kdaRaw   = p.deaths === 0 ? p.kills + p.assists : (p.kills + p.assists) / p.deaths;
          const dmgPct   = (p.damageToChamps / maxDamage) * 100;
          const isViewer = p.puuid === viewerPuuid;
          return (
            <div
              key={p.puuid}
              className="grid items-center gap-2 px-2 py-1.5 border-t text-[11px]"
              style={{
                borderColor: "var(--border-subtle)",
                background:  isViewer ? "rgba(99,102,241,0.05)" : "transparent",
                gridTemplateColumns: "auto 1fr auto auto 1fr",
              }}
            >
              {/* Champion + level */}
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="relative w-7 h-7 rounded overflow-hidden" style={{ background: "var(--bg-overlay)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={championIconUrl(p.championId)} alt={p.championName} className="w-full h-full object-cover" />
                  <span
                    className="absolute bottom-0 right-0 text-[8px] font-bold px-0.5 rounded-tl leading-none"
                    style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}
                  >
                    {p.champLevel}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <SpellIcon id={p.summoner1Id} />
                  <SpellIcon id={p.summoner2Id} />
                </div>
              </div>

              {/* Name */}
              <div className="min-w-0">
                <p
                  className="truncate font-medium"
                  style={{ color: isViewer ? "var(--text-primary)" : "var(--text-secondary)" }}
                >
                  {p.riotIdGameName ?? p.summonerName ?? "—"}
                  {p.riotIdTagline ? <span style={{ color: "var(--text-muted)" }}>#{p.riotIdTagline}</span> : null}
                </p>
                <p style={{ color: "var(--text-muted)", fontSize: 10 }}>{p.championName}</p>
              </div>

              {/* KDA */}
              <div className="text-right shrink-0">
                <p className="tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {p.kills}<span style={{ color: "var(--text-muted)" }}> / </span>
                  <span style={{ color: "var(--danger)" }}>{p.deaths}</span>
                  <span style={{ color: "var(--text-muted)" }}> / </span>{p.assists}
                </p>
                <p style={{ color: "var(--text-muted)", fontSize: 10 }}>{kdaRaw.toFixed(2)} KDA</p>
              </div>

              {/* CS + gold + vision */}
              <div className="text-right shrink-0 tabular-nums" style={{ color: "var(--text-muted)", fontSize: 10, lineHeight: 1.35 }}>
                <p>{p.cs} CS ({csPerMin})</p>
                <p>{Math.round(p.goldEarned / 100) / 10}k gold</p>
                <p>{p.visionScore} vision</p>
              </div>

              {/* Damage bar + items */}
              <div className="flex flex-col gap-1 min-w-0">
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: "var(--bg-overlay)" }}
                  title={`${p.damageToChamps.toLocaleString()} damage to champions`}
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${dmgPct}%`,
                      background: won ? "var(--success)" : "var(--danger)",
                    }}
                  />
                </div>
                <div className="flex items-center gap-0.5 flex-wrap">
                  {p.items.slice(0, 6).map((id, idx) => (
                    <ItemIcon key={idx} id={id} />
                  ))}
                  <span className="w-px h-5 mx-0.5" style={{ background: "var(--border-subtle)" }} />
                  <ItemIcon id={p.items[6] ?? 0} />
                </div>
              </div>
            </div>
          );
        })}
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
