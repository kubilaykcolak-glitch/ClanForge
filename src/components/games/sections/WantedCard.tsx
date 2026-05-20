"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Crosshair, ExternalLink, Loader2, Award } from "lucide-react";
import { claimBounty, cancelBounty } from "@/lib/actions/bounty.actions";
import type { Bounty } from "@/types/bounty";

export function WantedCard({
  bounty,
  viewerUid,
  ticketUrl,
}: {
  bounty:    Bounty;
  viewerUid: string | null;
  ticketUrl: string | null;
}) {
  const [pending, startTransition] = useTransition();

  const isIssuer  = viewerUid === bounty.issuedBy;
  const isClaimer = viewerUid === bounty.claimedBy;
  const isOpen    = bounty.status === "open";
  const isClaimed = bounty.status === "claimed";
  const cooldownPassed = bounty.cancelCooldownUntil < new Date();

  const claim = () => {
    if (!viewerUid) {
      toast.error("Sign in to claim");
      return;
    }
    startTransition(async () => {
      const res = await claimBounty(bounty.id as string);
      if (res.success) {
        toast.success("Claim staked. Submit evidence in the Discord ticket.");
      } else {
        toast.error(res.error ?? "Could not claim");
      }
    });
  };

  const cancel = () => {
    if (!window.confirm("Cancel this bounty? Any active claim will be voided.")) return;
    startTransition(async () => {
      const res = await cancelBounty(bounty.id as string);
      if (res.success) toast.success("Cancelled");
      else toast.error(res.error ?? "Could not cancel");
    });
  };

  return (
    <article
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${isClaimed ? "rgba(245,158,11,0.30)" : "var(--border-subtle)"}`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <Crosshair size={14} className="mt-1 shrink-0" style={{ color: "var(--accent)" }} />
          <div className="min-w-0">
            <h3 className="font-display font-bold text-base leading-tight truncate" style={{ color: "var(--text-primary)" }}>
              {bounty.title}
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              Posted by {bounty.issuedByName}
            </p>
          </div>
        </div>
        <div
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold whitespace-nowrap"
          style={{
            background: "rgba(251,191,36,0.15)",
            color:      "#fbbf24",
            border:     "1px solid rgba(251,191,36,0.30)",
          }}
        >
          <Award size={11} /> {bounty.rewardXp} XP
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>
          Target
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {bounty.targetDescription}
        </p>
      </div>

      {bounty.description && (
        <p className="text-xs leading-relaxed whitespace-pre-wrap break-words" style={{ color: "var(--text-secondary)" }}>
          {bounty.description}
        </p>
      )}

      {isClaimed && (
        <div
          className="rounded-md px-2 py-1.5 text-[11px]"
          style={{ background: "rgba(245,158,11,0.10)", color: "var(--warning)", border: "1px solid rgba(245,158,11,0.20)" }}
        >
          Claimed by <strong>{bounty.claimedByName}</strong>. Awaiting evidence review.
        </div>
      )}

      <div className="flex items-center gap-2 mt-auto pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        {isOpen && !isIssuer && (
          <button
            type="button"
            onClick={claim}
            disabled={pending || !viewerUid}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-40"
            style={{ background: "var(--accent)", color: "white" }}
          >
            {pending ? <Loader2 size={12} className="animate-spin" /> : null}
            Claim bounty
          </button>
        )}
        {isClaimed && isClaimer && ticketUrl && (
          <a
            href={ticketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold"
            style={{ background: "var(--accent)", color: "white" }}
          >
            <ExternalLink size={12} /> Submit evidence
          </a>
        )}
        {isIssuer && (isOpen || isClaimed) && (
          <button
            type="button"
            onClick={cancel}
            disabled={pending || !cooldownPassed}
            title={!cooldownPassed ? "Cancellation locked for 24h after publish" : undefined}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-40"
            style={{ background: "transparent", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.30)" }}
          >
            Cancel
          </button>
        )}
        <span className="ml-auto text-[10px]" style={{ color: "var(--text-muted)" }}>
          Expires {bounty.expiresAt.toLocaleDateString()}
        </span>
      </div>
    </article>
  );
}
