import type { GameRecord } from "@/types";

interface GameRecordCardProps {
  record: GameRecord;
}

const PLATFORM_COLOURS: Record<string, string> = {
  PC:          "var(--accent)",
  PlayStation: "#003791",
  Xbox:        "#107C10",
  Switch:      "#E4000F",
  Mobile:      "#555",
};

export function GameRecordCard({ record }: GameRecordCardProps) {
  const total = record.wins + record.losses + record.draws;
  const winPct  = total > 0 ? (record.wins  / total) * 100 : 0;
  const lossPct = total > 0 ? (record.losses / total) * 100 : 0;
  const drawPct = total > 0 ? (record.draws  / total) * 100 : 0;

  const platformColour = PLATFORM_COLOURS[record.platform] ?? "var(--text-muted)";

  return (
    <div
      className="relative rounded-xl p-5 flex flex-col gap-3"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
      }}
    >
      {/* ── Featured star ── */}
      {record.isFeatured && (
        <span className="absolute top-3 right-3 text-base" title="Featured">⭐</span>
      )}

      {/* ── Game name + platform ── */}
      <div className="flex items-start justify-between gap-2 pr-6">
        <h3
          className="font-display font-semibold leading-tight"
          style={{ fontSize: 20, color: "var(--text-primary)" }}
        >
          {record.gameName}
        </h3>
        <span
          className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full"
          style={{
            background: `${platformColour}22`,
            color: platformColour,
            border: `1px solid ${platformColour}44`,
          }}
        >
          {record.platform}
        </span>
      </div>

      {/* ── W/L/D bar ── */}
      <div>
        <div className="flex h-2 rounded-full overflow-hidden gap-px">
          {winPct  > 0 && <div style={{ width: `${winPct}%`,  background: "var(--success)" }} />}
          {lossPct > 0 && <div style={{ width: `${lossPct}%`, background: "var(--danger)"  }} />}
          {drawPct > 0 && <div style={{ width: `${drawPct}%`, background: "var(--text-muted)" }} />}
          {total === 0  && <div className="flex-1" style={{ background: "var(--bg-overlay)" }} />}
        </div>
        <div className="flex gap-4 mt-2">
          <span className="text-xs font-medium" style={{ color: "var(--success)" }}>
            {record.wins}W
          </span>
          <span className="text-xs font-medium" style={{ color: "var(--danger)" }}>
            {record.losses}L
          </span>
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            {record.draws}D
          </span>
        </div>
      </div>

      {/* ── Extra stats ── */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {record.peakRank && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Peak <span style={{ color: "var(--text-secondary)" }}>{record.peakRank}</span>
          </p>
        )}
        {record.hoursPlayed > 0 && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            <span style={{ color: "var(--text-secondary)" }}>{record.hoursPlayed.toLocaleString()}</span> hrs
          </p>
        )}
        {record.notes && (
          <p
            className="text-xs w-full mt-1 line-clamp-2"
            style={{ color: "var(--text-muted)" }}
          >
            {record.notes}
          </p>
        )}
      </div>
    </div>
  );
}
