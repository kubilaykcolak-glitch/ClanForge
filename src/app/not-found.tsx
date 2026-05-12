import Link from "next/link";

// ── CSS gamepad illustration ──────────────────────────────────────────────────

function BrokenGamepad() {
  const btnPositions = [
    { top: 20, left: 118 }, // top
    { top: 34, left: 104 }, // left
    { top: 34, left: 132 }, // right
    { top: 48, left: 118 }, // bottom
  ];

  return (
    <div
      className="relative mx-auto select-none"
      style={{ width: 200, height: 130 }}
      aria-hidden="true"
    >
      {/* ── Body ── */}
      <div
        className="absolute"
        style={{
          top: 0, left: 20, right: 20,
          height: 80,
          background:   "var(--bg-elevated)",
          border:       "2px solid var(--border-default)",
          borderRadius: 18,
        }}
      />

      {/* ── Left grip ── */}
      <div
        className="absolute"
        style={{
          bottom: 0, left: 12,
          width: 44, height: 48,
          background:         "var(--bg-elevated)",
          border:             "2px solid var(--border-default)",
          borderTopColor:     "transparent",
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius:  16,
          borderBottomRightRadius: 10,
        }}
      />

      {/* ── Right grip ── */}
      <div
        className="absolute"
        style={{
          bottom: 0, right: 12,
          width: 44, height: 48,
          background:         "var(--bg-elevated)",
          border:             "2px solid var(--border-default)",
          borderTopColor:     "transparent",
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius:  10,
          borderBottomRightRadius: 16,
        }}
      />

      {/* ── D-pad horizontal bar ── */}
      <div
        className="absolute"
        style={{
          top: 28, left: 38,
          width: 36, height: 12,
          background:   "var(--border-strong)",
          borderRadius: 3,
        }}
      />
      {/* D-pad vertical bar */}
      <div
        className="absolute"
        style={{
          top: 16, left: 50,
          width: 12, height: 36,
          background:   "var(--border-strong)",
          borderRadius: 3,
        }}
      />

      {/* ── Face buttons (diamond layout) ── */}
      {btnPositions.map((pos, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: 12, height: 12,
            background:   "var(--border-strong)",
            top:  pos.top,
            left: pos.left,
          }}
        />
      ))}

      {/* ── Centre select / start pills ── */}
      <div
        className="absolute rounded-full"
        style={{ width: 10, height: 7, background: "var(--border-default)", top: 33, left: 78 }}
      />
      <div
        className="absolute rounded-full"
        style={{ width: 10, height: 7, background: "var(--border-default)", top: 33, left: 112 }}
      />

      {/* ── Crack (glowing diagonal line through the body) ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          width:      2,
          height:     110,
          top:        -15,
          left:       "50%",
          transform:  "translateX(-50%) rotate(-22deg)",
          background: "linear-gradient(to bottom, transparent 0%, rgba(99,102,241,0.6) 40%, rgba(99,102,241,0.6) 60%, transparent 100%)",
          borderRadius: 1,
        }}
      />
      {/* Secondary crack shard */}
      <div
        className="absolute pointer-events-none"
        style={{
          width:      1,
          height:     40,
          top:        18,
          left:       "calc(50% + 8px)",
          transform:  "rotate(10deg)",
          background: "linear-gradient(to bottom, rgba(99,102,241,0.4), transparent)",
        }}
      />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NotFound() {
  return (
    <>
      {/* Glitch keyframes injected as a <style> tag — valid in server components */}
      <style>{`
        .nf-glitch { position: relative; display: inline-block; }

        .nf-glitch::before,
        .nf-glitch::after {
          content: "404";
          position: absolute;
          inset: 0;
          font-family: inherit;
          font-size: inherit;
          font-weight: inherit;
          line-height: inherit;
          letter-spacing: inherit;
        }

        .nf-glitch::before {
          color: #ef4444;
          animation: nf-glitch-a 2.8s infinite linear;
        }
        .nf-glitch::after {
          color: #06b6d4;
          animation: nf-glitch-b 2.8s infinite linear reverse;
        }

        @keyframes nf-glitch-a {
          0%,  95%, 100% { clip-path: inset(0% 0 99% 0);  transform: translate(0); }
          5%             { clip-path: inset(30% 0 60% 0);  transform: translate(-4px, 0); }
          15%            { clip-path: inset(65% 0 20% 0);  transform: translate(3px, 0); }
          25%            { clip-path: inset(10% 0 80% 0);  transform: translate(-2px, 0); }
          35%            { clip-path: inset(82% 0 5% 0);   transform: translate(4px, 0); }
          45%            { clip-path: inset(45% 0 40% 0);  transform: translate(-3px, 0); }
          55%            { clip-path: inset(0% 0 99% 0);   transform: translate(0); }
        }

        @keyframes nf-glitch-b {
          0%,  95%, 100% { clip-path: inset(50% 0 48% 0);  transform: translate(0); }
          8%             { clip-path: inset(75% 0 10% 0);   transform: translate(3px, 0); }
          20%            { clip-path: inset(15% 0 72% 0);   transform: translate(-3px, 0); }
          30%            { clip-path: inset(55% 0 30% 0);   transform: translate(2px, 0); }
          42%            { clip-path: inset(88% 0 2% 0);    transform: translate(-4px, 0); }
          52%            { clip-path: inset(50% 0 48% 0);   transform: translate(0); }
        }
      `}</style>

      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
        style={{ background: "var(--bg-base)" }}
      >
        {/* Broken gamepad */}
        <div className="mb-10 opacity-60">
          <BrokenGamepad />
        </div>

        {/* 404 with glitch */}
        <h1
          className="nf-glitch font-display font-bold leading-none mb-5"
          style={{
            fontSize:      120,
            color:         "var(--text-primary)",
            letterSpacing: "-0.03em",
          }}
        >
          404
        </h1>

        {/* Subtext */}
        <p
          className="text-lg mb-2"
          style={{ color: "var(--text-secondary)" }}
        >
          This page doesn&apos;t exist.
        </p>
        <p
          className="text-sm mb-10"
          style={{ color: "var(--text-muted)" }}
        >
          It may have been moved, deleted, or never existed.
        </p>

        {/* CTA */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-88"
          style={{ background: "var(--accent)" }}
        >
          ← Back to Home
        </Link>
      </div>
    </>
  );
}
