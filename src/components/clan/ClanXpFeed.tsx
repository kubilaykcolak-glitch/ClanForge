"use client";

import { useEffect, useState } from "react";
import { getClanXpFeed, type ClanXpEventRow, type ClanXpReason } from "@/lib/actions/clan-xp.actions";
import { timeAgo } from "@/lib/utils";

const REASON_ICONS: Record<ClanXpReason, string> = {
  member_join:            "👋",
  post_created:           "📝",
  tournament_participate: "🎮",
  tournament_win:         "🏆",
  challenge_complete:     "⚡",
  member_recruited:       "🤝",
  mission_contribute:     "🎯",
  clan_mission_complete:  "🛡️",
};

interface Props {
  clanId: string;
  limit?: number;
}

export function ClanXpFeed({ clanId, limit = 8 }: Props) {
  const [events, setEvents] = useState<ClanXpEventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getClanXpFeed(clanId, limit)
      .then(r => setEvents(r.data ?? []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [clanId, limit]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-10 rounded-lg animate-pulse"
            style={{ background: "var(--bg-overlay)" }}
          />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-xs text-center py-4" style={{ color: "var(--text-muted)" }}>
        No XP activity yet — complete challenges, post, and recruit members to earn XP.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {events.map((e, i) => (
        <div
          key={e.id}
          className="flex items-center gap-2.5 py-2"
          style={{ borderBottom: i < events.length - 1 ? "1px solid var(--border-subtle)" : "none" }}
        >
          <span className="text-base shrink-0">{REASON_ICONS[e.reason] ?? "⭐"}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate" style={{ color: "var(--text-secondary)" }}>
              {e.label}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {timeAgo(new Date(e.createdAt))}
            </p>
          </div>
          <span className="text-xs font-bold shrink-0" style={{ color: "var(--success)" }}>
            +{e.amount} XP
          </span>
        </div>
      ))}
    </div>
  );
}
