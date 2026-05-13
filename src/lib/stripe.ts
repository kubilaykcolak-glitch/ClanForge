// ─── Stripe SDK wrapper ───────────────────────────────────────────────────────
//
// Server-only. Lazy-initialised so importing this module on the client
// doesn't blow up at build time. Use these helpers from server actions
// and the webhook route — never expose the secret key client-side.

import "server-only";
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to .env.local (test mode key sk_test_…) " +
      "and to your Vercel project environment for production.",
    );
  }

  _stripe = new Stripe(key, {
    // No explicit apiVersion pin — the SDK uses its bundled default.
    // We rely on the package-lock to lock the SDK version, which transitively
    // locks the API version too.
    typescript: true,
  });

  return _stripe;
}

// ─── Webhook signature verification ───────────────────────────────────────────

export function verifyWebhookSignature(
  rawBody:   string,
  signature: string,
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is not set. For local dev run " +
      "`stripe listen --forward-to localhost:3000/api/webhooks/stripe` " +
      "and paste the printed whsec_… into .env.local",
    );
  }

  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}

// ─── Public re-exports ────────────────────────────────────────────────────────

export type { Stripe };
