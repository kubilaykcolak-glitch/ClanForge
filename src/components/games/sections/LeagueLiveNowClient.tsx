"use client";

// ─── LoL Live Now client island ──────────────────────────────────────────────
//
// Owns the refresh button + the optional auto-poll (60s) for the live-game
// list. The Riot spectator endpoint is rate-limit sensitive, so the manual
// refresh is gated server-side by a 30s per-user cooldown; the auto-poll
// off by default and the user opts in.

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { championIconUrl, queueLabel } from "@/lib/riot/assets";
import { refreshLiveGames } from "@/lib/actions/live-games.actions";
import { formatGameLength, type LiveGameRow } from "@/lib/riot/live-game";

const POLL_INTERVAL_MS = 60_000;

export function LeagueLiveNowClient({
  initialRows,
  clanId,
}: {
  initialRows: LiveGameRow[];
  clanId:      string | null;
}) {
  const [rows, setRows]   = useState<LiveGameRow[]>(initialRows);
  const [pending, startTransition] = useTransition();
  const [autoPoll, setAutoPoll]    = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<number>(Date.now());

  const refresh = () => {
    startTransition(async () => {
      const res = await refreshLiveGames(clanId);
      if (res.success && res.rows) {
        setRows(res.rows);
        setLastFetchedAt(Date.now());
      } else if (res.error) {
        toast.error(res.error);
      }
    });
  };

  useEffect(() => {
    if (!autoPoll) return;
    const t = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(t);
    // refresh is stable enough — we deliberately don't put it in deps to avoid resetting the timer on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPoll, clanId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
          <span>Last updated {timeSince(lastFetchedAt)} ago</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoPoll}
              onChange={e => setAutoPoll(e.target.checked)}
              className="accent-current"
              style={{ accentColor: "var(--accent)" }}
            />
            <span>Auto-refresh every 60s</span>
          </label>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={pending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors disabled:opacity-40"
          style={{
            background: "var(--bg-elevated)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-default)",
          }}
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Refresh
        </button>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map(row => (
            <LiveGameCard key={row.uid} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function LiveGameCard({ row }: { row: LiveGameRow }) {
  const inChampSelect = row.gameLengthSec <= 0;
  return (
    <Link
      href={`/profile/${encodeURIComponent(row.displayName)}`}
      className="block rounded-xl p-3 transition-colors hover:opacity-90"
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex items-center gap-3">
        <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0" style={{ background: "var(--bg-overlay)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={championIconUrl(row.championId)} alt="" className="w-full h-full object-cover" />
          <span
            className="absolute top-0 left-0 px-1 text-[8px] font-bold uppercase tracking-wider rounded-br"
            style={{ background: "rgba(220,38,38,0.9)", color: "#fff" }}
          >
            LIVE
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-sm truncate" style={{ color: "var(--text-primary)" }}>
            {row.displayName || "Unknown"}
          </p>
          <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
            {row.riotIdGameName}
            {row.riotIdTagline && <span>#{row.riotIdTagline}</span>}
            <span className="ml-1 uppercase">· {row.region}</span>
          </p>
          <div className="mt-1 flex items-center gap-2 text-[11px]" style={{ color: "var(--text-secondary)" }}>
            <span>{queueLabel(row.queueId, row.gameMode)}</span>
            <span style={{ color: "var(--text-muted)" }}>·</span>
            <span className="tabular-nums">
              {inChampSelect ? "Champion select" : formatGameLength(row.gameLengthSec)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function timeSince(epochMs: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - epochMs) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}
