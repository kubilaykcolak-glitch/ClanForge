import { getClanLevelProgress, TIER_COLORS } from "@/lib/clan-levels";

interface ClanXpBarProps {
  xp:       number;
  /** When true, show the full perk list for the current & next level */
  showPerks?: boolean;
}

export function ClanXpBar({ xp, showPerks = false }: ClanXpBarProps) {
  const { current, next, xpIntoLevel, xpToNext, percentDone } = getClanLevelProgress(xp);
  const colors = TIER_COLORS[current.tier];

  return (
    <div
      className="rounded-xl px-5 py-4"
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-default)",
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="text-xl font-semibold px-2.5 py-1 rounded-lg"
            style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
          >
            {current.icon} {current.name}
          </span>
          <span className="text-sm font-semibold" style={{ color: colors.text }}>
            Level {current.level}
          </span>
        </div>
        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          {xp.toLocaleString()} XP total
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="h-2.5 rounded-full overflow-hidden mb-2"
        style={{ background: "var(--bg-overlay)" }}
      >
        {next ? (
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${percentDone}%`, background: colors.text }}
          />
        ) : (
          <div
            className="h-full rounded-full"
            style={{ width: "100%", background: colors.text }}
          />
        )}
      </div>

      {/* XP label */}
      {next ? (
        <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
          <span>{xpIntoLevel.toLocaleString()} / {(xpIntoLevel + xpToNext).toLocaleString()} XP</span>
          <span>
            <span style={{ color: "var(--text-secondary)" }}>{xpToNext.toLocaleString()} XP</span>
            {" "}to {next.icon} Level {next.level}
          </span>
        </div>
      ) : (
        <p className="text-xs text-center" style={{ color: colors.text }}>
          Max level reached — Mythic Clan 🌟
        </p>
      )}

      {/* Perks (optional) */}
      {showPerks && (
        <div className="mt-4 flex flex-col gap-3">
          {/* Current perks */}
          {current.perks.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                Unlocked at this level
              </p>
              <div className="flex flex-wrap gap-1.5">
                {current.perks.map((p, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: colors.bg,
                      color:      colors.text,
                      border:     `1px solid ${colors.border}`,
                    }}
                  >
                    ✓ {p.description}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Next level perks */}
          {next && next.perks.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                Unlock at Level {next.level}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {next.perks.map((p, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: "var(--bg-overlay)",
                      color:      "var(--text-muted)",
                      border:     "1px solid var(--border-subtle)",
                    }}
                  >
                    🔒 {p.description}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
