"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { joinClan, leaveClan } from "@/lib/clan-actions";
import type { ClanRole } from "@/types";

interface ClanActionsProps {
  clanId:          string;
  currentUid:      string | null;
  currentRole:     ClanRole | null;   // null = not a member
  isPublic:        boolean;
  isRecruiting:    boolean;
  displayName:     string;
  avatarUrl?:      string;
}

const SLOW_THRESHOLD_MS = 8_000;

export function ClanActions({
  clanId,
  currentUid,
  currentRole,
  isPublic,
  isRecruiting,
  displayName,
  avatarUrl,
}: ClanActionsProps) {
  const router          = useRouter();
  const [busy, setBusy] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const slowTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track slow operations
  useEffect(() => {
    if (busy) {
      slowTimerRef.current = setTimeout(() => setIsSlow(true), SLOW_THRESHOLD_MS);
    } else {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setIsSlow(false);
    }
    return () => { if (slowTimerRef.current) clearTimeout(slowTimerRef.current); };
  }, [busy]);

  // ── Not logged in ──
  if (!currentUid) {
    return (
      <a
        href="/login"
        className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all"
        style={{ background: "var(--accent)" }}
      >
        Log In to Join
      </a>
    );
  }

  // ── Clan leader ──
  if (currentRole === "leader") {
    return (
      <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
        👑 You own this clan
      </span>
    );
  }

  // ── Pending approval ──
  if (currentRole === "pending") {
    return (
      <span
        className="inline-flex items-center px-4 py-2.5 rounded-lg text-sm font-medium"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          color: "var(--text-muted)",
        }}
      >
        ⏳ Request pending…
      </span>
    );
  }

  // Shared slow warning (rendered below whichever button is active)
  const SlowWarning = isSlow ? (
    <div className="flex items-center gap-1.5 mt-2">
      <AlertCircle size={12} style={{ color: "var(--warning)", flexShrink: 0 }} />
      <p className="text-xs" style={{ color: "var(--warning)" }}>
        Taking longer than expected…
      </p>
    </div>
  ) : null;

  // ── Already a member (officer / member) — show Leave ──
  if (currentRole) {
    const handleLeave = async () => {
      if (!confirm("Leave this clan? You'll need to re-apply to rejoin.")) return;
      setBusy(true);
      try {
        await leaveClan(clanId, currentUid);
        toast.success("You left the clan");
        router.refresh();
      } catch {
        toast.error("Failed to leave clan — please try again.");
        setBusy(false);
      }
    };

    return (
      <div className="flex flex-col items-start">
        <button
          onClick={handleLeave}
          disabled={busy}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
          style={{
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            color: "var(--danger)",
          }}
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {busy ? "Leaving…" : "Leave Clan"}
        </button>
        {SlowWarning}
      </div>
    );
  }

  // ── Not a member — show Join or Request ──
  if (!isPublic || !isRecruiting) {
    // Private or not recruiting → Request
    const handleRequest = async () => {
      setBusy(true);
      try {
        await joinClan(clanId, currentUid, displayName, avatarUrl, "pending");
        toast.success("Request sent! Waiting for approval.");
        router.refresh();
      } catch {
        toast.error("Failed to send request — please try again.");
        setBusy(false);
      }
    };

    return (
      <div className="flex flex-col items-start">
        <button
          onClick={handleRequest}
          disabled={busy}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
          style={{ background: "var(--violet)" }}
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {busy ? "Sending…" : "Request to Join"}
        </button>
        {SlowWarning}
      </div>
    );
  }

  // Public + recruiting → direct Join
  const handleJoin = async () => {
    setBusy(true);
    try {
      await joinClan(clanId, currentUid, displayName, avatarUrl, "member");
      toast.success("Welcome to the clan! 🛡️");
      router.refresh();
    } catch {
      toast.error("Failed to join clan — please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start">
      <button
        onClick={handleJoin}
        disabled={busy}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
        style={{ background: "var(--accent)" }}
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        {busy ? "Joining…" : "Join Clan"}
      </button>
      {SlowWarning}
    </div>
  );
}
