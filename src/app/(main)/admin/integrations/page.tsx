"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Search, Unlink, Plug } from "lucide-react";
import { toast } from "sonner";
import { adminListLeagueOwners } from "@/lib/actions/admin.actions";
import { forceUnlinkRiotAccount } from "@/lib/actions/admin-moderation.actions";
import { useStepUp } from "@/components/admin/useStepUp";

interface Owner {
  puuid:       string;
  uid:         string;
  username:    string | null;
  displayName: string | null;
  gameName:    string | null;
  tagLine:     string | null;
  region:      string | null;
  claimedAt:   string | null;
}

// ─── /admin/integrations ─────────────────────────────────────────────────────
// Read view of every active Riot PUUID lock, with a force-unlink action per
// row. Search by PUUID prefix or ClanForge uid.

export default function AdminIntegrationsPage() {
  const [rows, setRows] = useState<Owner[]>([]);
  const [q, setQ]       = useState("");
  const [loading, setLoading] = useState(true);
  const [, startTransition]   = useTransition();
  const { call, modal } = useStepUp();
  const [pendingUid, setPendingUid] = useState<string | null>(null);

  const load = (query: string) => {
    setLoading(true);
    startTransition(async () => {
      const res = await adminListLeagueOwners({ query, pageSize: 100 });
      setLoading(false);
      setRows(res.success && res.data ? res.data : []);
    });
  };

  useEffect(() => { load(""); }, []);

  const handleSearch = (value: string) => {
    setQ(value);
    load(value);
  };

  const handleUnlink = async (o: Owner) => {
    const label = o.gameName ? `${o.gameName}#${o.tagLine ?? ""}` : o.uid;
    const reason = window.prompt(`Force-unlink ${label}'s Riot account?\n\nReason (audit-logged + Discord-alerted):`)?.trim();
    if (!reason)              { toast.message("Cancelled"); return; }
    if (reason.length < 5)    { toast.error("Reason must be at least 5 chars"); return; }
    setPendingUid(o.uid);
    const res = await call(() => forceUnlinkRiotAccount(o.uid, reason));
    setPendingUid(null);
    if (res.success)          { toast.success("Riot account force-unlinked"); load(q); }
    else if (!res.needsStepUp) toast.error(res.error ?? "Failed");
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Plug size={22} /> Riot integrations
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Active PUUID locks. Force-unlink to release the PUUID for a different ClanForge profile.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(q)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : undefined} /> Refresh
        </button>
      </div>

      {/* Search */}
      <div className="rounded-xl p-3 mb-4"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            value={q}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search by PUUID prefix or ClanForge uid"
            className="w-full rounded-lg text-sm outline-none font-mono"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
              borderRadius: 8,
              padding: "9px 12px 9px 34px",
              fontSize: 13,
            }}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex flex-col gap-1.5">
        {rows.length === 0 && !loading && (
          <p className="text-xs py-8 text-center" style={{ color: "var(--text-muted)" }}>
            No active Riot integrations matched.
          </p>
        )}
        {rows.map(o => (
          <div key={o.puuid} className="rounded-lg px-3 py-2.5 flex items-center gap-3"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                  {o.gameName ? `${o.gameName}#${o.tagLine}` : <span style={{ color: "var(--text-muted)" }}>(integration deleted)</span>}
                </span>
                {o.region && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(99,102,241,0.10)", color: "var(--accent)", border: "1px solid rgba(99,102,241,0.30)" }}>
                    {o.region}
                  </span>
                )}
                <Link href={`/admin/users/${o.uid}`} className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                  → {o.displayName ?? o.username ?? o.uid.slice(0, 10) + "…"}
                </Link>
              </div>
              <p className="text-[10px] font-mono truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                {o.puuid}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleUnlink(o)}
              disabled={pendingUid === o.uid}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--warning)", color: "var(--warning)" }}
            >
              {pendingUid === o.uid ? <Loader2 size={11} className="animate-spin" /> : <Unlink size={11} />}
              Force-unlink
            </button>
          </div>
        ))}
      </div>

      {modal}
    </div>
  );
}
