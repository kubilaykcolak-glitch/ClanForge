// ─── Game-hub Tournaments section ─────────────────────────────────────────────
//
// Per the cleanup rule, the game hub does NOT duplicate the global
// /tournaments surface. This section shows only the tournaments the
// viewer is currently registered in for this game. Discovery + creation
// live entirely in the dedicated Tournaments tab; "View all" funnels there.

import Link from "next/link";
import { Trophy } from "lucide-react";
import {
  getMyActiveTournamentsForGame,
  type TournamentRow,
} from "@/lib/actions/tournament-list.actions";
import { TournamentCard } from "@/components/tournament/TournamentCard";
import { getCurrentUserContext } from "@/lib/games/current-user";
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

export default async function TournamentsSection({ gameName }: GameSectionProps) {
  const viewer = await getCurrentUserContext();
  const mineRes = viewer
    ? await getMyActiveTournamentsForGame(viewer.uid, gameName, 24)
    : { success: true as const, data: [] as TournamentRow[] };
  const items = mineRes.success ? (mineRes.data ?? []) : [];

  return (
    <div>
      <SectionHeader gameName={gameName} count={items.length} />

      {items.length === 0 ? (
        <EmptyState gameName={gameName} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map(row => (
            <TournamentCard key={row.id} tournament={rowToTournament(row)} />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ gameName, count }: { gameName: string; count: number }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
      <div>
        <h2
          className="font-display font-bold text-xl"
          style={{ color: "var(--text-primary)" }}
        >
          Your {gameName} tournaments
        </h2>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {count > 0 ? `${count} active` : "Nothing active for you right now"}
        </p>
      </div>
      <Link
        href="/tournaments"
        className="text-xs font-medium underline-offset-2 hover:underline"
        style={{ color: "var(--text-secondary)" }}
      >
        View all →
      </Link>
    </div>
  );
}

function EmptyState({ gameName }: { gameName: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-2xl py-16 text-center"
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-subtle)",
      }}
    >
      <Trophy size={32} style={{ color: "var(--text-muted)" }} className="mb-3 opacity-40" />
      <p className="text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
        You haven&rsquo;t joined a {gameName} tournament yet
      </p>
      <p className="text-xs mb-5 max-w-sm" style={{ color: "var(--text-muted)" }}>
        Browse what&rsquo;s open and join from the Tournaments tab. Everything
        you&rsquo;re registered in will show here.
      </p>
      <Link
        href="/tournaments"
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
        style={{
          background: "var(--bg-elevated)",
          border:     "1px solid var(--border-default)",
          color:      "var(--text-primary)",
        }}
      >
        Browse all tournaments
      </Link>
    </div>
  );
}
