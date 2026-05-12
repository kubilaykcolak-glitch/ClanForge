import { Suspense } from "react";
import type { Profile } from "@/types";
import { PlayerCard } from "@/components/player/PlayerCard";
import { PlayerFilters } from "@/components/player/PlayerFilters";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlayerRow extends Profile {
  id: string;
}

// ── Data fetch ────────────────────────────────────────────────────────────────

interface FetchOptions {
  q:        string | undefined;
  verified: boolean;
}

async function getPlayers({ q, verified }: FetchOptions): Promise<PlayerRow[]> {
  const { adminDb } = await import("@/lib/firebase/admin");

  let query: FirebaseFirestore.Query = adminDb.collection("profiles");

  if (q) {
    // Username prefix search — needs only default index (username asc)
    const lower = q.toLowerCase();
    query = query
      .orderBy("username")
      .startAt(lower)
      .endAt(lower + "")
      .limit(24);
  } else if (verified) {
    // Verified filter — compound index: isVerified + xp desc
    query = query
      .where("isVerified", "==", true)
      .orderBy("xp", "desc")
      .limit(24);
  } else {
    // Default leaderboard: top 24 by XP
    query = query.orderBy("xp", "desc").limit(24);
  }

  const snap = await query.get();

  return snap.docs.map(d => {
    const data = d.data();
    return {
      id:                d.id,
      username:          (data.username as string)          ?? "",
      displayName:       (data.displayName as string)       ?? "Unknown",
      avatarUrl:         data.avatarUrl as string | undefined,
      bio:               data.bio as string | undefined,
      country:           data.country as string | undefined,
      steamUrl:          data.steamUrl as string | undefined,
      xboxGamertag:      data.xboxGamertag as string | undefined,
      psnId:             data.psnId as string | undefined,
      discordTag:        data.discordTag as string | undefined,
      twitchUrl:         data.twitchUrl as string | undefined,
      xp:                (data.xp as number)                ?? 0,
      tournamentsPlayed: (data.tournamentsPlayed as number) ?? 0,
      tournamentsWon:    (data.tournamentsWon as number)    ?? 0,
      isVerified:        (data.isVerified as boolean)       ?? false,
      isAdmin:           (data.isAdmin as boolean)          ?? false,
      createdAt:         data.createdAt?.toDate?.()         ?? new Date(),
      updatedAt:         data.updatedAt?.toDate?.()         ?? new Date(),
    } satisfies PlayerRow;
  });
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function PlayerCardSkeleton() {
  return (
    <div
      className="rounded-2xl overflow-hidden animate-pulse"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
      }}
    >
      <div className="h-1.5 w-full" style={{ background: "var(--bg-overlay)" }} />
      <div className="p-5">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-14 h-14 rounded-xl" style={{ background: "var(--bg-elevated)" }} />
          <div className="flex-1 space-y-2">
            <div className="h-4 rounded w-3/4" style={{ background: "var(--bg-elevated)" }} />
            <div className="h-3 rounded w-1/2" style={{ background: "var(--bg-elevated)" }} />
          </div>
        </div>
        <div className="flex gap-2 mb-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex-1 h-12 rounded-lg" style={{ background: "var(--bg-elevated)" }} />
          ))}
        </div>
        <div className="h-1 rounded-full" style={{ background: "var(--bg-elevated)" }} />
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ q, verified }: { q?: string; verified: boolean }) {
  return (
    <div
      className="col-span-full flex flex-col items-center justify-center py-20 rounded-2xl text-center"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <span className="text-5xl mb-4 opacity-30">🎮</span>
      <p
        className="font-display font-semibold text-lg mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        No players found
      </p>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {q
          ? `No users matched "${q}". Try a different username.`
          : verified
          ? "No verified players found yet."
          : "Be the first to join ClanForge!"}
      </p>
    </div>
  );
}

// ── Inner async grid (receives resolved searchParams) ─────────────────────────

async function PlayerGrid({
  q,
  verified,
}: {
  q?: string;
  verified: boolean;
}) {
  const players = await getPlayers({ q, verified });

  if (players.length === 0) {
    return <EmptyState q={q} verified={verified} />;
  }

  return (
    <>
      {players.map((player, idx) => (
        <PlayerCard
          key={player.id}
          player={player}
          rank={!q && !verified ? idx + 1 : undefined}
        />
      ))}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: { q?: string; verified?: string };
}) {
  const q        = searchParams.q?.trim().toLowerCase() || undefined;
  const verified = searchParams.verified === "true";

  return (
    <div className="max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div className="mb-8">
        <h1
          className="font-display font-bold text-4xl mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Find Players
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {q
            ? `Search results for "${q}"`
            : verified
            ? "Verified players"
            : "Top players ranked by XP"}
        </p>
      </div>

      {/* ── Filters (client component, needs Suspense for useSearchParams) ── */}
      <Suspense fallback={null}>
        <PlayerFilters />
      </Suspense>

      {/* ── Player grid ── */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Suspense
          fallback={Array.from({ length: 6 }).map((_, i) => (
            <PlayerCardSkeleton key={i} />
          ))}
        >
          <PlayerGrid q={q} verified={verified} />
        </Suspense>
      </div>

      {/* ── Footer note ── */}
      <p
        className="mt-8 text-center text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        Showing up to 24 players · Rankings update in real-time
      </p>
    </div>
  );
}
