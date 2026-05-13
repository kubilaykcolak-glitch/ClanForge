import Link from "next/link";
import { Users } from "lucide-react";
import type { Tournament } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import { formatPence } from "@/lib/prize-splits";

// ── Helpers ───────────────────────────────────────────────────────────────────

function gameGradient(gameName: string): string {
  const gradients = [
    "linear-gradient(135deg, #1e1b4b 0%, #0a0a0f 100%)",
    "linear-gradient(135deg, #1a1a2e 0%, #0f0f23 100%)",
    "linear-gradient(135deg, #0d1117 0%, #1a2634 100%)",
    "linear-gradient(135deg, #2d1b69 0%, #1a0a2e 100%)",
    "linear-gradient(135deg, #1a0505 0%, #2d1010 100%)",
    "linear-gradient(135deg, #0a1a0a 0%, #102d10 100%)",
  ];
  let hash = 0;
  for (let i = 0; i < gameName.length; i++) {
    hash = (hash << 5) - hash + gameName.charCodeAt(i);
    hash |= 0;
  }
  return gradients[Math.abs(hash) % gradients.length];
}

const FORMAT_LABELS: Record<string, string> = {
  single_elim: "Single Elim",
  double_elim: "Double Elim",
  round_robin:  "Round Robin",
};

const STATUS_VARIANTS: Record<
  string,
  Parameters<typeof Badge>[0]["variant"]
> = {
  open:     "success",
  live:     "live",
  locked:   "warning",
  complete: "default",
  draft:    "default",
};

const STATUS_LABELS: Record<string, string> = {
  open:     "Open",
  live:     "Live",
  locked:   "Starting Soon",
  complete: "Completed",
  draft:    "Draft",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface TournamentCardProps {
  tournament: Tournament;
}

export function TournamentCard({ tournament }: TournamentCardProps) {
  const id       = tournament.id ?? "";
  const hasPrize = tournament.prizePool > 0;
  const isFree   = tournament.entryFee === 0;

  return (
    <Link
      href={`/tournaments/${id}`}
      className="group block rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-glow"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
      }}
    >
      {/* ── Banner ── */}
      <div
        className="w-full relative"
        style={{
          height: 100,
          background: tournament.bannerUrl ? undefined : gameGradient(tournament.game),
        }}
      >
        {tournament.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tournament.bannerUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        )}

        {/* Status badge — top right */}
        <span className="absolute top-2 right-2">
          <Badge variant={STATUS_VARIANTS[tournament.status] ?? "default"}>
            {STATUS_LABELS[tournament.status] ?? tournament.status}
          </Badge>
        </span>

        {/* Prize — top left */}
        {hasPrize && (
          <span
            className="absolute top-2 left-2 text-xs font-bold px-2 py-0.5 rounded-full"
            style={{
              background: "rgba(245,158,11,0.15)",
              border: "1px solid rgba(245,158,11,0.3)",
              color: "var(--warning)",
            }}
          >
            {formatPence(tournament.prizePool)} Prize
          </span>
        )}
      </div>

      {/* ── Body ── */}
      <div className="px-4 py-4">
        {/* Name */}
        <h3
          className="font-display font-bold text-lg leading-tight mb-2 truncate"
          style={{ color: "var(--text-primary)" }}
        >
          {tournament.name}
        </h3>

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <Badge variant="tournament">{tournament.game}</Badge>
          <Badge variant="info">
            {FORMAT_LABELS[tournament.format] ?? tournament.format}
          </Badge>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between text-xs mb-3">
          <span className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
            <Users size={12} />
            {tournament.participantCount} / {tournament.maxParticipants}
          </span>
          <span style={{ color: isFree ? "var(--success)" : "var(--warning)" }}>
            {isFree ? "Free Entry" : `${formatPence(tournament.entryFee)} Entry`}
          </span>
        </div>

        {/* Start date */}
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          Starts {formatDate(tournament.startsAt)}
        </p>

        {/* CTA */}
        <div
          className="w-full text-center py-2 rounded-lg text-sm font-medium"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            color: "var(--text-secondary)",
          }}
        >
          View Tournament →
        </div>
      </div>
    </Link>
  );
}
