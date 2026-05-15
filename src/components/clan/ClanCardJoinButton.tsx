"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { joinClan } from "@/lib/clan-actions";
import { awardXp, checkClanJoinAllowed } from "@/lib/actions/xp.actions";

interface ClanCardJoinButtonProps {
  clanId:             string;
  clanSlug:           string;
  isRecruiting:       boolean;
  isFull:             boolean;
  /** currentClanId === this clan's id */
  isAlreadyMember:    boolean;
  /** user belongs to a different clan */
  isInAnotherClan:    boolean;
  currentUid:         string | null;
  currentDisplayName: string;
  currentAvatarUrl?:  string;
}

export function ClanCardJoinButton({
  clanId,
  clanSlug,
  isRecruiting,
  isFull,
  isAlreadyMember,
  isInAnotherClan,
  currentUid,
  currentDisplayName,
  currentAvatarUrl,
}: ClanCardJoinButtonProps) {
  const router        = useRouter();
  const [busy, setBusy] = useState(false);

  // Not logged in
  if (!currentUid) {
    return (
      <a
        href="/login"
        className="arena-cta w-full"
        style={{ padding: "10px 16px", fontSize: 12 }}
        onClick={e => e.stopPropagation()}
      >
        Log in to Join
      </a>
    );
  }

  // Already a member of THIS clan
  if (isAlreadyMember) {
    return (
      <span
        className="w-full flex items-center justify-center py-2 rounded-lg text-sm font-medium"
        style={{
          background: "rgba(99,102,241,0.1)",
          border:     "1px solid rgba(99,102,241,0.25)",
          color:      "var(--accent)",
        }}
      >
        ✓ Member
      </span>
    );
  }

  // In a different clan — can't join another
  if (isInAnotherClan) {
    return (
      <span
        className="w-full flex items-center justify-center py-2 rounded-lg text-sm font-medium"
        style={{
          background: "var(--bg-elevated)",
          border:     "1px solid var(--border-default)",
          color:      "var(--text-muted)",
        }}
        title="Leave your current clan first"
      >
        Leave clan to join
      </span>
    );
  }

  // Clan is full
  if (isFull) {
    return (
      <span
        className="w-full flex items-center justify-center py-2 rounded-lg text-sm font-medium"
        style={{
          background: "var(--bg-elevated)",
          border:     "1px solid var(--border-default)",
          color:      "var(--text-muted)",
        }}
      >
        Clan Full
      </span>
    );
  }

  const role = isRecruiting ? "member" : "pending";

  const handleJoin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setBusy(true);
    try {
      const check = await checkClanJoinAllowed(currentUid);
      if (check.success && check.data && !check.data.allowed) {
        toast.error(check.data.message ?? "You're still on a join cooldown.");
        setBusy(false);
        return;
      }

      await joinClan(clanId, currentUid, currentDisplayName, currentAvatarUrl, role);
      toast.success(isRecruiting ? "Welcome to the clan! 🛡️" : "Request sent! Waiting for approval.");

      if (isRecruiting) {
        const xp = await awardXp(currentUid, "clan_join", clanId);
        if (xp.success && xp.data && xp.data.awarded > 0) {
          toast.success(`+${xp.data.awarded} XP — ${xp.data.label}`);
        }
      }

      router.push(`/clans/${clanSlug}`);
    } catch {
      toast.error("Failed to join — please try again.");
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleJoin}
      disabled={busy}
      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
      style={{ background: isRecruiting ? "var(--accent)" : "var(--violet)" }}
    >
      {busy && <Loader2 size={14} className="animate-spin" />}
      {busy ? "Joining…" : isRecruiting ? "Join Clan" : "Request to Join"}
    </button>
  );
}
