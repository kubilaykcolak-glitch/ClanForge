// ─── LoL hub: My Profile ──────────────────────────────────────────────────────
//
// Server component. Resolves viewer + integration, fires the background
// staleness check, reads the cached match array, renders rank cards, then
// hands the match array to LeagueMatchesClient which owns the filter tabs,
// champion search, stats overview, and the recent-games list.

import Link from "next/link";
import { ArrowRight, Plug, Swords } from "lucide-react";
import { getCurrentLeagueIntegration, getCurrentUserContext } from "@/lib/games/current-user";
import {
  getMyRecentMatches,
  ingestRecentMatchesIfStale,
} from "@/lib/actions/match-history.actions";
import {
  formatRank,
  tierColour,
  tierLabel,
} from "@/lib/riot/assets";
import { LeagueMatchesClient } from "./LeagueMatchesClient";
import type { GameSectionProps } from "@/lib/games/types";
import type { LeagueIntegration } from "@/types/integrations";

export default async function LeagueProfileSection({ gameName }: GameSectionProps) {
  const viewer = await getCurrentUserContext();
  if (!viewer) return <NotSignedIn />;

  const integration = await getCurrentLeagueIntegration();
  if (!integration) return <NotLinked gameName={gameName} />;

  // Background-refresh trigger — fires only if cache > 1h old, fire-and-forget.
  void ingestRecentMatchesIfStale(viewer.uid);

  const matches = await getMyRecentMatches(viewer.uid, 20);

  return (
    <div className="space-y-6">
      {/* ── Block 1: Rank cards (server-rendered, never filtered) ────── */}
      <section>
        <h2 className="font-display font-bold text-lg mb-3" style={{ color: "var(--text-primary)" }}>
          Ranked breakdown
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <RankCard label="Ranked Solo/Duo" rank={integration.snapshot.soloRank} />
          <RankCard label="Ranked Flex"     rank={integration.snapshot.flexRank} />
        </div>
      </section>

      {/* ── Block 2: Filterable stats + match list ───────────────────── */}
      <LeagueMatchesClient
        matches={matches}
        viewerPuuid={integration.account.puuid}
      />
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

  const total  = rank.wins + rank.losses;
  const wr     = total > 0 ? Math.round((rank.wins / total) * 100) : 0;
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
