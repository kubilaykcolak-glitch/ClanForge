// ─── /games — game-picker landing ─────────────────────────────────────────────
//
// Lists every supported game as a tile. Adding a game = adding an entry to
// the registry; this page picks it up automatically. Static metadata only.

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Crosshair, Swords, type LucideIcon } from "lucide-react";
import { listGames } from "@/lib/games/registry";
import type { GameSlug } from "@/lib/games/types";

// Fallback iconography when a game ships without a wordmark asset. Mirrors
// the banner's GAME_ICON map; keeping these in sync is enforced by the TS
// exhaustive Record<GameSlug, …>.
const GAME_ICON: Record<GameSlug, LucideIcon> = {
  "league-of-legends": Swords,
  "arc-raiders":        Crosshair,
};

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
                {/* Wordmark — real game art preferred, gradient icon tile
                    + h2 fallback if the asset isn't there. The accessible
                    name is always provided via alt / a visually hidden h2
                    so screen readers and SEO get the literal game name. */}
                <h2 className="sr-only">{g.name}</h2>
                {g.logoSrc ? (
                  <div className="mb-3" style={{ height: 36, maxWidth: 240 }}>
                    <Image
                      src={g.logoSrc}
                      alt={`${g.name} logo`}
                      width={480}
                      height={96}
                      unoptimized
                      style={{
                        height:         "100%",
                        width:          "auto",
                        maxWidth:       "100%",
                        objectFit:      "contain",
                        objectPosition: "left center",
                        filter:         `drop-shadow(0 2px 8px ${g.theme.accent}44)`,
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 mb-2" aria-hidden>
                    {(() => {
                      const Icon = GAME_ICON[g.slug];
                      const t = g.theme;
                      return (
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0"
                          style={{
                            background: `linear-gradient(135deg, ${t.accent} 0%, ${t.secondary} 100%)`,
                            boxShadow:  `0 4px 12px -4px ${t.accent}80, inset 0 0 0 1px rgba(255,255,255,0.18)`,
                          }}
                        >
                          <Icon size={20} strokeWidth={1.75} aria-hidden />
                        </div>
                      );
                    })()}
                    <span
                      className="font-display font-bold text-xl"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {g.name}
                    </span>
                  </div>
                )}
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
