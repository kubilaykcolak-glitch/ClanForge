"use client";

import { useState, useTransition } from "react";
import { Copy, Check, Wrench, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { TournamentMatch } from "@/types";
import {
  regenerateMatchCode,
  simulateRiotMatchResult,
  adminFinalizeMatch,
} from "@/lib/actions/riot-tournament.actions";

interface BracketViewProps {
  matches:          TournamentMatch[];
  participantNames: Record<string, string>;          // userId → displayName
  tournamentId?:    string;
  isCreatorOrAdmin?: boolean;
  isLol?:           boolean;
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

// ── Match box ─────────────────────────────────────────────────────────────────

function MatchBox({
  match,
  participantNames,
  tournamentId,
  isCreatorOrAdmin,
  isLol,
}: {
  match:             TournamentMatch;
  participantNames:  Record<string, string>;
  tournamentId?:     string;
  isCreatorOrAdmin?: boolean;
  isLol?:            boolean;
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

  return (
    <div
      className="rounded-lg overflow-hidden text-xs"
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
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
