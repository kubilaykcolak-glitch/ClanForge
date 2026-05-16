"use client";

import { useEffect, useState, useTransition } from "react";
import { doc, getDoc } from "firebase/firestore";
import { CheckCircle2, Loader2, Link as LinkIcon, Unlink, X } from "lucide-react";
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
import { championIconUrl, formatRank, tierColour } from "@/lib/riot/assets";
import type { LeagueSnapshot } from "@/types/integrations";

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
  const [successData, setSuccessData] = useState<{
    gameName: string;
    tagLine:  string;
    region:   string;
    snapshot: LeagueSnapshot;
  } | null>(null);

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
        setSuccessData({
          gameName: res.data.gameName,
          tagLine:  res.data.tagLine,
          region,
          snapshot: res.data.snapshot,
        });
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

  const successModal = successData ? (
    <LinkSuccessModal
      data={successData}
      onClose={() => setSuccessData(null)}
    />
  ) : null;

  if (loading) {
    return (
      <>
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
        {successModal}
      </>
    );
  }

  if (linked) {
    return (
      <>
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
        {successModal}
      </>
    );
  }

  return (
    <>
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
    {successModal}
    </>
  );
}

// ─── Success modal ────────────────────────────────────────────────────────────
// Centered overlay shown after a Riot account has been resolved and the
// initial snapshot pulled. Confirms to the user what was fetched (rank, level,
// top champions) so the "did it work?" question is answered visually.

interface LinkSuccessModalProps {
  data: {
    gameName: string;
    tagLine:  string;
    region:   string;
    snapshot: LeagueSnapshot;
  };
  onClose: () => void;
}

function LinkSuccessModal({ data, onClose }: LinkSuccessModalProps) {
  const { gameName, tagLine, region, snapshot } = data;
  const rank   = snapshot.soloRank ?? snapshot.flexRank;
  const colour = tierColour(rank?.tier);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl p-6 flex flex-col gap-4"
        style={{
          background: "var(--bg-surface)",
          border:     "1px solid var(--border-default)",
          boxShadow:  "0 0 40px rgba(99,102,241,0.25), 0 0 80px rgba(232,121,249,0.15)",
        }}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-md transition-colors"
          style={{ color: "var(--text-muted)" }}
        >
          <X size={16} />
        </button>

        {/* Title */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{
              background: "rgba(34,197,94,0.15)",
              border:     "1px solid rgba(34,197,94,0.40)",
            }}
          >
            <CheckCircle2 size={20} style={{ color: "var(--success)" }} />
          </div>
          <div className="min-w-0">
            <h3
              className="font-display font-bold text-lg leading-tight"
              style={{ color: "var(--text-primary)" }}
            >
              Account linked
            </h3>
            <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
              {gameName}#{tagLine} · {region.toUpperCase()}
            </p>
          </div>
        </div>

        {/* Stats grid */}
        <div
          className="grid grid-cols-2 gap-3 rounded-xl p-4"
          style={{
            background: "var(--bg-elevated)",
            border:     "1px solid var(--border-subtle)",
          }}
        >
          {/* Rank */}
          <div className="col-span-2 flex items-center gap-3">
            {rank ? (
              <>
                <div
                  className="flex flex-col items-start px-3 py-1.5 rounded-lg"
                  style={{ background: `${colour}1A`, border: `1px solid ${colour}55` }}
                >
                  <span
                    className="text-xs font-bold uppercase tracking-wider leading-tight"
                    style={{ color: colour }}
                  >
                    {formatRank(rank.tier, rank.division)}
                  </span>
                  <span className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>
                    {rank.lp} LP
                  </span>
                </div>
                <div className="text-xs">
                  <span style={{ color: "var(--success)" }}>{rank.wins}W</span>
                  <span className="mx-1.5" style={{ color: "var(--text-muted)" }}>·</span>
                  <span style={{ color: "var(--danger)" }}>{rank.losses}L</span>
                </div>
              </>
            ) : (
              <span
                className="inline-block text-xs font-semibold px-2.5 py-1 rounded-md uppercase tracking-wider"
                style={{
                  background: "var(--bg-overlay)",
                  color:      "var(--text-muted)",
                  border:     "1px solid var(--border-subtle)",
                }}
              >
                Unranked
              </span>
            )}
          </div>

          {/* Level */}
          <div>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Summoner Level
            </p>
            <p
              className="font-display font-bold text-xl mt-0.5"
              style={{ color: "var(--text-primary)" }}
            >
              {snapshot.summonerLevel}
            </p>
          </div>

          {/* Top champs */}
          <div>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Top Champions
            </p>
            <div className="flex gap-1.5 mt-1">
              {snapshot.topChampions.length > 0 ? (
                snapshot.topChampions.slice(0, 3).map(c => (
                  <div
                    key={c.championId}
                    className="relative w-8 h-8 rounded-md overflow-hidden"
                    style={{ border: "1px solid var(--border-subtle)" }}
                    title={`Mastery ${c.level}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={championIconUrl(c.championId)}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))
              ) : (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>—</p>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="self-end px-5 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: "var(--accent)" }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
