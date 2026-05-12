// Skeleton for the clan detail page (/clans/[slug]).
// Mirrors the two-column layout: main feed (flex-1) + members aside (240 px).

function PostSkeleton() {
  return (
    <div
      className="rounded-xl p-4 flex gap-3"
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-subtle)",
      }}
    >
      {/* Author avatar */}
      <div
        className="rounded-full shrink-0"
        style={{ width: 36, height: 36, background: "var(--bg-overlay)" }}
      />
      {/* Text lines */}
      <div className="flex-1 flex flex-col gap-2 pt-1">
        <div className="rounded" style={{ width: 120, height: 13, background: "var(--bg-overlay)" }} />
        <div className="rounded" style={{ width: "90%", height: 12, background: "var(--bg-overlay)" }} />
        <div className="rounded" style={{ width: "65%", height: 12, background: "var(--bg-overlay)" }} />
        <div className="rounded" style={{ width: "40%", height: 12, background: "var(--bg-overlay)" }} />
      </div>
    </div>
  );
}

export default function ClanLoading() {
  return (
    <div className="max-w-5xl mx-auto animate-pulse">

      {/* ── Hero banner (200 px) ── */}
      <div
        className="w-full rounded-2xl mb-0"
        style={{ height: 200, background: "var(--bg-elevated)" }}
      />

      {/* ── Clan identity panel ── */}
      <div
        className="rounded-b-2xl px-6 pb-6 mb-6"
        style={{
          background: "var(--bg-surface)",
          border:     "1px solid var(--border-subtle)",
          borderTop:  "none",
        }}
      >
        {/* 72 px avatar circle overlapping banner */}
        <div
          className="rounded-xl"
          style={{
            width:       72,
            height:      72,
            background:  "var(--bg-overlay)",
            border:      "3px solid var(--bg-surface)",
            marginTop:   -32,
            marginBottom: 14,
          }}
        />

        {/* Clan name */}
        <div className="rounded-lg mb-3" style={{ width: 220, height: 28, background: "var(--bg-elevated)" }} />

        {/* Badge row */}
        <div className="flex gap-2 mb-4">
          <div className="rounded-full" style={{ width: 88, height: 22, background: "var(--bg-elevated)" }} />
          <div className="rounded-full" style={{ width: 76, height: 22, background: "var(--bg-elevated)" }} />
        </div>

        {/* Description lines */}
        <div className="flex flex-col gap-2">
          <div className="rounded" style={{ width: "85%", height: 13, background: "var(--bg-elevated)" }} />
          <div className="rounded" style={{ width: "60%", height: 13, background: "var(--bg-elevated)" }} />
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="flex gap-6">

        {/* ── Main: clan feed ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* Compose box placeholder */}
          <div
            className="rounded-xl"
            style={{ height: 80, background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
          />
          {/* Post skeletons */}
          <PostSkeleton />
          <PostSkeleton />
          <PostSkeleton />
        </div>

        {/* ── Aside: members panel (240 px) ── */}
        <aside className="hidden md:flex flex-col gap-3 shrink-0" style={{ width: 240 }}>
          {/* Members heading */}
          <div className="rounded-lg" style={{ width: 100, height: 18, background: "var(--bg-elevated)" }} />
          {/* Member rows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className="rounded-full shrink-0"
                style={{ width: 32, height: 32, background: "var(--bg-elevated)" }}
              />
              <div className="flex flex-col gap-1.5 flex-1">
                <div className="rounded" style={{ width: "70%", height: 12, background: "var(--bg-elevated)" }} />
                <div className="rounded-full" style={{ width: 48, height: 16, background: "var(--bg-elevated)" }} />
              </div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
