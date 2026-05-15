import Link from "next/link";
import { Users, Trophy } from "lucide-react";
import type { Tournament } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { MonoPill } from "@/components/ui/MonoPill";
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
      className="group block rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-glow hover:-translate-y-0.5"
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

        {/* Prize — top left. Uses amber tier colour + Trophy icon for clearer
            visual hierarchy ("this is what you can win"). */}
        {hasPrize && (
          <MonoPill
            color="var(--amber)"
            bg="rgba(251,191,36,0.15)"
            icon={<Trophy size={11} />}
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              border: "1px solid rgba(251,191,36,0.3)",
              fontWeight: 700,
            }}
          >
            {formatPence(tournament.prizePool)}
          </MonoPill>
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

        {/* Tag row — MonoPill for category tags (game + format).
            Cleaner than two semantic-coloured Badges side-by-side. */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <MonoPill color="var(--cyan)" bg="rgba(34,211,238,0.10)">
            {tournament.game}
          </MonoPill>
          <MonoPill>
            {FORMAT_LABELS[tournament.format] ?? tournament.format}
          </MonoPill>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between text-xs mb-3">
          <span className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
            <Users size={12} />
            {tournament.participantCount} / {tournament.maxParticipants}
          </span>
          <span
            className="font-mono-tech"
            style={{ color: isFree ? "var(--success)" : "var(--warning)", fontSize: 10 }}
          >
            {isFree ? "Free Entry" : `${formatPence(tournament.entryFee)} Entry`}
          </span>
        </div>

        {/* Start date */}
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          Starts {formatDate(tournament.startsAt)}
        </p>

        {/* CTA — subtle ghost button. Promotes on hover via group-hover. */}
        <div
          className="w-full text-center py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            color: "var(--text-secondary)",
          }}
        >
          <span className="group-hover:text-white transition-colors">
            View Tournament →
          </span>
        </div>
      </div>
    </Link>
  );
}
