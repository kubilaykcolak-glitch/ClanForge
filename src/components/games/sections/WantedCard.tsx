"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Crosshair, ExternalLink, Loader2, Award, X } from "lucide-react";
import { claimBounty, cancelBounty } from "@/lib/actions/bounty.actions";
import {
  type Bounty,
  BOUNTY_NOTES_MIN_LEN,
  BOUNTY_NOTES_MAX_LEN,
} from "@/types/bounty";

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
  // Claim form is collapsed by default — opens when the hunter clicks the
  // Claim button. Notes are required (10–500 chars); evidence URL is
  // optional because most hunters paste their evidence in the Discord
  // ticket and don't need a separate link.
  const [claimOpen,    setClaimOpen]    = useState(false);
  const [claimNotes,   setClaimNotes]   = useState("");
  const [claimUrl,     setClaimUrl]     = useState("");

  const isIssuer  = viewerUid === bounty.issuedBy;
  const isClaimer = viewerUid === bounty.claimedBy;
  const isOpen    = bounty.status === "open";
  const isClaimed = bounty.status === "claimed";
  const cooldownPassed = bounty.cancelCooldownUntil < new Date();

  const startClaim = () => {
    if (!viewerUid) { toast.error("Sign in to claim"); return; }
    setClaimOpen(true);
  };

  const submitClaim = () => {
    const notes = claimNotes.trim();
    if (notes.length < BOUNTY_NOTES_MIN_LEN) {
      toast.error(`Notes must be at least ${BOUNTY_NOTES_MIN_LEN} characters`);
      return;
    }
    startTransition(async () => {
      const res = await claimBounty(bounty.id as string, {
        notes,
        evidenceUrl: claimUrl.trim() || undefined,
      });
      if (res.success) {
        toast.success("Claim submitted — mods will review your evidence.");
        setClaimOpen(false);
        setClaimNotes("");
        setClaimUrl("");
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

      {/* Claim form — required notes + optional evidence link. Toggled by
          the Claim button below. Kept inline rather than in a modal so
          mobile users aren't bounced into a separate context just to
          stake their claim. */}
      {claimOpen && (
        <div
          className="rounded-md p-3 flex flex-col gap-2 text-xs"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
        >
          <div className="flex items-center justify-between">
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
              Submit your claim
            </p>
            <button
              type="button"
              onClick={() => setClaimOpen(false)}
              disabled={pending}
              className="text-[10px] px-1 py-0.5 rounded"
              style={{ color: "var(--text-muted)" }}
              aria-label="Close claim form"
            >
              <X size={12} />
            </button>
          </div>
          <label className="flex flex-col gap-1">
            <span style={{ color: "var(--text-secondary)" }}>
              Notes for the mod team <span style={{ color: "var(--danger)" }}>*</span>
            </span>
            <textarea
              value={claimNotes}
              onChange={e => setClaimNotes(e.target.value)}
              rows={3}
              maxLength={BOUNTY_NOTES_MAX_LEN}
              placeholder={`e.g. "Killed at 0:47, target's name visible at 0:12 in chat. Evidence in #bounty-tickets."`}
              className="w-full rounded px-2 py-1.5 text-xs outline-none"
              style={{
                background: "var(--bg-surface)",
                color:      "var(--text-primary)",
                border:     "1px solid var(--border-default)",
              }}
            />
            <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
              {claimNotes.trim().length}/{BOUNTY_NOTES_MAX_LEN} · min {BOUNTY_NOTES_MIN_LEN}
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ color: "var(--text-secondary)" }}>
              Evidence link (optional — Discord message URL, YouTube, Streamable…)
            </span>
            <input
              type="text"
              value={claimUrl}
              onChange={e => setClaimUrl(e.target.value)}
              placeholder="https://discord.com/channels/…"
              className="w-full rounded px-2 py-1.5 text-xs outline-none"
              style={{
                background: "var(--bg-surface)",
                color:      "var(--text-primary)",
                border:     "1px solid var(--border-default)",
              }}
            />
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Leave blank if your evidence lives in the bounty&apos;s Discord ticket — mods will find it there.
            </span>
          </label>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setClaimOpen(false)}
              disabled={pending}
              className="text-xs px-2 py-1 rounded"
              style={{ color: "var(--text-muted)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitClaim}
              disabled={pending || claimNotes.trim().length < BOUNTY_NOTES_MIN_LEN}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-40"
              style={{ background: "var(--accent)", color: "white" }}
            >
              {pending && <Loader2 size={12} className="animate-spin" />}
              Submit claim
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mt-auto pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        {isOpen && !isIssuer && !claimOpen && (
          <button
            type="button"
            onClick={startClaim}
            disabled={pending || !viewerUid}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-40"
            style={{ background: "var(--accent)", color: "white" }}
          >
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
