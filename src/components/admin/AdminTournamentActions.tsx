"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  forceFinalizeTournament,
  forceCancelTournament,
} from "@/lib/actions/admin-tournament.actions";
import { useStepUp } from "@/components/admin/useStepUp";

interface Props {
  tournamentId:         string;
  canForce:             boolean;
  participantCount:     number;
  paidParticipantCount: number;
}

export function AdminTournamentActions({
  tournamentId,
  canForce,
  participantCount,
  paidParticipantCount,
}: Props) {
  const hasPaid = paidParticipantCount > 0;
  const router = useRouter();
  const { call, modal } = useStepUp();
  const [pending, setPending] = useState<string | null>(null);

  const promptReason = (label: string) => {
    const reason = window.prompt(`${label}\n\nReason (audit-logged + Discord-alerted):`)?.trim();
    if (!reason)                  { toast.message("Cancelled");                 return null; }
    if (reason.length < 5)        { toast.error("Reason must be at least 5 chars"); return null; }
    return reason;
  };

  const handleFinalize = async () => {
    const reason = promptReason("Force-finalize this tournament?");
    if (!reason) return;
    setPending("finalize");
    const res = await call(() => forceFinalizeTournament(tournamentId, reason));
    setPending(null);
    if (res.success)              { toast.success("Tournament finalised"); router.refresh(); }
    else if (!res.needsStepUp)    toast.error(res.error ?? "Failed");
  };

  const handleCancel = async () => {
    const summary = hasPaid
      ? `Force-cancel this tournament?\n\n${paidParticipantCount} paid participant${paidParticipantCount === 1 ? "" : "s"} will be refunded via Stripe.`
      : participantCount > 0
        ? `Force-cancel this tournament?\n\n${participantCount} participant${participantCount === 1 ? "" : "s"} registered — none paid, no refunds needed.`
        : "Force-cancel this tournament?\n\nNo participants registered, no money involved.";
    const reason = promptReason(summary);
    if (!reason) return;
    setPending("cancel");
    const res = await call(() => forceCancelTournament(tournamentId, reason));
    setPending(null);
    if (res.success) {
      const refunded = res.data?.refundedCount ?? 0;
      const failures = res.data?.failures      ?? 0;
      const msg = refunded > 0
        ? `Tournament cancelled — ${refunded} refunded${failures > 0 ? `, ${failures} refund failure(s)` : ""}`
        : "Tournament cancelled";
      toast.success(msg);
      router.refresh();
    } else if (!res.needsStepUp) {
      toast.error(res.error ?? "Failed");
    }
  };

  if (!canForce) {
    return (
      <div className="rounded-xl px-4 py-3 text-xs"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
        This tournament is already final. No admin actions available.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl p-4"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
        <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>
          Admin actions
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleFinalize}
            disabled={pending !== null}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--warning)", color: "var(--warning)" }}
          >
            {pending === "finalize" ? <Loader2 size={13} className="animate-spin" /> : <CheckSquare size={13} />}
            Force finalize
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={pending !== null}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--danger)", color: "var(--danger)" }}
          >
            {pending === "cancel" ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
            {hasPaid ? `Force cancel (refund ${paidParticipantCount})` : "Force cancel"}
          </button>
        </div>
        <p className="text-[11px] mt-3" style={{ color: "var(--text-muted)" }}>
          {hasPaid
            ? `Cancellation will issue Stripe refunds to ${paidParticipantCount} paid participant${paidParticipantCount === 1 ? "" : "s"}.`
            : "No paid participants — cancellation involves no refunds."}
          {" "}Both actions require re-entering your password.
        </p>
      </div>

      {modal}
    </>
  );
}
