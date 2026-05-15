"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Settings } from "lucide-react";
import { toast } from "sonner";
import { joinClan, leaveClan } from "@/lib/clan-actions";
import { awardXp, checkClanJoinAllowed } from "@/lib/actions/xp.actions";
import { CLAN_JOIN_COOLDOWN_HOURS } from "@/lib/xp";
import type { ClanRole } from "@/types";

interface ClanActionsProps {
  clanId:          string;
  slug:            string;
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
  slug,
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
      <a href="/login" className="arena-cta">
        Log In to Join
      </a>
    );
  }

  // ── Clan leader ──
  if (currentRole === "leader") {
    return (
      <Link
        href={`/clans/${slug}/settings`}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
        style={{
          background: "var(--bg-elevated)",
          border:     "1px solid var(--border-default)",
          color:      "var(--text-secondary)",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
          (e.currentTarget as HTMLElement).style.color       = "var(--text-primary)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)";
          (e.currentTarget as HTMLElement).style.color       = "var(--text-secondary)";
        }}
      >
        <Settings size={15} />
        Manage Clan
      </Link>
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
      const confirmMsg =
        `Leave this clan?\n\n` +
        `You'll need to re-apply to rejoin, and a ${CLAN_JOIN_COOLDOWN_HOURS}-hour cooldown ` +
        `will start before you can join another clan. This keeps clan membership meaningful.`;
      if (!confirm(confirmMsg)) return;
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
        // Cooldown precheck — pending requests still create a member doc, so
        // we treat them the same as a full join for cooldown purposes.
        const check = await checkClanJoinAllowed(currentUid);
        if (check.success && check.data && !check.data.allowed) {
          toast.error(check.data.message ?? "You're still on a join cooldown.");
          setBusy(false);
          return;
        }

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
      const check = await checkClanJoinAllowed(currentUid);
      if (check.success && check.data && !check.data.allowed) {
        toast.error(check.data.message ?? "You're still on a join cooldown.");
        setBusy(false);
        return;
      }

      await joinClan(clanId, currentUid, displayName, avatarUrl, "member");
      toast.success("Welcome to the clan! 🛡️");

      // Award XP for the join. Capped to once per clan by the awardXp rules.
      const xp = await awardXp(currentUid, "clan_join", clanId);
      if (xp.success && xp.data && xp.data.awarded > 0) {
        toast.success(`+${xp.data.awarded} XP — ${xp.data.label}`);
      }

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
        className="arena-cta"
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        {busy ? "Joining…" : "Join Clan"}
      </button>
      {SlowWarning}
    </div>
  );
}
