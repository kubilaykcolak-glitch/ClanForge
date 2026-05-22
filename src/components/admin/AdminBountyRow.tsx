"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, X, Loader2, ExternalLink, Award, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { adminResolveBounty } from "@/lib/actions/bounty.actions";
import type { Bounty } from "@/types/bounty";
import { AdminBountyDetailPanel } from "./AdminBountyDetailPanel";

const STATUS_VARIANT: Record<Bounty["status"], Parameters<typeof Badge>[0]["variant"]> = {
  open:      "success",
  claimed:   "warning",
  resolved:  "info",
  cancelled: "default",
  expired:   "default",
};

export function AdminBountyRow({ bounty }: { bounty: Bounty }) {
  const [resolveOpen, setResolveOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  // Detail panel is the catch-all home for everything that doesn't fit
  // inline: edit, mod-cancel, internal notes, full description + activity
  // feed. The inline Approve/Reject for claimed bounties stays on the row
  // so the fast path doesn't require a click + panel open.
  const [detailsOpen, setDetailsOpen] = useState(false);

  const decide = (approved: boolean) => {
    if (!approved && !reason.trim()) {
      toast.error("Reject reason is required");
      return;
    }
    startTransition(async () => {
      const res = await adminResolveBounty(bounty.id as string, approved, reason);
      if (res.success) {
        toast.success(approved ? `Approved — ${bounty.rewardXp} XP granted` : "Rejected, returned to open");
        setResolveOpen(false);
        setReason("");
      } else {
        toast.error(res.error ?? "Could not resolve");
      }
    });
  };

  const isClaimed = bounty.status === "claimed";

  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-display font-bold text-sm" style={{ color: "var(--text-primary)" }}>
              {bounty.title}
            </h3>
            <Badge variant={STATUS_VARIANT[bounty.status]}>{bounty.status}</Badge>
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{ background: "rgba(251,191,36,0.10)", color: "#fbbf24" }}
            >
              <Award size={9} /> {bounty.rewardXp} XP
            </span>
          </div>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {bounty.targetDescription}
          </p>
          <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
            Issued by {bounty.issuedByName} · published by {bounty.publishedByName}
            {bounty.claimedByName && <> · claimed by <strong>{bounty.claimedByName}</strong></>}
          </p>
          {bounty.resolutionReason && (
            <p className="text-[10px] mt-1 italic" style={{ color: "var(--text-muted)" }}>
              Note: {bounty.resolutionReason}
            </p>
          )}
          {/* Evidence surfaced inline on claimed rows so mods see it in the
              queue without opening the side panel. The notes excerpt gives
              them context for the link; the link itself is the fast path
              to actually review. */}
          {bounty.status === "claimed" && (bounty.evidenceNotes || bounty.evidenceUrl) && (
            <div
              className="mt-2 rounded-md px-2 py-1.5 text-[11px]"
              style={{
                background: "rgba(245,158,11,0.08)",
                border:     "1px solid rgba(245,158,11,0.20)",
                color:      "var(--text-secondary)",
              }}
            >
              {bounty.evidenceNotes && (
                <p className="leading-snug whitespace-pre-wrap">{bounty.evidenceNotes}</p>
              )}
              {bounty.evidenceUrl && (
                <a
                  href={bounty.evidenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-1 underline-offset-2 hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  <ExternalLink size={10} /> Evidence link
                </a>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {bounty.discordTicketUrl && (
            <a
              href={bounty.discordTicketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px]"
              style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
            >
              <ExternalLink size={11} /> Ticket
            </a>
          )}
          {isClaimed && !resolveOpen && (
            <>
              <button
                type="button"
                onClick={() => decide(true)}
                disabled={pending}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold disabled:opacity-40"
                style={{ background: "var(--success)", color: "white" }}
              >
                {pending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                Approve
              </button>
              <button
                type="button"
                onClick={() => setResolveOpen(true)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold"
                style={{ background: "transparent", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.30)" }}
              >
                <X size={11} /> Reject
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium"
            style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
            title="Open full bounty details, edit, cancel, or notes"
          >
            <MoreHorizontal size={11} /> Details
          </button>
        </div>
      </div>

      <AdminBountyDetailPanel
        bounty={bounty}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />

      {resolveOpen && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={reason}
            maxLength={500}
            placeholder="Reason for rejection (sent to the hunter)"
            onChange={e => setReason(e.target.value)}
            rows={2}
            className="w-full px-2 py-1.5 rounded text-xs"
            style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setResolveOpen(false); setReason(""); }}
              className="text-xs px-2 py-1 rounded"
              style={{ color: "var(--text-muted)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => decide(false)}
              disabled={pending || !reason.trim()}
              className="text-xs px-2 py-1 rounded font-semibold disabled:opacity-40"
              style={{ background: "var(--danger)", color: "white" }}
            >
              {pending ? <Loader2 size={11} className="inline animate-spin mr-1" /> : null}
              Reject claim
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
