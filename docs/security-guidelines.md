# ClanForge — Security Guidelines (Agent Runbook)

> **How to use this file:** This is an agent runbook, not a tutorial. Read the **Pre-Implementation Checks** before writing any code for a new feature. Apply the **During-Implementation Checks** as each function is written. Run the **Post-Implementation Verification** before declaring the work done. The **Audit Log** section is the source of truth — every rule in this document is grounded in a specific vulnerability that was found and fixed in this codebase.

---

## Table of Contents

1. [Audit Log: Discovered Issues & Fixes](#1-audit-log-discovered-issues--fixes)
2. [Pre-Implementation Checks](#2-pre-implementation-checks)
3. [During-Implementation Checks](#3-during-implementation-checks)
4. [Post-Implementation Verification Checklist](#4-post-implementation-verification-checklist)
5. [Reference: Auth Pattern Selection](#5-reference-auth-pattern-selection)

---

## 1. Audit Log: Discovered Issues & Fixes

This is the canonical log of every security issue found during the audit phase. Each entry shows: the vulnerable function, the attack it enabled, and the exact fix applied. **Reference this list when designing similar new features — the same class of attack will apply.**

### 1.1 IDOR — Caller-Supplied UID Not Verified

The attacker supplies someone else's UID in a server action call to act as that user. Server actions are callable via direct HTTP POST, bypassing UI guards.

| # | Function | File | Attack | Fix |
|---|---|---|---|---|
| 1 | `createTournament(uid, data)` | `src/lib/actions/tournament.actions.ts` | Any signed-in user could create a tournament with someone else as the listed creator | Added `await getSessionUid(); if (sessionUid !== uid) return Forbidden` |
| 2 | `registerForTournament(uid, ...)` | `src/lib/actions/tournament.actions.ts` | Attacker registers another user into a tournament without consent | Same pattern |
| 3 | `withdrawFromTournament(uid, ...)` | `src/lib/actions/tournament.actions.ts` | Attacker force-withdraws other participants | Same pattern |
| 4 | `reportMatchResult(uid, ...)` | `src/lib/actions/tournament.actions.ts` | Attacker reports match results on behalf of others | Same pattern |
| 5 | `disputeMatch(uid, ...)` | `src/lib/actions/tournament.actions.ts` | Attacker raises disputes as another player | Same pattern |
| 6 | `generateBracket(uid, ...)` | `src/lib/actions/tournament.actions.ts` | Attacker triggers bracket generation as the creator | Same pattern |
| 7 | `lockTournament(uid, ...)` | `src/lib/actions/tournament.actions.ts` | Attacker locks registration on someone else's tournament | Same pattern |
| 8 | `createCheckoutSession(uid, tournamentId, profile)` | `src/lib/actions/tournament-payment.actions.ts` | Attacker opens a Stripe checkout under another user's UID | Same pattern |
| 9 | `withdrawPaidEntry(uid, tournamentId)` | `src/lib/actions/tournament-payment.actions.ts` | Attacker force-refunds + evicts paid participants | Same pattern |
| 10 | `cancelTournament(uid, tournamentId)` | `src/lib/actions/tournament-payment.actions.ts` | Attacker cancels any tournament by supplying creator's UID | Same pattern |
| 11 | `finalizeTournament(uid, ...)` | `src/lib/actions/tournament-payment.actions.ts` | Attacker triggers prize distribution as the creator | Same pattern |
| 12 | `initiatePrizeClaim(uid, ...)` | `src/lib/actions/tournament-payment.actions.ts` | Attacker claims another winner's prize | Same pattern |
| 13 | `canCreateTournament(uid)` | `src/lib/actions/tournament-limits.actions.ts` | Attacker probes another user's rate-limit state, bypasses account-age check | Same pattern |
| 14 | `checkClanJoinAllowed(uid)` | `src/lib/actions/xp.actions.ts` | Attacker probes another user's clan join cooldown | Same pattern |
| 15 | `trackChallengeProgress(contributorUid, clanId, ...)` | `src/lib/actions/challenge.actions.ts` | Any user increments challenge progress on behalf of anyone in any clan, with caller-supplied amount | `sessionUid !== contributorUid → return`, clan membership check, `safeAmount = 1` hardcoded |

**The pattern that fixed all of these:**
```typescript
const sessionUid = await getSessionUid();
if (sessionUid !== uid) return { success: false, error: "Forbidden" };
```

### 1.2 Admin Layout Bypass

Admin layout guards run only during browser navigation. Direct HTTP POST to server actions skips them entirely. Found in challenge and season management.

| # | Function | File | Attack | Fix |
|---|---|---|---|---|
| 16 | `createChallenge` | `src/lib/actions/challenge.actions.ts` | Non-admin signed-in user creates challenges via direct POST | Added `await getAdminUid()` at start |
| 17 | `updateChallengeStatus` | `src/lib/actions/challenge.actions.ts` | Non-admin updates challenge status | Same |
| 18 | `getAllChallenges` | `src/lib/actions/challenge.actions.ts` | Non-admin reads full admin challenge list | Same |
| 19 | `createSeason` | `src/lib/actions/season.actions.ts` | Non-admin creates seasons | Same |
| 20 | `updateSeasonStatus` | `src/lib/actions/season.actions.ts` | Non-admin changes season status | Same |
| 21 | `markPrizePaid(adminUid, ...)` | `src/lib/actions/tournament-payment.actions.ts` | Non-admin marks prizes as paid out, hiding outstanding obligations | Session verify + DB isAdmin check (two-layer because money is involved) |

**The pattern that fixed all of these:**
```typescript
await getAdminUid();   // throws Unauthenticated or Forbidden
```

**Helper added to `src/lib/actions/server-auth.ts`:**
```typescript
export async function getAdminUid(): Promise<string> {
  const sessionCookie = cookies().get("session")?.value;
  if (!sessionCookie) throw new Error("Unauthenticated");
  const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
  const snap = await adminDb.collection("profiles").doc(decoded.uid).get();
  if (!snap.exists || !snap.data()?.isAdmin) throw new Error("Forbidden");
  return decoded.uid;
}
```

### 1.3 Spoofing Caller-Supplied Identity Data

When a function accepts user-identity fields (displayName, avatarUrl) from the caller, those fields can be forged. Found in payment registration.

| # | Function | File | Attack | Fix |
|---|---|---|---|---|
| 22 | `createCheckoutSession` | `src/lib/actions/tournament-payment.actions.ts` | Attacker registers into tournament appearing as a different display name | Read `displayName` and `avatarUrl` from `profiles/{uid}` instead of caller-supplied params |

**The pattern that fixed it:**
```typescript
const profileSnap = await adminDb.collection("profiles").doc(uid).get();
const dbDisplayName = profileSnap.data()?.displayName ?? fallback;
const dbAvatarUrl   = profileSnap.data()?.avatarUrl   ?? null;
await participantRef.set({ displayName: dbDisplayName, avatarUrl: dbAvatarUrl });
```

### 1.4 Unvalidated Cross-Reference IDs

When a function accepts IDs that refer to objects in another collection, those IDs can point anywhere. Found in tournament finalization.

| # | Function | File | Attack | Fix |
|---|---|---|---|---|
| 23 | `finalizeTournament(..., winnerUserIds)` | `src/lib/actions/tournament-payment.actions.ts` | Creator assigns prizes to UIDs who never entered the tournament | Fetch participants, build `Set` of valid (paid/free) UIDs, reject if any winnerId is outside the set |

**The pattern that fixed it:**
```typescript
const validParticipantUids = new Set(
  participantsSnap.docs
    .filter(d => ["paid", "free"].includes(d.data().paymentStatus))
    .map(d => d.id),
);
const invalidWinners = winnerUserIds.filter(w => w && !validParticipantUids.has(w));
if (invalidWinners.length > 0) {
  return { success: false, error: "One or more declared winners are not registered participants" };
}
```

### 1.5 Caller-Controlled Numeric Amounts

When a function accepts a numeric amount (XP, score, progress) the caller can inflate it arbitrarily.

| # | Function | File | Attack | Fix |
|---|---|---|---|---|
| 24 | `trackChallengeProgress(..., _amount)` | `src/lib/actions/challenge.actions.ts` | Caller passes `amount: 999999` to instantly complete a challenge | `const safeAmount = 1` hardcoded; caller param renamed `_amount` and ignored |

### 1.6 Cross-User Server-to-Server Calls

`awardXp` and `awardClanXp` are legitimately called from other server actions to award XP to a **different** user (e.g. winner of a match reported by the loser). Adding `sessionUid !== uid → Forbidden` here would break those legitimate flows.

| # | Function | File | Resolution |
|---|---|---|---|
| 25 | `awardXp(uid, ...)` | `src/lib/actions/xp.actions.ts` | **Session-exists gate only** — `await getSessionUid()` (no uid equality). The XP dedup/cap rules are the second defensive layer. |
| 26 | `awardClanXp(clanId, ..., contributorUid)` | `src/lib/actions/clan-xp.actions.ts` | Same — session-exists gate only |
| 27 | `awardClanXpForMember(uid, ...)` | `src/lib/actions/clan-xp.actions.ts` | Same — session-exists gate only |

### 1.7 Webhook Context Breaking Auth Gate

After adding `getSessionUid()` to `awardXp`, the Stripe webhook path through `confirmPaidParticipant → awardXp` would fail because webhooks have no session cookie. This would cause Stripe to retry the webhook indefinitely.

| # | Function | File | Fix |
|---|---|---|---|
| 28 | `confirmPaidParticipant → awardXp` | `src/lib/actions/tournament-payment.actions.ts` | Wrapped the inner `awardXp` call in a non-fatal `try/catch`. XP is best-effort in webhook context; payment confirmation must not fail because of it. |

```typescript
try {
  const { awardXp } = await import("@/lib/actions/xp.actions");
  await awardXp(uid, "tournament_register", tournamentId);
} catch {
  // Non-fatal: XP award skipped when called from webhook context.
}
```

### 1.8 Firestore Rules — Creator ID Forgery

| # | Rule | File | Attack | Fix |
|---|---|---|---|---|
| 29 | Tournament `create` | `firebase/rules/firestore.rules` | Any signed-in client write could set `creatorId` to another user's UID | Added `request.resource.data.creatorId == request.auth.uid` |

```
allow create: if isSignedIn() &&
  request.resource.data.creatorId == request.auth.uid;
```

---

## 2. Pre-Implementation Checks

> Run these BEFORE writing any code for a new feature. The goal is to identify which classes of attack the feature is exposed to so the design accommodates them up front.

### 2.1 Surface Mapping

Answer these questions out loud before designing:

- [ ] **What new server actions will this feature introduce?** List them.
- [ ] **Which of those actions accept a `uid` parameter?** Mark them as IDOR-candidates → must use `getSessionUid()` + uid equality (Audit Log §1.1).
- [ ] **Which are admin-only?** Mark them → must use `getAdminUid()` (Audit Log §1.2).
- [ ] **Which legitimately operate on another user's data (server-to-server calls)?** Mark them → session-exists gate only, document the cross-user reason (Audit Log §1.6).
- [ ] **Which are called from webhooks?** Mark them → no session check, must rely on signature verification at the route handler (Audit Log §1.7).

### 2.2 Data Flow Mapping

- [ ] **What identity fields (displayName, avatarUrl, email) does this feature write?** If any are accepted from the caller, plan to read them from Firestore instead (Audit Log §1.3).
- [ ] **What cross-reference IDs (winnerIds, opponentIds, targetIds) does this feature accept?** Plan validation against the source collection (Audit Log §1.4).
- [ ] **What numeric amounts (XP, fees, scores, progress) does this feature involve?** Plan to source them from rule configs or DB documents, never from the caller (Audit Log §1.5).

### 2.3 Persistence Mapping

- [ ] **What new Firestore collections will this feature create?** Plan explicit `read`, `create`, `update`, `delete` rules for each (Audit Log §1.8).
- [ ] **For any new `create` rule:** does it enforce ownership? (`request.resource.data.ownerId == request.auth.uid`)
- [ ] **For any new `update` rule:** are sensitive fields (payment status, role, isAdmin) protected from client writes?

---

## 3. During-Implementation Checks

> Apply these AS each function is being written. Each rule cites the audit log entry it derives from.

### 3.1 Server Action Skeleton

Every new server action starts with this skeleton. Pick the right auth helper for the action type:

```typescript
// Mutating action acting on the caller's own data — Audit Log §1.1
export async function myAction(uid: string, payload: ...) {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    // … action body …

    return { success: true, data: ... };
  } catch (err) {
    console.error("[myAction]", err);
    return { success: false, error: err instanceof Error ? err.message : "..." };
  }
}
```

```typescript
// Admin-only action — Audit Log §1.2
export async function myAdminAction(payload: ...) {
  try {
    await getAdminUid();
    // … action body …
  }
}
```

```typescript
// Cross-user server-to-server call — Audit Log §1.6
// Document WHY uid equality is not enforced.
export async function awardX(uid: string, ...) {
  try {
    // Session-exists gate only — this is called from server actions that
    // award X on behalf of another user (e.g. <list specific callers>).
    await getSessionUid();
    // … action body …
  }
}
```

### 3.2 Inline Rules

- [ ] **Auth is the FIRST operation inside the try block.** No DB reads, no validation, nothing before it.
- [ ] **Any caller-supplied displayName/avatarUrl is replaced with a Firestore read** (Audit Log §1.3).
- [ ] **Any caller-supplied cross-reference ID is validated against its source collection** (Audit Log §1.4).
- [ ] **Any caller-supplied numeric amount is replaced with a constant or rule lookup** (Audit Log §1.5).
- [ ] **Any call to `awardXp` / `awardClanXp` from a webhook-reachable path is wrapped in `try/catch`** (Audit Log §1.7).
- [ ] **The action returns `{ success: boolean; data?: T; error?: string }`** consistently.
- [ ] **Error messages do not leak internal state** (e.g. don't echo back raw exception messages from Firestore — they may contain document paths).

### 3.3 Firestore Rules

If the feature adds a new collection or modifies an existing one's rules:

- [ ] **No `allow read, write: if true` anywhere.**
- [ ] **`create` rules enforce ownership via `request.resource.data.ownerField == request.auth.uid`** (Audit Log §1.8).
- [ ] **Sensitive fields are blocked from client updates via `.affectedKeys().hasAny([...])` or `.hasOnly([...])`**.
- [ ] **Default to `allow ...: if false`** then loosen explicitly.

### 3.4 Webhook Handlers

If the feature adds or modifies a webhook endpoint:

- [ ] **Signature verification happens BEFORE any handler logic** (Stripe: `constructEvent(rawBody, sig, secret)`).
- [ ] **Use `req.text()` for raw body**, never `req.json()`, before constructing the event.
- [ ] **Return `400` for invalid signatures, `200` for everything else** (including ignored event types).
- [ ] **Any inner call that requires a session is wrapped in `try/catch`** (Audit Log §1.7).

### 3.5 API Routes

- [ ] **Session cookie verification at the top** before any logic.
- [ ] **File uploads: server-side type allowlist and size limit.** Never trust client-side validation.
- [ ] **Cron routes: check `Authorization: Bearer ${CRON_SECRET}` header**.

---

## 4. Post-Implementation Verification Checklist

> Run this AFTER the feature is fully written, before declaring it complete. This is the agent's self-review gate.

### 4.1 Static Audit (read each new file)

For each new server action file:

- [ ] **Every exported function has `await getSessionUid()` or `await getAdminUid()` as the first line inside `try`** — no exceptions other than documented cross-user / webhook cases.
- [ ] **Every exported function that accepts `uid` has `sessionUid !== uid → Forbidden`** — except cross-user cases, which carry a comment explaining why.
- [ ] **Every exported function returns the `{ success, data?, error? }` shape**.
- [ ] **No caller-supplied `displayName`, `avatarUrl`, `email`, `role`, or `isAdmin` is written to Firestore** without first being read from the user's profile.
- [ ] **No caller-supplied numeric amount is used directly in a `FieldValue.increment` or arithmetic operation** — it must come from a rule, the DB, or a hardcoded constant.

### 4.2 Cross-Reference Audit

- [ ] **For any function accepting IDs that point to another collection**, those IDs are validated against that collection via a `Set` membership check.
- [ ] **For any function modifying counters (`participantCount`, `prizePool`, `xp`)**, the increment value is derived server-side from authoritative sources, never the caller.

### 4.3 Firestore Rules Audit

For each new or modified collection in `firebase/rules/firestore.rules`:

- [ ] **`create` enforces `creatorId/ownerId/userId == request.auth.uid`** where applicable.
- [ ] **`update` lists allowed fields explicitly or blocks sensitive fields explicitly.**
- [ ] **No collection is left at default `allow read, write: if true`.**

### 4.4 Webhook & System Path Audit

If the feature has any webhook-reachable paths:

- [ ] **Trace every inner call from the webhook handler down to leaf functions.** Any call that uses `getSessionUid()` directly OR indirectly is wrapped in `try/catch` so webhook retries don't loop.
- [ ] **Signature verification is the first thing the route handler does.**

### 4.5 Attack Simulation

Mentally walk through these scenarios for the new feature. If any of them works, fix before shipping:

1. **Cross-user IDOR:** Can a signed-in attacker call `<newAction>(victimUid, ...)` and have it succeed?
   - Expected: Returns `Forbidden`.
2. **Admin bypass:** Can a non-admin signed-in user call any admin-only function via direct POST?
   - Expected: Returns `Forbidden`.
3. **Name spoofing:** Can the caller embed a fake displayName in the payload and have it persisted?
   - Expected: The stored value matches `profiles/{uid}.displayName`, not the payload.
4. **Cross-reference forgery:** Can the caller pass an ID that doesn't belong to the relevant scope (e.g. a random UID as a winner)?
   - Expected: Returns an error before writing.
5. **Amount inflation:** Can the caller pass `amount: 999999` and have it applied?
   - Expected: The actual increment is a fixed/rule-derived value.
6. **Webhook brick:** Could a future change cause the webhook path to throw inside `awardXp` and break Stripe retries?
   - Expected: All such inner calls are in `try/catch`.
7. **Firestore client write:** Could a client SDK write directly to Firestore and bypass the server action?
   - Expected: Rules block it; if rules allow client writes, the rules enforce the same invariants as the server action would.

### 4.6 Final Sign-off

- [ ] **Cross-reference every new function against Audit Log §1.1–§1.8.** For each category, either confirm the rule is applied or document why it doesn't apply.
- [ ] **No `TODO: add auth check` or `// FIXME: validate input` comments remain.**

---

## 5. Reference: Auth Pattern Selection

| Action type | Helper | UID equality | Audit Log § |
|---|---|---|---|
| User mutates their own data | `getSessionUid()` | ✅ `sessionUid !== uid → Forbidden` | §1.1 |
| Server action awards XP/points to another user | `getSessionUid()` | ❌ Session-exists only + comment | §1.6 |
| Admin-only mutation | `getAdminUid()` | N/A | §1.2 |
| Admin + money involved | `getSessionUid()` + DB `isAdmin` check | ✅ Both layers | §1.2 (#21) |
| Stripe webhook handler | None at action level (signature verified at route) | N/A | §1.7 |
| Public read (open data) | None required | N/A | — |
| Authenticated read (private data) | `getSessionUid()` | Owner equality if applicable | — |

### Helper Locations

- `getSessionUid()` — `src/lib/actions/server-auth.ts`
- `getAdminUid()` — `src/lib/actions/server-auth.ts`
- XP rules — `src/lib/xp.ts` (`XP_RULES`)
- Clan XP rules — `src/lib/actions/clan-xp.actions.ts` (`CLAN_XP_RULES`)
- Firestore rules — `firebase/rules/firestore.rules`
- Stripe webhook — `src/app/api/webhooks/stripe/route.ts`
