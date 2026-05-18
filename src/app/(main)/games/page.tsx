// ─── /games — game-picker landing ─────────────────────────────────────────────
//
// Lists every supported game as a tile. Adding a game = adding an entry to
// the registry; this page picks it up automatically. Static metadata only.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { listGames } from "@/lib/games/registry";

export const metadata = {
  title: "Games · ClanForge",
};

export default function GamesIndexPage() {
  const games = listGames();

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display font-bold text-3xl" style={{ color: "var(--text-primary)" }}>
          Games
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Pick a game to find tournaments, clans, and players.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {games.map(g => (
          <Link
            key={g.slug}
            href={`/games/${g.slug}`}
            className="relative rounded-2xl p-6 overflow-hidden transition-transform hover:-translate-y-0.5"
            style={{
              background: `linear-gradient(135deg, ${g.accentColor}22 0%, var(--bg-surface) 60%)`,
              border:     "1px solid var(--border-subtle)",
              minHeight:  140,
            }}
          >
            <div
              className="absolute top-0 left-0 right-0"
              style={{ height: 3, background: g.accentColor }}
            />
            <div className="flex items-start justify-between gap-4 mt-1">
              <div className="min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center font-display font-bold text-white shrink-0"
                    style={{ background: g.accentColor }}
                  >
                    {g.shortName[0]}
                  </div>
                  <h2
                    className="font-display font-bold text-xl"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {g.name}
                  </h2>
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {g.tagline}
                </p>
              </div>
              <ArrowRight size={18} style={{ color: "var(--text-muted)" }} className="shrink-0 mt-1" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
