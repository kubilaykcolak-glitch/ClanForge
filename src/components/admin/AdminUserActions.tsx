"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Ban, ShieldOff, Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { setUserRole } from "@/lib/actions/admin.actions";
import {
  banUser,
  unbanUser,
  forceUnlinkRiotAccount,
} from "@/lib/actions/admin-moderation.actions";
import { useStepUp } from "@/components/admin/useStepUp";
import { rolesGrantableBy, type Role } from "@/lib/auth/roles";

// ─── AdminUserActions ─────────────────────────────────────────────────────────
//
// Client island rendered on /admin/users/[uid]. All destructive actions go
// through useStepUp so the step-up modal opens automatically when needed.

interface Props {
  targetUid:    string;
  targetEmail:  string | null;
  targetRole:   Role | null;
  targetBanned: boolean;
  myRole:       Role | null;
}

export function AdminUserActions({
  targetUid,
  targetEmail,
  targetRole,
  targetBanned,
  myRole,
}: Props) {
  const router = useRouter();
  const { call, modal } = useStepUp();
  const [pending, setPending] = useState<string | null>(null);

  const grantable = rolesGrantableBy(myRole);
  const canBan    = myRole === "super_admin" || (myRole === "admin" && targetRole !== "admin" && targetRole !== "super_admin");
  const canUnlink = myRole === "admin" || myRole === "super_admin";

  const promptReason = (label: string) => {
    const reason = window.prompt(`${label}\n\nReason (will be audit-logged + Discord-alerted):`)?.trim();
    if (!reason) {
      toast.message("Cancelled");
      return null;
    }
    if (reason.length < 5) {
      toast.error("Reason must be at least 5 characters");
      return null;
    }
    return reason;
  };

  const handleGrant = async (role: Role | null) => {
    const reason = promptReason(role === null ? `Revoke role from ${targetEmail ?? targetUid}` : `Grant role ${role} to ${targetEmail ?? targetUid}`);
    if (!reason) return;
    setPending(`grant:${role}`);
    const res = await setUserRole(targetUid, role, reason);
    setPending(null);
    if (res.success) {
      toast.success("Role updated. User must sign out and back in for the new claim to take effect.");
      router.refresh();
    } else {
      toast.error(res.error ?? "Failed");
    }
  };

  const handleBan = async () => {
    const reason = promptReason(`Ban ${targetEmail ?? targetUid}`);
    if (!reason) return;
    setPending("ban");
    const res = await call(() => banUser(targetUid, reason));
    setPending(null);
    if (res.success)       { toast.success("User banned"); router.refresh(); }
    else if (!res.needsStepUp) toast.error(res.error ?? "Failed");
  };

  const handleUnban = async () => {
    const reason = promptReason(`Unban ${targetEmail ?? targetUid}`);
    if (!reason) return;
    setPending("unban");
    const res = await call(() => unbanUser(targetUid, reason));
    setPending(null);
    if (res.success)       { toast.success("User unbanned"); router.refresh(); }
    else if (!res.needsStepUp) toast.error(res.error ?? "Failed");
  };

  const handleUnlinkRiot = async () => {
    const reason = promptReason(`Force-unlink League integration for ${targetEmail ?? targetUid}`);
    if (!reason) return;
    setPending("unlink_riot");
    const res = await call(() => forceUnlinkRiotAccount(targetUid, reason));
    setPending(null);
    if (res.success)       { toast.success("Riot integration force-unlinked"); router.refresh(); }
    else if (!res.needsStepUp) toast.error(res.error ?? "Failed");
  };

  return (
    <>
      <div
        className="rounded-xl p-4 mt-4"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>
          Actions
        </h2>

        <div className="flex flex-wrap gap-2">
          {/* Role grants — only super_admin / admin (for moderator) */}
          {grantable.filter(r => r !== "super_admin").map(role => (
            <ActionButton
              key={`grant-${role}`}
              icon={<Shield size={13} />}
              label={`Set role: ${role.replace("_", " ")}`}
              accent="accent"
              disabled={pending !== null || targetRole === role}
              loading={pending === `grant:${role}`}
              onClick={() => handleGrant(role)}
            />
          ))}

          {/* Revoke role — visible only if target has one and we can grant it */}
          {targetRole && grantable.includes(targetRole) && (
            <ActionButton
              icon={<ShieldOff size={13} />}
              label="Revoke role"
              accent="warning"
              disabled={pending !== null}
              loading={pending === "grant:null"}
              onClick={() => handleGrant(null)}
            />
          )}

          {/* Ban / Unban */}
          {!targetBanned ? (
            canBan && (
              <ActionButton
                icon={<Ban size={13} />}
                label="Ban user"
                accent="danger"
                disabled={pending !== null}
                loading={pending === "ban"}
                onClick={handleBan}
              />
            )
          ) : (
            canBan && (
              <ActionButton
                icon={<Ban size={13} />}
                label="Unban user"
                accent="success"
                disabled={pending !== null}
                loading={pending === "unban"}
                onClick={handleUnban}
              />
            )
          )}

          {/* Force-unlink Riot */}
          {canUnlink && (
            <ActionButton
              icon={<Unlink size={13} />}
              label="Force-unlink Riot account"
              accent="warning"
              disabled={pending !== null}
              loading={pending === "unlink_riot"}
              onClick={handleUnlinkRiot}
            />
          )}
        </div>

        <p className="text-[11px] mt-3" style={{ color: "var(--text-muted)" }}>
          Destructive actions require re-entering your password. All actions are audit-logged and posted to the admin Discord channel.
        </p>
      </div>

      {modal}
    </>
  );
}

// ─── ActionButton helper ─────────────────────────────────────────────────────

function ActionButton({
  icon, label, accent, disabled, loading, onClick,
}: {
  icon:    React.ReactNode;
  label:   string;
  accent:  "accent" | "danger" | "warning" | "success";
  disabled?: boolean;
  loading?:  boolean;
  onClick: () => void;
}) {
  const colour = accent === "danger"  ? "var(--danger)"
              : accent === "warning" ? "var(--warning)"
              : accent === "success" ? "var(--success)"
              : "var(--accent)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
      style={{
        background: "var(--bg-elevated)",
        border:     `1px solid ${colour}`,
        color:      colour,
      }}
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}
