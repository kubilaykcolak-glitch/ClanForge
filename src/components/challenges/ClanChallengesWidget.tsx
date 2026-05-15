"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Trophy, Clock, ChevronRight, Zap } from "lucide-react";
import { getClanActiveChallenges, type ClanChallengeWidgetData } from "@/lib/actions/challenge.actions";
import { ChallengeProgressBar } from "./ChallengeProgressBar";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, string> = {
  tournament_participate: "🎮",
  tournament_win:         "🏆",
  post_create:            "📣",
  member_recruit:         "🎯",
  xp_earn:                "⚡",
  match_win:              "⚔️",
};

const TYPE_LABELS: Record<string, string> = {
  tournament_participate: "Tournament Participation",
  tournament_win:         "Tournament Wins",
  post_create:            "Clan Posts",
  member_recruit:         "New Members",
  xp_earn:                "XP Earned",
  match_win:              "Match Wins",
};

function timeRemaining(endAtMs: number): string {
  const diff = endAtMs - Date.now();
  if (diff <= 0) return "Ended";
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h left`;
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  clanId: string;
}

export function ClanChallengesWidget({ clanId }: Props) {
  const [data,    setData]    = useState<ClanChallengeWidgetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [active,  setActive]  = useState(0); // index of selected challenge

  useEffect(() => {
    getClanActiveChallenges(clanId).then(result => {
      if (result.success && result.data) setData(result.data);
      setLoading(false);
    });
  }, [clanId]);

  if (loading) {
    return (
      <div
        className="rounded-2xl p-5 animate-pulse"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", minHeight: 120 }}
      />
    );
  }

  if (data.length === 0) {
    return (
      <div
        className="rounded-2xl p-6 text-center"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        <Trophy size={28} className="mx-auto mb-2 opacity-30" style={{ color: "var(--text-muted)" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No active challenges right now</p>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Check back soon for new clan challenges</p>
      </div>
    );
  }

  const current = data[active];
  if (!current) return null;

  const { challenge, entry, topEntries } = current;
  const progress = entry?.progress ?? 0;

  // Memoised so it doesn't recompute on every parent render
  // (only recomputes when the active challenge's endAt changes)
  const timeLeft = useMemo(() => timeRemaining(challenge.endAt), [challenge.endAt]);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
    >
      {/* ── Header ── */}
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2">
          <Trophy size={16} style={{ color: "var(--warning)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Active Challenges
          </span>
        </div>
        <Link
          href="/leaderboard"
          className="text-xs flex items-center gap-1 transition-colors"
          style={{ color: "var(--accent)" }}
        >
          Leaderboard <ChevronRight size={12} />
        </Link>
      </div>

      {/* ── Tab pills (multiple challenges) ── */}
      {data.length > 1 && (
        <div className="flex gap-1.5 px-5 pt-4">
          {data.map((d, i) => (
            <button
              key={d.challenge.id}
              onClick={() => setActive(i)}
              className="text-xs px-2.5 py-1 rounded-full transition-colors"
              style={{
                background: i === active ? "var(--accent)" : "var(--bg-elevated)",
                color:      i === active ? "#fff"          : "var(--text-muted)",
                border:     "1px solid var(--border-default)",
              }}
            >
              {TYPE_ICONS[d.challenge.type] ?? "🎯"}
            </button>
          ))}
        </div>
      )}

      {/* ── Main challenge card ── */}
      <div className="px-5 pt-4 pb-5">
        {/* Challenge header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-xs font-medium mb-0.5" style={{ color: "var(--accent)" }}>
              {TYPE_ICONS[challenge.type]} {TYPE_LABELS[challenge.type] ?? challenge.type}
              {" · "}
              <span className="capitalize">{challenge.duration}</span>
            </p>
            <h3 className="font-display font-semibold text-base leading-tight" style={{ color: "var(--text-primary)" }}>
              {challenge.title}
            </h3>
            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-muted)" }}>
              {challenge.description}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <div
              className="text-lg font-bold font-display"
              style={{ color: "var(--warning)" }}
            >
              {challenge.pointValue}
              <span className="text-xs font-normal ml-0.5" style={{ color: "var(--text-muted)" }}>pts</span>
            </div>
            {challenge.memberXpReward > 0 && (
              <div className="flex items-center gap-0.5 justify-end">
                <Zap size={10} style={{ color: "var(--accent)" }} />
                <span className="text-xs" style={{ color: "var(--accent)" }}>+{challenge.memberXpReward} XP</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="mb-4">
          <ChallengeProgressBar
            progress={progress}
            target={challenge.targetValue}
            completed={entry?.completed ?? false}
          />
        </div>

        {/* Time + rewards row */}
        <div className="flex items-center justify-between text-xs mb-4">
          <div className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
            <Clock size={11} />
            <span>{timeLeft}</span>
          </div>
          {challenge.badgeReward && (
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium"
              style={{
                background: "rgba(245,158,11,0.1)",
                border:     "1px solid rgba(245,158,11,0.25)",
                color:      "var(--warning)",
              }}
            >
              🏅 Badge reward
            </span>
          )}
        </div>

        {/* Mini leaderboard */}
        {topEntries.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>
              Top clans
            </p>
            <div className="space-y-1.5">
              {topEntries.map((e) => (
                <div key={e.clanId} className="flex items-center gap-2">
                  <span
                    className="w-5 text-center text-xs font-bold shrink-0"
                    style={{ color: e.rank === 1 ? "var(--warning)" : "var(--text-muted)" }}
                  >
                    {e.rank}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span
                        className="text-xs font-medium truncate"
                        style={{ color: e.clanId === clanId ? "var(--accent)" : "var(--text-secondary)" }}
                      >
                        {e.clanTag ? `[${e.clanTag}] ` : ""}{e.clanName}
                      </span>
                      <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
                        {e.progress}/{e.targetValue}
                      </span>
                    </div>
                    <div
                      className="h-1 rounded-full overflow-hidden"
                      style={{ background: "var(--bg-overlay)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width:      `${Math.min(100, Math.round((e.progress / e.targetValue) * 100))}%`,
                          background: e.completed ? "var(--success)" : e.clanId === clanId ? "var(--accent)" : "var(--bg-elevated)",
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
