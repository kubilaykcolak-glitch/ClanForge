// ─── Stripe webhook receiver ──────────────────────────────────────────────────
//
// Stripe posts signed events to this endpoint. We verify the signature, then
// route by event type. All handlers are idempotent — Stripe may retry the
// same event many times.

import { NextRequest, NextResponse } from "next/server";
import type { Stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Verify signature using the RAW request body — never the parsed JSON.
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    const { verifyWebhookSignature } = await import("@/lib/stripe");
    event = verifyWebhookSignature(rawBody, signature);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signature verification failed";
    console.error("[stripe webhook] signature verify failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "checkout.session.expired":
        await handleCheckoutExpired(event.data.object as Stripe.Checkout.Session);
        break;

      case "charge.refunded":
        // Defensive logging only — refunds we issue ourselves already update
        // the participant doc inline. This event is mainly a paper trail.
        console.log("[stripe webhook] charge.refunded", (event.data.object as Stripe.Charge).id);
        break;

      default:
        // Unhandled event types are fine — Stripe sends many we don't care about.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`[stripe webhook] handler for ${event.type} failed:`, err);
    // Return 500 so Stripe retries with backoff.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}

// ─── checkout.session.completed ───────────────────────────────────────────────
// Promote the pending draft participant to paid. If the tournament filled up
// in the meantime, refund the payment immediately.

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const tournamentId = session.metadata?.tournamentId;
  const uid          = session.metadata?.userId;

  if (!tournamentId || !uid) {
    console.error("[stripe webhook] checkout.session.completed missing metadata", session.id);
    return;
  }
  if (session.payment_status !== "paid") {
    // E.g. async payment still pending — ignore and let Stripe send the
    // proper update event later.
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (!paymentIntentId) {
    console.error("[stripe webhook] no payment_intent on completed session", session.id);
    return;
  }

  const amountPaid = session.amount_total ?? 0;

  const { confirmPaidParticipant, refundLatePayment } =
    await import("@/lib/actions/tournament-payment.actions");

  const result = await confirmPaidParticipant(
    tournamentId,
    uid,
    session.id,
    paymentIntentId,
    amountPaid,
  );

  if (!result.success) {
    // Tournament filled up or was cancelled — auto-refund.
    console.warn(
      `[stripe webhook] auto-refunding ${paymentIntentId} for ${uid}: ${result.error}`,
    );
    await refundLatePayment(tournamentId, uid, paymentIntentId);
  }
}

// ─── checkout.session.expired ─────────────────────────────────────────────────
// Stripe sends this after 24h if the user never paid. Clean up the draft.

async function handleCheckoutExpired(session: Stripe.Checkout.Session): Promise<void> {
  const tournamentId = session.metadata?.tournamentId;
  const uid          = session.metadata?.userId;
  if (!tournamentId || !uid) return;

  const { expirePendingDraft } = await import("@/lib/actions/tournament-payment.actions");
  await expirePendingDraft(tournamentId, uid);
}
