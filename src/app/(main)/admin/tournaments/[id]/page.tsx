import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { adminGetTournamentDetail, getMyRole } from "@/lib/actions/admin.actions";
import { AdminTournamentActions } from "@/components/admin/AdminTournamentActions";

interface Participant {
  uid:             string;
  displayName:     string | null;
  paymentStatus:   string | null;
  paidAmount:      number;
  registeredAt:    string | null;
  refundedAt:      string | null;
}

// ─── /admin/tournaments/[id] ─────────────────────────────────────────────────
// Read-only server-rendered detail page plus a client island for the
// destructive admin actions (force-finalize / force-cancel / per-participant
// refund). All gated by step-up.

export default async function AdminTournamentDetailPage({ params }: { params: { id: string } }) {
  const meRes  = await getMyRole();
  const myRole = meRes.success ? meRes.data?.role ?? null : null;
  if (myRole !== "admin" && myRole !== "super_admin") redirect("/admin");

  const res = await adminGetTournamentDetail(params.id);
  if (!res.success || !res.data) notFound();
  const t = res.data.tournament as Record<string, unknown>;
  const participants = res.data.participants;

  const status = (t.status as string) ?? "?";
  const isPaid = !!t.isPaid;

  return (
    <div>
      <div className="mb-4">
        <Link href="/admin/tournaments" className="text-xs" style={{ color: "var(--text-muted)" }}>
          ← All tournaments
        </Link>
      </div>

      <div className="mb-6 flex items-baseline gap-3 flex-wrap">
        <h1 className="font-display font-bold text-2xl" style={{ color: "var(--text-primary)" }}>
          {(t.name as string) ?? "(unnamed)"}
        </h1>
        <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded"
          style={{
            background: status === "live" ? "rgba(34,197,94,0.15)"
              : status === "cancelled" ? "rgba(239,68,68,0.15)"
              : status === "complete" ? "var(--bg-overlay)"
              : "rgba(99,102,241,0.15)",
            color: status === "live" ? "var(--success)"
              : status === "cancelled" ? "var(--danger)"
              : status === "complete" ? "var(--text-muted)"
              : "var(--accent)",
            border: "1px solid currentColor",
          }}>
          {status}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <DetailCard title="Tournament">
          <DetailRow label="ID"       value={(t.id as string) ?? ""} mono />
          <DetailRow label="Game"     value={(t.game as string) ?? "?"} />
          <DetailRow label="Format"   value={(t.format as string) ?? "?"} />
          <DetailRow label="Provider" value={(t.gameProvider as string | null) ?? "(manual)"} />
          <DetailRow label="Participants" value={`${t.participantCount ?? 0} / ${t.maxParticipants ?? 0}`} />
          <DetailRow label="Creator"  value={(t.creatorId as string) ?? "?"} mono />
        </DetailCard>

        <DetailCard title="Money">
          <DetailRow label="Paid"           value={isPaid ? "yes" : "free"} />
          <DetailRow label="Entry fee"      value={`£${((t.entryFee as number ?? 0) / 100).toFixed(2)}`} />
          <DetailRow label="Prize pool"     value={`£${((t.prizePool as number ?? 0) / 100).toFixed(2)}`} />
          <DetailRow label="Platform fee %" value={String(t.platformFeePct ?? "—")} />
        </DetailCard>
      </div>

      {/* Actions */}
      <AdminTournamentActions
        tournamentId={params.id}
        canForce={status !== "complete" && status !== "cancelled"}
      />

      {/* Participants */}
      <div className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>
          Participants ({participants.length})
        </h2>
        {participants.length === 0 ? (
          <p className="text-xs py-4 text-center rounded-xl"
            style={{ color: "var(--text-muted)", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
            No participants yet.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {participants.map(p => <ParticipantRow key={p.uid} p={p} tournamentId={params.id} isPaid={isPaid} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Layout helpers ──────────────────────────────────────────────────────────

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
      <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>
        {title}
      </h2>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className={`text-xs text-right truncate ${mono ? "font-mono" : ""}`}
        style={{ color: "var(--text-primary)" }}>
        {value}
      </span>
    </div>
  );
}

// Inline client island for per-participant refund. Defined in its own
// component file so it can use the useStepUp hook.
import { AdminParticipantRefundButton } from "@/components/admin/AdminParticipantRefundButton";

function ParticipantRow({ p, tournamentId, isPaid }: { p: Participant; tournamentId: string; isPaid: boolean }) {
  const paid = p.paymentStatus === "paid";
  return (
    <div className="rounded-lg px-3 py-2 flex items-center gap-3"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
          {p.displayName ?? <span style={{ color: "var(--text-muted)" }}>(no name)</span>}
        </p>
        <p className="text-[10px] font-mono truncate" style={{ color: "var(--text-muted)" }}>
          {p.uid}
        </p>
      </div>
      {isPaid && (
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
          style={{
            background: paid ? "rgba(34,197,94,0.10)"
              : p.paymentStatus === "refunded" ? "rgba(239,68,68,0.10)"
              : "var(--bg-overlay)",
            color: paid ? "var(--success)"
              : p.paymentStatus === "refunded" ? "var(--danger)"
              : "var(--text-muted)",
            border: "1px solid currentColor",
          }}
        >
          {p.paymentStatus ?? "—"}
        </span>
      )}
      {isPaid && paid && (
        <AdminParticipantRefundButton tournamentId={tournamentId} participantUid={p.uid} />
      )}
    </div>
  );
}
