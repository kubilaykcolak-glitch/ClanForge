"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Trophy } from "lucide-react";
import { adminListTournaments } from "@/lib/actions/admin.actions";

type StatusFilter = "" | "open" | "locked" | "live" | "complete" | "cancelled" | "draft";

interface Row {
  id:                string;
  name:              string;
  game:              string;
  status:            string;
  isPaid:            boolean;
  entryFee:          number;
  prizePool:         number;
  participantCount:  number;
  maxParticipants:   number;
  gameProvider:      string | null;
  creatorId:         string;
  createdAt:         string;
  startsAt:          string | null;
}

// ─── /admin/tournaments ──────────────────────────────────────────────────────
// Live-filterable list of tournaments with admin-level metadata. Each row
// links to the detail page where force-finalize / force-cancel / force-refund
// live.

export default function AdminTournamentsPage() {
  const [rows, setRows]     = useState<Row[]>([]);
  const [status, setStatus] = useState<StatusFilter>("");
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [, startTransition] = useTransition();

  const load = (statusFilter: StatusFilter, before?: string, append = false) => {
    setLoading(true);
    startTransition(async () => {
      const res = await adminListTournaments({
        status: statusFilter === "" ? null : statusFilter,
        before,
        pageSize: 30,
      });
      setLoading(false);
      if (!res.success || !res.data) return;
      setRows(prev => append ? [...prev, ...res.data!.items] : res.data!.items);
      setHasMore(res.data.hasMore);
    });
  };

  useEffect(() => { load(status); }, [status]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl flex items-center gap-2"
            style={{ color: "var(--text-primary)" }}>
            <Trophy size={22} /> Tournaments
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Force-finalize, force-cancel, or refund individuals.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(status)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : undefined} /> Refresh
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {[
          { v: "" as StatusFilter,        label: "All" },
          { v: "open" as StatusFilter,    label: "Open" },
          { v: "locked" as StatusFilter,  label: "Locked" },
          { v: "live" as StatusFilter,    label: "Live" },
          { v: "complete" as StatusFilter, label: "Complete" },
          { v: "cancelled" as StatusFilter, label: "Cancelled" },
        ].map(f => {
          const selected = status === f.v;
          return (
            <button
              key={f.v}
              type="button"
              onClick={() => setStatus(f.v)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: selected ? "var(--accent)" : "var(--bg-surface)",
                color:      selected ? "#fff" : "var(--text-secondary)",
                border:     `1px solid ${selected ? "var(--accent)" : "var(--border-default)"}`,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="flex flex-col gap-2">
        {rows.length === 0 && !loading && (
          <p className="text-xs py-8 text-center" style={{ color: "var(--text-muted)" }}>
            No tournaments matched.
          </p>
        )}
        {rows.map(t => <Row key={t.id} t={t} />)}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => { const last = rows[rows.length - 1]; if (last) load(status, last.createdAt, true); }}
          disabled={loading}
          className="w-full mt-4 px-4 py-3 rounded-lg text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
        >
          {loading ? <Loader2 size={14} className="inline animate-spin mr-2" /> : null}
          Load older
        </button>
      )}
    </div>
  );
}

// ─── Row component ───────────────────────────────────────────────────────────

function Row({ t }: { t: Row }) {
  const statusColour =
    t.status === "live"      ? "var(--success)"
    : t.status === "complete" ? "var(--text-muted)"
    : t.status === "cancelled" ? "var(--danger)"
    : t.status === "locked"   ? "var(--warning)"
    : t.status === "open"     ? "var(--accent)"
    : "var(--text-muted)";

  return (
    <Link
      href={`/admin/tournaments/${t.id}`}
      className="rounded-lg p-3 transition-colors hover:bg-[var(--bg-elevated)]"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {t.name}
            </span>
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: `${statusColour}22`, color: statusColour, border: `1px solid ${statusColour}55` }}
            >
              {t.status}
            </span>
            {t.gameProvider === "league" && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: "rgba(99,102,241,0.15)", color: "var(--accent)", border: "1px solid rgba(99,102,241,0.30)" }}>
                LoL Tournament-V5
              </span>
            )}
            {t.isPaid && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: "rgba(251,191,36,0.10)", color: "var(--amber)", border: "1px solid rgba(251,191,36,0.30)" }}>
                Paid
              </span>
            )}
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            {t.game} · {t.participantCount}/{t.maxParticipants} participants ·
            entry £{(t.entryFee / 100).toFixed(2)} · pool £{(t.prizePool / 100).toFixed(2)} ·
            <span className="font-mono ml-1">{t.id.slice(0, 10)}…</span>
          </p>
        </div>
        <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>
          {new Date(t.createdAt).toLocaleDateString()}
        </span>
      </div>
    </Link>
  );
}
