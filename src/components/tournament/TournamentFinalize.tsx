"use client";

// ─── TournamentFinalize ───────────────────────────────────────────────────────
// Creator-facing button + modal for declaring final standings. The number of
// winner slots matches the prizeSplit preset (1 / 3 / 4 / 5). Calling
// finalizeTournament writes the PrizePayout docs and flips status to "complete".

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import { finalizeTournament } from "@/lib/actions/tournament-payment.actions";
import {
  computePayouts,
  formatPence,
  getPresetLabel,
  getPresetPositionsCount,
  positionLabel,
} from "@/lib/prize-splits";
import type { PrizeSplit } from "@/types";

interface ParticipantOption {
  userId:      string;
  displayName: string;
}

interface Props {
  tournamentId:    string;
  currentUid:      string;
  prizeSplit:      PrizeSplit | null;   // null = no prize pool defined
  prizePool:       number;              // in pence
  participants:    ParticipantOption[];
  participantCount: number;
}

export function TournamentFinalize({
  tournamentId,
  currentUid,
  prizeSplit,
  prizePool,
  participants,
  participantCount,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Number of placements to fill = preset's max OR 1 when no split set,
  // capped by actual participants.
  const targetSlots = useMemo(() => {
    const presetCount = prizeSplit ? getPresetPositionsCount(prizeSplit) : 1;
    return Math.min(presetCount, participantCount);
  }, [prizeSplit, participantCount]);

  const [slots, setSlots] = useState<string[]>(() => Array(targetSlots).fill(""));

  // Keep slots length in sync if target changes (e.g. tournament shrank).
  // useMemo doesn't help here — useEffect-style sync without an effect:
  if (slots.length !== targetSlots) {
    setSlots(prev => {
      const next = prev.slice(0, targetSlots);
      while (next.length < targetSlots) next.push("");
      return next;
    });
  }

  const payouts = prizeSplit && prizePool > 0
    ? computePayouts(prizePool, prizeSplit).slice(0, targetSlots)
    : Array(targetSlots).fill(null);

  const allFilled  = slots.every(s => s !== "");
  const noDupes    = new Set(slots.filter(Boolean)).size === slots.filter(Boolean).length;
  const canSubmit  = allFilled && noDupes && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    const result = await finalizeTournament(currentUid, tournamentId, slots);
    if (!result.success) {
      toast.error(result.error ?? "Could not finalize tournament");
      setBusy(false);
      return;
    }
    if (result.data?.prizesCreated && result.data.prizesCreated > 0) {
      toast.success(`Tournament finalized — ${result.data.prizesCreated} prize(s) ready to claim.`);
    } else {
      toast.success("Tournament finalized.");
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all"
          style={{
            background: "var(--warning)",
            boxShadow:  "0 0 16px rgba(245,158,11,0.25)",
          }}
        >
          <Trophy size={15} />
          Finalize Tournament
        </button>
      ) : (
        <div
          className="rounded-2xl p-5 flex flex-col gap-4"
          style={{
            background: "var(--bg-surface)",
            border:     "1px solid var(--border-default)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display font-bold text-base" style={{ color: "var(--text-primary)" }}>
                Finalize Tournament
              </h3>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                {prizeSplit
                  ? <>Pick the top {targetSlots} placers. Prize split: <strong style={{ color: "var(--text-secondary)" }}>{getPresetLabel(prizeSplit)}</strong></>
                  : <>Pick the tournament winner.</>}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 p-1 rounded transition-colors"
              style={{ color: "var(--text-muted)" }}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {slots.map((value, i) => {
              const payout = payouts[i];
              return (
                <div key={i} className="flex items-center gap-2">
                  <span
                    className="shrink-0 w-10 text-center text-xs font-semibold"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {positionLabel(i + 1)}
                  </span>
                  <select
                    value={value}
                    onChange={e => setSlots(prev => prev.map((v, j) => (j === i ? e.target.value : v)))}
                    className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                    style={{
                      background: "var(--bg-elevated)",
                      border:     "1px solid var(--border-default)",
                      color:      "var(--text-primary)",
                    }}
                  >
                    <option value="">— select participant —</option>
                    {participants.map(p => (
                      <option key={p.userId} value={p.userId}>{p.displayName}</option>
                    ))}
                  </select>
                  {payout && (
                    <span
                      className="shrink-0 text-xs font-semibold"
                      style={{ color: "var(--warning)" }}
                    >
                      {formatPence(payout.amount)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {!noDupes && (
            <p className="text-xs" style={{ color: "var(--danger)" }}>
              The same participant can&apos;t appear in two positions.
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--accent)" }}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? "Finalizing…" : "Confirm Standings"}
          </button>
        </div>
      )}
    </>
  );
}
