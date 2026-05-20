// ─── LoL stats overview card (presentational) ────────────────────────────────
//
// Pure JSX over a DerivedStats prop. Used in two places today:
//
//   - The LoL hub Overview section as a quick-glance summary alongside the
//     linked-account card.
//   - The My Profile section as the live-filter-driven stats panel above
//     the recent-games list.
//
// The first usage is a server component (data fetched + derived on the
// server); the second one is inside a client component (data derived
// from useMemo on filter change). Same component renders both — no React
// state inside.

import { championIconUrl } from "@/lib/riot/assets";
import type { DerivedStats } from "@/lib/riot/match-stats";

export function LeagueStatsOverview({
  stats,
  embedded = false,
}: {
  stats: DerivedStats;
  /** When true, omit the outer rounded surface + border so this block can
   *  be composed inside a larger container (e.g. merged with LinkedGameCard
   *  under one border on the LoL hub Overview). */
  embedded?: boolean;
}) {
  if (stats.total === 0) {
    return (
      <div
        className={embedded ? "py-2 text-center" : "rounded-xl py-6 px-4 text-center"}
        style={
          embedded
            ? undefined
            : { background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }
        }
      >
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          No recent games yet.
        </p>
      </div>
    );
  }

  return (
    <div
      className={
        embedded
          ? "grid grid-cols-1 md:grid-cols-3 gap-6"
          : "rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-6"
      }
      style={
        embedded
          ? undefined
          : { background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }
      }
    >
      {/* W/L + KDA pillar */}
      <div className="flex items-center gap-4">
        <WinRateRing winPct={stats.winPct} />
        <div>
          <p className="text-sm font-display font-bold" style={{ color: "var(--text-primary)" }}>
            {stats.wins}W <span style={{ color: "var(--text-muted)" }}>·</span> {stats.losses}L
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {stats.avgKills.toFixed(1)} / <span style={{ color: "var(--danger)" }}>{stats.avgDeaths.toFixed(1)}</span> / {stats.avgAssists.toFixed(1)}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>{stats.kda.toFixed(2)} KDA</strong>
            <span className="opacity-60"> · P/Kill {stats.pKill}%</span>
          </p>
        </div>
      </div>

      {/* Top champions pillar */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
          Top champions
        </p>
        {stats.topChamps.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>—</p>
        ) : (
          <div className="space-y-1.5">
            {stats.topChamps.slice(0, 3).map(c => (
              <div key={c.championId} className="flex items-center gap-2">
                <div className="w-7 h-7 rounded overflow-hidden shrink-0" style={{ background: "var(--bg-overlay)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={championIconUrl(c.championId)} alt={c.championName} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0 text-[11px]">
                  <p className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                    {c.championName}
                  </p>
                  <p style={{ color: "var(--text-muted)" }}>
                    {c.wins}W {c.games - c.wins}L
                    <span style={{ color: c.winPct >= 50 ? "var(--success)" : "var(--danger)" }}> · {c.winPct}%</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Role distribution pillar */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
          Preferred role
        </p>
        <div className="space-y-1.5">
          {stats.roles.map(r => (
            <div key={r.key} className="flex items-center gap-2 text-[11px]">
              <span className="w-12 shrink-0" style={{ color: "var(--text-muted)" }}>{r.label}</span>
              <div
                className="flex-1 h-2 rounded-full overflow-hidden"
                style={{ background: "var(--bg-overlay)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${r.pct}%`, background: "var(--accent)" }}
                />
              </div>
              <span className="w-8 text-right shrink-0" style={{ color: "var(--text-secondary)" }}>
                {r.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// SVG win-rate ring — small, no chart-lib dependency.
function WinRateRing({ winPct }: { winPct: number }) {
  const size   = 64;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circ   = 2 * Math.PI * radius;
  const offset = circ * (1 - winPct / 100);
  const colour = winPct >= 50 ? "var(--success)" : "var(--danger)";

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--bg-overlay)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={colour}
        strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dy="0.35em"
        fontSize={14}
        fontWeight={700}
        fill="var(--text-primary)"
      >
        {winPct}%
      </text>
    </svg>
  );
}
