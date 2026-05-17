# Stripe Internals

How payments and refunds actually flow. Pairs with `../03-tournaments.md` (paid tournament feature).

---

## 1. Stripe setup

We use Stripe Checkout (hosted page) + the Stripe Node SDK on the server. No card details ever touch ClanForge — the user is redirected to Stripe, comes back via webhook + redirect URL.

| Component | Where |
|---|---|
| Stripe Node client | `src/lib/stripe.ts → getStripe()` |
| Webhook signing verifier | `src/lib/stripe.ts → verifyWebhookSignature` |
| Server actions | `src/lib/actions/tournament-payment.actions.ts` |
| Webhook handler | `src/app/api/webhooks/stripe/route.ts` |

Env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

---

## 2. Paid-tournament registration flow

### Happy path
1. User clicks **Register & Pay** on a paid tournament.
2. Server action `createCheckoutSession`:
   - Validates tournament status + capacity.
   - Reads user's `displayName` + `avatarUrl` from Firestore (NOT from caller-supplied params — defends against identity spoofing — see security-guidelines §3).
   - Creates a `pending_payment` participant doc immediately so the slot is held.
   - Creates a Stripe Checkout Session with metadata `{ tournamentId, userId }`.
   - Returns the Checkout URL.
3. Client redirects to Stripe Checkout.
4. User completes payment.
5. Stripe POSTs `checkout.session.completed` to `/api/webhooks/stripe`.
6. Webhook handler:
   - Verifies the signature using `STRIPE_WEBHOOK_SECRET` against the **raw** request body. The verifier always uses the unparsed text — re-parsing would change the signature.
   - Reads `metadata.tournamentId` + `metadata.userId`.
   - Calls `confirmPaidParticipant(...)` inside a webhook AsyncLocalStorage context so downstream `awardXp` / `trackMissionProgress` can run without a session cookie.
   - On success: participant flips to `paid`, prize pool grows, mission progress fires.
7. User is redirected back to ClanForge via the Stripe success URL.

### Race-condition path: tournament filled up during checkout
Between session creation and webhook callback, another user might fill the last slot.

1. Webhook fires.
2. `confirmPaidParticipant` runs the capacity check again. Detects the conflict.
3. Returns `{ success: false, error: "Tournament full" }`.
4. Webhook handler invokes `refundLatePayment` automatically:
   - `stripe.refunds.create({ payment_intent: paymentIntentId, reason: "requested_by_customer" })`.
   - Deletes the pending participant doc.
5. User's payment is refunded within seconds of payment landing. No money held; no half-state.

### Expired path: user starts checkout but never completes
1. Stripe Checkout Sessions live 24h.
2. After expiry, Stripe POSTs `checkout.session.expired`.
3. Webhook calls `expirePendingDraft` → deletes the `pending_payment` participant doc.

---

## 3. Participant withdrawal (self-initiated)

`withdrawPaidEntry`:
1. Auth check — only the participant themselves can withdraw.
2. Tournament must still be `open` (not locked / live).
3. **Refund first, then DB update.**
   - `stripe.refunds.create(...)` — if this fails the participant doc is untouched and the user can retry. If we updated the DB first and the refund failed, we'd have a refunded-but-still-registered user.
4. Transaction: delete participant doc, decrement `participantCount`, shrink `prizePool` by `prizePoolDeltaForEntry(entryFee, platformFeePct)` (the same delta used at registration so the math reconciles).

---

## 4. Admin force-refund

Two entry points:
- **Per-participant**: `forceRefundParticipant(tournamentId, uid, reason)` from `/admin/tournaments/[id]`.
- **Whole tournament**: `forceCancelTournament(tournamentId, reason)` iterates every paid participant and refunds them.

Both:
- Require admin tier + step-up.
- Use the same `stripe.refunds.create(...)` flow.
- Mark the participant doc `refunded`, set `refundedAt`.
- Audit + Discord-alert (critical).

For `forceCancelTournament`, refund failures are tallied rather than aborting:
```ts
"Tournament cancelled — refunded 8, 1 refund failure(s)"
```
The cancellation itself completes regardless; failed individual refunds get logged for manual retry.

---

## 5. Prize claims

Prize payouts are NOT auto-paid. The flow is:

1. `finalizeTournament` (creator action) computes the payout split based on `prizeSplit` and bracket results. Writes docs to `/tournaments/{id}/prizes/{prizeId}` with `status: "pending"` and a unique `claimReference` (e.g. `TOURN-abc1-1`).
2. The winning participant sees a **Claim {amount}** button on the tournament page.
3. Clicking calls `initiatePrizeClaim` → status `claim_initiated`, UI shows a Discord support link with the claim reference.
4. User messages support in Discord with the reference.
5. ClanForge admin verifies + pays out by hand (Stripe Connect / bank transfer — out-of-band).
6. Admin runs `markPrizePaid` from `/admin/challenges` → status `paid`.

By design ClanForge does not auto-payout. The manual claim step is a fraud check and matches the prize-pool policy described in the Riot production-key application.

---

## 6. Idempotency

Stripe will retry webhook events on 5xx responses (backoff up to ~3 days). All handlers must be idempotent:

- `confirmPaidParticipant` — checks `participant.paymentStatus === "paid"` and returns success if already done.
- `refundLatePayment` — if the participant doc is already deleted, Stripe refund still goes through; idempotency is on the participant side.
- `expirePendingDraft` — only deletes if the participant exists; missing is treated as success.

We also defensively log `charge.refunded` events without acting on them — refunds we issue ourselves already update the DB inline; the event is a paper trail.

---

## 7. Webhook security

`/api/webhooks/stripe`:
- Verifies the `stripe-signature` header against the raw body using `STRIPE_WEBHOOK_SECRET`. Body MUST be the un-parsed text; re-parsing changes whitespace and breaks verification.
- 400 on signature failure (Stripe stops retrying).
- 500 on handler failure (Stripe retries with backoff).
- 200 on success.

Webhook never trusts the body without verification. The signature is the only proof the request is from Stripe.

---

## 8. Money-handling invariants

- **Entry fees stored in pence** on every doc — `entryFee`, `paidAmount`, `prizePool`. Display layer converts to £ at render time. Avoids floating-point errors.
- **Platform fee captured at registration time** — `tournament.platformFeePct` is snapshotted; future fee changes don't retroactively alter existing tournaments.
- **Prize pool grows on register, shrinks on withdraw / refund** — symmetric so the bookkeeping balances. `prizePoolDeltaForEntry` is the shared helper used by both directions.

---

## 9. Testing

Stripe Test Mode is enabled by default in dev — test card `4242 4242 4242 4242` works end-to-end.

Local webhook delivery: use the Stripe CLI to forward to localhost:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```
The CLI prints a webhook signing secret you set as `STRIPE_WEBHOOK_SECRET` for the duration of the local session.

For production, the webhook endpoint is configured in the Stripe Dashboard → Developers → Webhooks, with the signing secret set as `STRIPE_WEBHOOK_SECRET` on Vercel.

---

## 10. Reading audit logs for payment issues

A typical "user says they were charged twice" investigation:

1. `/admin/users/[uid]/view` — pulls recent tournament participations + audit entries targeting them.
2. Stripe Dashboard → Payments → search by customer email or by payment intent ID.
3. Check the Vercel logs around the time of the second charge for the Stripe webhook handler events.
4. Cross-reference participant docs — was a refund issued? Did Stripe receive a duplicate `checkout.session.completed`?

Most "duplicate charge" reports turn out to be:
- One charge that succeeded + a separate failed/refunded one (legitimate),
- Two different tournament registrations (legitimate),
- Or a real bug — in which case the audit log + Vercel logs together show the order of operations.
