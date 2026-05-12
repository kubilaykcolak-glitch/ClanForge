"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Profile } from "@/types";
import { setProfilePrivacy } from "@/lib/actions/profile.actions";
import Toggle from "@/components/ui/Toggle";
import PlayerCard from "./PlayerCard";

// ── Types ─────────────────────────────────────────────────────────────────────

// Dates are serialised to ms timestamps when crossing the RSC boundary.
export type PlayerRow = Omit<Profile, "createdAt" | "updatedAt"> & {
  id:        string;
  createdAt: number;
  updatedAt: number;
};

interface PlayersClientProps {
  players:          PlayerRow[];
  uid:              string | null;
  initialIsPrivate: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ── Component ─────────────────────────────────────────────────────────────────

export default function PlayersClient({
  players,
  uid,
  initialIsPrivate,
}: PlayersClientProps) {
  const [search,     setSearch]     = useState("");
  const [isPrivate,  setIsPrivate]  = useState(initialIsPrivate);
  const [activeOnly, setActiveOnly] = useState(false);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <h1
          className="font-display font-bold text-3xl"
          style={{ color: "var(--text-primary)" }}
        >
          Find Players
        </h1>

        {uid && (
          <Toggle
            checked={!isPrivate}
            onChange={handlePrivacyToggle}
            label="My visibility"
            description={isPrivate ? "Hidden from search" : "Visible in search"}
          />
        )}
      </div>

      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by username or clan tag..."
          style={{
            width:        "100%",
            background:   "var(--bg-surface)",
            border:       "1px solid var(--border-default)",
            borderRadius: 10,
            padding:      "11px 16px",
            fontSize:     14,
            color:        "var(--text-primary)",
            outline:      "none",
            transition:   "border-color 0.15s ease",
          }}
          onFocus={e => {
            (e.currentTarget as HTMLInputElement).style.borderColor = "var(--accent)";
          }}
          onBlur={e => {
            (e.currentTarget as HTMLInputElement).style.borderColor = "var(--border-default)";
          }}
        />
      </div>

      {/* ── Filter row ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-8">
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

        {(search || activeOnly) && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {filtered.length} of {players.length} players
          </span>
        )}
      </div>

      {/* ── Player grid ────────────────────────────────────────────────────── */}
      {filtered.length > 0 ? (
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap:                 16,
            marginBottom:        32,
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
      <div className="flex justify-center pb-16">
        <button
          type="button"
          style={{
            padding:      "10px 32px",
            borderRadius: 10,
            border:       "1px solid var(--border-default)",
            background:   "transparent",
            color:        "var(--text-secondary)",
            fontSize:     14,
            fontWeight:   500,
            cursor:       "pointer",
            transition:   "border-color 0.15s ease, color 0.15s ease",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
            (e.currentTarget as HTMLElement).style.color       = "var(--accent)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)";
            (e.currentTarget as HTMLElement).style.color       = "var(--text-secondary)";
          }}
        >
          Load more
        </button>
      </div>
    </div>
  );
}
