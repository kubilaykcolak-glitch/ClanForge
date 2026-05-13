"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  deleteDoc,
  doc,
  increment,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import { Badge } from "@/components/ui/Badge";
import { CountdownTimer } from "./CountdownTimer";
import type { TournamentStatus } from "@/types";
import { formatPence } from "@/lib/prize-splits";
import { createCheckoutSession, withdrawPaidEntry } from "@/lib/actions/tournament-payment.actions";

interface TournamentRegistrationProps {
  tournamentId:        string;
  status:              TournamentStatus;
  registrationClosesAt: Date;
  maxParticipants:     number;
  participantCount:    number;
  entryFee:            number;
  prizePool:           number;
  currentUid:          string | null;
  isRegistered:        boolean;
  currentDisplayName:  string;
  currentAvatarUrl?:   string;
  winner?: { displayName: string; avatarUrl?: string } | null;
}

const SLOW_THRESHOLD_MS = 8_000;

export function TournamentRegistration({
  tournamentId,
  status,
  registrationClosesAt,
  maxParticipants,
  participantCount,
  entryFee,
  prizePool,
  currentUid,
  isRegistered,
  currentDisplayName,
  currentAvatarUrl,
  winner,
}: TournamentRegistrationProps) {
  const router         = useRouter();
  const searchParams   = useSearchParams();
  const [busy, setBusy]   = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isFull   = participantCount >= maxParticipants;
  const isFree   = entryFee === 0;
  const hasPrize = prizePool > 0;

  // Surface Stripe Checkout outcomes once when the user returns from the
  // hosted page (?payment=success | cancelled). The participant won't show
  // as "paid" until the webhook lands, so success is celebratory but
  // tentative — router.refresh() pulls the new state when it's ready.
  useEffect(() => {
    const status = searchParams.get("payment");
    if (status === "success") {
      toast.success("Payment received — finalising your registration…");
      router.refresh();
    } else if (status === "cancelled") {
      toast.info("Payment cancelled. You can retry whenever you're ready.");
    }
    // Strip the param so it doesn't fire again on next render.
    if (status) {
      const url = new URL(window.location.href);
      url.searchParams.delete("payment");
      window.history.replaceState({}, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (busy) {
      slowTimerRef.current = setTimeout(() => setIsSlow(true), SLOW_THRESHOLD_MS);
    } else {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setIsSlow(false);
    }
    return () => { if (slowTimerRef.current) clearTimeout(slowTimerRef.current); };
  }, [busy]);

  // ── Register ──
  // Free tournaments: direct Firestore write (existing behaviour).
  // Paid tournaments: server action → Stripe Checkout → webhook confirms.
  const handleRegister = async () => {
    if (!currentUid) { window.location.href = "/login"; return; }
    setBusy(true);
    setOpError(null);

    try {
      if (isFree) {
        await setDoc(doc(db, "tournaments", tournamentId, "participants", currentUid), {
          userId:        currentUid,
          seed:          0,
          status:        "registered",
          paymentStatus: "free",
          registeredAt:  new Date(),
          displayName:   currentDisplayName,
          avatarUrl:     currentAvatarUrl ?? null,
        });
        await updateDoc(doc(db, "tournaments", tournamentId), {
          participantCount: increment(1),
        });
        toast.success("You're registered! 🏆");
        router.refresh();
        return;
      }

      // Paid path — redirect to Stripe Checkout. Note: setBusy(false) is
      // intentionally NOT in `finally` for the success path because
      // window.location.href fires before React can rerender.
      const result = await createCheckoutSession(currentUid, tournamentId, {
        displayName: currentDisplayName,
        avatarUrl:   currentAvatarUrl,
      });
      if (!result.success || !result.data?.checkoutUrl) {
        setOpError(result.error ?? "Could not start payment. Try again.");
        toast.error(result.error ?? "Could not start payment");
        setBusy(false);
        return;
      }
      window.location.href = result.data.checkoutUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      setOpError(msg.includes("permission") ? "Permission denied — you may already be registered." : "Registration failed. Please try again.");
      toast.error("Registration failed. Try again.");
      setBusy(false);
    }
  };

  // ── Withdraw ──
  // Free path: client-side Firestore delete (unchanged).
  // Paid path: server action that issues a Stripe refund then mirrors
  // the participant deletion + counter decrement transactionally.
  const handleWithdraw = async () => {
    if (!currentUid) return;
    const confirmMsg = isFree
      ? "Withdraw from this tournament?"
      : `Withdraw and refund ${formatPence(entryFee)} to your card?`;
    if (!confirm(confirmMsg)) return;

    setBusy(true);
    setOpError(null);

    try {
      if (isFree) {
        await deleteDoc(doc(db, "tournaments", tournamentId, "participants", currentUid));
        await updateDoc(doc(db, "tournaments", tournamentId), {
          participantCount: increment(-1),
        });
        toast.success("Withdrawn from tournament");
        router.refresh();
        return;
      }

      const result = await withdrawPaidEntry(currentUid, tournamentId);
      if (!result.success) {
        setOpError(result.error ?? "Withdrawal failed");
        toast.error(result.error ?? "Withdrawal failed");
        return;
      }
      toast.success("Refund issued — should land within a few days");
      router.refresh();
    } catch {
      setOpError("Withdrawal failed. Please try again.");
      toast.error("Withdrawal failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
      }}
    >
      <h3
        className="font-display font-bold text-base"
        style={{ color: "var(--text-primary)" }}
      >
        Registration
      </h3>

      {/* Prize pool */}
      {hasPrize && (
        <div
          className="flex items-center justify-center py-3 rounded-xl"
          style={{
            background: "rgba(245,158,11,0.06)",
            border: "1px solid rgba(245,158,11,0.2)",
          }}
        >
          <span
            className="font-display font-bold text-2xl"
            style={{ color: "var(--warning)" }}
          >
            {formatPence(prizePool)} Prize Pool
          </span>
        </div>
      )}

      {/* Entry fee */}
      <div className="flex items-center justify-between text-sm">
        <span style={{ color: "var(--text-muted)" }}>Entry</span>
        <span
          className="font-semibold"
          style={{ color: isFree ? "var(--success)" : "var(--text-primary)" }}
        >
          {isFree ? "Free" : formatPence(entryFee)}
        </span>
      </div>

      {/* Spots */}
      <div className="flex items-center justify-between text-sm">
        <span style={{ color: "var(--text-muted)" }}>Spots</span>
        <span style={{ color: isFull ? "var(--danger)" : "var(--text-primary)" }}>
          {participantCount} / {maxParticipants}
          {isFull && " (Full)"}
        </span>
      </div>

      <div style={{ borderTop: "1px solid var(--border-subtle)" }} />

      {/* ── Status-based UI ── */}

      {/* Open + not logged in */}
      {status === "open" && !currentUid && (
        <a
          href="/login"
          className="block w-full py-2.5 rounded-lg text-sm font-semibold text-center text-white transition-all"
          style={{ background: "var(--accent)" }}
        >
          Log In to Register
        </a>
      )}

      {/* Open + logged in + not registered + not full */}
      {status === "open" && currentUid && !isRegistered && !isFull && (
        <>
          <button
            onClick={handleRegister}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{
              background: "var(--accent)",
              boxShadow: "0 0 20px var(--accent-glow)",
            }}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy
              ? (isFree ? "Registering…" : "Redirecting…")
              : (isFree ? "Register Now" : `Register & Pay ${formatPence(entryFee)}`)}
          </button>
          <CountdownTimer targetDate={registrationClosesAt} />
        </>
      )}

      {/* Open + logged in + full */}
      {status === "open" && currentUid && !isRegistered && isFull && (
        <p className="text-sm text-center" style={{ color: "var(--danger)" }}>
          Tournament is full
        </p>
      )}

      {/* Open + registered */}
      {status === "open" && isRegistered && (
        <>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} style={{ color: "var(--success)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--success)" }}>
              You&apos;re registered!
            </span>
          </div>
          <button
            onClick={handleWithdraw}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "var(--danger)",
            }}
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {busy ? "Withdrawing…" : "Withdraw"}
          </button>
          <CountdownTimer targetDate={registrationClosesAt} />
        </>
      )}

      {/* Locked or live */}
      {(status === "locked" || status === "live") && (
        <div className="flex flex-col items-center gap-2">
          <Badge variant="warning">Roster Locked</Badge>
          <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
            Registration is closed. The bracket is being prepared.
          </p>
          {isRegistered && (
            <div className="flex items-center gap-1.5 mt-1">
              <CheckCircle2 size={13} style={{ color: "var(--success)" }} />
              <span className="text-xs" style={{ color: "var(--success)" }}>
                You are registered
              </span>
            </div>
          )}
        </div>
      )}

      {/* Complete */}
      {status === "complete" && (
        <div className="flex flex-col items-center gap-3 py-2">
          <span className="text-3xl">🏆</span>
          {winner ? (
            <>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Tournament Winner
              </p>
              <p
                className="font-display font-bold text-lg"
                style={{ color: "var(--warning)" }}
              >
                {winner.displayName}
              </p>
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Tournament Completed
            </p>
          )}
        </div>
      )}

      {/* ── Shared feedback (slow warning + error) ── */}

      {isSlow && busy && (
        <div className="flex items-center gap-1.5">
          <AlertCircle size={13} style={{ color: "var(--warning)", flexShrink: 0 }} />
          <p className="text-xs" style={{ color: "var(--warning)" }}>
            This is taking longer than expected — please keep this tab open.
          </p>
        </div>
      )}

      {opError && (
        <div
          className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs"
          style={{
            background: "rgba(239,68,68,0.06)",
            border: "1px solid rgba(239,68,68,0.2)",
            color: "var(--danger)",
          }}
        >
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{opError}</span>
        </div>
      )}
    </div>
  );
}
