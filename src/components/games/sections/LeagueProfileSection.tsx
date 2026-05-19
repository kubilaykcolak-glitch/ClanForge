// ─── LoL hub: My Profile ──────────────────────────────────────────────────────
//
// First spec #2 deliverable: rank breakdown + recent match list, backed by a
// cached subcollection at /profiles/{uid}/match_history. Triggers a stale-
// check ingest in the background on every load (rate-limited to once per
// hour). Manual Refresh button on the header for force-refresh (5-min
// cooldown server-enforced).
//
// Owner-only by design today — we render an empty state for unauthenticated
// viewers and for users without a linked Riot account. Public-profile
// surfacing is a follow-up.

import Link from "next/link";
import { ArrowRight, Plug, Swords, Trophy } from "lucide-react";
import { getCurrentLeagueIntegration, getCurrentUserContext } from "@/lib/games/current-user";
import {
  getMyRecentMatches,
  ingestRecentMatchesIfStale,
} from "@/lib/actions/match-history.actions";
import {
  championIconUrl,
  formatDuration,
  formatRank,
  itemIconUrl,
  queueLabel,
  summonerSpellIconUrl,
  tierColour,
  tierLabel,
  timeAgoCompact,
} from "@/lib/riot/assets";
import { RefreshMatchHistoryButton } from "./RefreshMatchHistoryButton";
import type {
  MatchParticipantLite,
  MatchSummaryDoc,
} from "@/types/match-history";
import type { GameSectionProps } from "@/lib/games/types";
import type { LeagueIntegration } from "@/types/integrations";

export default async function LeagueProfileSection({ gameName }: GameSectionProps) {
  const viewer = await getCurrentUserContext();
  if (!viewer) return <NotSignedIn />;

  const integration = await getCurrentLeagueIntegration();
  if (!integration) return <NotLinked gameName={gameName} />;

  // Fire the staleness check BEFORE the cache read so a fresh ingest can
  // make it into this render. We don't await — the ingest helper itself
  // returns immediately when fresh, and runs background work when stale.
  // The render reads whatever is currently in cache.
  void ingestRecentMatchesIfStale(viewer.uid);

  const matches = await getMyRecentMatches(viewer.uid, 20);

  return (
    <div className="space-y-6">

      {/* ── Block 1: Rank cards ────────────────────────────────────── */}
      <section>
        <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
          <h2 className="font-display font-bold text-lg" style={{ color: "var(--text-primary)" }}>
            Ranked breakdown
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <RankCard label="Ranked Solo/Duo" rank={integration.snapshot.soloRank} />
          <RankCard label="Ranked Flex"     rank={integration.snapshot.flexRank} />
        </div>
      </section>

      {/* ── Block 2: Recent games ──────────────────────────────────── */}
      <section>
        <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h2 className="font-display font-bold text-lg" style={{ color: "var(--text-primary)" }}>
              Recent games
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              Last {matches.length || "—"} matches across all queues.
              {" "}<span className="opacity-70">Auto-refreshes hourly.</span>
            </p>
          </div>
          <RefreshMatchHistoryButton />
        </div>

        {matches.length === 0 ? (
          <NoMatchesYet />
        ) : (
          <div className="space-y-2">
            {matches.map(m => (
              <MatchRow key={m.matchId} match={m} viewerPuuid={integration.account.puuid} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Rank card ────────────────────────────────────────────────────────────────

function RankCard({
  label,
  rank,
}: {
  label: string;
  rank:  LeagueIntegration["snapshot"]["soloRank"];
}) {
  if (!rank) {
    return (
      <div
        className="rounded-xl p-5"
        style={{
          background: "var(--bg-surface)",
          border:     "1px solid var(--border-subtle)",
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
          {label}
        </p>
        <p className="text-base font-display font-bold" style={{ color: "var(--text-secondary)" }}>
          Unranked
        </p>
        <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
          Play placement matches to appear on this card.
        </p>
      </div>
    );
  }

  const total = rank.wins + rank.losses;
  const wr    = total > 0 ? Math.round((rank.wins / total) * 100) : 0;
  const colour = tierColour(rank.tier);

  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-subtle)",
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <div className="flex items-baseline gap-2 mb-2">
        <p className="text-2xl font-display font-bold" style={{ color: colour }}>
          {tierLabel(rank.tier)}
        </p>
        <p className="text-sm font-display font-semibold" style={{ color: "var(--text-secondary)" }}>
          {formatRank(rank.tier, rank.division).replace(tierLabel(rank.tier), "").trim() || ""}
        </p>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          · {rank.lp} LP
        </p>
      </div>
      <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--text-secondary)" }}>
        <span>{rank.wins}W</span>
        <span>{rank.losses}L</span>
        <span style={{ color: wr >= 50 ? "var(--success)" : "var(--danger)" }}>
          {wr}% WR
        </span>
        <span style={{ color: "var(--text-muted)" }}>· {total} games</span>
      </div>
    </div>
  );
}

// ─── Recent match row ─────────────────────────────────────────────────────────

function MatchRow({ match, viewerPuuid }: { match: MatchSummaryDoc; viewerPuuid: string }) {
  const me = match.participants.find(p => p.puuid === viewerPuuid);
  if (!me) return null;

  const win    = me.win;
  const kda    = me.deaths === 0 ? me.kills + me.assists : (me.kills + me.assists) / me.deaths;
  const teamKills = match.participants
    .filter(p => p.teamId === me.teamId)
    .reduce((sum, p) => sum + p.kills, 0);
  const pKill = teamKills > 0 ? Math.round(((me.kills + me.assists) / teamKills) * 100) : 0;
  const csPerMin = match.durationSec > 0
    ? (me.cs / (match.durationSec / 60)).toFixed(1)
    : "0.0";

  const multikill = me.pentaKills > 0
    ? "Penta Kill"
    : me.quadraKills > 0
      ? "Quadra Kill"
      : me.tripleKills > 0
        ? "Triple Kill"
        : me.doubleKills > 1
          ? "Multi Kill"
          : null;

  // Background tint follows the result (subtle, OP.GG-style).
  const tint = win ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)";
  const accent = win ? "var(--success)" : "var(--danger)";

  return (
    <div
      className="rounded-xl p-3 flex items-stretch gap-3 flex-wrap sm:flex-nowrap"
      style={{
        background: tint,
        border:     `1px solid ${win ? "rgba(34,197,94,0.20)" : "rgba(239,68,68,0.20)"}`,
      }}
    >
      {/* Result column */}
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

      {/* Champion + spells column */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative w-12 h-12 rounded-lg overflow-hidden" style={{ background: "var(--bg-overlay)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={championIconUrl(me.championId)}
            alt={me.championName}
            className="w-full h-full object-cover"
          />
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

      {/* KDA / CS column */}
      <div className="shrink-0 flex flex-col justify-center pr-3 border-r"
           style={{ borderColor: "var(--border-subtle)", minWidth: 100 }}>
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

      {/* Items column */}
      <div className="flex items-center gap-1 shrink-0">
        {me.items.slice(0, 6).map((id, idx) => (
          <ItemIcon key={idx} id={id} />
        ))}
        <span className="w-px h-6 mx-1" style={{ background: "var(--border-subtle)" }} />
        <ItemIcon id={me.items[6] ?? 0} />
      </div>

      {/* Multikill badge */}
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

      {/* Participants list (compact, hidden on small screens) */}
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
    <div
      className="w-5 h-5 rounded overflow-hidden"
      style={{ background: "var(--bg-overlay)" }}
      aria-hidden
    >
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

// ─── Empty / unsigned / unlinked states ──────────────────────────────────────

function NotSignedIn() {
  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-subtle)",
      }}
    >
      <Swords size={28} style={{ color: "var(--text-muted)" }} className="mx-auto mb-3 opacity-40" />
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Sign in to see your match history.
      </p>
    </div>
  );
}

function NotLinked({ gameName }: { gameName: string }) {
  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-subtle)",
      }}
    >
      <Plug size={28} style={{ color: "var(--text-muted)" }} className="mx-auto mb-3 opacity-50" />
      <h3 className="font-display font-semibold text-base mb-1" style={{ color: "var(--text-primary)" }}>
        Link your Riot account
      </h3>
      <p className="text-xs mb-5 max-w-sm mx-auto" style={{ color: "var(--text-muted)" }}>
        Connect your Riot ID to see your {gameName} rank, recent games, KDA, items, and more.
        We&rsquo;ll auto-refresh your match history every hour.
      </p>
      <Link
        href="/profile/edit"
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
        style={{
          background: "var(--bg-elevated)",
          border:     "1px solid var(--border-default)",
          color:      "var(--text-primary)",
        }}
      >
        Link account
        <ArrowRight size={12} />
      </Link>
    </div>
  );
}

function NoMatchesYet() {
  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-subtle)",
      }}
    >
      <Trophy size={28} style={{ color: "var(--text-muted)" }} className="mx-auto mb-3 opacity-40" />
      <p className="text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
        We&rsquo;re pulling your match history
      </p>
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        First load fetches your last 20 matches from Riot. Refresh the page in a few seconds
        if nothing appears.
      </p>
    </div>
  );
}
