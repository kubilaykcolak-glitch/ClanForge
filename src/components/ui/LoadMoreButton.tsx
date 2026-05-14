"use client";

// ─── LoadMoreButton ───────────────────────────────────────────────────────────
//
// Centered "Load more" button + exhausted-state label used by the various
// paginated listings (clans, tournaments, players, clan posts). Hidden when
// `exhausted` and `loading` are both false (e.g. initial empty state).

import { Loader2 } from "lucide-react";

interface Props {
  onClick:        () => void;
  loading:        boolean;
  /** True when there's no more data to fetch. Shows the exhausted label. */
  exhausted:      boolean;
  /** Override for the exhausted-state label. Defaults to "That's everything". */
  exhaustedLabel?: string;
  /** Hide everything when there's nothing to do (e.g. the page is empty). */
  hide?:          boolean;
}

export function LoadMoreButton({
  onClick,
  loading,
  exhausted,
  exhaustedLabel,
  hide,
}: Props) {
  if (hide) return null;

  if (exhausted) {
    return (
      <p
        className="text-center text-xs pt-8 pb-4"
        style={{ color: "var(--text-muted)" }}
      >
        {exhaustedLabel ?? "That's everything"}
      </p>
    );
  }

  return (
    <div className="flex justify-center pt-8 pb-4">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="inline-flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: "var(--bg-elevated)",
          border:     "1px solid var(--border-default)",
          color:      "var(--text-secondary)",
        }}
      >
        {loading && <Loader2 size={14} className="animate-spin" />}
        {loading ? "Loading…" : "Load more"}
      </button>
    </div>
  );
}
