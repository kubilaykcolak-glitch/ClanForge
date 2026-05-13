"use client";

// ─── TournamentCreatorActions ─────────────────────────────────────────────────
// Creator-only toolbar shown on the tournament detail page. For now this is
// just a Danger Zone "Cancel tournament" button that refunds everyone and
// flips status to "cancelled". A finalize-tournament button will join it in
// the next commit.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cancelTournament } from "@/lib/actions/tournament-payment.actions";

interface Props {
  tournamentId: string;
  currentUid:   string;
  isPaid:       boolean;
  participantCount: number;
}

export function TournamentCreatorActions({
  tournamentId,
  currentUid,
  isPaid,
  participantCount,
}: Props) {
  const router          = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const confirmWord = "CANCEL";

  const handleCancel = async () => {
    if (confirmText !== confirmWord) return;
    setBusy(true);
    const result = await cancelTournament(currentUid, tournamentId);
    if (!result.success) {
      toast.error(result.error ?? "Could not cancel tournament");
      setBusy(false);
      return;
    }
    if (isPaid && (result.data?.refundedCount ?? 0) > 0) {
      toast.success(`Tournament cancelled — refunded ${result.data!.refundedCount} participant(s).`);
    } else {
      toast.success("Tournament cancelled.");
    }
    router.refresh();
  };

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{
        background: "rgba(239,68,68,0.04)",
        border:     "1px solid rgba(239,68,68,0.20)",
      }}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} style={{ color: "var(--danger)", marginTop: 2, flexShrink: 0 }} />
        <div>
          <h3 className="font-display font-bold text-base" style={{ color: "var(--danger)" }}>
            Danger Zone
          </h3>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Cancelling is permanent. {isPaid
              ? "All paid participants will receive a full refund automatically."
              : "All registrations will be cleared."}
          </p>
        </div>
      </div>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 self-start px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: "rgba(239,68,68,0.10)",
            border:     "1px solid rgba(239,68,68,0.30)",
            color:      "var(--danger)",
          }}
        >
          <Trash2 size={14} />
          Cancel Tournament
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Type <strong style={{ color: "var(--text-primary)" }}>{confirmWord}</strong> to confirm.
            {isPaid && participantCount > 0 && (
              <>
                {" "}You&apos;ll trigger {participantCount} refund{participantCount === 1 ? "" : "s"}.
              </>
            )}
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={confirmWord}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--bg-elevated)",
              border:     "1px solid rgba(239,68,68,0.4)",
              color:      "var(--text-primary)",
            }}
            onFocus={e => { e.currentTarget.style.borderColor = "var(--danger)"; }}
            onBlur={e =>  { e.currentTarget.style.borderColor = "rgba(239,68,68,0.4)"; }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy || confirmText !== confirmWord}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "var(--danger)" }}
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {busy ? "Cancelling…" : "Yes, Cancel"}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setConfirmText(""); }}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: "var(--bg-elevated)",
                border:     "1px solid var(--border-default)",
                color:      "var(--text-secondary)",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
