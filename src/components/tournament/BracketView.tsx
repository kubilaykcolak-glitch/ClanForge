"use client";

import { useState, useTransition } from "react";
import { Copy, Check, Wrench, Loader2, X, Flag, ThumbsUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { TournamentMatch } from "@/types";
import {
  regenerateMatchCode,
  simulateRiotMatchResult,
  adminFinalizeMatch,
} from "@/lib/actions/riot-tournament.actions";
import {
  reportMatchResult,
  confirmMatchResult,
  disputeMatch,
} from "@/lib/actions/tournament.actions";

interface BracketViewProps {
  matches:          TournamentMatch[];
  participantNames: Record<string, string>;          // userId → displayName
  tournamentId?:    string;
  isCreatorOrAdmin?: boolean;
  isLol?:           boolean;
  /** Viewer's signed-in UID (undefined for anonymous). Used to decide which
   *  participant-facing panel to render on `pending` / `pending_confirmation` /
   *  `disputed` matches. */
  viewerUid?:       string;
}

// ── Placeholder bracket ───────────────────────────────────────────────────────

function PlaceholderBracket() {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <div className="flex items-center gap-4 opacity-25 mb-6 select-none">
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="w-24 h-7 rounded"
              style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)" }} />
          ))}
        </div>
        <div className="flex flex-col gap-11">
          {[0, 1].map(i => (
            <div key={i} className="w-24 h-7 rounded"
              style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)" }} />
          ))}
        </div>
        <div className="w-24 h-7 rounded"
          style={{ background: "var(--bg-overlay)", border: "1px solid var(--accent)" }} />
      </div>
      <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
        Bracket will be generated when registration closes
      </p>
    </div>
  );
}

// ── Tournament code chip ─────────────────────────────────────────────────────

function TournamentCodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — user can still read the code */ }
  };

  return (
    <div
      title="Tournament code — paste in your LoL client: Play → Tournaments"
      className="flex items-center gap-1 px-2 py-1 border-t text-[10px]"
      style={{
        background:   "rgba(99,102,241,0.08)",
        borderColor:  "var(--border-subtle)",
        color:        "var(--accent)",
      }}
    >
      <span className="font-mono truncate flex-1" style={{ fontSize: 9 }}>
        {code}
      </span>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 p-0.5 rounded transition-colors"
        style={{ color: "var(--text-muted)" }}
        aria-label="Copy tournament code"
      >
        {copied ? <Check size={10} /> : <Copy size={10} />}
      </button>
    </div>
  );
}

// ── Match admin panel ────────────────────────────────────────────────────────
//
// Inline panel shown to the tournament creator (or platform admin) below a
// match box. Lets them resolve common LoL-specific situations without leaving
// the bracket view:
//
//   • Regenerate code — for replays or when a code can't accept results
//     (e.g. teams started a different lobby by mistake).
//   • Simulate result — before Tournament-V5 production approval the stub
//     never sends real callbacks, so this lets us exercise the full XP /
//     missions / bracket-advance chain end-to-end in dev/staging.
//   • Force winner — manual override for disputed / unresolvable matches.

function MatchAdminPanel({
  tournamentId,
  match,
  nameA,
  nameB,
  onClose,
}: {
  tournamentId: string;
  match:        TournamentMatch;
  nameA:        string;
  nameB:        string;
  onClose:      () => void;
}) {
  const [pending, startTransition] = useTransition();

  const callAction = async <T,>(fn: () => Promise<{ success: boolean; data?: T; error?: string }>, successMsg: string) => {
    const res = await fn();
    if (res.success) {
      toast.success(successMsg);
      onClose();
    } else {
      toast.error(res.error ?? "Action failed");
    }
  };

  const regen = () => startTransition(() => {
    void callAction(() => regenerateMatchCode(tournamentId, match.id as string), "New code minted");
  });
  const simulate = (winnerId: string) => startTransition(() => {
    void callAction(() => simulateRiotMatchResult(tournamentId, match.id as string, winnerId), "Result simulated");
  });
  const forceWinner = (winnerId: string) => startTransition(() => {
    if (!window.confirm(`Force ${winnerId === match.participantAId ? nameA : nameB} as the winner? This bypasses Riot's auto-verification.`)) return;
    const scoreA = winnerId === match.participantAId ? 1 : 0;
    const scoreB = winnerId === match.participantBId ? 1 : 0;
    void callAction(() => adminFinalizeMatch(tournamentId, match.id as string, winnerId, scoreA, scoreB), "Match finalised");
  });

  return (
    <div
      className="border-t px-2 py-2 flex flex-col gap-1.5"
      style={{ background: "rgba(99,102,241,0.04)", borderColor: "var(--border-subtle)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
          Admin
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="p-0.5 rounded"
          style={{ color: "var(--text-muted)" }}
        >
          <X size={10} />
        </button>
      </div>

      {match.status !== "complete" && (
        <>
          <button
            type="button"
            onClick={regen}
            disabled={pending}
            className="text-[10px] px-2 py-1 rounded font-medium transition-colors disabled:opacity-50 text-left"
            style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
          >
            {pending ? <Loader2 size={9} className="inline animate-spin mr-1" /> : null}
            Regenerate code
          </button>

          <div className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Simulate winner
            </span>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                disabled={pending || !match.participantAId || match.participantAId === "BYE"}
                onClick={() => simulate(match.participantAId as string)}
                className="text-[10px] px-2 py-1 rounded font-medium truncate disabled:opacity-40"
                style={{ background: "rgba(99,102,241,0.10)", color: "var(--accent)", border: "1px solid rgba(99,102,241,0.30)" }}
              >
                {nameA}
              </button>
              <button
                type="button"
                disabled={pending || !match.participantBId || match.participantBId === "BYE"}
                onClick={() => simulate(match.participantBId as string)}
                className="text-[10px] px-2 py-1 rounded font-medium truncate disabled:opacity-40"
                style={{ background: "rgba(99,102,241,0.10)", color: "var(--accent)", border: "1px solid rgba(99,102,241,0.30)" }}
              >
                {nameB}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1 mt-1">
            <span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Force winner
            </span>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                disabled={pending || !match.participantAId || match.participantAId === "BYE"}
                onClick={() => forceWinner(match.participantAId as string)}
                className="text-[10px] px-2 py-1 rounded font-medium truncate disabled:opacity-40"
                style={{ background: "var(--bg-elevated)", color: "var(--warning)", border: "1px solid rgba(245,158,11,0.30)" }}
              >
                {nameA}
              </button>
              <button
                type="button"
                disabled={pending || !match.participantBId || match.participantBId === "BYE"}
                onClick={() => forceWinner(match.participantBId as string)}
                className="text-[10px] px-2 py-1 rounded font-medium truncate disabled:opacity-40"
                style={{ background: "var(--bg-elevated)", color: "var(--warning)", border: "1px solid rgba(245,158,11,0.30)" }}
              >
                {nameB}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Participant report panel ─────────────────────────────────────────────────
//
// Rendered inside a non-LoL `pending` MatchBox when the viewer is one of the
// two participants. Lets them stage a result claim — the OPPONENT must
// confirm before the match finalises (audit fix H4).

function ParticipantReportPanel({
  tournamentId,
  match,
  viewerUid,
  nameA,
  nameB,
}: {
  tournamentId: string;
  match:        TournamentMatch;
  viewerUid:    string;
  nameA:        string;
  nameB:        string;
}) {
  const [open, setOpen]     = useState(false);
  const [scoreA, setScoreA] = useState<string>("");
  const [scoreB, setScoreB] = useState<string>("");
  const [winnerOverride, setWinnerOverride] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const nA = Number(scoreA);
  const nB = Number(scoreB);
  const validNumeric =
    Number.isFinite(nA) && Number.isFinite(nB) &&
    nA >= 0 && nB >= 0 && nA <= 99 && nB <= 99 &&
    scoreA !== "" && scoreB !== "";
  const inferredWinner =
    !validNumeric ? null :
    nA > nB ? match.participantAId :
    nB > nA ? match.participantBId :
    winnerOverride;
  const canSubmit = validNumeric && !!inferredWinner && !pending;

  const submit = () => {
    if (!canSubmit || !inferredWinner) return;
    startTransition(async () => {
      const res = await reportMatchResult(viewerUid, tournamentId, match.id as string, nA, nB, inferredWinner);
      if (res.success) {
        toast.success("Result submitted — waiting on your opponent to confirm");
        setOpen(false);
      } else {
        toast.error(res.error ?? "Could not submit result");
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1 py-1 border-t text-[10px] font-semibold transition-colors"
        style={{
          background:  "rgba(99,102,241,0.06)",
          color:       "var(--accent)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <Flag size={10} /> Report result
      </button>
    );
  }

  const tied = validNumeric && nA === nB;

  return (
    <div
      className="border-t px-2 py-2 flex flex-col gap-1.5"
      style={{ background: "rgba(99,102,241,0.04)", borderColor: "var(--border-subtle)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
          Report Result
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="p-0.5 rounded"
          style={{ color: "var(--text-muted)" }}
        >
          <X size={10} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-wider truncate" style={{ color: "var(--text-muted)" }}>{nameA}</span>
          <input
            type="number"
            min={0}
            max={99}
            inputMode="numeric"
            value={scoreA}
            onChange={e => setScoreA(e.target.value)}
            className="w-full px-1.5 py-1 rounded text-xs text-center tabular-nums focus:outline-none focus:ring-1"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
            }}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-wider truncate" style={{ color: "var(--text-muted)" }}>{nameB}</span>
          <input
            type="number"
            min={0}
            max={99}
            inputMode="numeric"
            value={scoreB}
            onChange={e => setScoreB(e.target.value)}
            className="w-full px-1.5 py-1 rounded text-xs text-center tabular-nums focus:outline-none focus:ring-1"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
            }}
          />
        </label>
      </div>

      {tied && (
        <div className="flex flex-col gap-1">
          <span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--warning)" }}>Tie — pick winner</span>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setWinnerOverride(match.participantAId as string)}
              className="text-[10px] px-2 py-1 rounded font-medium truncate"
              style={{
                background: winnerOverride === match.participantAId ? "rgba(99,102,241,0.20)" : "var(--bg-elevated)",
                color: winnerOverride === match.participantAId ? "var(--accent)" : "var(--text-secondary)",
                border: `1px solid ${winnerOverride === match.participantAId ? "var(--accent)" : "var(--border-default)"}`,
              }}
            >
              {nameA}
            </button>
            <button
              type="button"
              onClick={() => setWinnerOverride(match.participantBId as string)}
              className="text-[10px] px-2 py-1 rounded font-medium truncate"
              style={{
                background: winnerOverride === match.participantBId ? "rgba(99,102,241,0.20)" : "var(--bg-elevated)",
                color: winnerOverride === match.participantBId ? "var(--accent)" : "var(--text-secondary)",
                border: `1px solid ${winnerOverride === match.participantBId ? "var(--accent)" : "var(--border-default)"}`,
              }}
            >
              {nameB}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="text-[10px] px-2 py-1 rounded font-semibold transition-colors disabled:opacity-40"
        style={{
          background: "var(--accent)",
          color: "white",
          border: "1px solid var(--accent)",
        }}
      >
        {pending ? <Loader2 size={9} className="inline animate-spin mr-1" /> : null}
        Submit for confirmation
      </button>
      <p className="text-[9px] leading-snug" style={{ color: "var(--text-muted)" }}>
        Your opponent will see this and confirm or dispute.
      </p>
    </div>
  );
}

// ── Confirm / dispute panel (opponent view) ──────────────────────────────────
//
// Rendered when the match is `pending_confirmation` and the viewer is the
// participant who did NOT report. Two buttons + an inline dispute textarea.

function ConfirmDisputePanel({
  tournamentId,
  match,
  viewerUid,
  reporterName,
}: {
  tournamentId: string;
  match:        TournamentMatch;
  viewerUid:    string;
  reporterName: string;
}) {
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    startTransition(async () => {
      const res = await confirmMatchResult(tournamentId, match.id as string);
      if (res.success) toast.success("Result confirmed");
      else toast.error(res.error ?? "Could not confirm");
    });
  };
  const dispute = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error("Please add a brief reason");
      return;
    }
    if (!window.confirm("Send this to an admin? The match will be paused until they resolve it.")) return;
    startTransition(async () => {
      const res = await disputeMatch(viewerUid, tournamentId, match.id as string, trimmed);
      if (res.success) {
        toast.success("Dispute opened — an admin will review");
        setDisputeOpen(false);
      } else {
        toast.error(res.error ?? "Could not open dispute");
      }
    });
  };

  return (
    <div
      className="border-t px-2 py-2 flex flex-col gap-1.5"
      style={{ background: "rgba(245,158,11,0.06)", borderColor: "var(--border-subtle)" }}
    >
      <div className="flex items-center gap-1.5">
        <AlertTriangle size={11} style={{ color: "var(--warning)" }} />
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--warning)" }}>
          Action needed
        </span>
      </div>
      <p className="text-[10px] leading-snug" style={{ color: "var(--text-secondary)" }}>
        <strong style={{ color: "var(--text-primary)" }}>{reporterName}</strong> reported{" "}
        <span className="tabular-nums font-mono">{match.reportedScoreA}–{match.reportedScoreB}</span>.
        Confirm if accurate, dispute if not.
      </p>

      {!disputeOpen ? (
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="text-[10px] px-2 py-1 rounded font-semibold transition-colors disabled:opacity-40"
            style={{
              background: "var(--success)",
              color: "white",
              border: "1px solid var(--success)",
            }}
          >
            {pending ? <Loader2 size={9} className="inline animate-spin mr-1" /> : <ThumbsUp size={9} className="inline mr-1" />}
            Confirm
          </button>
          <button
            type="button"
            onClick={() => setDisputeOpen(true)}
            disabled={pending}
            className="text-[10px] px-2 py-1 rounded font-semibold transition-colors disabled:opacity-40"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--warning)",
              border: "1px solid rgba(245,158,11,0.4)",
            }}
          >
            Dispute
          </button>
        </div>
      ) : (
        <>
          <textarea
            value={reason}
            maxLength={500}
            placeholder="What's wrong with the reported result?"
            onChange={e => setReason(e.target.value)}
            rows={3}
            className="w-full px-1.5 py-1 rounded text-[10px] resize-none focus:outline-none focus:ring-1"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[9px] tabular-nums" style={{ color: "var(--text-muted)" }}>
              {reason.length}/500
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => { setDisputeOpen(false); setReason(""); }}
                className="text-[10px] px-2 py-1 rounded"
                style={{ background: "transparent", color: "var(--text-muted)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={dispute}
                disabled={pending || !reason.trim()}
                className="text-[10px] px-2 py-1 rounded font-semibold disabled:opacity-40"
                style={{
                  background: "var(--warning)",
                  color: "white",
                  border: "1px solid var(--warning)",
                }}
              >
                {pending ? <Loader2 size={9} className="inline animate-spin mr-1" /> : null}
                Send dispute
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── My pending claim panel (reporter view) ───────────────────────────────────
//
// Rendered when the match is `pending_confirmation` and the viewer IS the
// reporter. Read-only summary + a dispute option (in case they realise their
// opponent isn't going to confirm in good faith).

function MyPendingClaimPanel({
  tournamentId,
  match,
  viewerUid,
}: {
  tournamentId: string;
  match:        TournamentMatch;
  viewerUid:    string;
}) {
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const dispute = () => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    if (!window.confirm("Send this to an admin? The match will be paused until they resolve it.")) return;
    startTransition(async () => {
      const res = await disputeMatch(viewerUid, tournamentId, match.id as string, trimmed);
      if (res.success) toast.success("Dispute opened");
      else toast.error(res.error ?? "Could not open dispute");
    });
  };

  return (
    <div
      className="border-t px-2 py-2 flex flex-col gap-1"
      style={{ background: "rgba(99,102,241,0.04)", borderColor: "var(--border-subtle)" }}
    >
      <div className="flex items-center gap-1.5">
        <Loader2 size={10} className="animate-spin" style={{ color: "var(--accent)" }} />
        <span className="text-[10px] font-medium" style={{ color: "var(--text-secondary)" }}>
          Awaiting opponent confirmation
        </span>
      </div>
      <p className="text-[9px] leading-snug" style={{ color: "var(--text-muted)" }}>
        You reported <span className="font-mono">{match.reportedScoreA}–{match.reportedScoreB}</span>.
      </p>
      {!disputeOpen ? (
        <button
          type="button"
          onClick={() => setDisputeOpen(true)}
          className="text-[9px] underline self-start"
          style={{ color: "var(--text-muted)" }}
        >
          Opponent not responding?
        </button>
      ) : (
        <div className="flex flex-col gap-1 mt-1">
          <textarea
            value={reason}
            maxLength={500}
            placeholder="Reason (admin will review)"
            onChange={e => setReason(e.target.value)}
            rows={2}
            className="w-full px-1.5 py-1 rounded text-[10px] resize-none focus:outline-none focus:ring-1"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
            }}
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => { setDisputeOpen(false); setReason(""); }}
              className="text-[10px] px-2 py-0.5 rounded"
              style={{ color: "var(--text-muted)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={dispute}
              disabled={pending || !reason.trim()}
              className="text-[10px] px-2 py-0.5 rounded font-semibold disabled:opacity-40"
              style={{ background: "var(--warning)", color: "white" }}
            >
              {pending ? <Loader2 size={9} className="inline animate-spin mr-1" /> : null}
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dispute reason chip (visible to participants) ────────────────────────────

function DisputeReasonChip({ match, viewerUid }: { match: TournamentMatch; viewerUid: string }) {
  const isParticipant = match.participantAId === viewerUid || match.participantBId === viewerUid;
  if (!isParticipant || !match.disputeReason) return null;
  return (
    <div
      className="border-t px-2 py-1.5"
      style={{ background: "rgba(245,158,11,0.04)", borderColor: "var(--border-subtle)" }}
    >
      <p className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: "var(--warning)" }}>
        Reason
      </p>
      <p className="text-[10px] leading-snug break-words" style={{ color: "var(--text-secondary)" }}>
        {match.disputeReason}
      </p>
    </div>
  );
}

// ── Match box ─────────────────────────────────────────────────────────────────

function MatchBox({
  match,
  participantNames,
  tournamentId,
  isCreatorOrAdmin,
  isLol,
  viewerUid,
}: {
  match:             TournamentMatch;
  participantNames:  Record<string, string>;
  tournamentId?:     string;
  isCreatorOrAdmin?: boolean;
  isLol?:            boolean;
  viewerUid?:        string;
}) {
  const [adminOpen, setAdminOpen] = useState(false);

  const nameA = match.participantAId
    ? (participantNames[match.participantAId] ?? "TBD")
    : "TBD";
  const nameB = match.participantBId
    ? (participantNames[match.participantBId] ?? "TBD")
    : "TBD";
  const aWins = match.status === "complete" && match.winnerId === match.participantAId;
  const bWins = match.status === "complete" && match.winnerId === match.participantBId;

  const showCode = isLol
    && match.status !== "complete"
    && match.participantBId !== "BYE"
    && !!match.riotTournamentCode;
  const showAdminToggle = isLol && isCreatorOrAdmin && !!tournamentId
    && match.status !== "complete"
    && match.participantBId !== "BYE";

  // ─── Participant-facing H4 panels (non-LoL only — LoL auto-finalises) ───
  const bothAssigned = !!match.participantAId && !!match.participantBId
    && match.participantAId !== "BYE" && match.participantBId !== "BYE";
  const viewerIsParticipant = !!viewerUid && bothAssigned
    && (match.participantAId === viewerUid || match.participantBId === viewerUid);
  const showParticipantUi = !isLol && !!tournamentId && viewerIsParticipant;
  const viewerIsReporter = showParticipantUi && match.reportedBy === viewerUid;

  const reporterName = match.reportedBy
    ? (participantNames[match.reportedBy] ?? "Opponent")
    : "Opponent";

  return (
    <div
      id={match.id ? `match-${match.id}` : undefined}
      className="rounded-lg overflow-hidden text-xs scroll-mt-24"
      style={{
        background: "var(--bg-elevated)",
        border: `1px solid ${match.status === "disputed" ? "var(--warning)" : "var(--border-default)"}`,
        minWidth: 140,
      }}
    >
      {/* Status / source badges */}
      {match.status === "disputed" && (
        <div
          className="px-2 py-0.5 text-center text-[10px] font-semibold"
          style={{ background: "rgba(245,158,11,0.1)", color: "var(--warning)" }}
        >
          DISPUTED
        </div>
      )}
      {(match.resultSource === "riot_callback" || match.resultSource === "riot_poll") && (
        <div
          className="px-2 py-0.5 text-center text-[10px] font-semibold"
          style={{ background: "rgba(34,197,94,0.10)", color: "var(--success)" }}
          title="Result verified automatically by Riot"
        >
          AUTO-VERIFIED
        </div>
      )}
      {match.resultSource === "admin_simulate" && (
        <div
          className="px-2 py-0.5 text-center text-[10px] font-semibold"
          style={{ background: "rgba(139,92,246,0.10)", color: "var(--violet)" }}
          title="Result was simulated by an admin (dev/stub)"
        >
          SIMULATED
        </div>
      )}
      {match.resultSource === "admin_override" && (
        <div
          className="px-2 py-0.5 text-center text-[10px] font-semibold"
          style={{ background: "rgba(99,102,241,0.10)", color: "var(--accent)" }}
          title="Result manually finalised by an admin"
        >
          ADMIN OVERRIDE
        </div>
      )}

      {/* Participant rows */}
      <div
        className="flex items-center justify-between px-2.5 py-1.5"
        style={{
          background: aWins ? "rgba(99,102,241,0.08)" : "transparent",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <span
          className="font-medium truncate max-w-[80px]"
          style={{ color: aWins ? "var(--accent)" : "var(--text-primary)" }}
        >
          {nameA}
        </span>
        {match.status === "complete" && (
          <span className="ml-2 font-bold tabular-nums"
            style={{ color: aWins ? "var(--accent)" : "var(--text-muted)" }}>
            {match.scoreA}
          </span>
        )}
      </div>
      <div
        className="flex items-center justify-between px-2.5 py-1.5"
        style={{ background: bWins ? "rgba(99,102,241,0.08)" : "transparent" }}
      >
        <span
          className="font-medium truncate max-w-[80px]"
          style={{ color: bWins ? "var(--accent)" : "var(--text-primary)" }}
        >
          {nameB}
        </span>
        {match.status === "complete" && (
          <span className="ml-2 font-bold tabular-nums"
            style={{ color: bWins ? "var(--accent)" : "var(--text-muted)" }}>
            {match.scoreB}
          </span>
        )}
      </div>

      {showCode && <TournamentCodeChip code={match.riotTournamentCode as string} />}

      {/* H4 participant-facing panels (non-LoL). Ordered by match status. */}
      {showParticipantUi && match.status === "pending" && tournamentId && viewerUid && (
        <ParticipantReportPanel
          tournamentId={tournamentId}
          match={match}
          viewerUid={viewerUid}
          nameA={nameA}
          nameB={nameB}
        />
      )}
      {showParticipantUi && match.status === "pending_confirmation" && tournamentId && viewerUid && (
        viewerIsReporter ? (
          <MyPendingClaimPanel
            tournamentId={tournamentId}
            match={match}
            viewerUid={viewerUid}
          />
        ) : (
          <ConfirmDisputePanel
            tournamentId={tournamentId}
            match={match}
            viewerUid={viewerUid}
            reporterName={reporterName}
          />
        )
      )}
      {match.status === "pending_confirmation" && !viewerIsParticipant && match.reportedBy && (
        <div
          className="border-t px-2 py-1 text-center text-[9px]"
          style={{ background: "transparent", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
        >
          Awaiting confirmation
        </div>
      )}
      {match.status === "disputed" && viewerUid && (
        <DisputeReasonChip match={match} viewerUid={viewerUid} />
      )}

      {showAdminToggle && !adminOpen && (
        <button
          type="button"
          onClick={() => setAdminOpen(true)}
          className="w-full flex items-center justify-center gap-1 py-1 border-t text-[10px] font-semibold transition-colors"
          style={{
            background:  "transparent",
            color:       "var(--text-muted)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <Wrench size={10} /> Admin
        </button>
      )}

      {showAdminToggle && adminOpen && (
        <MatchAdminPanel
          tournamentId={tournamentId as string}
          match={match}
          nameA={nameA}
          nameB={nameB}
          onClose={() => setAdminOpen(false)}
        />
      )}
    </div>
  );
}

// ── BracketView ───────────────────────────────────────────────────────────────

export function BracketView({
  matches,
  participantNames,
  tournamentId,
  isCreatorOrAdmin,
  isLol,
  viewerUid,
}: BracketViewProps) {
  if (matches.length === 0) return <PlaceholderBracket />;

  const rounds = matches.reduce<Record<number, TournamentMatch[]>>((acc, m) => {
    if (!acc[m.round]) acc[m.round] = [];
    acc[m.round].push(m);
    return acc;
  }, {});

  const roundNumbers = Object.keys(rounds)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-6 min-w-max">
        {roundNumbers.map(round => (
          <div key={round} className="flex flex-col gap-4">
            <p
              className="text-xs font-semibold text-center uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              {round === Math.max(...roundNumbers) ? "Final" : `Round ${round}`}
            </p>

            <div
              className="flex flex-col"
              style={{ gap: round > 1 ? `${Math.pow(2, round - 1) * 16}px` : "8px" }}
            >
              {rounds[round]
                .sort((a, b) => a.matchNumber - b.matchNumber)
                .map(match => (
                  <MatchBox
                    key={match.id ?? `${round}-${match.matchNumber}`}
                    match={match}
                    participantNames={participantNames}
                    tournamentId={tournamentId}
                    isCreatorOrAdmin={isCreatorOrAdmin}
                    isLol={isLol}
                    viewerUid={viewerUid}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
