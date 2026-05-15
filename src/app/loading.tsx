// ─── Root loading state ─────────────────────────────────────────────────────
// Shown while any page in the root segment loads (auth flows + initial routes
// that don't have their own loading.tsx).
//
// Arena treatment: aurora-tinted background, gradient brand mark matching the
// login/register hero, conic-gradient ring spinner using the indigo→magenta
// palette. Pure CSS — no JS, no JS handlers, no client component needed.

export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-7 px-6 arena-bg-aurora">

      {/* ── Brand mark ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-lg flex items-center justify-center font-display font-bold text-white text-lg shrink-0"
          style={{
            background: "linear-gradient(135deg, var(--accent) 0%, var(--magenta) 100%)",
            boxShadow:  "0 0 24px var(--accent-glow), 0 0 48px var(--magenta-glow)",
          }}
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

      {/* ── Gradient ring spinner ──────────────────────────────────────────── */}
      {/*
        Conic-gradient ring with a centred mask "cuts out" the inner disc so we
        get a clean ring shape. The whole element rotates via animate-spin.
        Pure CSS, no extra DOM.
      */}
      <div
        className="w-12 h-12 rounded-full animate-spin"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0%, var(--accent) 35%, var(--magenta) 70%, transparent 100%)",
          // Padding-mask trick to leave a transparent core, producing a ring.
          padding: 3,
          WebkitMask:
            "radial-gradient(circle, transparent calc(50% - 3px), #000 calc(50% - 3px))",
          mask:
            "radial-gradient(circle, transparent calc(50% - 3px), #000 calc(50% - 3px))",
        }}
        aria-hidden
      />

      {/* ── Label ──────────────────────────────────────────────────────────── */}
      <p
        className="font-mono-tech text-xs cf-pulse-dot"
        style={{ color: "var(--text-muted)" }}
      >
        Loading
      </p>
    </div>
  );
}
