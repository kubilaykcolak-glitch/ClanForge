"use client";

// ─── AdminBountyDetailPanel ──────────────────────────────────────────────────
//
// Right-side slide-over panel opened from AdminBountyRow's "Details" button.
// Hosts everything mods do that doesn't fit in the inline row:
//
//   - Full description, target, meta (issuer / hunter / expiry / ticket URL)
//   - Edit form (title / description / target / reward / expiry / ticket URL)
//   - Mod-override cancel (with required reason)
//   - Internal note input (mod-only audit comment)
//   - Activity feed loaded from /bounties/{id}/activity, newest first
//
// Approve / reject of claims stays on the inline row in AdminBountyRow —
// that's the fast path and shouldn't require a panel open. Everything else
// is panel-only so the queue list stays scannable.
//
// State boundary: the panel owns its own open/closed state via the `open`
// + `onOpenChange` props. Parent supplies the bounty and stays in charge
// of refreshing the list (we call router.refresh() on every successful
// mutation so the parent re-fetches via its server component).

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  Pencil,
  X as XIcon,
  AlertTriangle,
  StickyNote,
  ExternalLink,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/Badge";
import {
  adminEditBounty,
  adminCancelBounty,
  adminAddBountyNote,
  listBountyActivity,
  type AdminEditBountyPatch,
} from "@/lib/actions/bounty.actions";
import {
  type ActivityEntry,
  type ActivityKind,
  type Bounty,
  BOUNTY_MIN_XP,
  BOUNTY_MAX_XP,
  ACTIVITY_NOTE_MAX,
} from "@/types/bounty";

interface Props {
  bounty: Bounty;
  open:   boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_VARIANT: Record<Bounty["status"], Parameters<typeof Badge>[0]["variant"]> = {
  open:      "success",
  claimed:   "warning",
  resolved:  "info",
  cancelled: "default",
  expired:   "default",
};

// Compact human-readable label per activity kind. Used in the audit feed
// row headers. Keep terse — the entry detail lives in the body / payload.
const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  published:      "Published",
  edited:         "Edited",
  claim_opened:   "Claim opened",
  claim_approved: "Claim approved",
  claim_rejected: "Claim rejected",
  cancelled:      "Cancelled",
  expired:        "Expired",
  note:           "Mod note",
};

const ACTIVITY_COLOUR: Record<ActivityKind, string> = {
  published:      "var(--accent)",
  edited:         "var(--accent)",
  claim_opened:   "var(--warning)",
  claim_approved: "var(--success)",
  claim_rejected: "var(--danger)",
  cancelled:      "var(--text-muted)",
  expired:        "var(--text-muted)",
  note:           "var(--accent)",
};

export function AdminBountyDetailPanel({ bounty, open, onOpenChange }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Active inline form. Only one editor can be open at a time so the panel
  // doesn't grow vertically without bound. Click an action button → form
  // opens; click again or hit cancel → closes.
  type Editor = "none" | "edit" | "cancel" | "note";
  const [editor, setEditor] = useState<Editor>("none");

  // Activity feed — loaded once when the panel opens, refetched after any
  // successful mutation so the timeline reflects the latest entry.
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);

  const reloadActivity = useMemo(() => {
    return async () => {
      if (!bounty.id) return;
      setActivityLoading(true);
      try {
        const entries = await listBountyActivity(bounty.id);
        setActivity(entries);
      } finally {
        setActivityLoading(false);
      }
    };
  }, [bounty.id]);

  useEffect(() => {
    if (open) {
      void reloadActivity();
      setEditor("none");
    }
  }, [open, reloadActivity]);

  // ── Edit form state ────────────────────────────────────────────────────
  // Seeded from `bounty` on every open so a fresh open shows current values
  // instead of stale state from a previous bounty.
  const [editTitle,    setEditTitle]    = useState(bounty.title);
  const [editDesc,     setEditDesc]     = useState(bounty.description);
  const [editTarget,   setEditTarget]   = useState(bounty.targetDescription);
  const [editReward,   setEditReward]   = useState(String(bounty.rewardXp));
  const [editExpiry,   setEditExpiry]   = useState<string>(toDateInputValue(bounty.expiresAt));
  const [editTicket,   setEditTicket]   = useState(bounty.discordTicketUrl ?? "");

  useEffect(() => {
    if (open) {
      setEditTitle(bounty.title);
      setEditDesc(bounty.description);
      setEditTarget(bounty.targetDescription);
      setEditReward(String(bounty.rewardXp));
      setEditExpiry(toDateInputValue(bounty.expiresAt));
      setEditTicket(bounty.discordTicketUrl ?? "");
    }
  }, [open, bounty]);

  // ── Cancel + note form state ───────────────────────────────────────────
  const [cancelReason, setCancelReason] = useState("");
  const [noteBody,     setNoteBody]     = useState("");

  const isResolved = bounty.status === "resolved";
  const isClosed   = bounty.status === "cancelled" || bounty.status === "expired";

  // ── Handlers ────────────────────────────────────────────────────────────

  const submitEdit = () => {
    if (!bounty.id) return;
    const patch: AdminEditBountyPatch = {};
    if (editTitle  !== bounty.title)             patch.title             = editTitle;
    if (editDesc   !== bounty.description)       patch.description       = editDesc;
    if (editTarget !== bounty.targetDescription) patch.targetDescription = editTarget;

    const rewardNum = Number(editReward);
    if (Number.isFinite(rewardNum) && rewardNum !== bounty.rewardXp) patch.rewardXp = rewardNum;

    const expiryDate = editExpiry ? new Date(editExpiry) : null;
    if (expiryDate && expiryDate.getTime() !== bounty.expiresAt.getTime()) patch.expiresAt = expiryDate;

    const ticketTrimmed = editTicket.trim();
    if ((bounty.discordTicketUrl ?? "") !== ticketTrimmed) {
      patch.discordTicketUrl = ticketTrimmed || null;
    }

    if (Object.keys(patch).length === 0) {
      toast.info("No changes to save");
      setEditor("none");
      return;
    }

    startTransition(async () => {
      const res = await adminEditBounty(bounty.id as string, patch);
      if (res.success) {
        toast.success("Bounty updated");
        setEditor("none");
        await reloadActivity();
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not update bounty");
      }
    });
  };

  const submitCancel = () => {
    if (!bounty.id) return;
    const trimmed = cancelReason.trim();
    if (!trimmed) { toast.error("Cancellation reason is required"); return; }
    startTransition(async () => {
      const res = await adminCancelBounty(bounty.id as string, trimmed);
      if (res.success) {
        toast.success("Bounty cancelled");
        setCancelReason("");
        setEditor("none");
        await reloadActivity();
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not cancel bounty");
      }
    });
  };

  const submitNote = () => {
    if (!bounty.id) return;
    const trimmed = noteBody.trim();
    if (!trimmed) { toast.error("Note body is required"); return; }
    startTransition(async () => {
      const res = await adminAddBountyNote(bounty.id as string, trimmed);
      if (res.success) {
        toast.success("Note added");
        setNoteBody("");
        setEditor("none");
        await reloadActivity();
      } else {
        toast.error(res.error ?? "Could not add note");
      }
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto"
        style={{ background: "var(--bg-surface)", borderLeft: "1px solid var(--border-default)" }}
      >
        <SheetHeader className="mb-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge variant={STATUS_VARIANT[bounty.status]}>{bounty.status.toUpperCase()}</Badge>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {bounty.gameSlug}
                </span>
              </div>
              <SheetTitle
                className="font-display font-bold leading-tight"
                style={{ color: "var(--text-primary)", fontSize: 18 }}
              >
                {bounty.title}
              </SheetTitle>
            </div>
          </div>
        </SheetHeader>

        {/* ── Meta block ───────────────────────────────────────────────── */}
        <div className="space-y-3 mb-5">
          <MetaRow label="Target"        value={bounty.targetDescription} />
          <MetaRow label="Reward"        value={`${bounty.rewardXp} XP`} />
          <MetaRow label="Issued by"     value={`${bounty.issuedByName}`} />
          <MetaRow label="Published"     value={formatDateTime(bounty.publishedAt)} />
          <MetaRow label="Published by"  value={bounty.publishedByName} />
          <MetaRow label="Expires"       value={formatDateTime(bounty.expiresAt)} />
          {bounty.claimedBy && (
            <>
              <MetaRow label="Claimed by"   value={bounty.claimedByName ?? bounty.claimedBy} />
              {bounty.claimedAt && <MetaRow label="Claimed at" value={formatDateTime(bounty.claimedAt)} />}
            </>
          )}
          {bounty.resolvedBy && (
            <>
              <MetaRow label="Resolved by" value={bounty.resolvedByName ?? bounty.resolvedBy} />
              {bounty.resolvedAt && <MetaRow label="Resolved at" value={formatDateTime(bounty.resolvedAt)} />}
              {bounty.resolution && <MetaRow label="Resolution"  value={bounty.resolution} />}
              {bounty.resolutionReason && <MetaRow label="Reason" value={bounty.resolutionReason} />}
            </>
          )}
          {bounty.discordTicketUrl && (
            <div className="text-xs flex items-center gap-1.5 pt-1" style={{ color: "var(--text-secondary)" }}>
              <ExternalLink size={12} />
              <a
                href={bounty.discordTicketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:underline"
                style={{ color: "var(--accent)" }}
              >
                Discord intake ticket
              </a>
            </div>
          )}
        </div>

        {/* ── Description ──────────────────────────────────────────────── */}
        <div className="mb-5">
          <p
            className="text-[10px] uppercase tracking-wider mb-1.5"
            style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}
          >
            Description
          </p>
          <p
            className="text-sm leading-relaxed whitespace-pre-wrap"
            style={{ color: "var(--text-secondary)" }}
          >
            {bounty.description}
          </p>
        </div>

        {/* ── Mod actions ─────────────────────────────────────────────── */}
        {!isResolved && !isClosed && (
          <div className="flex flex-wrap gap-2 mb-4">
            <ActionButton
              icon={<Pencil size={13} />}
              label="Edit"
              active={editor === "edit"}
              onClick={() => setEditor(editor === "edit" ? "none" : "edit")}
            />
            <ActionButton
              icon={<AlertTriangle size={13} />}
              label="Cancel (mod)"
              danger
              active={editor === "cancel"}
              onClick={() => setEditor(editor === "cancel" ? "none" : "cancel")}
            />
            <ActionButton
              icon={<StickyNote size={13} />}
              label="Add note"
              active={editor === "note"}
              onClick={() => setEditor(editor === "note" ? "none" : "note")}
            />
          </div>
        )}
        {(isResolved || isClosed) && (
          <div className="flex flex-wrap gap-2 mb-4">
            <ActionButton
              icon={<StickyNote size={13} />}
              label="Add note"
              active={editor === "note"}
              onClick={() => setEditor(editor === "note" ? "none" : "note")}
            />
            <span className="text-xs self-center" style={{ color: "var(--text-muted)" }}>
              {isResolved ? "Resolved bounties cannot be edited." : "Bounty is closed."}
            </span>
          </div>
        )}

        {editor === "edit" && (
          <div
            className="rounded-lg p-4 mb-5 space-y-3"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
          >
            <Field label="Title">
              <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
                className={inputCls()} />
            </Field>
            <Field label="Target description">
              <input type="text" value={editTarget} onChange={e => setEditTarget(e.target.value)}
                className={inputCls()} />
            </Field>
            <Field label="Description">
              <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)}
                rows={4} className={inputCls()} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Reward XP (${BOUNTY_MIN_XP}–${BOUNTY_MAX_XP})`}>
                <input type="number" min={BOUNTY_MIN_XP} max={BOUNTY_MAX_XP} value={editReward}
                  onChange={e => setEditReward(e.target.value)} className={inputCls()} />
              </Field>
              <Field label="Expires (UTC date)">
                <input type="date" value={editExpiry}
                  onChange={e => setEditExpiry(e.target.value)} className={inputCls()} />
              </Field>
            </div>
            <Field label="Discord intake ticket URL (optional)">
              <input type="text" value={editTicket} onChange={e => setEditTicket(e.target.value)}
                placeholder="https://discord.com/channels/…" className={inputCls()} />
            </Field>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditor("none")} className={secondaryBtnCls()}>
                Cancel
              </button>
              <button type="button" onClick={submitEdit} disabled={pending} className={primaryBtnCls(pending)}>
                {pending && <Loader2 size={13} className="animate-spin" />}
                Save changes
              </button>
            </div>
          </div>
        )}

        {editor === "cancel" && (
          <div
            className="rounded-lg p-4 mb-5 space-y-3"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Mod-override cancel. The issuer + hunter (if claimed) will be notified with your reason.
            </p>
            <Field label="Cancellation reason (required)">
              <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                rows={3} className={inputCls()} />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditor("none")} className={secondaryBtnCls()}>
                Back
              </button>
              <button type="button" onClick={submitCancel} disabled={pending} className={dangerBtnCls(pending)}>
                {pending && <Loader2 size={13} className="animate-spin" />}
                Cancel bounty
              </button>
            </div>
          </div>
        )}

        {editor === "note" && (
          <div
            className="rounded-lg p-4 mb-5 space-y-3"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
          >
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Internal note — visible to moderators only. Never sent to Discord or the bounty parties.
            </p>
            <Field label={`Note body (≤${ACTIVITY_NOTE_MAX} chars)`}>
              <textarea value={noteBody} onChange={e => setNoteBody(e.target.value)}
                rows={4} maxLength={ACTIVITY_NOTE_MAX} className={inputCls()} />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditor("none")} className={secondaryBtnCls()}>
                Cancel
              </button>
              <button type="button" onClick={submitNote} disabled={pending} className={primaryBtnCls(pending)}>
                {pending && <Loader2 size={13} className="animate-spin" />}
                Add note
              </button>
            </div>
          </div>
        )}

        {/* ── Activity feed ────────────────────────────────────────────── */}
        <div
          className="rounded-lg p-4"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <p
              className="text-[10px] uppercase tracking-wider"
              style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}
            >
              Activity
            </p>
            {activityLoading && <Loader2 size={12} className="animate-spin" style={{ color: "var(--text-muted)" }} />}
          </div>
          {activity === null ? (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Loading…</p>
          ) : activity.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>No activity recorded.</p>
          ) : (
            <ul className="space-y-3">
              {activity.map(entry => <ActivityRow key={entry.id} entry={entry} />)}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 text-xs">
      <span className="shrink-0 w-24" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="flex-1 break-words" style={{ color: "var(--text-secondary)" }}>{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>{label}</span>
      {children}
    </label>
  );
}

function ActionButton({
  icon, label, danger, active, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
      style={{
        background: active
          ? (danger ? "rgba(239,68,68,0.15)" : "rgba(99,102,241,0.15)")
          : "var(--bg-elevated)",
        color: active
          ? (danger ? "var(--danger)" : "var(--accent)")
          : "var(--text-secondary)",
        border: `1px solid ${active
          ? (danger ? "rgba(239,68,68,0.45)" : "rgba(99,102,241,0.45)")
          : "var(--border-default)"}`,
      }}
    >
      {icon} {label}
      {active && <XIcon size={11} />}
    </button>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  return (
    <li className="flex gap-3">
      <span
        className="shrink-0 mt-1 w-1.5 h-1.5 rounded-full"
        style={{ background: ACTIVITY_COLOUR[entry.kind] }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
            {ACTIVITY_LABEL[entry.kind]}
          </span>
          <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
            {formatDateTime(entry.createdAt)}
          </span>
        </div>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
          by {entry.actorName}{entry.actorRole ? ` (${entry.actorRole})` : ""}
        </p>
        {entry.reason && (
          <p className="text-xs mt-1 whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
            <span style={{ color: "var(--text-muted)" }}>Reason:</span> {entry.reason}
          </p>
        )}
        {entry.body && (
          <p className="text-xs mt-1 whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
            {entry.body}
          </p>
        )}
        {entry.changes && entry.changes.length > 0 && (
          <ul className="text-[11px] mt-1 space-y-0.5" style={{ color: "var(--text-secondary)" }}>
            {entry.changes.map(c => (
              <li key={c.field} className="tabular-nums">
                <span style={{ color: "var(--text-muted)" }}>{c.field}:</span>{" "}
                <span style={{ color: "var(--danger)" }}>{c.from}</span>
                {" → "}
                <span style={{ color: "var(--success)" }}>{c.to}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function inputCls() {
  return "w-full rounded-md px-3 py-2 text-sm outline-none bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] focus:border-[var(--accent)]";
}

function primaryBtnCls(pending: boolean) {
  return `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white ${pending ? "opacity-60 cursor-not-allowed" : ""}`
    + " bg-[var(--accent)]";
}

function secondaryBtnCls() {
  return "px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)]";
}

function dangerBtnCls(pending: boolean) {
  return `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white ${pending ? "opacity-60 cursor-not-allowed" : ""}`
    + " bg-[var(--danger)]";
}

function formatDateTime(d: Date): string {
  // Compact UTC formatting — mods cross timezones, ISO yyyy-mm-dd hh:mm
  // avoids ambiguity. Seconds dropped because per-entry timing precision
  // doesn't help the audit narrative.
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

function toDateInputValue(d: Date): string {
  // <input type="date"> expects yyyy-mm-dd in LOCAL time; we coerce to the
  // local date string so timezone offsets don't shift the displayed day.
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
