"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Trophy, ChevronRight, Clock } from "lucide-react";
import { getDashboardChallenges, type DashboardChallengeItem } from "@/lib/actions/challenge.actions";
import { ChallengeProgressBar } from "./ChallengeProgressBar";

function timeRemaining(endAtMs: number): string {
  const diff = endAtMs - Date.now();
  if (diff <= 0) return "Ended";
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d left`;
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h left`;
  return `${m}m left`;
}

const TYPE_ICONS: Record<string, string> = {
  tournament_participate: "🎮",
  tournament_win:         "🏆",
  post_create:            "📣",
  member_recruit:         "🎯",
  xp_earn:                "⚡",
  match_win:              "⚔️",
};

interface Props {
  clanId: string | null;
}

export function DashboardChallengesWidget({ clanId }: Props) {
  const [items,   setItems]   = useState<DashboardChallengeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardChallenges(clanId).then(result => {
      if (result.success && result.data) setItems(result.data);
      setLoading(false);
    });
  }, [clanId]);

  // Pre-compute time-remaining strings once per items change, not on every render
  const timeLabels = useMemo(
    () => Object.fromEntries(items.map(({ challenge }) => [challenge.id, timeRemaining(challenge.endAt)])),
    [items],
  );

  if (!clanId) return null;

  if (loading) {
    return (
      <div
        className="rounded-2xl p-5"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={16} style={{ color: "var(--warning)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Clan Challenges</span>
        </div>
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: "var(--bg-elevated)" }} />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="rounded-2xl p-5"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Trophy size={16} style={{ color: "var(--warning)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Clan Challenges</span>
        </div>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No active challenges for your clan.</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2">
          <Trophy size={16} style={{ color: "var(--warning)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Clan Challenges
          </span>
        </div>
        <Link
          href="/leaderboard"
          className="text-xs flex items-center gap-1"
          style={{ color: "var(--accent)" }}
        >
          Leaderboard <ChevronRight size={12} />
        </Link>
      </div>

      {/* Challenge list */}
      <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
        {items.map(({ challenge, entry }) => (
          <div key={challenge.id} className="px-5 py-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>
                  {TYPE_ICONS[challenge.type] ?? "🎯"} {challenge.title}
                </p>
                <div className="flex items-center gap-3">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: entry?.completed ? "var(--success)" : "var(--text-secondary)" }}
                  >
                    {entry?.progress ?? 0} / {challenge.targetValue}
                  </span>
                  <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    <Clock size={10} />
                    {timeLabels[challenge.id]}
                  </span>
                </div>
              </div>
              <div
                className="shrink-0 text-sm font-bold font-display"
                style={{ color: "var(--warning)" }}
              >
                {challenge.pointValue}
                <span className="text-xs font-normal ml-0.5" style={{ color: "var(--text-muted)" }}>pts</span>
              </div>
            </div>
            <ChallengeProgressBar
              progress={entry?.progress ?? 0}
              target={challenge.targetValue}
              completed={entry?.completed ?? false}
              showLabel={false}
              height={4}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
