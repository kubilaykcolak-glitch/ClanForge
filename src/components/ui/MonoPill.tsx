// ─── MonoPill ────────────────────────────────────────────────────────────────
// JetBrains-Mono uppercase tag. Adopted from the Arena prototype's <Pill>
// primitive. Used for game tags (VALORANT, CS2), season tags (SEASON 4),
// status tags (LIVE, REGISTERING).
//
// Differs from <Badge> — Badge is shadcn's pill with semantic colour
// variants for status (success/warning/danger/info), while MonoPill is a
// purely typographic chip for category labels. Both can coexist.
//
// Usage:
//   <MonoPill>Season 4 · Iron Forge</MonoPill>
//   <MonoPill color="var(--magenta)" bg="rgba(232,121,249,0.12)">LIVE</MonoPill>
//   <MonoPill icon={<Zap size={11} />}>+1,240 XP</MonoPill>

import * as React from "react";

interface Props {
  children: React.ReactNode;
  /** Text colour — default text-secondary. */
  color?:   string;
  /** Background colour — default subtle white tint. */
  bg?:      string;
  /** Optional leading icon, sized small (~11px). */
  icon?:    React.ReactNode;
  /** Extra inline styles (merged after defaults). */
  style?:   React.CSSProperties;
}

export function MonoPill({
  children,
  color = "var(--text-secondary)",
  bg    = "rgba(255,255,255,0.05)",
  icon,
  style,
}: Props) {
  return (
    <span
      style={{
        display:     "inline-flex",
        alignItems:  "center",
        gap:         6,
        padding:     "3px 8px",
        borderRadius: 4,
        background:  bg,
        color,
        fontFamily:  "JetBrains Mono, ui-monospace, monospace",
        fontSize:    11,
        fontWeight:  500,
        lineHeight:  1.4,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        whiteSpace:  "nowrap",
        ...style,
      }}
    >
      {icon}
      <span>{children}</span>
    </span>
  );
}
