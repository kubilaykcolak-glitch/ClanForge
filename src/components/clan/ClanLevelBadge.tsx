import { getClanLevel, TIER_COLORS } from "@/lib/clan-levels";

interface ClanLevelBadgeProps {
  xp:       number;
  /** "sm" = compact pill, "md" = default, "lg" = larger with level number */
  size?:    "sm" | "md" | "lg";
  showName?: boolean;
}

export function ClanLevelBadge({ xp, size = "md", showName = false }: ClanLevelBadgeProps) {
  const def    = getClanLevel(xp);
  const colors = TIER_COLORS[def.tier];

  const sizeStyles = {
    sm: { fontSize: 10, padding: "1px 6px",  borderRadius: 999, gap: 3  },
    md: { fontSize: 11, padding: "2px 8px",  borderRadius: 999, gap: 4  },
    lg: { fontSize: 13, padding: "4px 10px", borderRadius: 999, gap: 5  },
  }[size];

  return (
    <span
      className="inline-flex items-center font-semibold shrink-0"
      style={{
        background:  colors.bg,
        color:       colors.text,
        border:      `1px solid ${colors.border}`,
        ...sizeStyles,
      }}
      title={`Level ${def.level} — ${def.name}`}
    >
      <span style={{ lineHeight: 1 }}>{def.icon}</span>
      <span>Lv.{def.level}</span>
      {showName && <span style={{ opacity: 0.85 }}>{def.name}</span>}
    </span>
  );
}
