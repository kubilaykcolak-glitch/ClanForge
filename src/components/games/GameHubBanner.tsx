// ─── Game-hub banner ──────────────────────────────────────────────────────────
//
// Sits at the top of every game hub page. The banner is the user's first cue
// that they've landed in a particular game's world, so each game declares its
// own theme (`GameTheme` in lib/games/meta.ts) — a base/mid background pair,
// primary + secondary accent, subtitle hue, and a decorative motif. The motif
// is rendered here as an inline SVG overlay so we don't need an extra image
// asset per game.
//
// Why no background image?
//   - Banner art is licensed per-game and we don't yet host any. The themed
//     gradient + motif gives each hub a distinct look without that asset cost.
//   - When real art ships, drop it in `/public/games/<slug>/banner.webp` and
//     swap the gradient layer for a Next/Image background.

import Image from "next/image";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Crosshair, Swords, type LucideIcon } from "lucide-react";
import type { GameDefinition, GameSlug } from "@/lib/games/types";
import type { GameTheme } from "@/lib/games/meta";
import { LeagueBannerStatus } from "./LeagueBannerStatus";

// Fallback iconography for games that don't have a wordmark asset yet. The
// banner prefers `game.logoSrc` (a real game-art wordmark stored under
// /public) and only renders these Lucide marks if the image is missing or
// the slug isn't pre-mapped. Picked to evoke each game's identity:
//   - LoL → crossed swords (the rift, melee combat)
//   - Arc Raiders → crosshair (raider HUD reticle)
const GAME_ICON: Record<GameSlug, LucideIcon> = {
  "league-of-legends": Swords,
  "arc-raiders":        Crosshair,
};

interface Props {
  game: GameDefinition;
}

export function GameHubBanner({ game }: Props) {
  const t = game.theme;

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
          background: `
            radial-gradient(120% 80% at 0% 0%, ${t.accent}26 0%, transparent 55%),
            radial-gradient(110% 90% at 100% 100%, ${t.secondary}1F 0%, transparent 60%),
            linear-gradient(135deg, ${t.bgBase} 0%, ${t.bgMid} 100%)
          `,
          border:    `1px solid ${t.accent}33`,
          minHeight: 180,
        }}
      >
        {/* Top accent strip — full-width sliver in the game's primary colour. */}
        <div
          className="absolute top-0 left-0 right-0"
          style={{
            height:     3,
            background: `linear-gradient(90deg, ${t.accent} 0%, ${t.secondary} 100%)`,
          }}
        />

        {/* Decorative motif — low-opacity SVG pattern that nods at each game's
            visual language. Hexagons for LoL (hextech), scanlines for AR
            (broadcast/CRT). */}
        <BannerMotif theme={t} />

        {/* Right-edge accent glow — subtle vignette of the secondary colour
            so the right side doesn't feel empty when the linked-account chip
            isn't rendered. */}
        <div
          aria-hidden
          className="absolute top-0 right-0 bottom-0 pointer-events-none"
          style={{
            width:      "40%",
            background: `linear-gradient(270deg, ${t.secondary}1A 0%, transparent 100%)`,
          }}
        />

        <div className="relative p-6 sm:p-8">
          <div className="flex items-start gap-6 flex-wrap">
            <div className="min-w-0 flex-1">
              {/* Eyebrow — small uppercase label in the primary accent. */}
              <p
                className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.25em] mb-3"
                style={{ color: t.accent }}
              >
                Game hub
              </p>

              {/* Wordmark — real game art from /public/games/<slug>/logo.*
                  rendered at a fixed height with auto width so wide
                  wordmarks (LoL ~2.6:1, AR ~5:1) keep their proportions.
                  Falls back to a flavoured Lucide icon tile if the asset
                  is missing. The accessible game name is kept as a visually
                  hidden h1 for screen readers / SEO. */}
              <h1 className="sr-only">{game.name}</h1>
              <GameWordmark game={game} theme={t} />

              <p
                className="text-sm mt-4 max-w-xl"
                style={{ color: t.subtitle }}
              >
                {game.tagline}
              </p>
            </div>

            {/* Persistent linked-account chip — LoL only. Wrapped in Suspense
                so the banner paints immediately and the chip streams in once
                the integration lookup resolves. */}
            {game.slug === "league-of-legends" && (
              <div className="ml-auto self-start mt-1">
                <Suspense fallback={null}>
                  <LeagueBannerStatus />
                </Suspense>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Wordmark ────────────────────────────────────────────────────────────────
//
// Renders the game's actual wordmark image (sourced from press resources /
// the community wiki and saved under /public/games/<slug>/logo.<ext>) at a
// fixed height so wide wordmarks keep their proportions without dominating
// the banner. A soft accent drop-shadow gives the image lift over the dark
// background. If the asset is missing, falls back to a gradient tile with a
// flavoured Lucide icon so the banner still reads as branded.

function GameWordmark({ game, theme }: { game: GameDefinition; theme: GameTheme }) {
  if (game.logoSrc) {
    return (
      <div className="relative" style={{ height: 56, maxWidth: 360 }}>
        <Image
          src={game.logoSrc}
          alt={`${game.name} logo`}
          width={720}
          height={140}
          priority
          unoptimized
          style={{
            height:      "100%",
            width:       "auto",
            maxWidth:    "100%",
            objectFit:   "contain",
            objectPosition: "left center",
            filter:      `drop-shadow(0 4px 14px ${theme.accent}55)`,
          }}
        />
      </div>
    );
  }
  // Fallback — no wordmark asset available for this game yet.
  const Icon = GAME_ICON[game.slug];
  return (
    <div
      className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-white shrink-0"
      style={{
        background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.secondary} 100%)`,
        boxShadow:  `0 8px 24px -8px ${theme.accent}80, inset 0 0 0 1px rgba(255,255,255,0.18)`,
      }}
    >
      <Icon size={36} strokeWidth={1.75} aria-hidden />
    </div>
  );
}

// ─── Decorative motif (SVG overlay) ──────────────────────────────────────────
//
// Each game declares a `motif` token in its theme. We render the matching SVG
// inline so the markup is fully self-contained — no separate image fetch, no
// CSP fuss. All motifs use the theme's primary accent at very low opacity so
// they read as texture, not chrome.

function BannerMotif({ theme }: { theme: GameTheme }) {
  if (theme.motif === "hex") {
    // Hexagonal lattice — single SVG `<pattern>` tiled across the banner.
    return (
      <svg
        aria-hidden
        className="absolute inset-0 w-full h-full pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="hex-pattern"
            x="0" y="0"
            width="32" height="28"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M16 0 L32 8 L32 20 L16 28 L0 20 L0 8 Z"
              fill="none"
              stroke={theme.accent}
              strokeOpacity="0.08"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hex-pattern)" />
      </svg>
    );
  }
  if (theme.motif === "scanlines") {
    // Horizontal scanlines — evokes broadcast / surveillance overlay.
    return (
      <svg
        aria-hidden
        className="absolute inset-0 w-full h-full pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="scan-pattern"
            x="0" y="0"
            width="100%" height="4"
            patternUnits="userSpaceOnUse"
          >
            <rect x="0" y="0" width="100%" height="1" fill={theme.accent} opacity="0.05" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#scan-pattern)" />
      </svg>
    );
  }
  return null;
}
