import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/about",   label: "About" },
  { href: "https://discord.gg/NB9VftUUSJ", label: "Discord", external: true },
  { href: "/terms",   label: "Terms" },
  { href: "/privacy", label: "Privacy" },
];

export function Footer() {
  return (
    <footer
      className="w-full px-6 py-6 relative"
      style={{
        background: "var(--bg-surface)",
        borderTop:  "1px solid var(--border-subtle)",
        zIndex:     1, // sit above any fixed profile-bg layers (which paint at z-index -1)
      }}
    >
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">

        {/* ── Left: Logo + tagline ── */}
        <div className="flex flex-col items-center sm:items-start gap-2">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
              style={{ background: "var(--accent)" }}
            >
              CF
            </div>
            <span
              className="font-display font-semibold text-base tracking-wide"
              style={{ color: "var(--text-primary)" }}
            >
              ClanForge
            </span>
          </div>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Built for gamers
          </p>
        </div>

        {/* ── Centre: nav links ── */}
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          {FOOTER_LINKS.map(({ href, label, external }) => (
            <Link
              key={href}
              href={href}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer" : undefined}
              className="footer-link text-xs transition-colors duration-150"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* ── Right: copyright ── */}
        <p className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
          © 2025 ClanForge
        </p>
      </div>
    </footer>
  );
}
