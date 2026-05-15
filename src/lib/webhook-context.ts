// ─── Webhook context flag ─────────────────────────────────────────────────────
//
// Some server-side flows are reached only via verified webhooks (e.g. the
// Stripe payment webhook). In those flows there is no user session cookie,
// so any helper that does `getSessionUid()` as a "session-exists" gate will
// throw, and side-effect calls (XP awards, mission tracking) silently fail.
//
// We use AsyncLocalStorage to mark the webhook handler's async context.
// Downstream code can call `inWebhookContext()` to learn whether it's
// running under a trusted webhook caller and skip the session check.
//
// Security:
//   • Only the webhook route handler sets the flag (after Stripe signature
//     verification). Clients can never invoke a code path that flips it.
//   • AsyncLocalStorage propagates through async/await chains automatically,
//     so the flag is visible to nested server actions, dynamic imports,
//     transactions, etc.
//   • Multiple webhooks in flight have isolated contexts (one store per
//     `run()` call).

import { AsyncLocalStorage } from "async_hooks";

const _store = new AsyncLocalStorage<true>();

/**
 * Run the given async function with the webhook-context flag set.
 * Should be called only from a verified webhook route handler.
 */
export function runInWebhookContext<T>(fn: () => Promise<T>): Promise<T> {
  return _store.run(true, fn);
}

/** True when the current async context was started by a webhook handler. */
export function inWebhookContext(): boolean {
  return _store.getStore() === true;
}
