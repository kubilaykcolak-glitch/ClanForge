// Root-level loading state — shown while any page in the root segment loads.
// Centred CF logo + spinning accent ring.

export default function Loading() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6"
      style={{ background: "var(--bg-base)" }}
    >
      {/* ── Brand mark ── */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-9 h-9 rounded-md flex items-center justify-center font-display font-bold text-white text-base shrink-0"
          style={{ background: "var(--accent)" }}
        >
          CF
        </div>
        <span
          className="font-display font-bold text-2xl tracking-wide"
          style={{ color: "var(--text-primary)" }}
        >
          ClanForge
        </span>
      </div>

      {/* ── Spinning ring ── */}
      <div
        className="w-10 h-10 rounded-full animate-spin"
        style={{
          border:         "3px solid var(--border-default)",
          borderTopColor: "var(--accent)",
        }}
      />

      {/* ── Label ── */}
      <p className="text-sm tracking-wide" style={{ color: "var(--text-muted)" }}>
        Loading…
      </p>
    </div>
  );
}
