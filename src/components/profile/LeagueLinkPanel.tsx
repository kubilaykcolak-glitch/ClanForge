"use client";

import { useEffect, useState, useTransition } from "react";
import { doc, getDoc } from "firebase/firestore";
import { Loader2, Link as LinkIcon, Unlink } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import {
  linkLeagueAccount,
  unlinkLeagueAccount,
} from "@/lib/actions/integrations.actions";
import {
  LOL_PLATFORM_REGIONS,
  PLATFORM_LABELS,
  type LolPlatformRegion,
} from "@/lib/riot/regions";

// ─── LeagueLinkPanel ──────────────────────────────────────────────────────────
//
// Shows either:
//   • a "Linked: Name#TAG · REGION  [Unlink]" row, OR
//   • an inline form to link a Riot account.
//
// Built to plug into the profile-edit "My Games" section. Designed to fit
// alongside future provider panels (ValorantLinkPanel, etc.) via the same
// visual contract.

interface LeagueLinkPanelProps {
  uid: string;
}

interface LinkedSummary {
  gameName: string;
  tagLine:  string;
  region:   string;
}

export function LeagueLinkPanel({ uid }: LeagueLinkPanelProps) {
  const [linked,     setLinked]     = useState<LinkedSummary | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [riotId,     setRiotId]     = useState("");
  const [region,     setRegion]     = useState<LolPlatformRegion>("euw1");
  const [pending,    startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "profiles", uid, "integrations", "league"));
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data() as { account?: LinkedSummary };
          if (data.account) setLinked(data.account);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [uid]);

  const handleLink = () => {
    startTransition(async () => {
      const res = await linkLeagueAccount(uid, riotId, region);
      if (res.success && res.data) {
        setLinked({ gameName: res.data.gameName, tagLine: res.data.tagLine, region });
        setRiotId("");
        toast.success(`Linked ${res.data.gameName}#${res.data.tagLine}`);
      } else {
        toast.error(res.error ?? "Failed to link");
      }
    });
  };

  const handleUnlink = () => {
    if (!window.confirm("Unlink your League of Legends account? Your cached stats will be deleted.")) return;
    startTransition(async () => {
      const res = await unlinkLeagueAccount(uid);
      if (res.success) {
        setLinked(null);
        toast.success("Unlinked");
      } else {
        toast.error(res.error ?? "Failed to unlink");
      }
    });
  };

  if (loading) {
    return (
      <div
        className="rounded-xl px-4 py-3 flex items-center gap-2"
        style={{
          background: "var(--bg-elevated)",
          border:     "1px solid var(--border-default)",
        }}
      >
        <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-muted)" }} />
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Loading…</span>
      </div>
    );
  }

  if (linked) {
    return (
      <div
        className="rounded-xl px-4 py-3 flex items-center gap-3"
        style={{
          background: "var(--bg-elevated)",
          border:     "1px solid var(--border-default)",
        }}
      >
        <div
          className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
          style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.30)" }}
        >
          <LinkIcon size={15} style={{ color: "var(--accent)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            League of Legends
          </p>
          <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
            {linked.gameName}#{linked.tagLine} · {(linked.region ?? "").toUpperCase()}
          </p>
        </div>
        <button
          type="button"
          onClick={handleUnlink}
          disabled={pending}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          style={{
            background: "var(--bg-surface)",
            border:     "1px solid var(--border-default)",
            color:      "var(--danger)",
          }}
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />}
          Unlink
        </button>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: "var(--bg-elevated)",
        border:     "1px solid var(--border-default)",
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
          style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-subtle)" }}
        >
          <LinkIcon size={15} style={{ color: "var(--text-muted)" }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Link League of Legends
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Show your rank, W/L and top champions on your profile.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
        <input
          type="text"
          value={riotId}
          onChange={e => setRiotId(e.target.value)}
          placeholder="Name#TAG"
          className="w-full rounded-lg text-sm outline-none"
          style={{
            background:   "var(--bg-surface)",
            border:       "1px solid var(--border-default)",
            color:        "var(--text-primary)",
            borderRadius: 8,
            padding:      "9px 12px",
            fontSize:     13,
          }}
        />
        <select
          value={region}
          onChange={e => setRegion(e.target.value as LolPlatformRegion)}
          className="w-full rounded-lg text-sm outline-none"
          style={{
            background:   "var(--bg-surface)",
            border:       "1px solid var(--border-default)",
            color:        "var(--text-primary)",
            borderRadius: 8,
            padding:      "9px 12px",
            fontSize:     13,
          }}
        >
          {LOL_PLATFORM_REGIONS.map(r => (
            <option key={r} value={r}>{PLATFORM_LABELS[r]}</option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={handleLink}
        disabled={pending || riotId.trim().length === 0}
        className="self-end inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
        style={{ background: "var(--accent)" }}
      >
        {pending && <Loader2 size={14} className="animate-spin" />}
        Link Account
      </button>
    </div>
  );
}
