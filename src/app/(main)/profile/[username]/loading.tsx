// Skeleton that mirrors the real profile/[username] page layout.
// Each block uses bg-elevated + animate-pulse to simulate content loading.

export default function ProfileLoading() {
  return (
    <div className="max-w-4xl mx-auto animate-pulse">

      {/* ── Banner (160 px tall) ── */}
      <div
        className="w-full rounded-2xl"
        style={{ height: 160, background: "var(--bg-elevated)" }}
      />

      {/* ── Avatar + identity ── */}
      <div className="px-6 mb-6 flex items-end gap-4" style={{ marginTop: -40 }}>
        {/* 88 px avatar circle overlapping banner */}
        <div
          className="rounded-full shrink-0"
          style={{
            width:       88,
            height:      88,
            background:  "var(--bg-overlay)",
            border:      "4px solid var(--bg-base)",
          }}
        />
        <div className="flex flex-col gap-2 pb-1">
          {/* Display name — 200 px */}
          <div className="rounded-lg" style={{ width: 200, height: 26, background: "var(--bg-elevated)" }} />
          {/* Username — 120 px */}
          <div className="rounded-lg" style={{ width: 120, height: 15, background: "var(--bg-elevated)" }} />
        </div>
      </div>

      {/* ── Bio lines ── */}
      <div className="px-6 mb-8 flex flex-col gap-2.5">
        <div className="rounded-lg" style={{ width: "78%", height: 13, background: "var(--bg-elevated)" }} />
        <div className="rounded-lg" style={{ width: "52%", height: 13, background: "var(--bg-elevated)" }} />
      </div>

      {/* ── 4 stat cards (equal widths, 80 px tall) ── */}
      <div className="px-6 grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl flex flex-col justify-between p-4"
            style={{ height: 80, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="rounded" style={{ width: "55%", height: 11, background: "var(--bg-overlay)" }} />
            <div className="rounded" style={{ width: "40%", height: 22, background: "var(--bg-overlay)" }} />
          </div>
        ))}
      </div>

      {/* ── Section heading (150 px) ── */}
      <div className="px-6 mb-5">
        <div className="rounded-lg" style={{ width: 150, height: 22, background: "var(--bg-elevated)" }} />
      </div>

      {/* ── 2×3 game record card grid ── */}
      <div className="px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-4 flex flex-col gap-3"
            style={{
              height:     118,
              background: "var(--bg-elevated)",
              border:     "1px solid var(--border-subtle)",
            }}
          >
            {/* Card header: game name + platform pill */}
            <div className="flex items-center justify-between">
              <div className="rounded" style={{ width: 110, height: 15, background: "var(--bg-overlay)" }} />
              <div className="rounded-full" style={{ width: 54, height: 20, background: "var(--bg-overlay)" }} />
            </div>
            {/* Stat row */}
            <div className="flex gap-3">
              <div className="rounded" style={{ width: 44, height: 12, background: "var(--bg-overlay)" }} />
              <div className="rounded" style={{ width: 44, height: 12, background: "var(--bg-overlay)" }} />
              <div className="rounded" style={{ width: 44, height: 12, background: "var(--bg-overlay)" }} />
            </div>
            {/* Notes line */}
            <div className="rounded" style={{ width: "70%", height: 11, background: "var(--bg-overlay)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
