// Skeleton for the tournament detail page (/tournaments/[id]).
// Mirrors the two-column layout: main content (bracket + table) + registration aside (280 px).

// ── Bracket match box ─────────────────────────────────────────────────────────

function MatchBox() {
  return (
    <div
      className="rounded-lg flex flex-col gap-2 p-3 shrink-0"
      style={{
        width:      160,
        background: "var(--bg-elevated)",
        border:     "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex items-center gap-2">
        <div className="rounded-full shrink-0" style={{ width: 20, height: 20, background: "var(--bg-overlay)" }} />
        <div className="rounded flex-1" style={{ height: 11, background: "var(--bg-overlay)" }} />
      </div>
      <div className="rounded" style={{ width: "30%", height: 1, background: "var(--border-subtle)" }} />
      <div className="flex items-center gap-2">
        <div className="rounded-full shrink-0" style={{ width: 20, height: 20, background: "var(--bg-overlay)" }} />
        <div className="rounded flex-1" style={{ height: 11, background: "var(--bg-overlay)" }} />
      </div>
    </div>
  );
}

export default function TournamentLoading() {
  return (
    <div className="max-w-5xl mx-auto animate-pulse">

      {/* ── Header text lines ── */}
      <div className="mb-8 flex flex-col gap-3">
        <div className="rounded-lg" style={{ width: 320, height: 36, background: "var(--bg-elevated)" }} />
        <div className="flex gap-2">
          <div className="rounded-full" style={{ width: 90, height: 22, background: "var(--bg-elevated)" }} />
          <div className="rounded-full" style={{ width: 120, height: 22, background: "var(--bg-elevated)" }} />
          <div className="rounded-full" style={{ width: 80,  height: 22, background: "var(--bg-elevated)" }} />
        </div>
        <div className="rounded" style={{ width: 160, height: 14, background: "var(--bg-elevated)" }} />
        <div className="rounded" style={{ width: 120, height: 14, background: "var(--bg-elevated)" }} />
      </div>

      {/* ── Two-column body ── */}
      <div className="flex gap-6">

        {/* ── Main: bracket + participants ── */}
        <div className="flex-1 min-w-0">

          {/* Bracket section heading */}
          <div className="rounded-lg mb-4" style={{ width: 90, height: 22, background: "var(--bg-elevated)" }} />

          {/* Bracket skeleton — 5 match boxes in a bracket formation */}
          <div
            className="rounded-xl p-4 mb-8 overflow-x-auto"
            style={{
              background: "var(--bg-surface)",
              border:     "1px solid var(--border-subtle)",
            }}
          >
            {/* Round 1: 4 matches in a column, Round 2: 2 matches, Final: 1 match */}
            <div className="flex gap-10 items-center" style={{ minWidth: 560 }}>

              {/* QF column */}
              <div className="flex flex-col gap-4">
                <MatchBox />
                <MatchBox />
                <MatchBox />
                <MatchBox />
              </div>

              {/* SF column — vertically centred between QF pairs */}
              <div className="flex flex-col gap-16 mt-10 mb-10">
                <MatchBox />
                <MatchBox />
              </div>

              {/* Final */}
              <div className="flex flex-col mt-20">
                <MatchBox />
              </div>
            </div>
          </div>

          {/* Participants section heading */}
          <div className="rounded-lg mb-4" style={{ width: 160, height: 22, background: "var(--bg-elevated)" }} />

          {/* Participants table */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: "var(--bg-surface)",
              border:     "1px solid var(--border-subtle)",
            }}
          >
            {/* Header row */}
            <div
              className="flex gap-4 px-4 py-3"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <div className="rounded" style={{ width: 20,  height: 12, background: "var(--bg-elevated)" }} />
              <div className="rounded" style={{ width: 80,  height: 12, background: "var(--bg-elevated)" }} />
              <div className="rounded" style={{ width: 60,  height: 12, background: "var(--bg-elevated)" }} />
            </div>
            {/* Data rows */}
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-4 py-3"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <div className="rounded" style={{ width: 20, height: 12, background: "var(--bg-elevated)" }} />
                <div className="flex items-center gap-2 flex-1">
                  <div className="rounded-full shrink-0" style={{ width: 28, height: 28, background: "var(--bg-elevated)" }} />
                  <div className="rounded" style={{ width: 110, height: 12, background: "var(--bg-elevated)" }} />
                </div>
                <div className="rounded-full" style={{ width: 70, height: 20, background: "var(--bg-elevated)" }} />
              </div>
            ))}
          </div>
        </div>

        {/* ── Registration aside (280 px) ── */}
        <aside
          className="hidden md:flex flex-col gap-4 shrink-0"
          style={{ width: 280 }}
        >
          <div
            className="rounded-2xl p-5 flex flex-col gap-4"
            style={{
              background: "var(--bg-surface)",
              border:     "1px solid var(--border-subtle)",
            }}
          >
            {/* Status badge */}
            <div className="rounded-full" style={{ width: 110, height: 24, background: "var(--bg-elevated)" }} />
            {/* Countdown block */}
            <div className="rounded-xl" style={{ height: 56, background: "var(--bg-elevated)" }} />
            {/* Stat rows */}
            {[100, 80, 90].map((w, i) => (
              <div key={i} className="flex justify-between">
                <div className="rounded" style={{ width: 80, height: 13, background: "var(--bg-elevated)" }} />
                <div className="rounded" style={{ width: w * 0.6, height: 13, background: "var(--bg-elevated)" }} />
              </div>
            ))}
            {/* CTA button */}
            <div className="rounded-xl" style={{ height: 44, background: "var(--bg-elevated)" }} />
          </div>
        </aside>
      </div>
    </div>
  );
}
