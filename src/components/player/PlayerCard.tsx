import Link from "next/link";
import { Trophy, Sword, CheckCircle2 } from "lucide-react";
import type { Profile } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { getInitials } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getLevel(xp: number) {
  return Math.floor(xp / 1000) + 1;
}

/** Hash a username to one of several accent gradients for avatar fallbacks. */
function avatarGradient(username: string): string {
  const gradients = [
    "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)",
    "linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)",
    "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
    "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
    "linear-gradient(135deg, #14b8a6 0%, #6366f1 100%)",
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = (hash << 5) - hash + username.charCodeAt(i);
    hash |= 0;
  }
  return gradients[Math.abs(hash) % gradients.length];
}

// ── Stat pill ─────────────────────────────────────────────────────────────────

function StatPill({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg flex-1"
      style={{ background: "var(--bg-elevated)" }}
    >
      <div className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <span className="font-display font-bold text-sm" style={{ color: "var(--text-primary)" }}>
        {value}
      </span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PlayerCardProps {
  player: Profile & { id: string };
  rank?: number;
}

export function PlayerCard({ player, rank }: PlayerCardProps) {
  const level    = getLevel(player.xp);
  const gradient = avatarGradient(player.username);
  const winRate  =
    player.tournamentsPlayed > 0
      ? Math.round((player.tournamentsWon / player.tournamentsPlayed) * 100)
      : 0;

  return (
    <Link
      href={`/profile/${player.username}`}
      className="group block rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-glow"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
      }}
    >
      {/* ── Top accent strip ── */}
      <div className="h-1.5 w-full" style={{ background: gradient }} />

      <div className="p-5">

        {/* ── Header row ── */}
        <div className="flex items-start gap-4 mb-4">

          {/* Rank number */}
          {rank !== undefined && rank <= 3 && (
            <div
              className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-display"
              style={{
                background:
                  rank === 1
                    ? "linear-gradient(135deg,#fbbf24,#f59e0b)"
                    : rank === 2
                    ? "linear-gradient(135deg,#d1d5db,#9ca3af)"
                    : "linear-gradient(135deg,#cd7f32,#a0522d)",
                color: rank === 1 ? "#78350f" : rank === 2 ? "#111827" : "#fff",
              }}
            >
              {rank}
            </div>
          )}
          {rank !== undefined && rank > 3 && (
            <div
              className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono"
              style={{
                background: "var(--bg-elevated)",
                color: "var(--text-muted)",
              }}
            >
              {rank}
            </div>
          )}

          {/* Avatar */}
          <div
            className="shrink-0 w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold font-display text-lg overflow-hidden"
            style={{ background: gradient }}
          >
            {player.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={player.avatarUrl}
                alt={player.displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{getInitials(player.displayName)}</span>
            )}
          </div>

          {/* Identity */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="font-display font-bold text-base truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {player.displayName}
              </span>
              {player.isVerified && (
                <CheckCircle2
                  size={14}
                  style={{ color: "var(--info)", flexShrink: 0 }}
                />
              )}
            </div>

            <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
              @{player.username}
              {player.country && (
                <span className="ml-1.5">{player.country}</span>
              )}
            </p>

            {/* Level badge */}
            <Badge variant="info">Lv. {level}</Badge>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="flex gap-2 mb-4">
          <StatPill
            icon={<Trophy size={11} />}
            value={player.tournamentsPlayed}
            label="Played"
          />
          <StatPill
            icon={<Trophy size={11} style={{ color: "var(--warning)" }} />}
            value={player.tournamentsWon}
            label="Won"
          />
          <StatPill
            icon={<Sword size={11} />}
            value={winRate}
            label="Win%"
          />
        </div>

        {/* ── XP bar ── */}
        <div>
          <div
            className="flex justify-between text-xs mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            <span>{player.xp.toLocaleString()} XP</span>
            <span>Lv {level + 1} → {((level) * 1000).toLocaleString()} XP</span>
          </div>
          <div
            className="h-1 rounded-full overflow-hidden"
            style={{ background: "var(--bg-overlay)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min((player.xp % 1000) / 10, 100)}%`,
                background: gradient,
              }}
            />
          </div>
        </div>

        {/* ── View profile ── */}
        <div
          className="mt-4 w-full text-center py-2 rounded-lg text-xs font-medium transition-all duration-150 group-hover:border-accent"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            color: "var(--text-secondary)",
          }}
        >
          View Profile →
        </div>
      </div>
    </Link>
  );
}
