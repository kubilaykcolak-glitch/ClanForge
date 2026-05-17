"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { TournamentMatch } from "@/types";

interface BracketViewProps {
  matches:          TournamentMatch[];
  participantNames: Record<string, string>; // userId → displayName
}

// ── Placeholder bracket ───────────────────────────────────────────────────────

function PlaceholderBracket() {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      {/* CSS bracket illustration */}
      <div className="flex items-center gap-4 opacity-25 mb-6 select-none">
        {/* Round 1 */}
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className="w-24 h-7 rounded"
              style={{
                background: "var(--bg-overlay)",
                border: "1px solid var(--border-default)",
              }}
            />
          ))}
        </div>

        {/* → */}
        <div className="flex flex-col gap-11">
          {[0, 1].map(i => (
            <div
              key={i}
              className="w-24 h-7 rounded"
              style={{
                background: "var(--bg-overlay)",
                border: "1px solid var(--border-default)",
              }}
            />
          ))}
        </div>

        {/* Final */}
        <div
          className="w-24 h-7 rounded"
          style={{
            background: "var(--bg-overlay)",
            border: "1px solid var(--accent)",
          }}
        />
      </div>

      <p
        className="text-sm font-medium"
        style={{ color: "var(--text-muted)" }}
      >
        Bracket will be generated when registration closes
      </p>
    </div>
  );
}

// ── Tournament code chip ─────────────────────────────────────────────────────
//
// LoL-only. Shows the Riot tournament code with a copy button. Both
// participants paste the code into their LoL client (Play → Tournament) to
// join the auto-configured custom lobby.

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

// ── Match box ─────────────────────────────────────────────────────────────────

function MatchBox({
  match,
  participantNames,
}: {
  match:            TournamentMatch;
  participantNames: Record<string, string>;
}) {
  const nameA    = match.participantAId
    ? (participantNames[match.participantAId] ?? "TBD")
    : "TBD";
  const nameB    = match.participantBId
    ? (participantNames[match.participantBId] ?? "TBD")
    : "TBD";
  const aWins    = match.status === "complete" && match.winnerId === match.participantAId;
  const bWins    = match.status === "complete" && match.winnerId === match.participantBId;

  const showCode = match.status !== "complete"
    && match.participantBId !== "BYE"
    && !!match.riotTournamentCode;

  return (
    <div
      className="rounded-lg overflow-hidden text-xs"
      style={{
        background: "var(--bg-elevated)",
        border: `1px solid ${match.status === "disputed" ? "var(--warning)" : "var(--border-default)"}`,
        minWidth: 140,
      }}
    >
      {/* Disputed badge */}
      {match.status === "disputed" && (
        <div
          className="px-2 py-0.5 text-center text-[10px] font-semibold"
          style={{ background: "rgba(245,158,11,0.1)", color: "var(--warning)" }}
        >
          DISPUTED
        </div>
      )}

      {/* Auto-verify badge (LoL only) */}
      {match.resultSource === "riot_callback" && (
        <div
          className="px-2 py-0.5 text-center text-[10px] font-semibold"
          style={{ background: "rgba(34,197,94,0.10)", color: "var(--success)" }}
          title="Result verified automatically by Riot"
        >
          AUTO-VERIFIED
        </div>
      )}

      {/* Participant A */}
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
          <span
            className="ml-2 font-bold tabular-nums"
            style={{ color: aWins ? "var(--accent)" : "var(--text-muted)" }}
          >
            {match.scoreA}
          </span>
        )}
      </div>

      {/* Participant B */}
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
          <span
            className="ml-2 font-bold tabular-nums"
            style={{ color: bWins ? "var(--accent)" : "var(--text-muted)" }}
          >
            {match.scoreB}
          </span>
        )}
      </div>

      {/* Tournament code (LoL only, before completion) */}
      {showCode && <TournamentCodeChip code={match.riotTournamentCode as string} />}
    </div>
  );
}

// ── BracketView ───────────────────────────────────────────────────────────────

export function BracketView({ matches, participantNames }: BracketViewProps) {
  if (matches.length === 0) return <PlaceholderBracket />;

  // Group matches by round
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
            {/* Round label */}
            <p
              className="text-xs font-semibold text-center uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              {round === Math.max(...roundNumbers) ? "Final" : `Round ${round}`}
            </p>

            {/* Matches */}
            <div
              className="flex flex-col"
              style={{
                gap: round > 1 ? `${Math.pow(2, round - 1) * 16}px` : "8px",
              }}
            >
              {rounds[round]
                .sort((a, b) => a.matchNumber - b.matchNumber)
                .map(match => (
                  <MatchBox
                    key={match.id ?? `${round}-${match.matchNumber}`}
                    match={match}
                    participantNames={participantNames}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
