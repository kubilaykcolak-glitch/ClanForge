"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Trophy, ChevronRight, Clock, Info, ChevronUp } from "lucide-react";
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
  // Per-challenge expansion state — keyed by challenge id. Each entry's
  // "How to complete" panel toggles independently so a clan member can leave
  // one expanded while glancing at another.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const toggleExpanded = (id: string) =>
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

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
        {items.map(({ challenge, entry }) => {
          const isExpanded = expandedIds.has(challenge.id);
          return (
            <div key={challenge.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {TYPE_ICONS[challenge.type] ?? "🎯"} {challenge.title}
                    </p>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(challenge.id)}
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? "Hide challenge details" : "Show challenge details"}
                      title="How to complete this challenge"
                      className="p-0.5 rounded transition-colors"
                      style={{ color: isExpanded ? "var(--accent)" : "var(--text-muted)" }}
                    >
                      <Info size={11} />
                    </button>
                  </div>
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

              {/* Expanded details — full description + rewards summary. */}
              {isExpanded && (
                <div
                  className="mt-3 rounded-lg p-3"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <p
                      className="text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: "var(--text-muted)" }}
                    >
                      How to complete
                    </p>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(challenge.id)}
                      aria-label="Hide details"
                      className="p-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <ChevronUp size={11} />
                    </button>
                  </div>
                  <p
                    className="text-xs whitespace-pre-wrap"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {challenge.description || <em style={{ color: "var(--text-muted)" }}>No description provided.</em>}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 pt-2 text-[10px]"
                    style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
                  >
                    <span>Target: <strong style={{ color: "var(--text-primary)" }}>{challenge.targetValue}</strong></span>
                    {challenge.memberXpReward > 0 && <span>+{challenge.memberXpReward} XP</span>}
                    {challenge.clanXpReward > 0   && <span>+{challenge.clanXpReward} clan XP</span>}
                    {challenge.badgeReward       && <span>🏅 {challenge.badgeReward}</span>}
                    {challenge.titleReward       && <span>🎖 {challenge.titleReward}</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
