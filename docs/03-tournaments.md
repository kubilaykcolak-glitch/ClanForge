# Tournaments

Bracket-based competitive events. Free or paid, single-elim format. League of Legends tournaments additionally get automatic match-result verification via Riot's Tournament-V5 API.

---

## 1. Creating a tournament (`/tournaments/create`)

Three-step form: **Basics → Settings → Review**.

### Step 1 — Basics

- **Name** — 3–60 chars.
- **Game** — picked from a popular-games list or freely typed.
- **Description** — optional, 500 chars max.
- **Format** — only single-elimination is shipped for now; double-elim + round-robin are listed but disabled.
- **Banner image** — optional.
- **League of Legends server** (only shown when `game === "League of Legends"`):
  - Picker for NA / EUW / EUNE / KR / JP / BR / LAN / LAS / OCE / TR / RU.
  - Required for LoL tournaments — the Riot Tournament API needs a region to host lobbies.
  - Setting this auto-flags the tournament as `gameProvider: "league"`, which enables the auto-verification flow described in §6.

### Step 2 — Settings

- **Max participants** — 8 / 16 / 32 / 64.
- **Entry fee:**
  - **Free (default):** anyone can register without payment.
  - **Paid:** entry fee in pence, £1 minimum, £25 maximum. Triggers Stripe Checkout on register.
- **Prize pool:**
  - **Free tournament:** creator sets a fixed prize pool (out-of-band funded by them).
  - **Paid tournament:** prize pool auto-grows on every paid registration. The growth amount is `entryFee − platform fee` (default 20% platform fee, captured on the tournament doc so future fee changes don't retroactively alter existing tournaments).
- **Prize split** (paid only): `winner_takes_all` / `top_3` / `top_4` / `top_5`. Determines how the final pool is divided.
- **Registration closes at** — required.
- **Tournament start time** — required, must be after registration close.
- **Rules** — optional free-text section, rendered with light markdown on the tournament page.

### Step 3 — Review

Shows everything for confirmation. Submitting writes the tournament with status `open`.

---

## 2. Registration

From the tournament page anyone signed in can register. Conditions:

- The tournament status must be `open`.
- Participant count must be below the max.
- The user must not already be registered.
- **LoL tournaments only:** the user must have a linked-and-verified Riot account. Without it, registration is rejected with a clear error pointing them at `/profile/edit`.

### Free path
Single click, instant registration. Server action records the participant doc; the tournament's `participantCount` increments atomically inside a transaction.

### Paid path
Click opens a Stripe Checkout session. The participant doc is created with `paymentStatus: "pending_payment"`. On successful payment, the Stripe webhook flips it to `paid` and the prize pool grows. On expiry (24h) or failure, the participant is removed and any payment auto-refunded.

### Withdrawal
- **Open tournaments:** participants can withdraw freely until registration closes.
- **Paid participants:** withdrawal triggers a Stripe refund first, then the participant is removed and the prize pool shrinks by the same amount it grew at registration time.
- **Locked tournaments:** withdrawal disabled. The creator must remove participants manually if needed.

---

## 3. Status lifecycle

| Status | Meaning | Transitions |
|---|---|---|
| `draft` | Created but not yet open (admin-tool reserved) | → `open` |
| `open` | Accepting registrations | → `locked` (creator early-lock) → `live` (creator generates bracket) |
| `locked` | Registration closed by time or creator | → `live` (creator generates bracket) |
| `live` | Bracket exists; matches in progress | → `complete` (all matches resolved) |
| `complete` | All matches resolved, prizes computed | terminal |
| `cancelled` | Force-cancelled by creator or admin | terminal; refunds issued automatically |

`open → locked` happens automatically when `registrationClosesAt` is in the past.

---

## 4. Bracket generation

Once registration is closed, the creator hits **Generate Bracket** on the tournament page. Server-side:

1. Loads all registered participants.
2. Shuffles them (deterministic per-run, Fisher–Yates).
3. Creates Round-1 match documents pairing 1v2, 3v4, etc.
4. If the participant count is odd, the unpaired participant gets a **bye** — their match is auto-completed with them as the winner.
5. **For LoL tournaments only**: registers the tournament with Riot via Tournament-V5 (once), then mints one tournament code per non-bye match (allowedParticipants whitelisted to both captains' PUUIDs).
6. Flips the tournament status to `live`.

---

## 5. Matches and result reporting

Three ways a match resolves:

1. **Manual report** (`reportMatchResult`). Either participant submits the result with scores + winner. Once one of them reports, the match is `complete`. Either player can `disputeMatch` instead, parking it for admin review.
2. **Riot auto-verification** (LoL only) — see §6.
3. **Admin override** (`adminFinalizeMatch`) — creator or platform admin can force-set a winner. Used for stuck/disputed matches.

On any successful resolution:
- XP is awarded to the winner (`tournament_match_win`).
- Clan XP is awarded to the winner's clan (if any).
- Personal and clan missions are updated (`tournament_match_win`, plus `tournament_solo_streak` if this is the winner's third win in this tournament).
- The match doc gets a `resultSource` of `manual` / `riot_callback` / `riot_poll` / `admin_override` / `admin_simulate` — this drives the badge shown on the match box (e.g. `AUTO-VERIFIED` for Riot callbacks).

---

## 6. LoL auto-verification flow

When `gameProvider === "league"`, ClanForge integrates with Riot's Tournament-V5 API. The end-to-end flow:

1. **At bracket generation**, each non-bye match gets a unique Riot tournament code locked to the two captains' PUUIDs.
2. **The code is shown on the bracket** as a chip with a copy button (`STUB0506e-…` on dev, real codes once Tournament-V5 production access is granted).
3. **Players paste the code into the LoL client** (Play → Tournaments) — Riot creates a custom lobby with the pre-configured settings (5v5 Summoner's Rift, Tournament Draft, lobby-only spectators).
4. **When the game ends**, Riot's servers POST the result to `/api/webhooks/riot/tournament` with the winning team's PUUIDs and a `metaData` blob.
5. The webhook **verifies an HMAC-signed `metaData`** (forged callbacks get 401), cross-checks the code against the one we stored, and identifies the winning captain by PUUID.
6. The match is **finalised via the same code path as a manual report** — XP, clan XP, missions all fire identically. The badge shows `AUTO-VERIFIED`.

### Stub vs production

- **Stub mode** (`RIOT_TOURNAMENT_USE_STUB=true`, the default): works against `tournament-stub-v5`. Provider + tournament + code generation all succeed and return realistic shapes. **Stub does not send real callbacks** — there are no real games. Use the admin **Simulate Winner** button on each match (Bracket view → match → Admin → Simulate Winner: X) to exercise the full result-handling chain end-to-end.
- **Production mode** (`RIOT_TOURNAMENT_USE_STUB=false`): flip once Riot grants Tournament API production access. The real callback endpoint takes over and the simulate buttons become unnecessary.

### Admin per-match controls (LoL only)

On each pending LoL match in the bracket, the tournament creator (or platform admin) sees a small **Admin** toggle that opens an inline panel:

- **Regenerate code** — mint a fresh code (after a lag-out / dispute).
- **Simulate winner: A / B** — fake a Riot callback. Dev-mode tool.
- **Force winner: A / B** — manual override; bypasses Riot, sets the result directly.

All three are audit-logged.

---

## 7. Prize claim flow

Once a tournament is `complete`:

1. Prize payouts are computed automatically based on `prizeSplit` and the final bracket. Stored at `/tournaments/{id}/prizes/{prizeId}`, status `pending`.
2. Each winning participant sees a **Claim {amount}** button on their tournament page.
3. Clicking it transitions the payout to `claim_initiated`. The user is shown a Discord support link with a unique `claimReference` like `TOURN-abc1-1`.
4. ClanForge support (an admin) verifies via Discord, pays out by hand, and runs `markPrizePaid` from `/admin/challenges` (or programmatically) — final status `paid`.

By design ClanForge does not auto-payout. Out-of-band manual claim provides a fraud check.

---

## 8. What happens when…

- **A tournament fills up while someone is mid-payment.** The Stripe webhook detects the conflict, refunds the late payment immediately, and removes the pending participant doc. No money is held.
- **A LoL participant unlinks their Riot account after registering.** Their existing registration stays, but they can no longer be in the lobby — Riot's tournament code is locked to PUUIDs the player no longer "claims". Practical fix: admin force-finalize the match against them, or they re-link the same Riot ID.
- **A creator force-cancels.** Status → `cancelled`. Every paid participant gets a Stripe refund (best-effort, failures audit-logged). Free participants are just removed.
- **A creator goes missing mid-tournament.** A platform admin can `forceFinalizeTournament` from `/admin/tournaments/[id]`. Any still-pending matches remain unfinalised — admin should set winners individually via the per-match panel first if they care about correctness.
- **A match is disputed.** Status → `disputed`, both participants notified. Creator (or admin) resolves via the Force Winner button.
