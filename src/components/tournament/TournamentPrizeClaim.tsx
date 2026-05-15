"use client";

// ─── TournamentPrizeClaim ─────────────────────────────────────────────────────
// Renders one prize-claim card on the tournament detail page for the current
// user. Two paths:
//   - "pending"          → big "Claim £X" button. Calls initiatePrizeClaim,
//                          then expands to show the claim reference + Discord CTA.
//   - "claim_initiated"  → renders the reference + Discord CTA directly.
//   - "paid"             → renders a static "Paid" pill (rare here; usually
//                          the card is hidden once paid, but we show it for
//                          transparency until the page is refetched).
//
// Admin-only "Mark paid" button appears below if isAdmin.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Loader2, Trophy } from "lucide-react";
import { toast } from "sonner";
import {
  initiatePrizeClaim,
  markPrizePaid,
} from "@/lib/actions/tournament-payment.actions";
import { formatPence, positionLabel } from "@/lib/prize-splits";
import type { PrizePayoutStatus } from "@/types";

const DISCORD_URL = "https://discord.gg/NB9VftUUSJ";

interface Props {
  tournamentId:   string;
  prizeId:        string;
  position:       number;
  amountPence:    number;
  status:         PrizePayoutStatus;
  claimReference: string;
  currentUid:     string;
  isAdmin:        boolean;
}

export function TournamentPrizeClaim({
  tournamentId,
  prizeId,
  position,
  amountPence,
  status,
  claimReference,
  currentUid,
  isAdmin,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [localStatus, setLocalStatus] = useState<PrizePayoutStatus>(status);
  const [localReference, setLocalReference] = useState(claimReference);

  const handleClaim = async () => {
    setBusy(true);
    const result = await initiatePrizeClaim(currentUid, tournamentId, prizeId);
    if (!result.success) {
      toast.error(result.error ?? "Could not start claim");
      setBusy(false);
      return;
    }
    setLocalReference(result.data?.claimReference ?? claimReference);
    setLocalStatus("claim_initiated");
    toast.success("Claim started — message us on Discord to receive your prize.");
    setBusy(false);
  };

  const handleMarkPaid = async () => {
    if (!confirm("Mark this prize as paid? This is final.")) return;
    setBusy(true);
    const result = await markPrizePaid(currentUid, tournamentId, prizeId);
    if (!result.success) {
      toast.error(result.error ?? "Could not mark prize paid");
      setBusy(false);
      return;
    }
    setLocalStatus("paid");
    toast.success("Prize marked as paid.");
    setBusy(false);
    router.refresh();
  };

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{
        background: "rgba(245,158,11,0.06)",
        border:     "1px solid rgba(245,158,11,0.30)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(245,158,11,0.18)", color: "var(--warning)" }}
        >
          <Trophy size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            You finished {positionLabel(position)}
          </p>
          <p
            className="font-display font-bold text-2xl mt-0.5"
            style={{ color: "var(--warning)" }}
          >
            {formatPence(amountPence)} prize
          </p>
        </div>
      </div>

      {localStatus === "pending" && (
        <button
          type="button"
          onClick={handleClaim}
          disabled={busy}
          className="arena-cta w-full"
          style={{ padding: "11px 16px", fontSize: 13 }}
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {busy ? "Starting claim…" : `Claim ${formatPence(amountPence)}`}
        </button>
      )}

      {localStatus === "claim_initiated" && (
        <div className="flex flex-col gap-3">
          <div
            className="rounded-lg p-3 text-xs"
            style={{
              background: "var(--bg-elevated)",
              border:     "1px solid var(--border-default)",
              color:      "var(--text-secondary)",
            }}
          >
            <p style={{ color: "var(--text-muted)" }}>Your claim reference:</p>
            <p
              className="font-mono mt-1"
              style={{ fontSize: 13, color: "var(--text-primary)" }}
            >
              {localReference}
            </p>
            <p className="mt-2" style={{ color: "var(--text-muted)" }}>
              Send a DM in the ClanForge Discord with this reference and your preferred
              payout method (bank transfer / PayPal / etc). We&apos;ll get it sorted within
              a few days.
            </p>
          </div>
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="arena-cta w-full"
            style={{ padding: "11px 16px", fontSize: 13 }}
          >
            <ExternalLink size={14} />
            Open Discord
          </a>
        </div>
      )}

      {localStatus === "paid" && (
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} style={{ color: "var(--success)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--success)" }}>
            Prize paid
          </span>
        </div>
      )}

      {isAdmin && localStatus !== "paid" && (
        <button
          type="button"
          onClick={handleMarkPaid}
          disabled={busy}
          className="text-xs font-medium self-start transition-colors disabled:opacity-50"
          style={{ color: "var(--text-muted)" }}
        >
          [admin] Mark as paid
        </button>
      )}
    </div>
  );
}
