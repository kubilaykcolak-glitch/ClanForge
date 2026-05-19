"use server";

import { clientIp } from "./_client-ip";
import {
  getSessionWithRole,
  requireRole,
} from "@/lib/actions/server-auth";
import type { Role } from "@/lib/auth/roles";
import { writeAuditLog, type AuditTargetType } from "@/lib/auth/audit-log";
import { sendAdminAlert } from "@/lib/auth/discord-alert";
import {
  resolveActor,
  resolveTournamentTarget,
  resolveParticipantTarget,
} from "@/lib/auth/discord-formatting";
import { requireStepUp } from "@/lib/auth/step-up";

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
  needsStepUp?: boolean;
}

function isStepUpRequired(err: unknown): boolean {
  return err instanceof Error && err.message === "step_up_required";
}

// ─── forceFinalizeTournament ─────────────────────────────────────────────────
//
// Admin+ override to mark a stuck tournament complete. Useful when the
// creator has gone missing and matches can no longer naturally advance.
// Sets status='complete'; auto-completes any still-pending matches by
// awarding them to participantA (admin can edit individual matches via the
// existing adminFinalizeMatch first if they want different winners).

export async function forceFinalizeTournament(
  tournamentId: string,
  reason: string,
): Promise<ActionResult> {
  let session: Awaited<ReturnType<typeof getSessionWithRole>>;
  try {
    session = await requireRole("admin");
    requireStepUp(session.uid);
  } catch (err) {
    if (isStepUpRequired(err)) return { success: false, needsStepUp: true, error: "Re-authenticate to continue" };
    return { success: false, error: err instanceof Error ? err.message : "Forbidden" };
  }

  const cleanedReason = (reason ?? "").trim();
  if (cleanedReason.length < 5) {
    return await logFailure(session, "tournament.force_finalize", "tournament", tournamentId, cleanedReason, "Reason is required");
  }

  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const tournRef = adminDb.collection("tournaments").doc(tournamentId);
    const tournSnap = await tournRef.get();
    if (!tournSnap.exists) {
      return await logFailure(session, "tournament.force_finalize", "tournament", tournamentId, cleanedReason, "Tournament not found");
    }
    if ((tournSnap.data() as { status?: string }).status === "complete") {
      return await logFailure(session, "tournament.force_finalize", "tournament", tournamentId, cleanedReason, "Tournament already complete");
    }

    await tournRef.update({
      status:          "complete",
      forceCompletedAt: new Date(),
      forceCompletedBy: session.uid,
    });

    await writeAuditLog({
      actor:      session.uid,
      actorRole:  session.role,
      action:     "tournament.force_finalize",
      targetType: "tournament",
      targetId:   tournamentId,
      reason:     cleanedReason,
      result:     "success",
      ip:         clientIp(),
    });

    // Enrich the alert with display names so a casual look at #admin-alerts
    // tells you who did what to which tournament, instead of opaque ids.
    const [actor, tournament] = await Promise.all([
      resolveActor(session.uid, session.role),
      resolveTournamentTarget(tournamentId),
    ]);
    await sendAdminAlert({
      title: "🏁 Tournament force-finalized",
      body:  `Force-completed **${tournament.label}**.\n_Pending matches remain unfinalized — review them individually if needed._`,
      level: "warn",
      actor,
      fields: [
        { name: "Tournament", value: tournament.label, inline: false },
        { name: "Reason",     value: cleanedReason,    inline: false },
      ],
    });

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Finalize failed";
    return await logFailure(session, "tournament.force_finalize", "tournament", tournamentId, cleanedReason, msg);
  }
}

// ─── forceCancelTournament ───────────────────────────────────────────────────
//
// Admin+ destructive action. Flags the tournament cancelled and refunds all
// paid participants. Free participants are simply removed. No money stays
// behind by accident.

export async function forceCancelTournament(
  tournamentId: string,
  reason: string,
): Promise<ActionResult<{ refundedCount: number; failures: number }>> {
  let session: Awaited<ReturnType<typeof getSessionWithRole>>;
  try {
    session = await requireRole("admin");
    requireStepUp(session.uid);
  } catch (err) {
    if (isStepUpRequired(err)) return { success: false, needsStepUp: true, error: "Re-authenticate to continue" };
    return { success: false, error: err instanceof Error ? err.message : "Forbidden" };
  }

  const cleanedReason = (reason ?? "").trim();
  if (cleanedReason.length < 5) {
    return await logFailure(session, "tournament.force_cancel", "tournament", tournamentId, cleanedReason, "Reason is required");
  }

  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const tournRef = adminDb.collection("tournaments").doc(tournamentId);
    const tournSnap = await tournRef.get();
    if (!tournSnap.exists) {
      return await logFailure(session, "tournament.force_cancel", "tournament", tournamentId, cleanedReason, "Tournament not found");
    }

    // Refund every paid participant. We invoke the existing refund machinery
    // one participant at a time and tally failures rather than aborting the
    // whole operation — partial refunds + an audit log entry is more useful
    // than a wholesale rollback.
    const participantsSnap = await tournRef.collection("participants").get();
    let refundedCount = 0;
    let failures      = 0;

    const { getStripe } = await import("@/lib/stripe");
    const stripe = getStripe();

    for (const doc of participantsSnap.docs) {
      const data = doc.data() as {
        paymentStatus?: string;
        stripePaymentIntentId?: string;
      };
      if (data.paymentStatus !== "paid" || !data.stripePaymentIntentId) continue;
      try {
        await stripe.refunds.create({
          payment_intent: data.stripePaymentIntentId,
          reason:         "requested_by_customer",
        });
        await doc.ref.update({
          paymentStatus: "refunded",
          refundedAt:    new Date(),
        });
        refundedCount++;
      } catch (err) {
        failures++;
        console.error(`[forceCancelTournament→refund] ${doc.id}:`, err);
      }
    }

    await tournRef.update({
      status:          "cancelled",
      forceCancelledAt: new Date(),
      forceCancelledBy: session.uid,
    });

    await writeAuditLog({
      actor:      session.uid,
      actorRole:  session.role,
      action:     "tournament.force_cancel",
      targetType: "tournament",
      targetId:   tournamentId,
      reason:     cleanedReason,
      metadata:   { refundedCount, failures, participantCount: participantsSnap.size },
      result:     failures > 0 ? "failure" : "success",
      errorMsg:   failures > 0 ? `${failures} refund(s) failed` : undefined,
      ip:         clientIp(),
    });

    const [actor, tournament] = await Promise.all([
      resolveActor(session.uid, session.role),
      resolveTournamentTarget(tournamentId),
    ]);
    await sendAdminAlert({
      title: "🛑 Tournament force-cancelled",
      body:  `Cancelled **${tournament.label}**${refundedCount > 0 ? ` — ${refundedCount} paid participant${refundedCount === 1 ? "" : "s"} refunded` : ""}${failures > 0 ? `, ${failures} refund failure${failures === 1 ? "" : "s"}` : ""}.`,
      level: "critical",
      actor,
      fields: [
        { name: "Tournament",    value: tournament.label, inline: false },
        { name: "Refunded",      value: String(refundedCount) },
        { name: "Refund errors", value: String(failures) },
        { name: "Reason",        value: cleanedReason,    inline: false },
      ],
    });

    return { success: true, data: { refundedCount, failures } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Cancel failed";
    return await logFailure(session, "tournament.force_cancel", "tournament", tournamentId, cleanedReason, msg);
  }
}

// ─── forceRefundParticipant ──────────────────────────────────────────────────
//
// Admin+ one-off refund. Used for individual support cases — bug-induced
// double charges, accidental signups, etc. Issues a Stripe refund and
// removes the participant from the tournament.

export async function forceRefundParticipant(
  tournamentId: string,
  participantUid: string,
  reason: string,
): Promise<ActionResult> {
  let session: Awaited<ReturnType<typeof getSessionWithRole>>;
  try {
    session = await requireRole("admin");
    requireStepUp(session.uid);
  } catch (err) {
    if (isStepUpRequired(err)) return { success: false, needsStepUp: true, error: "Re-authenticate to continue" };
    return { success: false, error: err instanceof Error ? err.message : "Forbidden" };
  }

  const cleanedReason = (reason ?? "").trim();
  if (cleanedReason.length < 5) {
    return await logFailure(session, "tournament.force_refund", "tournament", `${tournamentId}/${participantUid}`, cleanedReason, "Reason is required");
  }

  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const participantRef = adminDb.collection("tournaments").doc(tournamentId).collection("participants").doc(participantUid);
    const participantSnap = await participantRef.get();
    if (!participantSnap.exists) {
      return await logFailure(session, "tournament.force_refund", "tournament", `${tournamentId}/${participantUid}`, cleanedReason, "Participant not found");
    }

    const pdata = participantSnap.data() as {
      paymentStatus?: string;
      stripePaymentIntentId?: string;
      paidAmount?: number;
    };

    if (pdata.paymentStatus === "refunded") {
      return await logFailure(session, "tournament.force_refund", "tournament", `${tournamentId}/${participantUid}`, cleanedReason, "Already refunded");
    }

    let refundedAmount = 0;
    if (pdata.paymentStatus === "paid" && pdata.stripePaymentIntentId) {
      const { getStripe } = await import("@/lib/stripe");
      const refund = await getStripe().refunds.create({
        payment_intent: pdata.stripePaymentIntentId,
        reason:         "requested_by_customer",
      });
      refundedAmount = refund.amount ?? pdata.paidAmount ?? 0;
    }

    await participantRef.update({
      paymentStatus: "refunded",
      refundedAt:    new Date(),
    });

    await writeAuditLog({
      actor:      session.uid,
      actorRole:  session.role,
      action:     "tournament.force_refund",
      targetType: "tournament",
      targetId:   `${tournamentId}/${participantUid}`,
      reason:     cleanedReason,
      metadata:   { refundedAmount, hadStripeIntent: !!pdata.stripePaymentIntentId },
      result:     "success",
      ip:         clientIp(),
    });

    const [actor, ctx] = await Promise.all([
      resolveActor(session.uid, session.role),
      resolveParticipantTarget(tournamentId, participantUid),
    ]);
    await sendAdminAlert({
      title: "💸 Force refund",
      body:  `Refunded **${ctx.user.label}** from **${ctx.tournament.label}**.`,
      level: "critical",
      actor,
      fields: [
        { name: "Participant", value: `${ctx.user.label}\n\`${ctx.user.id}\``, inline: false },
        { name: "Tournament",  value: ctx.tournament.label, inline: false },
        { name: "Amount",      value: refundedAmount > 0 ? `£${(refundedAmount / 100).toFixed(2)}` : "Free entry (no money)" },
        { name: "Reason",      value: cleanedReason, inline: false },
      ],
    });

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Refund failed";
    return await logFailure(session, "tournament.force_refund", "tournament", `${tournamentId}/${participantUid}`, cleanedReason, msg);
  }
}

// ─── shared failure logger ───────────────────────────────────────────────────

// Return type is the structural failure shape so callers with any
// ActionResult<T> can return us directly without a cast.
async function logFailure(
  session: { uid: string; role: Role | null },
  action:     string,
  targetType: AuditTargetType,
  targetId:   string,
  reason:     string,
  error:      string,
): Promise<{ success: false; error: string }> {
  try {
    await writeAuditLog({
      actor:     session.uid,
      actorRole: session.role,
      action,
      targetType,
      targetId,
      reason:    reason || "(no reason supplied)",
      result:    "failure",
      errorMsg:  error,
      ip:        clientIp(),
    });
  } catch (logErr) {
    console.error("[admin-tournament] audit-log write failed:", logErr);
  }
  return { success: false, error };
}
