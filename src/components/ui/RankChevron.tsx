// ─── RankChevron ─────────────────────────────────────────────────────────────
// Hexagonal level insignia rendered as inline SVG. Adopted from the Arena
// design prototype. Replaces plain "Level N" text badges on clan / player
// profile cards. Scales to any size — purely SVG + inline styles, no media
// queries, so it stays crisp on retina + composes inside responsive flex/grid
// containers without breaking layout.
//
// Usage:
//   <RankChevron tier="gold" level={5} size={44} />

import * as React from "react";

export type RankTier = "bronze" | "silver" | "gold" | "platinum" | "diamond" | "legendary";

const TIER_VAR: Record<RankTier, string> = {
  bronze:    "var(--tier-bronze)",
  silver:    "var(--tier-silver)",
  gold:      "var(--tier-gold)",
  platinum:  "var(--tier-platinum)",
  diamond:   "var(--tier-diamond)",
  legendary: "var(--tier-legendary)",
};

interface Props {
  tier:   RankTier;
  level:  number;
  size?:  number;          // outer SVG size in px; default 44
  /** Optional className for the wrapper — useful for absolute positioning. */
  className?: string;
}

export function RankChevron({ tier, level, size = 44, className }: Props) {
  const color = TIER_VAR[tier];
  // Use a stable but tier+size-scoped gradient ID so multiple chevrons on the
  // same page don't collide. React's useId would also work but is overkill
  // for a static SVG.
  const gradId = `rank-${tier}-${size}`;

  return (
    <div
      className={className}
      style={{
        position:    "relative",
        width:       size,
        height:      size,
        display:     "inline-flex",
        alignItems:  "center",
        justifyContent: "center",
        flexShrink:  0,
      }}
    >
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        style={{ position: "absolute", inset: 0 }}
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.95" />
            <stop offset="1" stopColor={color} stopOpacity="0.35" />
          </linearGradient>
        </defs>
        <path
          d="M24 4 L42 14 L42 30 L24 44 L6 30 L6 14 Z"
          fill={`url(#${gradId})`}
          stroke={color}
          strokeWidth="1.5"
        />
        <path
          d="M24 11 L36 18 L36 28 L24 37 L12 28 L12 18 Z"
          fill="rgba(0,0,0,0.45)"
          stroke={color}
          strokeOpacity="0.4"
          strokeWidth="0.8"
        />
      </svg>
      <span
        style={{
          position:    "relative",
          fontFamily:  "Rajdhani, sans-serif",
          fontWeight:  700,
          color,
          fontSize:    Math.round(size * 0.4),
          textShadow:  `0 0 10px ${color}88`,
        }}
      >
        {level}
      </span>
    </div>
  );
}
