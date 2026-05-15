"use client";

import { useEffect, useMemo, useState } from "react";
import { Target, Calendar, Clock, Check } from "lucide-react";
import { getDashboardMissions, type MissionsBundle, type MissionRow } from "@/lib/actions/missions.actions";

interface Props {
  uid: string;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function formatCountdown(msLeft: number): string {
  if (msLeft <= 0) return "soon";
  const h = Math.floor(msLeft / 3_600_000);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ${h % 24}h`;
  if (h >= 1) return `${h}h`;
  const m = Math.floor(msLeft / 60_000);
  return `${m}m`;
}

function percent(progress: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((progress / target) * 100));
}

// ─── Mission row (shared between daily and weekly) ────────────────────────────

function MissionItem({
  m,
  highlight,
}: {
  m:          MissionRow;
  highlight?: boolean;
}) {
  const pct  = percent(m.progress, m.target);
  const done = m.completed;

  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <p
            className="text-xs mb-0.5 flex items-center gap-1.5"
            style={{ color: "var(--text-muted)" }}
          >
            <span aria-hidden>{m.icon}</span>
            <span className="truncate">{m.label}</span>
            {done && (
              <Check size={12} style={{ color: "var(--success)" }} />
            )}
          </p>
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-semibold"
              style={{ color: done ? "var(--success)" : "var(--text-secondary)" }}
            >
              {m.progress} / {m.target}
            </span>
            <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
              {m.description}
            </span>
          </div>
        </div>
        <div
          className="shrink-0 text-sm font-bold font-display"
          style={{ color: done ? "var(--success)" : (highlight ? "var(--violet)" : "var(--accent)") }}
        >
          +{m.xpReward}
          <span className="text-xs font-normal ml-0.5" style={{ color: "var(--text-muted)" }}>
            xp
          </span>
        </div>
      </div>

      {/* Progress bar — uses CSS vars to match the rest of the dashboard. */}
      <div
        className="h-1 rounded-full overflow-hidden"
        style={{ background: "var(--bg-overlay)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width:      `${pct}%`,
            background: done ? "var(--success)" : (highlight ? "var(--violet)" : "var(--accent)"),
          }}
        />
      </div>
    </div>
  );
}

// ─── Widget ───────────────────────────────────────────────────────────────────

export function DashboardMissionsWidget({ uid }: Props) {
  const [bundle,  setBundle]  = useState<MissionsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDashboardMissions(uid).then(res => {
      if (cancelled) return;
      if (res.success && res.data) {
        setBundle(res.data);
        setError(null);
      } else {
        setError(res.error ?? "Could not load missions");
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [uid]);

  // Pre-compute countdown strings once per bundle change.
  const dailyLabel = useMemo(
    () => bundle ? formatCountdown(bundle.refreshDailyInMs)  : "",
    [bundle],
  );
  const weeklyLabel = useMemo(
    () => bundle ? formatCountdown(bundle.refreshWeeklyInMs) : "",
    [bundle],
  );

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        className="rounded-2xl p-5 mb-6"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Target size={16} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Daily Missions
          </span>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="h-14 rounded-xl animate-pulse"
              style={{ background: "var(--bg-elevated)" }}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (error || !bundle) {
    return (
      <div
        className="rounded-2xl p-5 mb-6"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Target size={16} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Daily Missions
          </span>
        </div>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {error ?? "Missions unavailable right now."}
        </p>
      </div>
    );
  }

  const { daily, weekly } = bundle;
  const dailyCompleted    = daily.filter(m => m.completed).length;

  return (
    <div
      className="rounded-2xl overflow-hidden mb-6"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2">
          <Target size={16} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Daily Missions
          </span>
          <span
            className="text-xs ml-2"
            style={{ color: "var(--text-muted)" }}
          >
            {dailyCompleted} / {daily.length} done
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
          <Clock size={12} />
          <span>Refreshes in {dailyLabel}</span>
        </div>
      </div>

      {/* ── Daily missions list ─────────────────────────────────────────── */}
      <div
        className="px-5 divide-y"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        {daily.length === 0 ? (
          <p className="py-4 text-sm" style={{ color: "var(--text-muted)" }}>
            No daily missions today.
          </p>
        ) : (
          daily.map(m => <MissionItem key={m.templateId} m={m} />)
        )}
      </div>

      {/* ── Weekly mission ──────────────────────────────────────────────── */}
      {weekly && (
        <div
          className="px-5 pt-3 pb-1"
          style={{
            borderTop: "1px solid var(--border-subtle)",
            background: "linear-gradient(180deg, rgba(139, 92, 246, 0.05) 0%, transparent 100%)",
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Calendar size={12} style={{ color: "var(--violet)" }} />
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--violet)" }}
              >
                Weekly mission
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
              <Clock size={10} />
              <span>{weeklyLabel}</span>
            </div>
          </div>
          <MissionItem m={weekly} highlight />
        </div>
      )}
    </div>
  );
}
