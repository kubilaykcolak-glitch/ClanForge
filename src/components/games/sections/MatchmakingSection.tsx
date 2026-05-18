// ─── Game-hub Matchmaking section ─────────────────────────────────────────────
//
// Placeholder until the full LFG (looking-for-group) feature ships. Routes
// users to the existing /players directory in the meantime.

import Link from "next/link";
import { MessagesSquare, Users } from "lucide-react";
import type { GameSectionProps } from "@/lib/games/types";

export default function MatchmakingSection({ gameName }: GameSectionProps) {
  return (
    <div>
      <div className="mb-5">
        <h2 className="font-display font-bold text-xl" style={{ color: "var(--text-primary)" }}>
          Matchmaking
        </h2>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          Find teammates and opponents for {gameName}.
        </p>
      </div>

      <div
        className="rounded-2xl p-8 text-center"
        style={{
          background: "var(--bg-surface)",
          border:     "1px solid var(--border-subtle)",
        }}
      >
        <MessagesSquare size={32} style={{ color: "var(--text-muted)" }} className="mx-auto mb-4 opacity-40" />
        <h3 className="font-display font-semibold text-base mb-2" style={{ color: "var(--text-primary)" }}>
          LFG board lands next
        </h3>
        <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: "var(--text-muted)" }}>
          Post a squad slot, filter by rank or role, and team up in chat. In the
          meantime, browse player profiles to scout teammates.
        </p>
        <Link
          href="/players"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{
            background: "var(--bg-elevated)",
            border:     "1px solid var(--border-default)",
            color:      "var(--text-primary)",
          }}
        >
          <Users size={14} />
          Browse players
        </Link>
      </div>
    </div>
  );
}
