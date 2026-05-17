"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { doc, getDoc } from "firebase/firestore";
import {
  CheckCircle2,
  Loader2,
  Link as LinkIcon,
  Unlink,
  X,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import {
  startLeagueLinkVerification,
  confirmLeagueLinkVerification,
  cancelLeagueLinkVerification,
  unlinkLeagueAccount,
} from "@/lib/actions/integrations.actions";
import {
  LOL_PLATFORM_REGIONS,
  PLATFORM_LABELS,
  type LolPlatformRegion,
} from "@/lib/riot/regions";
import {
  championIconUrl,
  formatRank,
  profileIconUrl,
  tierColour,
} from "@/lib/riot/assets";
import type { LeagueSnapshot } from "@/types/integrations";

// ─── LeagueLinkPanel ──────────────────────────────────────────────────────────
//
// Three view-states:
//   1. Idle / form          — enter Riot ID + region.
//   2. Verifying            — show target profile icon + instructions; wait
//                             for the user to set their LoL icon and click
//                             Confirm. We re-fetch summoner-v4 and compare.
//   3. Linked               — show summary + Unlink.

interface LeagueLinkPanelProps {
  uid: string;
}

interface LinkedSummary {
  gameName: string;
  tagLine:  string;
  region:   string;
}

interface PendingState {
  targetIconId:  number;
  initialIconId: number;
  gameName:      string;
  tagLine:       string;
  region:        LolPlatformRegion;
  expiresAt:     Date;
  ddragonVersion: string;
}

export function LeagueLinkPanel({ uid }: LeagueLinkPanelProps) {
  const [linked,      setLinked]      = useState<LinkedSummary | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [riotId,      setRiotId]      = useState("");
  const [region,      setRegion]      = useState<LolPlatformRegion>("euw1");
  const [pending,     startTransition] = useTransition();
  const [verifying,   setVerifying]   = useState<PendingState | null>(null);
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

  const handleStart = () => {
    startTransition(async () => {
      const res = await startLeagueLinkVerification(uid, riotId, region);
      if (res.success && res.data) {
        setVerifying({
          targetIconId:   res.data.targetIconId,
          initialIconId:  res.data.initialIconId,
          gameName:       res.data.gameName,
          tagLine:        res.data.tagLine,
          region,
          expiresAt:      new Date(res.data.expiresAt),
          ddragonVersion: res.data.ddragonVersion,
        });
      } else {
        toast.error(res.error ?? "Failed to start verification");
      }
    });
  };

  const handleConfirm = () => {
    startTransition(async () => {
      const res = await confirmLeagueLinkVerification(uid);
      if (res.success && res.data) {
        setLinked({ gameName: res.data.gameName, tagLine: res.data.tagLine, region });
        setVerifying(null);
        setRiotId("");
        setSuccessData({
          gameName: res.data.gameName,
          tagLine:  res.data.tagLine,
          region,
          snapshot: res.data.snapshot,
        });
      } else {
        toast.error(res.error ?? "Verification failed");
      }
    });
  };

  const handleCancelVerification = () => {
    startTransition(async () => {
      await cancelLeagueLinkVerification(uid);
      setVerifying(null);
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
    <LinkSuccessModal data={successData} onClose={() => setSuccessData(null)} />
  ) : null;

  if (loading) {
    return (
      <>
        <div
          className="rounded-xl px-4 py-3 flex items-center gap-2"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
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
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
        >
          <div
            className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
            style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.30)" }}
          >
            <ShieldCheck size={15} style={{ color: "var(--success)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
              League of Legends
              <span className="text-[10px] font-bold uppercase tracking-wider"
                title="Ownership verified via profile-icon challenge"
                style={{ color: "var(--success)" }}>
                Verified
              </span>
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

  // ── State 2: verifying ───────────────────────────────────────────────────
  if (verifying) {
    return (
      <>
        <VerificationStep
          state={verifying}
          pending={pending}
          onConfirm={handleConfirm}
          onCancel={handleCancelVerification}
        />
        {successModal}
      </>
    );
  }

  // ── State 1: idle / form ─────────────────────────────────────────────────
  return (
    <>
      <div
        className="rounded-xl p-4 flex flex-col gap-3"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
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

        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          We&apos;ll ask you to set a specific profile icon in League of Legends to prove this account belongs to you.
        </p>

        <button
          type="button"
          onClick={handleStart}
          disabled={pending || riotId.trim().length === 0}
          className="self-end inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {pending && <Loader2 size={14} className="animate-spin" />}
          Start Verification
        </button>
      </div>
      {successModal}
    </>
  );
}

// ─── VerificationStep ────────────────────────────────────────────────────────
// Shows the target profile-icon image with clear instructions and a confirm
// button. Includes a live countdown to the 10-minute expiry.

function VerificationStep({
  state,
  pending,
  onConfirm,
  onCancel,
}: {
  state:     PendingState;
  pending:   boolean;
  onConfirm: () => void;
  onCancel:  () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((state.expiresAt.getTime() - Date.now()) / 1000)),
  );
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    tickRef.current = setInterval(() => {
      setSecondsLeft(s => Math.max(0, s - 1));
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  const mm = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
  const ss = (secondsLeft % 60).toString().padStart(2, "0");

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-4"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--accent)" }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.30)" }}
        >
          <ShieldCheck size={18} style={{ color: "var(--accent)" }} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Verify {state.gameName}#{state.tagLine}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Prove this account belongs to you by changing your League profile icon.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="p-1 rounded transition-colors disabled:opacity-50"
          style={{ color: "var(--text-muted)" }}
          aria-label="Cancel verification"
        >
          <X size={14} />
        </button>
      </div>

      {/* Target icon — large and prominent */}
      <div
        className="flex items-center gap-4 rounded-xl p-4"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
      >
        <div
          className="w-20 h-20 rounded-lg overflow-hidden shrink-0"
          style={{ border: "2px solid var(--accent)", boxShadow: "0 0 20px var(--accent-glow)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={profileIconUrl(state.ddragonVersion, state.targetIconId)}
            alt={`Profile icon ${state.targetIconId}`}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
            Set your profile icon to this
          </p>
          <ol className="text-xs space-y-0.5" style={{ color: "var(--text-secondary)" }}>
            <li>1. Open the League of Legends client.</li>
            <li>2. Click your profile icon (top-left).</li>
            <li>3. Pick this icon and apply it.</li>
            <li>4. Click <strong>Confirm</strong> below.</li>
          </ol>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-mono" style={{ color: secondsLeft < 60 ? "var(--danger)" : "var(--text-muted)" }}>
          Expires in {mm}:{ss}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            style={{
              background: "var(--bg-surface)",
              border:     "1px solid var(--border-default)",
              color:      "var(--text-secondary)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending || secondsLeft === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {pending && <Loader2 size={12} className="animate-spin" />}
            I&apos;ve changed my icon → Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Success modal (unchanged from previous version) ─────────────────────────

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
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-md transition-colors"
          style={{ color: "var(--text-muted)" }}
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.40)" }}
          >
            <CheckCircle2 size={20} style={{ color: "var(--success)" }} />
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-bold text-lg leading-tight" style={{ color: "var(--text-primary)" }}>
              Verified &amp; linked
            </h3>
            <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
              {gameName}#{tagLine} · {region.toUpperCase()}
            </p>
          </div>
        </div>

        <div
          className="grid grid-cols-2 gap-3 rounded-xl p-4"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
        >
          <div className="col-span-2 flex items-center gap-3">
            {rank ? (
              <>
                <div className="flex flex-col items-start px-3 py-1.5 rounded-lg"
                  style={{ background: `${colour}1A`, border: `1px solid ${colour}55` }}>
                  <span className="text-xs font-bold uppercase tracking-wider leading-tight" style={{ color: colour }}>
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
                style={{ background: "var(--bg-overlay)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
              >
                Unranked
              </span>
            )}
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Summoner Level
            </p>
            <p className="font-display font-bold text-xl mt-0.5" style={{ color: "var(--text-primary)" }}>
              {snapshot.summonerLevel}
            </p>
          </div>

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
