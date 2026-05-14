import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}
    >
      {/* ── Minimal header ── */}
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <Link
          href="/"
          className="flex items-center gap-2.5"
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ background: "var(--accent)" }}
          >
            CF
          </div>
          <span
            className="font-display font-semibold tracking-wide"
            style={{ fontSize: 18, color: "var(--text-primary)" }}
          >
            ClanForge
          </span>
        </Link>

        <Link
          href="/register"
          className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition-all"
          style={{ background: "var(--accent)" }}
        >
          Create account →
        </Link>
      </header>

      {/* ── Content ── */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        {children}
      </main>
    </div>
  );
}
