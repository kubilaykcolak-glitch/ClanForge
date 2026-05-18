// ─── Game-hub Overview section ────────────────────────────────────────────────
//
// Default landing inside every game hub. Three blocks, fetched in parallel:
//   1. Your active tournaments for this game (user-participated only — the
//      global /tournaments page owns discovery + creation)
//   2. Your status card (game-specific — Riot for LoL, Discord stub for AR)
//   3. Quick-link tiles to other hub sections
//
// Deliberately NO "Create tournament" CTA, NO featured-tournaments grid —
// those duplicate the global /tournaments surface. View All links there.

import Link from "next/link";
import { ArrowRight, Shield, Trophy, Users } from "lucide-react";
import {
  getMyActiveTournamentsForGame,
  type TournamentRow,
} from "@/lib/actions/tournament-list.actions";
import { TournamentCard } from "@/components/tournament/TournamentCard";
import { LinkedGameCard } from "@/components/profile/LinkedGameCard";
import { getLiveSections, getGame } from "@/lib/games/registry";
import { getCurrentLeagueIntegration, getCurrentUserContext } from "@/lib/games/current-user";
import type { Tournament } from "@/types";
import type { GameSectionProps } from "@/lib/games/types";

function rowToTournament(row: TournamentRow): Tournament {
  return {
    ...row,
    startsAt:             new Date(row.startsAt),
    registrationClosesAt: new Date(row.registrationClosesAt),
    rosterLockedAt:       new Date(row.rosterLockedAt),
    createdAt:            new Date(row.createdAt),
  } as unknown as Tournament;
}

export default async function OverviewSection({ gameSlug, gameName }: GameSectionProps) {
  const game = getGame(gameSlug);
  // Parallel-fetch: viewer context + (for LoL only) league integration +
  // viewer's active tournaments for this game. All request-cached.
  const isLeague = gameSlug === "league-of-legends";
  const viewer = await getCurrentUserContext();
  const [leagueIntegration, mineRes] = await Promise.all([
    isLeague ? getCurrentLeagueIntegration() : Promise.resolve(null),
    viewer ? getMyActiveTournamentsForGame(viewer.uid, gameName, 3) : Promise.resolve({ success: true, data: [] as TournamentRow[] }),
  ]);
  const myActive = mineRes.success ? (mineRes.data ?? []) : [];
  const liveSections = game ? getLiveSections(game).filter(s => s.slug !== "overview") : [];

  return (
    <div className="space-y-8">

      {/* ── Block 1: Your active tournaments ───────────────────────── */}
      <section>
        <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
          <h2 className="font-display font-bold text-lg" style={{ color: "var(--text-primary)" }}>
            Your tournaments
          </h2>
          <Link
            href="/tournaments"
            className="text-xs font-medium underline-offset-2 hover:underline"
            style={{ color: "var(--text-secondary)" }}
          >
            View all →
          </Link>
        </div>

        {myActive.length === 0 ? (
          <div
            className="rounded-xl py-8 px-6 text-center"
            style={{
              background: "var(--bg-surface)",
              border:     "1px solid var(--border-subtle)",
            }}
          >
            <Trophy size={24} style={{ color: "var(--text-muted)" }} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
              You&rsquo;re not in any {gameName} tournament right now
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Browse open tournaments from the{" "}
              <Link
                href="/tournaments"
                className="underline-offset-2 hover:underline"
                style={{ color: "var(--accent)" }}
              >
                Tournaments tab
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {myActive.map(row => (
              <TournamentCard key={row.id} tournament={rowToTournament(row)} />
            ))}
          </div>
        )}
      </section>

      {/* ── Block 2: Your status card (game-specific) ──────────────── */}
      <section>
        <h2 className="font-display font-bold text-lg mb-4" style={{ color: "var(--text-primary)" }}>
          Your status
        </h2>
        {isLeague && leagueIntegration && viewer ? (
          <LinkedGameCard
            uid={viewer.uid}
            isOwner={true}
            integration={leagueIntegration}
          />
        ) : (
          <YourStatusCard gameSlug={gameSlug} gameName={gameName} />
        )}
      </section>

      {/* ── Block 3: Quick-link tiles to other sections ────────────── */}
      {liveSections.length > 0 && (
        <section>
          <h2 className="font-display font-bold text-lg mb-4" style={{ color: "var(--text-primary)" }}>
            Explore
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {liveSections.map(s => (
              <Link
                key={s.slug}
                href={`/games/${gameSlug}/${s.slug}`}
                className="rounded-xl p-4 transition-all"
                style={{
                  background: "var(--bg-surface)",
                  border:     "1px solid var(--border-subtle)",
                  color:      "var(--text-primary)",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <s.icon size={18} style={{ color: "var(--accent)" }} />
                  <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                </div>
                <p className="text-sm font-semibold">{s.label}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Your-status card: game-specific stub for v1 ────────────────────────────
// LoL → CTA to link Riot account (LoL data modules ship in spec #2).
// Arc Raiders → placeholder mentioning the Wanted/Discord flow (spec #3).
// Same component file because both states are tiny — split out when one
// grows past ~80 lines.

function YourStatusCard({ gameSlug, gameName }: { gameSlug: string; gameName: string }) {
  if (gameSlug === "league-of-legends") {
    return (
      <div
        className="rounded-xl p-5"
        style={{
          background: "var(--bg-surface)",
          border:     "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex items-start gap-4 flex-wrap">
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--bg-elevated)", color: "var(--accent)" }}
          >
            <Shield size={20} />
          </div>
          <div className="flex-1 min-w-[200px]">
            <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              Link your Riot account
            </p>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              Show your rank on your profile, get auto-verified in {gameName} tournaments,
              and unlock the match-history widget when it ships.
            </p>
            <Link
              href="/profile/edit"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
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
        </div>
      </div>
    );
  }

  // Arc Raiders + future games — generic social-shell placeholder.
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex items-start gap-4 flex-wrap">
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "var(--bg-elevated)", color: "var(--accent)" }}
        >
          <Users size={20} />
        </div>
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            Set up your {gameName} presence
          </p>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            Profile widgets, ranked tracking, and the Wanted bounty system arrive
            in a follow-up. For now, hop into a clan or LFG board to find squadmates.
          </p>
          <Link
            href="/clans"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{
              background: "var(--bg-elevated)",
              border:     "1px solid var(--border-default)",
              color:      "var(--text-primary)",
            }}
          >
            Browse clans
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}
