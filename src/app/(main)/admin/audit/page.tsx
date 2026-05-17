"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, AlertCircle, CheckCircle2, RefreshCw, ScrollText } from "lucide-react";
import { listAuditLog } from "@/lib/actions/admin.actions";

interface AuditRow {
  id:         string;
  actor:      string;
  actorRole:  string | null;
  action:     string;
  targetType: string;
  targetId:   string;
  reason:     string;
  result:     "success" | "failure";
  errorMsg:   string | null;
  metadata:   Record<string, unknown> | null;
  ip:         string | null;
  at:         string;
}

// ─── /admin/audit ────────────────────────────────────────────────────────────
//
// Paginated audit-log viewer. 50 entries per page, "Load older" button at
// the bottom. Filter by action prefix above the list.

export default function AdminAuditPage() {
  const [rows, setRows]     = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState("");
  const [, startTransition]   = useTransition();

  const load = (before?: string, action?: string, append = false) => {
    setLoading(true);
    startTransition(async () => {
      const res = await listAuditLog({ before, actionLike: action, pageSize: 50 });
      setLoading(false);
      if (!res.success || !res.data) return;
      setRows(prev => append ? [...prev, ...res.data!.items] : res.data!.items);
      setHasMore(res.data.hasMore);
    });
  };

  useEffect(() => { load(); }, []);

  const handleFilterApply = () => load(undefined, filter || undefined, false);
  const handleLoadMore    = () => {
    const last = rows[rows.length - 1];
    if (last) load(last.at, filter || undefined, true);
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <ScrollText size={22} /> Audit Log
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Every privileged action, success or failure. Server-only writes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(undefined, filter || undefined, false)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : undefined} />
          Refresh
        </button>
      </div>

      {/* Filter */}
      <div
        className="rounded-xl p-3 mb-4 flex gap-2"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder='Filter by exact action e.g. "user.ban"'
          className="flex-1 rounded-lg text-sm outline-none"
          style={{
            background:   "var(--bg-elevated)",
            border:       "1px solid var(--border-default)",
            color:        "var(--text-primary)",
            borderRadius: 8,
            padding:      "8px 12px",
            fontSize:     13,
          }}
        />
        <button
          type="button"
          onClick={handleFilterApply}
          className="px-4 py-2 rounded-lg text-xs font-semibold text-white"
          style={{ background: "var(--accent)" }}
        >
          Apply
        </button>
        {filter && (
          <button
            type="button"
            onClick={() => { setFilter(""); load(); }}
            className="px-3 py-2 rounded-lg text-xs font-medium"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Log */}
      <div className="flex flex-col gap-2">
        {rows.length === 0 && !loading && (
          <div
            className="rounded-xl py-10 text-center"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
          >
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No audit entries yet.</p>
          </div>
        )}
        {rows.map(r => <AuditRowCard key={r.id} r={r} />)}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={handleLoadMore}
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

// ─── Audit row card ──────────────────────────────────────────────────────────

function AuditRowCard({ r }: { r: AuditRow }) {
  const ok = r.result === "success";
  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: "var(--bg-surface)",
        border:     `1px solid ${ok ? "var(--border-default)" : "var(--danger)"}`,
      }}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          {ok
            ? <CheckCircle2 size={14} style={{ color: "var(--success)" }} />
            : <AlertCircle  size={14} style={{ color: "var(--danger)"  }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <code className="text-xs font-mono px-1.5 py-0.5 rounded"
              style={{ background: "var(--bg-elevated)", color: "var(--accent)" }}>
              {r.action}
            </code>
            <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              {r.targetType} · <span className="font-mono">{r.targetId.slice(0, 60)}</span>
            </span>
            <span className="text-[10px] ml-auto" style={{ color: "var(--text-muted)" }}>
              {new Date(r.at).toLocaleString()}
            </span>
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--text-primary)" }}>
            {r.reason}
          </p>
          {!ok && r.errorMsg && (
            <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>
              error: {r.errorMsg}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              actor <span className="font-mono">{r.actor.slice(0, 12)}…</span> ({r.actorRole ?? "?"})
            </span>
            {r.ip && (
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                · ip <span className="font-mono">{r.ip}</span>
              </span>
            )}
          </div>
          {r.metadata && Object.keys(r.metadata).length > 0 && (
            <details className="mt-1.5">
              <summary className="text-[10px] cursor-pointer" style={{ color: "var(--text-muted)" }}>
                metadata
              </summary>
              <pre className="text-[10px] mt-1 p-2 rounded overflow-x-auto"
                style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
                {JSON.stringify(r.metadata, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
