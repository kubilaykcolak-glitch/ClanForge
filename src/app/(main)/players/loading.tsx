export default function PlayersLoading() {
  return (
    <div className="max-w-6xl mx-auto">
      {/* Header skeleton */}
      <div className="mb-8 animate-pulse">
        <div
          className="h-10 rounded-lg w-56 mb-2"
          style={{ background: "var(--bg-surface)" }}
        />
        <div
          className="h-4 rounded w-40"
          style={{ background: "var(--bg-surface)" }}
        />
      </div>

      {/* Filter bar skeleton */}
      <div className="flex gap-3 mb-8 animate-pulse">
        <div
          className="h-10 rounded-lg flex-1"
          style={{ maxWidth: 360, background: "var(--bg-surface)" }}
        />
        <div
          className="h-10 w-36 rounded-lg"
          style={{ background: "var(--bg-surface)" }}
        />
      </div>

      {/* Grid skeleton */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl overflow-hidden animate-pulse"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
            }}
          >
            <div
              className="h-1.5 w-full"
              style={{ background: "var(--bg-overlay)" }}
            />
            <div className="p-5">
              <div className="flex items-start gap-4 mb-4">
                <div
                  className="w-14 h-14 rounded-xl shrink-0"
                  style={{ background: "var(--bg-elevated)" }}
                />
                <div className="flex-1 space-y-2">
                  <div
                    className="h-4 rounded w-3/4"
                    style={{ background: "var(--bg-elevated)" }}
                  />
                  <div
                    className="h-3 rounded w-1/2"
                    style={{ background: "var(--bg-elevated)" }}
                  />
                  <div
                    className="h-5 rounded-full w-16"
                    style={{ background: "var(--bg-elevated)" }}
                  />
                </div>
              </div>
              <div className="flex gap-2 mb-4">
                {[0, 1, 2].map(j => (
                  <div
                    key={j}
                    className="flex-1 h-12 rounded-lg"
                    style={{ background: "var(--bg-elevated)" }}
                  />
                ))}
              </div>
              <div
                className="h-1 rounded-full mb-4"
                style={{ background: "var(--bg-elevated)" }}
              />
              <div
                className="h-8 rounded-lg"
                style={{ background: "var(--bg-elevated)" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
