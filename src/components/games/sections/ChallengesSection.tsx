// ─── Game-hub Challenges section ──────────────────────────────────────────────
//
// Currently game-agnostic — the ClanChallenge schema doesn't carry a `game`
// field today, so this surfaces every active challenge in the system. When
// challenges grow a `game` field (planned), swap to a where-filter and drop
// the explanatory subtitle.

import { Target } from "lucide-react";
import type { GameSectionProps } from "@/lib/games/types";

interface ActiveChallenge {
  id:           string;
  title:        string;
  description:  string;
  targetValue:  number;
  pointValue:   number;
  endAt:        number;
}

async function getActiveChallenges(limit: number): Promise<ActiveChallenge[]> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb
      .collection("challenges")
      .where("status", "==", "active")
      .orderBy("endAt", "asc")
      .limit(limit)
      .get();

    const toMs = (v: unknown) =>
      (v as { toDate?: () => Date } | undefined)?.toDate?.().getTime() ?? Date.now();

    return snap.docs.map(d => {
      const data = d.data();
      return {
        id:          d.id,
        title:       (data.title       as string) ?? "",
        description: (data.description as string) ?? "",
        targetValue: (data.targetValue as number) ?? 0,
        pointValue:  (data.pointValue  as number) ?? 0,
        endAt:       toMs(data.endAt),
      };
    });
  } catch (err) {
    console.error("[ChallengesSection] failed:", err);
    return [];
  }
}

export default async function ChallengesSection({ gameName }: GameSectionProps) {
  const items = await getActiveChallenges(8);

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-xl" style={{ color: "var(--text-primary)" }}>
            Active challenges
          </h2>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Community challenges open right now — game-specific filtering coming soon.
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map(c => <ChallengeRow key={c.id} c={c} />)}
        </div>
      )}

      <p className="text-[11px] mt-6" style={{ color: "var(--text-muted)" }}>
        Showing all active challenges. Once challenges are tagged with a game,
        this list will narrow to {gameName} only.
      </p>
    </div>
  );
}

function ChallengeRow({ c }: { c: ActiveChallenge }) {
  const daysLeft = Math.max(0, Math.ceil((c.endAt - Date.now()) / 86_400_000));
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex items-start gap-3 mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "var(--bg-elevated)", color: "var(--accent)" }}
        >
          <Target size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            {c.title}
          </p>
          <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-muted)" }}>
            {c.description}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-[11px] mt-3" style={{ color: "var(--text-secondary)" }}>
        <span>Target: {c.targetValue.toLocaleString()}</span>
        <span>•</span>
        <span>{c.pointValue} pts</span>
        <span>•</span>
        <span>{daysLeft === 0 ? "Ends today" : `${daysLeft}d left`}</span>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-2xl py-16 text-center"
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-subtle)",
      }}
    >
      <Target size={32} style={{ color: "var(--text-muted)" }} className="mb-3 opacity-40" />
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        No active challenges right now
      </p>
      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
        Check back soon.
      </p>
    </div>
  );
}
