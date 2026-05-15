// ─── StatBlock ───────────────────────────────────────────────────────────────
// JetBrains-Mono tracked-uppercase label over a large Rajdhani value. Adopted
// from the Arena prototype's "big metric" pattern. Use in dashboard stat
// grids, profile stat columns, tournament-detail summaries.
//
// Designed to work in any grid cell — no fixed width, no media queries —
// so existing responsive grid layouts pass through it unchanged.
//
// Usage:
//   <StatBlock label="WIN RATE" value="67%" sub="↑ 4%" color="var(--success)" />

import * as React from "react";

interface Props {
  label:  string;
  value:  React.ReactNode;
  /** Inline suffix shown beside the value (e.g. "↑ 4%", "days"). */
  sub?:   React.ReactNode;
  /** Override the value color. Defaults to --text-primary. */
  color?: string;
  /** Inline icon shown next to the label. Sized to ~11px. */
  icon?:  React.ReactNode;
  /** Use a smaller value font (22px instead of 28px). */
  dense?: boolean;
}

export function StatBlock({ label, value, sub, color, icon, dense = false }: Props) {
  return (
    <div>
      <div
        className="font-mono-tech"
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        6,
          marginBottom: 4,
          color:      "var(--text-muted)",
          fontSize:   10,
        }}
      >
        {icon}
        <span>{label}</span>
      </div>
      <div
        style={{
          display:     "flex",
          alignItems:  "baseline",
          gap:         6,
          fontFamily:  "Rajdhani, sans-serif",
          fontWeight:  600,
          fontSize:    dense ? 22 : 28,
          color:       color ?? "var(--text-primary)",
          lineHeight:  1,
        }}
      >
        {value}
        {sub && (
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}
