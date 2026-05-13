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
