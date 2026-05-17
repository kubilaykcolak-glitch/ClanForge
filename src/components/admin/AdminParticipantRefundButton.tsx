"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { forceRefundParticipant } from "@/lib/actions/admin-tournament.actions";
import { useStepUp } from "@/components/admin/useStepUp";

interface Props {
  tournamentId:   string;
  participantUid: string;
}

export function AdminParticipantRefundButton({ tournamentId, participantUid }: Props) {
  const router = useRouter();
  const { call, modal } = useStepUp();
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    const reason = window.prompt(`Refund ${participantUid}?\n\nReason (audit-logged + Discord-alerted):`)?.trim();
    if (!reason)            { toast.message("Cancelled"); return; }
    if (reason.length < 5)  { toast.error("Reason must be at least 5 chars"); return; }
    setPending(true);
    const res = await call(() => forceRefundParticipant(tournamentId, participantUid, reason));
    setPending(false);
    if (res.success)        { toast.success("Refunded"); router.refresh(); }
    else if (!res.needsStepUp) toast.error(res.error ?? "Failed");
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold disabled:opacity-50"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--danger)", color: "var(--danger)" }}
      >
        {pending ? <Loader2 size={9} className="animate-spin" /> : <RotateCcw size={9} />}
        Refund
      </button>
      {modal}
    </>
  );
}
