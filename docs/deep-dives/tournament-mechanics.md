# Tournament Mechanics

Deep dive on how brackets are built, how matches resolve, and how prize money flows. Reference for `03-tournaments.md`.

---

## 1. Tournament lifecycle in detail

```
draft? → open → locked → live → complete
                 │        │      │
                 │        │      └─ All matches resolved + prizes computed
                 │        └─ Bracket generated, matches exist
                 └─ Registration closed (auto-time OR creator lock)
        │
        └─ Cancelled — terminal at any stage; refunds issued
```

### `draft`
Currently unused in the UI — reserved for an admin-tool that pre-creates a tournament without publishing it. Public tournaments always start at `open`.

### `open`
Registration is live. Server-side checks block:
- Tournament full (capacity reached)
- Status transitions out of `open`
- Already-registered users

The status flips to `locked` automatically when `registrationClosesAt` is in the past — checked lazily on any page load via:
```ts
if (tournament.status === "open" && tournament.registrationClosesAt < new Date()) {
  await tournRef.update({ status: "locked" });
  tournament.status = "locked";
}
```
This means the auto-lock happens on the **next** view, not at the exact second. Acceptable — a late registration attempt is still rejected because the timestamp comparison runs at the API layer too.

### `locked`
Bracket can be generated. Registrations are blocked. Creators can still:
- View the bracket placeholder.
- Manually unlock back to `open` — actually NO, not supported; once locked it stays locked unless `cancelled`. By design — prevents capacity drift mid-finalisation.

### `live`
Bracket exists. Matches are pending or in-progress. Creators can:
- Trigger `reportMatchResult` on individual matches (admin override path).
- Force-cancel (admin tier).
- View live progress.

### `complete`
All matches resolved. Prize payouts have been computed and written to `/tournaments/{id}/prizes/{prizeId}`. Winners see their **Claim** buttons.

### `cancelled`
Terminal. Paid participants are refunded (best-effort with failure tally). Free participants are just removed. The tournament doc stays in Firestore for audit.

---

## 2. Single-elimination — what it actually means

ClanForge implements **single-elimination** (1v1 matches, lose once = out).

> Single-elimination is the only format currently wired end-to-end. The creation form lists `double_elim` and `round_robin` as options but they're **disabled in the UI** — picking them won't change behaviour, the bracket generator hardcodes single-elim semantics.

### Format options explained

| Format | What it means in principle | What ClanForge does |
|---|---|---|
| **Single elimination** | Lose one match, you're out. N participants → ⌈log2(N)⌉ rounds. | **Fully wired.** |
| **Double elimination** | Lose once → drop to a "losers bracket", lose again → out. Roughly 2× the matches. | UI accepts the option, but bracket generator ignores it and produces a single-elim bracket. **Don't pick this in production until it's fully built.** |
| **Round robin** | Every participant plays every other participant. N participants → N×(N−1)/2 matches. | Same as double-elim — option appears but is unimplemented. |

If you want to enable double-elim or round-robin properly, the bracket generator in `generateBracket` (`src/lib/actions/tournament.actions.ts`) is where the work lives. Each format needs its own match-creation routine + a re-think of how `round` and `matchNumber` are sequenced.

---

## 3. Bracket generation algorithm

`generateBracket(uid, tournamentId)` — only the creator or platform admin can call it.

### Step-by-step

1. **Auth & state checks** — caller must own the tournament; status must be `open` or `locked`; not already `live` or `complete`.
2. **Load registered participants.** Filters to `status === "registered"` so unconfirmed paid drafts are excluded.
3. **Refuse empty** — returns `"No registered participants to bracket"`.
4. **For LoL tournaments only:** call `ensureRiotTournament(tournamentId)` — registers the tournament with Riot via Tournament-V5 and persists `riotTournamentId`. Skips on retry if already done.
5. **Shuffle.** Fisher–Yates in-place, using `Math.random()`. Non-deterministic — same input twice produces different brackets. This is the seeding fairness layer.
6. **Pair participants into matches.** Iterate the shuffled list in pairs:
   - Match k: `participantAId = shuffled[2k]`, `participantBId = shuffled[2k+1]`.
   - **If the participant count is odd**, the last participant has no opponent → they get a **bye**: `participantBId = "BYE"`, `winnerId = participantAId`, `status = "complete"` immediately.
7. **Batch-write the match documents.** One Firestore batch per generation. Match docs live at `/tournaments/{id}/matches/{auto-id}` with:
   - `round: 1` (always — we only generate round 1)
   - `matchNumber`: sequential within the round
   - `scoreA: 0, scoreB: 0`
   - `status: "pending"` for real matches, `"complete"` for byes
8. **Update participant seeds** to match the shuffled position (so the seed in the participant doc reflects bracket placement).
9. **Flip tournament status to `live`** in the same batch.
10. **For LoL only:** sequentially call `mintMatchCode(tournamentId, matchId)` for each non-bye match. One Riot Tournament-V5 code per match. Failures are logged but don't roll back the bracket — admin can `regenerateMatchCode` later.

### Why shuffle?
Without a shuffle, the order participants register in determines bracket pairing — the two earliest registrants meet in match 1. With shuffle, registration order is irrelevant. This is the simplest fairness model; if we ever want seeded brackets (top players placed apart in the bracket), the shuffle is where to swap in seed-based pairing logic.

### Worked example — 8 participants
```
Registered (shuffle order): [Alice, Bob, Carol, Dave, Eve, Frank, Gina, Hank]

Round 1 matches:
  Match 1: Alice vs Bob
  Match 2: Carol vs Dave
  Match 3: Eve   vs Frank
  Match 4: Gina  vs Hank
```

### Worked example — 7 participants (odd → one bye)
```
Registered (shuffle order): [Alice, Bob, Carol, Dave, Eve, Frank, Gina]

Round 1 matches:
  Match 1: Alice vs Bob
  Match 2: Carol vs Dave
  Match 3: Eve   vs Frank
  Match 4: Gina  vs BYE      ← auto-completes, status=complete, winner=Gina
```

---

## 4. Round advancement (lazy)

`generateBracket` only writes Round 1. **All higher rounds are lazy-created** by `advanceBracketIfReady` in `_match-result-core.ts`, which runs at the end of every match finalisation regardless of source (manual report / Riot callback / admin override / admin simulate).

### Algorithm

1. Load every match for the tournament.
2. Find the highest existing round number. If the tournament is already `complete` or `cancelled`, return.
3. Check whether every match in that round has `status === "complete"`. If not, return.
4. Collect the winners in match-number order. (Each match was assigned a `matchNumber` at creation; sorting by it gives the canonical bracket layout.)
5. **If exactly one winner remains, mark the tournament `status: complete` and return.** That winner is the tournament winner; prize-payout computation runs from there.
6. Otherwise, pair winners into new round-(N+1) matches: winner of match 1 plays winner of match 2, etc. Odd-winner case → the last one gets a bye and is auto-completed immediately.
7. For LoL tournaments (`gameProvider === "league"`), mint a fresh Riot Tournament-V5 code for each new non-bye round-N+1 match. Failures are logged and don't roll back the bracket — admin can `regenerateMatchCode` if needed.
8. If the new round is itself entirely complete (rare — happens when bye chains produce no real matches), recurse so the tournament finalises immediately.

### Why lazy (not pre-create)

The other common approach is to pre-create all rounds at bracket generation time with `participantAId = "TBD"` slots, then fill the slots as winners are decided. Lazy creation has two advantages:

- **Cleaner doc shape.** No TBD-or-real conditional in the match doc; every match in Firestore is a real match between two real participants.
- **No "phantom matches".** The bracket view doesn't have to handle "this match exists but has no opponents yet" — it just shows whatever's there.

The trade-off: the BracketView UI can't show "winner of Match 3 vs winner of Match 4" before those matches resolve. Acceptable for v1; the visible bracket is always a true snapshot of what's been played.

### Worked example — 8-person tournament

```
Round 1 (created at bracket gen):
  M1: Alice vs Bob   → Alice wins
  M2: Carol vs Dave  → Carol wins
  M3: Eve   vs Frank → Frank wins
  M4: Gina  vs Hank  → Hank wins

[advanceBracketIfReady fires on M4 finalisation]
[all of Round 1 complete → lazy-create Round 2]

Round 2 (created automatically):
  M1: Alice vs Carol  → Alice wins
  M2: Frank vs Hank   → Frank wins

[advanceBracketIfReady fires again]
[all of Round 2 complete → lazy-create Round 3 — but only 2 winners
 ≠ 1, so build a real Round 3 match]

Round 3 (final):
  M1: Alice vs Frank  → Alice wins

[advanceBracketIfReady fires]
[1 winner remaining → tournament.status = "complete"]
```

### Bye chains

A 5-person tournament:
```
Round 1: M1: A vs B → A wins
         M2: C vs D → C wins
         M3: E vs BYE → E auto-completes as winner immediately at gen

Round 2 (auto-created):
         M1: A vs C → A wins
         M2: E vs BYE → E auto-completes

Round 3 (auto-created):
         M1: A vs E → A wins → tournament complete
```

The recursive re-check at step 8 catches the case where Round 2 was created with all-bye, which would have left the bracket stalled otherwise.

---

## 5. Match resolution paths

Every match can be finalised via one of five paths. All five route through `finaliseTournamentMatch` (the shared core in `src/lib/actions/_match-result-core.ts`), so XP / clan-XP / mission tracking fires identically.

| Path | Trigger | Auth | `resultSource` field |
|---|---|---|---|
| Manual report | Participant submits via UI | participant only | `manual` |
| Riot callback | Tournament-V5 webhook | HMAC signature | `riot_callback` |
| Riot poll | Polling fallback (reserved, not yet exercised) | server-only | `riot_poll` |
| Admin force | Tournament admin panel | admin or creator | `admin_override` |
| Admin simulate | Dev tool (stub mode) | admin only | `admin_simulate` |

The `resultSource` field powers the badge on each match box in the bracket view, so anyone looking at the bracket can see at a glance how each match was decided.

### Dispute path

Either participant can `disputeMatch(matchId, reason)`. This sets `status === "disputed"`, stamps `disputedBy` + `disputedAt` + `disputeReason`. The match stays in disputed state until:
- The creator manually resolves via `adminFinalizeMatch`, OR
- A platform admin does the same.

There is no automatic resolution. By design — disputes are rare enough that human review is the right call.

---

## 6. Prize split math (with worked examples)

Prize splits are configured at tournament-creation time and stored on the tournament doc as `prizeSplit`.

### Available presets (`src/lib/prize-splits.ts`)

| Preset | Distribution |
|---|---|
| `winner_takes_all` | 100% to 1st |
| `top_3` | 50% / 30% / 20% |
| `top_4` | 40% / 30% / 20% / 10% |
| `top_5` | 40% / 25% / 15% / 12% / 8% |

### Computation

`computePayouts(prizePoolPence, preset)` produces one entry per position:

```ts
amount = Math.floor((prizePoolPence * percentage) / 100)
```

**floor() not round()** — keeps total payouts ≤ pool. Any rounding remainder (≤ N pence where N is the number of positions) stays in the platform account rather than risking an over-payout.

### Worked example — £100 prize pool (10000 pence), `top_3`

```
1st: floor(10000 * 50 / 100) = 5000  → £50.00
2nd: floor(10000 * 30 / 100) = 3000  → £30.00
3rd: floor(10000 * 20 / 100) = 2000  → £20.00
                              ─────
                              10000  → no rounding remainder
```

### Worked example — £73.07 prize pool (7307 pence), `top_5`

```
1st: floor(7307 * 40 / 100) = 2922  → £29.22
2nd: floor(7307 * 25 / 100) = 1826  → £18.26
3rd: floor(7307 * 15 / 100) = 1096  → £10.96
4th: floor(7307 * 12 / 100) =  876  → £8.76
5th: floor(7307 *  8 / 100) =  584  → £5.84
                              ─────
                              7304  → 3p rounding remainder stays w/ platform
```

---

## 7. Money flow — paid tournament walkthrough

End-to-end with concrete numbers. Tournament: paid, £10 entry fee (1000 pence), platform fee 10%, prize split `top_3`, max 8 participants.

### Per-registration delta

```ts
prizePoolDelta = entryFee - floor(entryFee * platformFeePct / 100)
              = 1000 - floor(1000 * 10 / 100)
              = 1000 - 100
              = 900
```
Each paid registration → 900 pence into the prize pool, 100 pence platform cut.

### Cumulative growth as players register

| Players | Prize pool (pence) | Display |
|---|---|---|
| 1 | 900 | £9.00 |
| 4 | 3600 | £36.00 |
| 8 (full) | 7200 | £72.00 |

### Final payout (8 full, `top_3`)

```
Pool = 7200 pence

1st: floor(7200 * 50 / 100) = 3600  → £36.00
2nd: floor(7200 * 30 / 100) = 2160  → £21.60
3rd: floor(7200 * 20 / 100) = 1440  → £14.40
                              ─────
                              7200  → 0p remainder
```

### Platform revenue
- Per registration: 100 pence × 8 = 800 pence (£8.00).
- Plus any rounding remainder from the payout calculation (0 in this case).
- Stripe processing fees come out of the platform cut, NOT the prize pool — entrants always get the full advertised amount.

### Refund symmetry
A withdrawal reverses the same delta:
```
prizePool -= prizePoolDelta  // -900 pence
participantCount -= 1
```
This is why the bookkeeping reconciles: the same helper computes the delta in both directions.

---

## 8. Limits and bounds

Enforced both in the UI and again server-side:

| Field | Min | Max | Why |
|---|---|---|---|
| `entryFee` | £1 (100 pence) | £25 (2500 pence in form; constant is £500 = 50000 pence) | UI hard-coded £25 cap matches the Riot tournament-policy answer. |
| `maxParticipants` | 8 | 64 | Form-restricted to 8 / 16 / 32 / 64. Single-elim works cleanly with powers of 2 (no byes); odd counts get one bye. |
| `prizePool` (free tournaments) | 0 | (no explicit max) | Free tournaments have creator-funded pools, not enforced. |
| Reason field on admin actions | 5 chars | (no max) | Server-validated, written into audit log. |

---

## 9. Edge cases worth knowing

- **All Round-1 matches are byes.** Theoretical — would require participantCount = 1. The capacity check refuses to bracket a single participant before this happens.
- **Tournament filled up while someone is mid-payment.** Stripe webhook detects the conflict on `checkout.session.completed`, calls `refundLatePayment`, and the user gets their money back within seconds. See `stripe-internals.md` for full details.
- **Creator force-cancels a complete tournament.** Blocked at the action — `status === "complete"` is terminal. They must contact a super-admin to override.
- **Bracket generated but creator immediately wants to add a participant.** Not supported. They'd have to `forceCancel` and create a new tournament. Worth flagging if a customer hits this.
- **A LoL participant's PUUID changes mid-tournament.** Riot PUUIDs are stable — this doesn't happen in practice. If a user unlinks and re-links the same Riot ID, the PUUID is identical. If they unlink and link a different account, the tournament code stays bound to the original PUUID, so they'd have to either re-link the original or admin-force-finalize their match.
- **Two participants both report different results.** Last writer wins by timestamp — but the loser's submission is rejected because `match.status === "complete"` after the first report. To dispute, use `disputeMatch` BEFORE the result is reported.
- **Match auto-completes via bye but the byed participant gets eliminated in round 2.** Doesn't happen — there is no Round 2. See §4.
