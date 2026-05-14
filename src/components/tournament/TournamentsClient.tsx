"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  getTournamentTab,
  searchTournaments,
  type TournamentRow,
  type TournamentSort,
  type TournamentStatusTab,
} from "@/lib/actions/tournament-list.actions";
import { TournamentCard } from "./TournamentCard";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { SortDropdown } from "@/components/ui/SortDropdown";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { Tournament } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowToTournament(row: TournamentRow): Tournament {
  return {
    ...row,
    startsAt:             new Date(row.startsAt),
    registrationClosesAt: new Date(row.registrationClosesAt),
    rosterLockedAt:       new Date(row.rosterLockedAt),
    createdAt:            new Date(row.createdAt),
  } as Tournament;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TabKey = "open" | "live" | "upcoming" | "completed";

const TAB_STATUS: Record<TabKey, TournamentStatusTab> = {
  open:      "open",
  live:      "live",
  upcoming:  "locked",
  completed: "complete",
};

const TAB_LABELS: Record<TabKey, string> = {
  open:      "Open",
  live:      "Live",
  upcoming:  "Starting Soon",
  completed: "Completed",
};

interface TabState {
  items:   TournamentRow[];
  cursor:  string | null;
  loading: boolean;
}

type AllTabsState = Record<TabKey, TabState>;

const SORT_OPTIONS: ReadonlyArray<{ value: TournamentSort; label: string }> = [
  { value: "soonest",      label: "Soonest"           },
  { value: "prize",        label: "Largest prize"     },
  { value: "participants", label: "Most participants" },
  { value: "newest",       label: "Newest"            },
];

function makeTabState(
  items:  TournamentRow[],
  cursor: string | null,
): TabState {
  return { items, cursor, loading: false };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface TournamentsClientProps {
  initialOpen:             TournamentRow[];
  initialLive:             TournamentRow[];
  initialUpcoming:         TournamentRow[];
  initialCompleted:        TournamentRow[];
  initialOpenCursor:       string | null;
  initialLiveCursor:       string | null;
  initialUpcomingCursor:   string | null;
  initialCompletedCursor:  string | null;
}

export function TournamentsClient({
  initialOpen,
  initialLive,
  initialUpcoming,
  initialCompleted,
  initialOpenCursor,
  initialLiveCursor,
  initialUpcomingCursor,
  initialCompletedCursor,
}: TournamentsClientProps) {
  const [tabs, setTabs] = useState<AllTabsState>({
    open:      makeTabState(initialOpen,      initialOpenCursor),
    live:      makeTabState(initialLive,      initialLiveCursor),
    upcoming:  makeTabState(initialUpcoming,  initialUpcomingCursor),
    completed: makeTabState(initialCompleted, initialCompletedCursor),
  });
  const [sort,      setSort]      = useState<TournamentSort>("soonest");
  const [resetting, setResetting] = useState(false);

  const [search,        setSearch]        = useState("");
  const [searchResults, setSearchResults] = useState<TournamentRow[] | null>(null);
  const [searching,     setSearching]     = useState(false);

  // Debounce search input
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);

    if (!value.trim()) {
      setSearchResults(null);
      return;
    }

    searchDebounce.current = setTimeout(async () => {
      setSearching(true);
      const result = await searchTournaments(value.trim());
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

  // ── Sort change — refetch all tabs ──
  const handleSortChange = async (next: TournamentSort) => {
    if (next === sort) return;
    setSort(next);
    setResetting(true);

    const [openRes, liveRes, upcomingRes, completedRes] = await Promise.all([
      getTournamentTab("open",     next),
      getTournamentTab("live",     next),
      getTournamentTab("locked",   next),
      getTournamentTab("complete", next),
    ]);

    setResetting(false);

    setTabs({
      open:      makeTabState(openRes.data?.items      ?? [], openRes.data?.nextCursor      ?? null),
      live:      makeTabState(liveRes.data?.items      ?? [], liveRes.data?.nextCursor      ?? null),
      upcoming:  makeTabState(upcomingRes.data?.items  ?? [], upcomingRes.data?.nextCursor  ?? null),
      completed: makeTabState(completedRes.data?.items ?? [], completedRes.data?.nextCursor ?? null),
    });

    if (!openRes.success || !liveRes.success || !upcomingRes.success || !completedRes.success) {
      toast.error("Some tabs couldn't reload — try again");
    }
  };

  // ── Load More for a specific tab ──
  const handleLoadMore = async (tab: TabKey) => {
    const cursor = tabs[tab].cursor;
    if (!cursor || tabs[tab].loading) return;

    setTabs(prev => ({
      ...prev,
      [tab]: { ...prev[tab], loading: true },
    }));

    const result = await getTournamentTab(TAB_STATUS[tab], sort, cursor);

    setTabs(prev => ({
      ...prev,
      [tab]: {
        items:  result.data ? [...prev[tab].items, ...result.data.items] : prev[tab].items,
        cursor: result.data?.nextCursor ?? null,
        loading: false,
      },
    }));

    if (!result.success) {
      toast.error(result.error ?? "Couldn't load more tournaments");
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  function TournamentGrid({
    items,
    empty,
  }: {
    items: TournamentRow[];
    empty: string;
  }) {
    if (items.length === 0) {
      return (
        <div
          className="flex flex-col items-center justify-center rounded-2xl py-20 text-center"
          style={{
            background: "var(--bg-surface)",
            border:     "1px solid var(--border-subtle)",
          }}
        >
          <span className="text-5xl mb-4 opacity-30">🏆</span>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {empty}
          </p>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map(row => (
          <TournamentCard key={row.id} tournament={rowToTournament(row)} />
        ))}
      </div>
    );
  }

  const isSearchMode = search.trim().length > 0;

  return (
    <div className="max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1
            className="font-display font-bold text-4xl"
            style={{ color: "var(--text-primary)" }}
          >
            Tournaments
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Compete, climb the bracket, claim the prize.
          </p>
        </div>
        <Link
          href="/tournaments/create"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white shrink-0 transition-all"
          style={{ background: "var(--accent)" }}
        >
          + Create Tournament
        </Link>
      </div>

      {/* ── Controls row ── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Search */}
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search tournaments by name…"
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

        {/* Sort — only relevant in tab mode */}
        {!isSearchMode && (
          <SortDropdown
            label="Sort"
            options={SORT_OPTIONS}
            value={sort}
            onChange={handleSortChange}
          />
        )}
      </div>

      {/* ── Search results ── */}
      {isSearchMode && (
        <div style={{ opacity: searching ? 0.5 : 1, transition: "opacity 0.15s ease" }}>
          {searching ? (
            <p className="text-sm text-center py-10" style={{ color: "var(--text-muted)" }}>
              Searching…
            </p>
          ) : (
            <>
              {searchResults && searchResults.length > 0 && (
                <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                  {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for &ldquo;{search}&rdquo;
                </p>
              )}
              <TournamentGrid
                items={searchResults ?? []}
                empty={`No tournaments match "${search}"`}
              />
            </>
          )}
        </div>
      )}

      {/* ── Tabbed grid ── */}
      {!isSearchMode && (
        <div style={{ opacity: resetting ? 0.5 : 1, transition: "opacity 0.15s ease" }}>
          <Tabs defaultValue="open">
            <TabsList
              className="mb-6 h-auto p-1 gap-1"
              style={{
                background: "var(--bg-surface)",
                border:     "1px solid var(--border-subtle)",
              }}
            >
              {(Object.keys(TAB_LABELS) as TabKey[]).map(key => (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="rounded-lg px-4 py-2 text-sm font-medium transition-colors data-[active]:!bg-[var(--bg-elevated)] data-[active]:!text-[var(--text-primary)] data-[active]:!border-[var(--border-default)] hover:!text-[var(--text-secondary)]"
                  style={
                    {
                      color:               "var(--text-muted)",
                      "--tw-ring-shadow":  "none",
                    } as React.CSSProperties
                  }
                >
                  {TAB_LABELS[key]} ({tabs[key].items.length}{tabs[key].cursor ? "+" : ""})
                </TabsTrigger>
              ))}
            </TabsList>

            {(Object.keys(TAB_LABELS) as TabKey[]).map(key => (
              <TabsContent key={key} value={key}>
                <TournamentGrid
                  items={tabs[key].items}
                  empty={`No ${TAB_LABELS[key].toLowerCase()} tournaments right now`}
                />
                <LoadMoreButton
                  onClick={() => handleLoadMore(key)}
                  loading={tabs[key].loading}
                  exhausted={tabs[key].cursor === null}
                  hide={tabs[key].items.length === 0}
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}
    </div>
  );
}
