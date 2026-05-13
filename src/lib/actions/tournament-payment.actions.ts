"use server";

// ─── Tournament payment server actions ────────────────────────────────────────
//
// All actions in this file deal with money flowing in and out of paid
// tournaments. Pure Firestore writes live in tournament.actions.ts; this
// file is specifically for the Stripe-backed lifecycle.

import { FieldValue } from "firebase-admin/firestore";
import type { Profile } from "@/types";

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
}

// ─── createCheckoutSession ────────────────────────────────────────────────────
// Called when a logged-in user clicks "Register & Pay" on a paid tournament.
//
//   1. Validates: tournament exists, is paid, is open, not full, registration
//      not closed, user not already registered (paid or pending).
//   2. Sweeps any stale "pending_payment" draft for this (uid, tournamentId)
//      so retries always start clean.
//   3. Writes a fresh draft participant doc with paymentStatus="pending_payment".
//   4. Creates a Stripe Checkout Session and returns its URL.
//
// The participant is NOT yet considered registered. The Stripe webhook flips
// the status to "paid" once payment is confirmed. See /api/webhooks/stripe.

export async function createCheckoutSession(
  uid:           string,
  tournamentId:  string,
  profile:       Pick<Profile, "displayName" | "avatarUrl">,
): Promise<ActionResult<{ checkoutUrl: string }>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const { getStripe } = await import("@/lib/stripe");

    const tournamentRef  = adminDb.collection("tournaments").doc(tournamentId);
    const participantRef = tournamentRef.collection("participants").doc(uid);

    const [tournamentSnap, existingSnap] = await Promise.all([
      tournamentRef.get(),
      participantRef.get(),
    ]);

    if (!tournamentSnap.exists) {
      return { success: false, error: "Tournament not found" };
    }

    const tournament = tournamentSnap.data()!;

    if (!tournament.isPaid || (tournament.entryFee as number) <= 0) {
      return { success: false, error: "This tournament does not require payment" };
    }
    if (tournament.status !== "open") {
      return { success: false, error: "Registration is closed" };
    }
    const closesAt = tournament.registrationClosesAt?.toDate?.() ?? new Date(0);
    if (closesAt <= new Date()) {
      return { success: false, error: "Registration is closed" };
    }
    if ((tournament.participantCount as number) >= (tournament.maxParticipants as number)) {
      return { success: false, error: "This tournament is full" };
    }

    // Reject if the user already has a confirmed seat. A leftover "pending"
    // draft is swept below so retries work cleanly.
    if (existingSnap.exists) {
      const existing = existingSnap.data()!;
      if (existing.paymentStatus === "paid") {
        return { success: false, error: "You are already registered for this tournament" };
      }
      // Defensive cleanup of stale pending docs.
      await participantRef.delete();
    }

    const entryFeePence = tournament.entryFee as number;
    const appUrl        = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const successUrl    = `${appUrl}/tournaments/${tournamentId}?payment=success`;
    const cancelUrl     = `${appUrl}/tournaments/${tournamentId}?payment=cancelled`;

    // Create the Stripe Checkout session FIRST so we have its id to stamp on
    // the draft participant. If Stripe fails we don't have a phantom doc.
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode:           "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency:     "gbp",
            unit_amount:  entryFeePence,
            product_data: {
              name:        `Entry — ${tournament.name}`,
              description: `Tournament entry fee for "${tournament.name}".`,
            },
          },
        },
      ],
      // Lets the user retry if they close the tab; expires after 24 h.
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      // These pop up in the webhook and let us reconcile to the participant.
      metadata: {
        tournamentId,
        userId: uid,
      },
      success_url: successUrl,
      cancel_url:  cancelUrl,
    });

    if (!session.url) {
      return { success: false, error: "Stripe failed to create a checkout session" };
    }

    // Write the draft participant now that we have the session id.
    await participantRef.set({
      userId:                  uid,
      seed:                    0,
      status:                  "registered",
      paymentStatus:           "pending_payment",
      stripeCheckoutSessionId: session.id,
      registeredAt:            new Date(),
      displayName:             profile.displayName,
      avatarUrl:               profile.avatarUrl ?? null,
    });

    return { success: true, data: { checkoutUrl: session.url } };
  } catch (err) {
    console.error("[createCheckoutSession]", err);
    const message = err instanceof Error ? err.message : "Failed to start payment";
    return { success: false, error: message };
  }
}

// ─── confirmPaidParticipant (called from the webhook) ─────────────────────────
// Promotes a pending_payment participant to paid, increments the tournament's
// participantCount, and grows the prize pool by the per-entry delta.
//
// Idempotent: re-running on an already-paid participant is a no-op.

export async function confirmPaidParticipant(
  tournamentId:          string,
  uid:                   string,
  stripeCheckoutSessionId: string,
  stripePaymentIntentId: string,
  amountPaidPence:       number,
): Promise<ActionResult<{ alreadyPaid: boolean }>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const { prizePoolDeltaForEntry, DEFAULT_PLATFORM_FEE_PCT } = await import("@/lib/prize-splits");

    const tournamentRef  = adminDb.collection("tournaments").doc(tournamentId);
    const participantRef = tournamentRef.collection("participants").doc(uid);

    return await adminDb.runTransaction(async tx => {
      const [tSnap, pSnap] = await Promise.all([tx.get(tournamentRef), tx.get(participantRef)]);

      if (!tSnap.exists) {
        return { success: false, error: "Tournament not found" };
      }
      if (!pSnap.exists) {
        return { success: false, error: "Participant draft not found" };
      }

      const tournament = tSnap.data()!;
      const participant = pSnap.data()!;

      // Idempotency: webhook may retry; skip if already promoted.
      if (participant.paymentStatus === "paid") {
        return { success: true, data: { alreadyPaid: true } };
      }

      // Late arrival: tournament filled up between Checkout and webhook.
      // The webhook caller is responsible for issuing the refund — we just
      // return the situation so it can act.
      const isFull = (tournament.participantCount as number) >= (tournament.maxParticipants as number);
      const isClosed = tournament.status !== "open";
      if (isFull || isClosed) {
        return {
          success: false,
          error:   isFull ? "Tournament filled up before payment confirmed" : "Tournament no longer open",
        };
      }

      const feePct = (tournament.platformFeePct as number) ?? DEFAULT_PLATFORM_FEE_PCT;
      const prizeDelta = prizePoolDeltaForEntry(amountPaidPence, feePct);

      tx.update(participantRef, {
        paymentStatus:         "paid",
        stripePaymentIntentId: stripePaymentIntentId,
        // Re-stamp the session id defensively in case the draft was rewritten.
        stripeCheckoutSessionId: stripeCheckoutSessionId,
        paidAmount:            amountPaidPence,
        paidAt:                new Date(),
      });
      tx.update(tournamentRef, {
        participantCount: FieldValue.increment(1),
        prizePool:        FieldValue.increment(prizeDelta),
      });

      return { success: true, data: { alreadyPaid: false } };
    });
  } catch (err) {
    console.error("[confirmPaidParticipant]", err);
    const message = err instanceof Error ? err.message : "Failed to confirm payment";
    return { success: false, error: message };
  }
}

// ─── refundLatePayment ────────────────────────────────────────────────────────
// Webhook helper: when the tournament filled up or was cancelled between
// Checkout and confirmation, refund the payment immediately and delete the
// pending participant.

export async function refundLatePayment(
  tournamentId: string,
  uid:          string,
  paymentIntentId: string,
): Promise<ActionResult> {
  try {
    const { adminDb }   = await import("@/lib/firebase/admin");
    const { getStripe } = await import("@/lib/stripe");

    await getStripe().refunds.create({
      payment_intent: paymentIntentId,
      reason:         "requested_by_customer",
    });

    await adminDb
      .collection("tournaments").doc(tournamentId)
      .collection("participants").doc(uid)
      .delete();

    return { success: true };
  } catch (err) {
    console.error("[refundLatePayment]", err);
    const message = err instanceof Error ? err.message : "Failed to refund late payment";
    return { success: false, error: message };
  }
}

// ─── withdrawPaidEntry ────────────────────────────────────────────────────────
// Participant-initiated refund. Allowed until registrationClosesAt.
//
// Refund happens BEFORE we touch Firestore so that a Stripe failure leaves
// the participant doc intact (the user can retry and we never end up with
// a refunded user still listed). Once the refund succeeds, we run a
// transaction that deletes the participant, decrements participantCount,
// and shrinks the prizePool by the same delta used at registration time.

export async function withdrawPaidEntry(
  uid:           string,
  tournamentId:  string,
): Promise<ActionResult> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const { getStripe } = await import("@/lib/stripe");
    const { prizePoolDeltaForEntry, DEFAULT_PLATFORM_FEE_PCT } = await import("@/lib/prize-splits");

    const tournamentRef  = adminDb.collection("tournaments").doc(tournamentId);
    const participantRef = tournamentRef.collection("participants").doc(uid);

    const [tSnap, pSnap] = await Promise.all([tournamentRef.get(), participantRef.get()]);

    if (!tSnap.exists)  return { success: false, error: "Tournament not found" };
    if (!pSnap.exists)  return { success: false, error: "You are not registered for this tournament" };

    const tournament  = tSnap.data()!;
    const participant = pSnap.data()!;

    if (participant.paymentStatus !== "paid") {
      return {
        success: false,
        error:   "Only paid participants can be refunded. Free entries can just leave the tournament.",
      };
    }

    const closesAt = tournament.registrationClosesAt?.toDate?.() ?? new Date(0);
    if (closesAt <= new Date()) {
      return { success: false, error: "Registration has closed — refunds are no longer available." };
    }

    const paymentIntentId = participant.stripePaymentIntentId as string | undefined;
    if (!paymentIntentId) {
      return { success: false, error: "Missing payment reference. Contact support via Discord." };
    }

    // 1) Issue the refund first — Stripe is the source of truth.
    await getStripe().refunds.create({
      payment_intent: paymentIntentId,
      reason:         "requested_by_customer",
    });

    // 2) Now mirror the change in Firestore, transactionally.
    const paidAmount = (participant.paidAmount as number) ?? (tournament.entryFee as number);
    const feePct     = (tournament.platformFeePct as number) ?? DEFAULT_PLATFORM_FEE_PCT;
    const prizeDelta = prizePoolDeltaForEntry(paidAmount, feePct);

    await adminDb.runTransaction(async tx => {
      tx.delete(participantRef);
      tx.update(tournamentRef, {
        participantCount: FieldValue.increment(-1),
        prizePool:        FieldValue.increment(-prizeDelta),
      });
    });

    return { success: true };
  } catch (err) {
    console.error("[withdrawPaidEntry]", err);
    const message = err instanceof Error ? err.message : "Withdrawal failed";
    return { success: false, error: message };
  }
}

// ─── cancelTournament ─────────────────────────────────────────────────────────
// Creator (or platform admin) cancels the tournament. All paid participants
// get a full refund regardless of whether registration has closed. Pending
// drafts are deleted with no refund (no charge ever completed).

export async function cancelTournament(
  uid:          string,
  tournamentId: string,
): Promise<ActionResult<{ refundedCount: number }>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const { getStripe } = await import("@/lib/stripe");

    const tournamentRef  = adminDb.collection("tournaments").doc(tournamentId);
    const participantsCol = tournamentRef.collection("participants");

    const [tSnap, profileSnap] = await Promise.all([
      tournamentRef.get(),
      adminDb.collection("profiles").doc(uid).get(),
    ]);

    if (!tSnap.exists) return { success: false, error: "Tournament not found" };

    const tournament = tSnap.data()!;
    const isCreator  = tournament.creatorId === uid;
    const isAdmin    = (profileSnap.data()?.isAdmin as boolean) === true;

    if (!isCreator && !isAdmin) {
      return { success: false, error: "Only the tournament creator or a platform admin can cancel" };
    }
    if (tournament.status === "cancelled") {
      return { success: false, error: "Tournament is already cancelled" };
    }
    if (tournament.status === "complete") {
      return { success: false, error: "Tournament has already finished — it cannot be cancelled" };
    }

    // Fetch all participants. Paid: refund + delete. Pending: delete.
    // Free: delete. Loop sequentially so one Stripe failure aborts cleanly.
    const participantsSnap = await participantsCol.get();
    let refundedCount = 0;

    for (const doc of participantsSnap.docs) {
      const data = doc.data();
      if (data.paymentStatus === "paid" && data.stripePaymentIntentId) {
        await getStripe().refunds.create({
          payment_intent: data.stripePaymentIntentId,
          reason:         "requested_by_customer",
        });
        refundedCount += 1;
      }
      await doc.ref.delete();
    }

    await tournamentRef.update({
      status:           "cancelled",
      participantCount: 0,
      prizePool:        0,
    });

    return { success: true, data: { refundedCount } };
  } catch (err) {
    console.error("[cancelTournament]", err);
    const message = err instanceof Error ? err.message : "Cancellation failed";
    return { success: false, error: message };
  }
}

// ─── finalizeTournament ───────────────────────────────────────────────────────
// Creator (or admin) declares the final standings. We compute the per-position
// payouts from prizeSplit + prizePool, write one PrizePayout doc per winner
// to /tournaments/{id}/prizes, mark the participants as "winner" / "eliminated",
// and flip the tournament status to "complete". No payouts leave Stripe at
// this point — winners claim manually via Discord (see initiatePrizeClaim).
//
// Idempotent: if status is already "complete" we no-op.

export async function finalizeTournament(
  uid:            string,
  tournamentId:   string,
  /** Ordered list of winning userIds: index 0 = 1st place, 1 = 2nd, … */
  winnerUserIds:  string[],
): Promise<ActionResult<{ prizesCreated: number }>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const { computePayouts, getPresetPositionsCount } = await import("@/lib/prize-splits");

    const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
    const prizesCol     = tournamentRef.collection("prizes");

    const [tSnap, profileSnap] = await Promise.all([
      tournamentRef.get(),
      adminDb.collection("profiles").doc(uid).get(),
    ]);

    if (!tSnap.exists) return { success: false, error: "Tournament not found" };

    const tournament = tSnap.data()!;
    const isCreator  = tournament.creatorId === uid;
    const isAdmin    = (profileSnap.data()?.isAdmin as boolean) === true;
    if (!isCreator && !isAdmin) {
      return { success: false, error: "Only the tournament creator or a platform admin can finalize" };
    }
    if (tournament.status === "complete") {
      return { success: false, error: "Tournament is already finalized" };
    }
    if (tournament.status === "cancelled") {
      return { success: false, error: "Cancelled tournaments cannot be finalized" };
    }

    const prizePool  = (tournament.prizePool as number) ?? 0;
    const prizeSplit = tournament.prizeSplit;

    let prizesCreated = 0;
    const batch = adminDb.batch();

    // Compute payouts only when there's a real prize pool. Free tournaments
    // with no creator-funded prize pool still finalize — they just don't
    // create any prize records.
    if (prizePool > 0 && prizeSplit) {
      const expectedPositions = getPresetPositionsCount(prizeSplit);
      // The bracket may not have filled every payable position (e.g. top_5
      // with 3 participants). Use min(expected, winnerUserIds.length,
      // participantCount). Unused prize-pool money stays in the platform
      // account by design (logged in createPayout for audit).
      const filledPositions = Math.min(
        expectedPositions,
        winnerUserIds.length,
        tournament.participantCount as number,
      );

      const payouts = computePayouts(prizePool, prizeSplit).slice(0, filledPositions);
      const shortRef = tournamentId.slice(0, 6).toLowerCase();

      payouts.forEach((p, i) => {
        const winnerUid = winnerUserIds[i];
        if (!winnerUid) return;

        const prizeRef = prizesCol.doc();
        batch.set(prizeRef, {
          tournamentId,
          participantId:  winnerUid,
          position:       p.position,
          amount:         p.amount,
          status:         "pending",
          claimReference: `TRN-${shortRef}-${p.position}`,
          computedAt:     new Date(),
        });
        prizesCreated += 1;

        if (p.position === 1) {
          const participantRef = tournamentRef.collection("participants").doc(winnerUid);
          batch.update(participantRef, { status: "winner" });
        }
      });

      // Log if any pot stayed in the platform account.
      const distributed = payouts.reduce((s, p) => s + p.amount, 0);
      if (distributed < prizePool) {
        console.log(
          `[finalizeTournament] ${prizePool - distributed} pence stayed in platform account ` +
          `for tournament ${tournamentId} (${expectedPositions - filledPositions} unfilled positions)`,
        );
      }
    } else if (winnerUserIds[0]) {
      // No money, but still mark the 1st-placer as "winner" for display.
      const participantRef = tournamentRef.collection("participants").doc(winnerUserIds[0]);
      batch.update(participantRef, { status: "winner" });
    }

    batch.update(tournamentRef, { status: "complete" });
    await batch.commit();

    return { success: true, data: { prizesCreated } };
  } catch (err) {
    console.error("[finalizeTournament]", err);
    const message = err instanceof Error ? err.message : "Failed to finalize tournament";
    return { success: false, error: message };
  }
}

// ─── initiatePrizeClaim ───────────────────────────────────────────────────────
// The winner clicks "Claim £X" on the tournament page. We flip the prize
// status from "pending" to "claim_initiated" and return the claimReference
// the user should mention when DMing the ClanForge Discord.

export async function initiatePrizeClaim(
  uid:           string,
  tournamentId:  string,
  prizeId:       string,
): Promise<ActionResult<{ claimReference: string }>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");

    const prizeRef = adminDb
      .collection("tournaments").doc(tournamentId)
      .collection("prizes").doc(prizeId);

    const snap = await prizeRef.get();
    if (!snap.exists) return { success: false, error: "Prize not found" };

    const prize = snap.data()!;
    if (prize.participantId !== uid) {
      return { success: false, error: "Only the prize winner can claim this prize" };
    }
    if (prize.status === "paid") {
      return { success: false, error: "This prize has already been paid out" };
    }

    await prizeRef.update({
      status:    "claim_initiated",
      claimedAt: new Date(),
    });

    return { success: true, data: { claimReference: prize.claimReference as string } };
  } catch (err) {
    console.error("[initiatePrizeClaim]", err);
    const message = err instanceof Error ? err.message : "Could not start claim";
    return { success: false, error: message };
  }
}

// ─── markPrizePaid ────────────────────────────────────────────────────────────
// Platform admin records that they've paid out the prize manually (bank
// transfer, Stripe transfer, etc.). Verified against profile.isAdmin.

export async function markPrizePaid(
  adminUid:      string,
  tournamentId:  string,
  prizeId:       string,
): Promise<ActionResult> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");

    const profileSnap = await adminDb.collection("profiles").doc(adminUid).get();
    if ((profileSnap.data()?.isAdmin as boolean) !== true) {
      return { success: false, error: "Admin permission required" };
    }

    await adminDb
      .collection("tournaments").doc(tournamentId)
      .collection("prizes").doc(prizeId)
      .update({
        status: "paid",
        paidAt: new Date(),
      });

    return { success: true };
  } catch (err) {
    console.error("[markPrizePaid]", err);
    const message = err instanceof Error ? err.message : "Could not mark prize paid";
    return { success: false, error: message };
  }
}

// ─── expirePendingDraft (called from the webhook) ─────────────────────────────
// Deletes a pending_payment draft when Stripe says the Checkout Session
// expired without payment.

export async function expirePendingDraft(
  tournamentId: string,
  uid:          string,
): Promise<ActionResult> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const ref = adminDb
      .collection("tournaments").doc(tournamentId)
      .collection("participants").doc(uid);

    const snap = await ref.get();
    if (!snap.exists) return { success: true };

    const data = snap.data()!;
    if (data.paymentStatus === "pending_payment") {
      await ref.delete();
    }
    return { success: true };
  } catch (err) {
    console.error("[expirePendingDraft]", err);
    const message = err instanceof Error ? err.message : "Failed to expire pending draft";
    return { success: false, error: message };
  }
}
