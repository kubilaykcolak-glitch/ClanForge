"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import type { Profile } from "@/types";
import { setProfilePrivacy } from "@/lib/actions/profile.actions";
import { getPlayers, type PlayerSort } from "@/lib/actions/player-list.actions";
import Toggle from "@/components/ui/Toggle";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { SortDropdown } from "@/components/ui/SortDropdown";
import PlayerCard from "./PlayerCard";

// ── Types ─────────────────────────────────────────────────────────────────────

// Dates are serialised to ms timestamps when crossing the RSC boundary.
//
// Privileged / moderation fields are stripped here BEFORE the row reaches
// the public response — `isAdmin` would otherwise tell anyone browsing the
// players directory which accounts are platform staff, and the banned*
// fields would expose moderation history. Strip in both the type AND the
// `mapDoc` mapper (audit finding H8).
export type PlayerRow = Omit<
  Profile,
  "createdAt" | "updatedAt"
  | "isAdmin"
  | "bannedAt" | "bannedBy" | "bannedReason"
> & {
  id:        string;
  createdAt: number;
  updatedAt: number;
};

interface PlayersClientProps {
  initialPlayers:   PlayerRow[];
  initialCursor:    string | null;
  uid:              string | null;
  initialIsPrivate: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const SORT_OPTIONS: ReadonlyArray<{ value: PlayerSort; label: string }> = [
  { value: "xp_desc",          label: "Top XP" },
  { value: "wins_desc",        label: "Most wins" },
  { value: "tournaments_desc", label: "Most tournaments" },
  { value: "newest",           label: "Newest accounts" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function PlayersClient({
  initialPlayers,
  initialCursor,
  uid,
  initialIsPrivate,
}: PlayersClientProps) {
  const [players,    setPlayers]    = useState<PlayerRow[]>(initialPlayers);
  const [cursor,     setCursor]     = useState<string | null>(initialCursor);
  const [sort,       setSort]       = useState<PlayerSort>("xp_desc");
  const [loadingMore, setLoadingMore] = useState(false);
  const [resetting,  setResetting]  = useState(false);

  const [search,     setSearch]     = useState("");
  const [isPrivate,  setIsPrivate]  = useState(initialIsPrivate);
  const [activeOnly, setActiveOnly] = useState(false);

  // ── Privacy toggle ──
  const handlePrivacyToggle = async (visible: boolean) => {
    const next = !visible;
    setIsPrivate(next); // optimistic
    const result = await setProfilePrivacy(uid!, next);
    if (!result.success) {
      setIsPrivate(!next); // revert
      toast.error(result.error ?? "Failed to update visibility");
    } else {
      toast.success(next ? "You are now hidden from search" : "You are now visible in search");
    }
  };

  // ── Sort change ── Resets the list to a fresh page in the new order.
  const handleSortChange = async (next: PlayerSort) => {
    if (next === sort) return;
    setSort(next);
    setResetting(true);
    const result = await getPlayers(next, null);
    setResetting(false);
    if (!result.success || !result.data) {
      toast.error(result.error ?? "Couldn't reorder the list");
      return;
    }
    setPlayers(result.data.items);
    setCursor(result.data.nextCursor);
  };

  // ── Load more ──
  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const result = await getPlayers(sort, cursor);
    setLoadingMore(false);
    if (!result.success || !result.data) {
      toast.error(result.error ?? "Couldn't load more players");
      return;
    }
    setPlayers(prev => [...prev, ...result.data!.items]);
    setCursor(result.data.nextCursor);
  };

  // ── Client-side filter (search + active-30d) ──
  const filtered = useMemo(() => {
    const now = Date.now();
    const q   = search.trim().toLowerCase();

    return players.filter(p => {
      if (q) {
        const matchUsername = p.username.toLowerCase().includes(q);
        const matchClanTag  = (p.clanTag ?? "").toLowerCase().includes(q);
        if (!matchUsername && !matchClanTag) return false;
      }
      if (activeOnly && now - p.updatedAt > THIRTY_DAYS_MS) return false;
      return true;
    });
  }, [players, search, activeOnly]);

  return (
    <div className="max-w-6xl mx-auto">

      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1
            className="font-display font-bold text-4xl"
            style={{ color: "var(--text-primary)" }}
          >
            Find Players
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Discover gamers, scout teammates, scope the competition.
          </p>
        </div>

        {uid && (
          <Toggle
            checked={!isPrivate}
            onChange={handlePrivacyToggle}
            label="My visibility"
            description={isPrivate ? "Hidden from search" : "Visible in search"}
          />
        )}
      </div>

      {/* ── Sort + filter row ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <button
          type="button"
          onClick={() => setActiveOnly(v => !v)}
          style={{
            display:      "inline-flex",
            alignItems:   "center",
            gap:          6,
            padding:      "6px 14px",
            borderRadius: 999,
            fontSize:     13,
            fontWeight:   500,
            border:       `1px solid ${activeOnly ? "var(--accent)" : "var(--border-default)"}`,
            background:   activeOnly ? "var(--accent-glow)" : "var(--bg-surface)",
            color:        activeOnly ? "var(--accent)" : "var(--text-secondary)",
            cursor:       "pointer",
            transition:   "border-color 0.15s ease, background 0.15s ease, color 0.15s ease",
          }}
        >
          <span
            style={{
              width:        7,
              height:       7,
              borderRadius: "50%",
              background:   activeOnly ? "var(--accent)" : "var(--text-muted)",
              flexShrink:   0,
              transition:   "background 0.15s ease",
            }}
          />
          Active recently
        </button>

        <SortDropdown
          label="Sort"
          options={SORT_OPTIONS}
          value={sort}
          onChange={handleSortChange}
        />
      </div>

      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      <div className="arena-input-wrap mb-4">
        <span className="arena-input-icon">
          <Search size={16} />
        </span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by username or clan tag…"
          className="arena-input arena-input--with-icon"
        />
        {(search || activeOnly) && (
          <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            Showing {filtered.length} of {players.length} loaded players
          </p>
        )}
      </div>

      {/* ── Player grid ────────────────────────────────────────────────────── */}
      {filtered.length > 0 ? (
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap:                 16,
            marginBottom:        12,
            opacity:             resetting ? 0.5 : 1,
            transition:          "opacity 0.15s ease",
          }}
        >
          {filtered.map(player => (
            <PlayerCard
              key={player.id}
              // Dates in PlayerRow are ms numbers; new PlayerCard never reads them.
              profile={player as unknown as Profile}
            />
          ))}
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center py-20 text-center rounded-2xl"
          style={{
            background:   "var(--bg-surface)",
            border:       "1px dashed var(--border-default)",
            marginBottom: 32,
          }}
        >
          <span className="text-4xl mb-4 opacity-30">🔍</span>
          <p
            className="font-display font-semibold text-lg"
            style={{ color: "var(--text-secondary)" }}
          >
            No players found
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {search ? "Try a different search term" : "No public profiles yet"}
          </p>
        </div>
      )}

      {/* ── Load more ──────────────────────────────────────────────────────── */}
      <LoadMoreButton
        onClick={handleLoadMore}
        loading={loadingMore}
        exhausted={cursor === null}
        exhaustedLabel="You've seen every player"
        hide={filtered.length === 0}
      />
    </div>
  );
}
