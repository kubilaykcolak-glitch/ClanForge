// ─── ArenaCard ───────────────────────────────────────────────────────────────
// Titled surface with optional accent stripe along the left edge. Adopted
// from the Arena prototype's card pattern. Composes with the standard ClanForge
// card classes (`bg-surface rounded-lg border border-default/10`) — this is
// just a structural wrapper that pre-arranges the title/subtitle/action row
// and adds the accent stripe.
//
// Pass `featured` to apply the gradient hairline border + multi-layer glow
// used on hero cards (e.g. Season banner).
//
// Usage:
//   <ArenaCard title="Daily Quests" subtitle="3 missions · resets in 06:24"
//              accent="var(--amber)" action={<span>60 XP available</span>}>
//     {children}
//   </ArenaCard>

import * as React from "react";

interface Props {
  children:   React.ReactNode;
  title?:     React.ReactNode;
  subtitle?:  React.ReactNode;
  /** Optional content rendered top-right of the header (link, badge, etc.). */
  action?:    React.ReactNode;
  /** Vertical stripe colour on the left edge — defaults to none. */
  accent?:    string;
  /** When true, applies arena-gradient-border + arena-glow-card. */
  featured?:  boolean;
  /** Internal padding override (default 16). */
  padding?:   number;
  /** Extra className for the outer container. */
  className?: string;
  style?:     React.CSSProperties;
}

export function ArenaCard({
  children,
  title,
  subtitle,
  action,
  accent,
  featured = false,
  padding = 16,
  className,
  style,
}: Props) {
  const featureClass = featured ? "arena-gradient-border arena-glow-card" : "";
  return (
    <div
      className={`${featureClass} ${className ?? ""}`.trim()}
      style={{
        position:     "relative",
        background:   "var(--bg-surface)",
        border:       featured ? "1px solid transparent" : "1px solid var(--border-default)",
        borderRadius: 14,
        overflow:     "hidden",
        ...style,
      }}
    >
      {accent && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: 3,
            background: accent,
            opacity: 0.85,
          }}
        />
      )}

      {(title || subtitle || action) && (
        <div
          style={{
            display:        "flex",
            alignItems:     "flex-start",
            justifyContent: "space-between",
            gap:            12,
            padding:        `${padding}px ${padding}px 0 ${padding}px`,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title && (
              <div
                style={{
                  fontFamily:  "Rajdhani, sans-serif",
                  fontWeight:  600,
                  fontSize:    16,
                  color:       "var(--text-primary)",
                  letterSpacing: "0.01em",
                  lineHeight:  1.2,
                }}
              >
                {title}
              </div>
            )}
            {subtitle && (
              <div
                style={{
                  fontSize:   11,
                  color:      "var(--text-muted)",
                  marginTop:  2,
                  letterSpacing: "0.04em",
                  fontFamily: "JetBrains Mono, ui-monospace, monospace",
                  textTransform: "uppercase",
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
          {action && <div style={{ flexShrink: 0 }}>{action}</div>}
        </div>
      )}

      <div style={{ padding }}>{children}</div>
    </div>
  );
}
