// Streaming skeleton — shown instantly on tab navigation while the section
// fetches data. The banner + tab nav stay rendered from the layout above,
// so users only see the content area refresh.

export default function GameHubLoading() {
  return (
    <div className="max-w-6xl mx-auto">
      {/* Tournament-card-row skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="rounded-2xl"
            style={{
              background: "var(--bg-surface)",
              border:     "1px solid var(--border-subtle)",
              height:     200,
              opacity:    0.5,
            }}
          />
        ))}
      </div>
      <div className="space-y-3">
        <div
          className="rounded-xl"
          style={{
            background: "var(--bg-surface)",
            border:     "1px solid var(--border-subtle)",
            height:     96,
            opacity:    0.5,
          }}
        />
      </div>
    </div>
  );
}
