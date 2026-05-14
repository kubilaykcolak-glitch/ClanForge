"use client";

import Link from "next/link";
import { Trophy, Users, Zap } from "lucide-react";
import { ClanLevelBadge } from "@/components/clan/ClanLevelBadge";
import { getClanBorderStyle } from "@/lib/clan-levels";
import type { LeaderboardEntry, PlayerLeaderboardEntry } from "@/lib/actions/leaderboard.actions";

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg">🥇</span>;
  if (rank === 2) return <span className="text-lg">🥈</span>;
  if (rank === 3) return <span className="text-lg">🥉</span>;
  return (
    <span className="w-7 text-center text-sm font-bold" style={{ color: "var(--text-muted)" }}>
      {rank}
    </span>
  );
}

export function LeaderboardTable({ entries, emptyLabel }: { entries: LeaderboardEntry[]; emptyLabel: string }) {
  if (entries.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-2xl py-20 text-center"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
      >
        <Trophy size={32} className="mb-3 opacity-20" style={{ color: "var(--text-muted)" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
    >
      <div
        className="grid items-center px-5 py-2.5"
        style={{ gridTemplateColumns: "48px 1fr auto auto", borderBottom: "1px solid var(--border-subtle)" }}
      >
        {["Rank", "Clan", "Members", "Points"].map(h => (
          <span key={h} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{h}</span>
        ))}
      </div>

      {entries.map((entry, i) => (
        <Link
          key={entry.clanId}
          href={`/clans/${entry.clanSlug}`}
          className="grid items-center px-5 py-4 transition-colors"
          style={{
            gridTemplateColumns: "48px 1fr auto auto",
            borderBottom: i < entries.length - 1 ? "1px solid var(--border-subtle)" : "none",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-elevated)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <div className="flex items-center">
            <RankBadge rank={entry.rank} />
          </div>

          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-white font-bold font-display overflow-hidden text-sm"
              style={{ background: "var(--violet)" }}
            >
              {entry.clanAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.clanAvatarUrl} alt={entry.clanName} className="w-full h-full object-cover" />
              ) : (
                entry.clanName[0]?.toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-display font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>
                  {entry.clanName}
                </span>
                <ClanLevelBadge xp={entry.clanXp} size="sm" />
                {entry.clanTag && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded font-mono shrink-0"
                    style={{ background: "var(--bg-overlay)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
                  >
                    [{entry.clanTag}]
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 text-sm pr-6" style={{ color: "var(--text-muted)" }}>
            <Users size={13} />
            <span>{entry.memberCount}</span>
          </div>

          <div className="text-right">
            <span className="font-bold font-display text-base" style={{ color: "var(--warning)" }}>
              {entry.points.toLocaleString()}
            </span>
            <span className="text-xs ml-1" style={{ color: "var(--text-muted)" }}>pts</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function PlayerTable({ entries }: { entries: PlayerLeaderboardEntry[] }) {
  if (entries.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-2xl py-20 text-center"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
      >
        <Trophy size={32} className="mb-3 opacity-20" style={{ color: "var(--text-muted)" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No players on the board yet.</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
    >
      <div
        className="grid items-center px-5 py-2.5"
        style={{ gridTemplateColumns: "48px 1fr auto auto", borderBottom: "1px solid var(--border-subtle)" }}
      >
        {["Rank", "Player", "Level", "XP"].map(h => (
          <span key={h} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{h}</span>
        ))}
      </div>

      {entries.map((entry, i) => (
        <Link
          key={entry.uid}
          href={`/profile/${entry.username}`}
          className="grid items-center px-5 py-4 transition-colors"
          style={{
            gridTemplateColumns: "48px 1fr auto auto",
            borderBottom: i < entries.length - 1 ? "1px solid var(--border-subtle)" : "none",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-elevated)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <div className="flex items-center">
            <RankBadge rank={entry.rank} />
          </div>

          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-sm overflow-hidden"
              style={{ background: "var(--accent)", ...getClanBorderStyle(entry.clanBorder) }}
            >
              {entry.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.avatarUrl} alt={entry.displayName} className="w-full h-full object-cover" />
              ) : (
                entry.displayName[0]?.toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>
                {entry.displayName}
              </p>
              <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                @{entry.username}
              </p>
            </div>
          </div>

          <div className="text-sm pr-6" style={{ color: "var(--text-secondary)" }}>
            Lv. {entry.level}
          </div>

          <div className="text-right">
            <div className="flex items-center gap-1 justify-end">
              <Zap size={12} style={{ color: "var(--accent)" }} />
              <span className="font-bold font-display text-base" style={{ color: "var(--accent)" }}>
                {entry.xp.toLocaleString()}
              </span>
            </div>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>XP</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
