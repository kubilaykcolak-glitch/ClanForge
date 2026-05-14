"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  getClanList,
  searchClans,
  type ClanRow,
  type ClanSort,
} from "@/lib/actions/clan-list.actions";
import { ClanCard } from "./ClanCard";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { SortDropdown } from "@/components/ui/SortDropdown";
import type { Clan } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowToClan(row: ClanRow): Clan {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  } as Clan;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SORT_OPTIONS: ReadonlyArray<{ value: ClanSort; label: string }> = [
  { value: "members",    label: "Most members"    },
  { value: "newest",     label: "Newest"          },
  { value: "recruiting", label: "Recruiting only" },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface ClansClientProps {
  initialItems:       ClanRow[];
  initialCursor:      string | null;
  currentUid:         string | null;
  currentClanId:      string | null;
  currentDisplayName: string;
  currentAvatarUrl:   string | undefined;
}

export function ClansClient({
  initialItems,
  initialCursor,
  currentUid,
  currentClanId,
  currentDisplayName,
  currentAvatarUrl,
}: ClansClientProps) {
  const [items,     setItems]     = useState<ClanRow[]>(initialItems);
  const [cursor,    setCursor]    = useState<string | null>(initialCursor);
  const [sort,      setSort]      = useState<ClanSort>("members");
  const [loading,   setLoading]   = useState(false);
  const [resetting, setResetting] = useState(false);

  const [search,        setSearch]        = useState("");
  const [searchResults, setSearchResults] = useState<ClanRow[] | null>(null);
  const [searching,     setSearching]     = useState(false);

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Search ──
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);

    if (!value.trim()) {
      setSearchResults(null);
      return;
    }

    searchDebounce.current = setTimeout(async () => {
      setSearching(true);
      const result = await searchClans(value.trim());
      setSearching(false);
      if (result.success && result.data) {
        setSearchResults(result.data);
      } else {
        toast.error(result.error ?? "Search failed");
      }
    }, 350);
  };

  useEffect(() => {
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, []);

  // ── Sort change ──
  const handleSortChange = async (next: ClanSort) => {
    if (next === sort) return;
    setSort(next);
    setResetting(true);
    const result = await getClanList(next, null);
    setResetting(false);
    if (!result.success || !result.data) {
      toast.error(result.error ?? "Couldn't reorder the list");
      return;
    }
    setItems(result.data.items);
    setCursor(result.data.nextCursor);
  };

  // ── Load more ──
  const handleLoadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    const result = await getClanList(sort, cursor);
    setLoading(false);
    if (!result.success || !result.data) {
      toast.error(result.error ?? "Couldn't load more clans");
      return;
    }
    setItems(prev => [...prev, ...result.data!.items]);
    setCursor(result.data.nextCursor);
  };

  const isSearchMode   = search.trim().length > 0;
  const displayItems   = isSearchMode ? (searchResults ?? []) : items;
  const showLoadMore   = !isSearchMode;

  return (
    <>
      {/* ── Controls row ── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Search */}
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search clans by name…"
            style={{
              width:        "100%",
              background:   "var(--bg-surface)",
              border:       "1px solid var(--border-default)",
              borderRadius: 10,
              padding:      "10px 16px",
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

        {/* Sort — only when not searching */}
        {!isSearchMode && (
          <SortDropdown
            label="Sort"
            options={SORT_OPTIONS}
            value={sort}
            onChange={handleSortChange}
          />
        )}
      </div>

      {/* ── Results label when searching ── */}
      {isSearchMode && !searching && searchResults !== null && (
        <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
          {searchResults.length > 0
            ? `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""} for "${search}"`
            : `No clans match "${search}"`}
        </p>
      )}

      {/* ── Grid ── */}
      <div style={{ opacity: (resetting || searching) ? 0.5 : 1, transition: "opacity 0.15s ease" }}>
        {displayItems.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {displayItems.map(row => (
              <ClanCard
                key={row.id}
                clan={rowToClan(row)}
                currentUid={currentUid}
                currentClanId={currentClanId}
                currentDisplayName={currentDisplayName}
                currentAvatarUrl={currentAvatarUrl}
              />
            ))}
          </div>
        ) : (
          !resetting && !searching && (
            <div
              className="flex flex-col items-center justify-center rounded-2xl py-24 text-center"
              style={{
                background: "var(--bg-surface)",
                border:     "1px solid var(--border-subtle)",
              }}
            >
              <span className="text-6xl mb-5 opacity-30">🛡️</span>
              <p
                className="font-display font-semibold text-xl mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                {isSearchMode ? "No clans found" : sort === "recruiting" ? "No recruiting clans" : "No clans yet"}
              </p>
              <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
                {isSearchMode
                  ? "Try a different search term"
                  : sort === "recruiting"
                  ? "Check back later or start your own."
                  : "Be the first to create a clan and start recruiting."}
              </p>
              {!isSearchMode && (
                <Link
                  href="/clans/create"
                  className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
                  style={{ background: "var(--accent)" }}
                >
                  + Create Clan
                </Link>
              )}
            </div>
          )
        )}
      </div>

      {/* ── Load more ── */}
      {showLoadMore && (
        <LoadMoreButton
          onClick={handleLoadMore}
          loading={loading}
          exhausted={cursor === null}
          hide={displayItems.length === 0}
        />
      )}
    </>
  );
}
