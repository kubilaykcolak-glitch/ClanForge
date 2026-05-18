// ─── Game-hub Tournaments section ─────────────────────────────────────────────
//
// Server component. Renders the open tournaments for this game in a grid,
// with a CTA into /tournaments/create and a "View all" link out to the
// global tournaments page. Curated preview — the full /tournaments page
// remains the deep interactive view.

import Link from "next/link";
import { Plus, Trophy } from "lucide-react";
import { getTournamentTab, type TournamentRow } from "@/lib/actions/tournament-list.actions";
import { TournamentCard } from "@/components/tournament/TournamentCard";
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
  // First page of "open" tournaments only — the curated section view. Users
  // who want live/locked/complete browse the global /tournaments page.
  const res = await getTournamentTab("open", "soonest", null, gameName);
  const items = res.data?.items ?? [];

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
          {gameName} tournaments
        </h2>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {count > 0
            ? `${count} open for registration`
            : "No tournaments open right now"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/tournaments"
          className="text-xs font-medium underline-offset-2 hover:underline"
          style={{ color: "var(--text-secondary)" }}
        >
          View all →
        </Link>
        <Link href="/tournaments/create" className="arena-cta shrink-0">
          <Plus size={14} />
          Create
        </Link>
      </div>
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
        No open {gameName} tournaments
      </p>
      <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
        Be the first to host one.
      </p>
      <Link href="/tournaments/create" className="arena-cta">
        <Plus size={14} />
        Create tournament
      </Link>
    </div>
  );
}
