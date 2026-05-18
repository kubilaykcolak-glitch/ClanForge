// Banner across the top of every game hub. Uses a soft gradient over a
// solid colour as the default so the page renders cleanly even before the
// real banner image is uploaded to /public/games/<slug>/banner.webp.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { GameDefinition } from "@/lib/games/types";

interface Props {
  game: GameDefinition;
}

export function GameHubBanner({ game }: Props) {
  return (
    <div className="mb-6">
      <Link
        href="/games"
        className="inline-flex items-center gap-1.5 text-xs mb-3 hover:underline underline-offset-2"
        style={{ color: "var(--text-muted)" }}
      >
        <ArrowLeft size={12} />
        All games
      </Link>

      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${game.accentColor}33 0%, var(--bg-surface) 60%)`,
          border:     "1px solid var(--border-subtle)",
          minHeight:  160,
        }}
      >
        {/* Subtle decorative accent stripe */}
        <div
          className="absolute top-0 left-0 right-0"
          style={{ height: 3, background: game.accentColor }}
        />

        <div className="relative p-6 sm:p-8">
          <div className="flex items-end gap-4 flex-wrap">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center font-display font-bold text-white shrink-0"
              style={{ background: game.accentColor, fontSize: 22 }}
            >
              {game.shortName[0]}
            </div>
            <div className="min-w-0">
              <h1
                className="font-display font-bold text-2xl sm:text-3xl"
                style={{ color: "var(--text-primary)" }}
              >
                {game.name}
              </h1>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                {game.tagline}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
