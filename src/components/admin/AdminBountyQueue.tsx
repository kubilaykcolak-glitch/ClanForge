"use client";

// ─── AdminBountyQueue ────────────────────────────────────────────────────────
//
// Tabbed view of every bounty in the system. Lives on /admin/bounties as
// the primary mod surface. Reads its data once from the server (passed in
// as `bounties`), then handles all interactivity client-side:
//
//   - Tab selection (Pending Review / Live / Resolved / Closed) via the
//     `?tab=` URL param so deep links + browser-back behave naturally.
//   - Search box across title / target / issuer / hunter, debounced via
//     useDeferredValue so typing doesn't re-render every keystroke.
//   - Count badges on each tab so mods see queue depth at a glance.
//
// Design intent (locked in brainstorm §2 Q1):
//   "Pending Review" is the default tab — the mod's most urgent work is
//   always one click in. Each tab is a discrete job-of-work; the count
//   badge tells the mod where attention is needed before clicking.

import { useDeferredValue, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import type { Bounty } from "@/types/bounty";
import { AdminBountyRow } from "./AdminBountyRow";

// ── Tab definitions ──────────────────────────────────────────────────────────
// Centralised so the tab nav, default selection, and bucket logic all read
// from one source. `match` is a per-bounty predicate; the queue uses it for
// counting and filtering.

type TabKey = "review" | "live" | "resolved" | "closed";

interface TabDef {
  key:    TabKey;
  label:  string;
  /** Predicate over a bounty — true means "belongs to this tab". */
  match:  (b: Bounty) => boolean;
  /** Empty-state copy when the tab has zero matches. */
  empty:  string;
}

const TABS: TabDef[] = [
  {
    key:   "review",
    label: "Pending Review",
    match: b => b.status === "claimed",
    empty: "Nothing waiting for review — go touch grass.",
  },
  {
    key:   "live",
    label: "Live",
    match: b => b.status === "open",
    empty: "No live bounties right now. New intakes from Discord land here once you publish them.",
  },
  {
    key:   "resolved",
    label: "Resolved",
    match: b => b.status === "resolved",
    empty: "No resolved bounties yet.",
  },
  {
    key:   "closed",
    label: "Closed",
    match: b => b.status === "cancelled" || b.status === "expired",
    empty: "Nothing closed yet — cancellations and expiries land here.",
  },
];

const DEFAULT_TAB: TabKey = "review";

function isTabKey(value: string | null): value is TabKey {
  return value === "review" || value === "live" || value === "resolved" || value === "closed";
}

// ── Component ────────────────────────────────────────────────────────────────

export function AdminBountyQueue({ bounties }: { bounties: Bounty[] }) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  // Tab state reads from `?tab=` so the back button + deep links work.
  // Writes go through router.replace so we don't pile history entries on
  // every tab click.
  const urlTab    = searchParams.get("tab");
  const activeTab = isTabKey(urlTab) ? urlTab : DEFAULT_TAB;

  const setTab = (tab: TabKey) => {
    const next = new URLSearchParams(searchParams.toString());
    if (tab === DEFAULT_TAB) next.delete("tab"); else next.set("tab", tab);
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  };

  // Search uses useDeferredValue so the input re-renders immediately but the
  // (potentially expensive) filter pass defers a frame. At 200 bounties this
  // is overkill but free; at 2000 bounties it'd matter.
  const [search, setSearch] = useState("");
  const deferredSearch      = useDeferredValue(search);

  // Per-tab counts come from the unfiltered list so the badges show what's
  // available across the whole queue, not just inside the current search.
  const counts = useMemo<Record<TabKey, number>>(() => {
    const result = { review: 0, live: 0, resolved: 0, closed: 0 };
    for (const b of bounties) {
      for (const t of TABS) {
        if (t.match(b)) result[t.key]++;
      }
    }
    return result;
  }, [bounties]);

  // Filtered list for the active tab + search needle. Search matches title,
  // target description, issuer name, claimer name — anything a mod might
  // remember about a bounty they're trying to find.
  const filtered = useMemo(() => {
    const tab    = TABS.find(t => t.key === activeTab) ?? TABS[0];
    const needle = deferredSearch.trim().toLowerCase();
    return bounties.filter(b => {
      if (!tab.match(b)) return false;
      if (!needle) return true;
      const hay = [
        b.title,
        b.targetDescription,
        b.issuedByName,
        b.claimedByName ?? "",
      ].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [bounties, activeTab, deferredSearch]);

  const activeDef = TABS.find(t => t.key === activeTab) ?? TABS[0];

  return (
    <div className="space-y-4">
      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1 overflow-x-auto rounded-lg p-1"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
      >
        {TABS.map(t => {
          const active = t.key === activeTab;
          const count  = counts[t.key];
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap"
              style={
                active
                  ? { background: "var(--bg-surface)", color: "var(--text-primary)", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }
                  : { color: "var(--text-secondary)" }
              }
            >
              {t.label}
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums"
                style={{
                  background: active
                    ? (t.key === "review" && count > 0 ? "var(--warning)" : "var(--accent)")
                    : "var(--bg-overlay)",
                  color:      active ? "white" : "var(--text-muted)",
                  minWidth:   18,
                  textAlign:  "center",
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
      >
        <Search size={14} style={{ color: "var(--text-muted)" }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by title, target, issuer, or hunter…"
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: "var(--text-primary)" }}
          // Avoid the password manager attempting to autofill.
          autoComplete="off"
          spellCheck={false}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ color: "var(--text-muted)" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* ── List ────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div
          className="rounded-xl p-10 text-center"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {deferredSearch.trim() ? `No matches for "${deferredSearch.trim()}" in ${activeDef.label}.` : activeDef.empty}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(b => <AdminBountyRow key={b.id} bounty={b} />)}
        </div>
      )}
    </div>
  );
}
