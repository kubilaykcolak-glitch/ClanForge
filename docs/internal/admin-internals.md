# Admin System Internals

How the admin layer actually works under the hood. Pairs with the feature doc at `../06-admin.md` (which describes behaviour) — this one explains the wiring.

---

## 1. Custom claims as the source of truth

Authorization reads from the **Firebase Custom Claim** `role` on the auth user, embedded in the signed session-cookie JWT. We do NOT use a Firestore field for the primary check.

Why: Firebase's official RBAC guidance — a Firestore field can be tampered with if a rule is mis-written. Custom claims live inside the signed JWT, can't be modified by clients regardless of rule misconfig, and are evaluated server-side at every request via `verifySessionCookie`.

### Setting a claim
Two paths:
- **`scripts/bootstrap-superadmin.ts`** — offline, only path that can produce `super_admin`.
- **`setUserRole` server action** — web, super_admin can grant `admin`/`moderator`, admin can grant `moderator`. Refuses `super_admin` grants entirely.

Both call `adminAuth.setCustomUserClaims(uid, { role })` and merge with existing claims (so a future non-role claim wouldn't be clobbered).

### Reading a claim
`server-auth.ts → getSessionWithRole()`:
1. Read the session cookie.
2. `verifySessionCookie(cookie, /* checkRevoked */ true)` — decodes the JWT and returns claims.
3. `decoded.role` is the source of truth.
4. Fall back to `profiles.isAdmin` if no claim is present (legacy migration window — TODO: remove fallback once all admins migrated).

### The session-cookie freshness gotcha
Custom claims update **does NOT update existing session cookies.** They embed claims at sign-in time. After running the bootstrap script or calling `setUserRole`, the target user must:

1. Sign out + back in, OR
2. Call `getIdToken(true)` in the browser console then re-POST to `/api/auth/session` to mint a new cookie.

The bootstrap script's success message reminds users of this.

---

## 2. Role hierarchy helpers (`src/lib/auth/roles.ts`)

```ts
type Role = "super_admin" | "admin" | "moderator";
const ROLE_RANK = { super_admin: 30, admin: 20, moderator: 10 };

function meetsRole(actual, required) {
  return actual ? ROLE_RANK[actual] >= ROLE_RANK[required] : false;
}

function rolesGrantableBy(granter) {
  if (granter === "super_admin") return ["super_admin", "admin", "moderator"];
  if (granter === "admin")       return ["moderator"];
  return [];
}
```

`meetsRole` is the hierarchy check used everywhere — `super_admin` satisfies any check.

`rolesGrantableBy` drives both the server-side validation in `setUserRole` AND the client-side UI (hides buttons your tier can't actually grant).

Note: `setUserRole` additionally short-circuits `super_admin` grants regardless of what `rolesGrantableBy` says — that's the offline-only invariant.

---

## 3. Step-up auth (`src/lib/auth/step-up.ts`)

The 15-minute "you recently re-entered your password" gate.

### Wire-up

A separate httpOnly cookie `step_up` with HMAC-signed `{uid}:{expiresAtMs}:{hexSig}`:

```
step_up = `${uid}:${expiresAtMs}:${sign("${uid}:${expiresAtMs}")}`
```

`sign` is HMAC-SHA256 with `STEP_UP_SECRET`. Verification uses `timingSafeEqual` to avoid leaking the signature via timing.

### Minting (server)
`POST /api/auth/step-up`:
1. Receive a fresh Firebase ID token in the body.
2. `verifyIdToken(token, /* checkRevoked */ true)` — confirms valid + not revoked.
3. Check `auth_time` claim is within last 5 minutes (defeats replay of old ID tokens).
4. Verify the existing session cookie's uid matches the fresh token's uid (defeats stolen-token attacks where attacker has a session cookie but a different fresh token).
5. Mint the cookie via `mintStepUpToken(uid)`.

### Enforcing (server)
`requireStepUp(uid)`:
```ts
const raw = cookies().get("step_up")?.value;
if (!raw) throw new Error("step_up_required");
const decoded = decode(raw);  // verifies HMAC + length + expiry
if (!decoded || decoded.uid !== uid || Date.now() > decoded.expiresAt) {
  throw new Error("step_up_required");
}
```

Every destructive admin action calls `requireStepUp(session.uid)` before doing anything else. The wrapper-style error handling in the action distinguishes step-up from other failures:

```ts
try {
  session = await requireRole("admin");
  requireStepUp(session.uid);
} catch (err) {
  if (err instanceof Error && err.message === "step_up_required") {
    return { success: false, needsStepUp: true, error: "Re-authenticate to continue" };
  }
  return { success: false, error: err instanceof Error ? err.message : "Forbidden" };
}
```

### Client retry flow (`useStepUp` hook)
1. Wrap any action call: `await call(() => banUser(uid, reason))`.
2. If result is `{ needsStepUp: true }`, the hook opens the password modal AND holds a pending promise.
3. Modal triggers `reauthenticateWithCredential(currentUser, credential)`, posts to `/api/auth/step-up`.
4. On step-up success, the hook re-runs the original action ONCE and resolves the held promise with the result.

The retry is non-recursive — if the second call ALSO returns `needsStepUp`, the user sees it as a failure rather than entering an infinite loop.

---

## 4. Audit log (`src/lib/auth/audit-log.ts`)

A single helper `writeAuditLog(entry)` that writes to `/admin_audit/{auto-id}`. Schema documented in `firestore-schema.md`.

### What gets logged
- **All admin actions** (success AND failure): role grants, bans, force operations, refunds, content moderation.
- **Sensitive reads**: opening `/admin/users/[uid]/view` writes a `user.view_state` entry. Other reads (search, list, audit-log view itself) are NOT logged to avoid noise.

### What doesn't get logged
- Regular user actions (tournament registration, posting, missions).
- Failed admin actions where the failure is purely client-validation (e.g. reason < 5 chars) — these throw before reaching the action handler.

Actually no, those DO get logged via `logFailure` to capture the attempt. The reason: it's evidence if someone is probing.

### Reading
`listAuditLog({ before?, pageSize, actionLike? })` returns paginated by `at` desc. The viewer at `/admin/audit` filters by exact action name (no contains — Firestore can't do that natively; future enhancement: denormalise an `actionPrefix` field for prefix queries).

### Append-only contract
The Firestore rule rejects `create/update/delete` from the client side. Server-side, we never expose a way to update or delete an entry — `writeAuditLog` is the only call site and it only adds. The append-only contract is what makes the log trustworthy.

---

## 5. Discord alerts (`src/lib/auth/discord-alert.ts`)

Webhook POST to `DISCORD_ADMIN_WEBHOOK_URL` with a Discord embed payload. Severity levels map to colours:

```ts
LEVEL_COLOURS = {
  info:     0x6366f1,  // indigo
  warn:     0xfbbf24,  // amber
  critical: 0xef4444,  // red
};
```

### Trigger rules
- **`critical`** for anything that touches money or revokes access: role changes, bans, force-cancel (with refunds), force-refund, also privilege-escalation attempts (a non-super_admin tries to grant super_admin).
- **`warn`** for force-finalize, force-unlink Riot, content moderation that affects multiple people.
- **`info`** for routine moderation (single content hide, unban).

### Best-effort delivery
A failed Discord POST never aborts the action — the audit log is the durable record. The webhook failure logs `[discord-alert] webhook returned 4xx` to Vercel logs.

### Silent when unset
If `DISCORD_ADMIN_WEBHOOK_URL` is not in env, the function early-returns. No errors, no log noise. Useful for local dev without spamming the prod channel.

---

## 6. The bootstrap script

Lives at `scripts/bootstrap-superadmin.ts`. Runs with `npx tsx` using the same Firebase Admin credentials as the running app (loaded from `.env.local` via `dotenv`).

Flow:
1. Look up the auth user by email.
2. Print current claims so the operator can sanity-check.
3. `setCustomUserClaims(uid, { ...existing, role: "super_admin" })` (or `null` on revoke).
4. Mirror to `profiles.isAdmin` for legacy reads.
5. Write an audit-log entry with `actor: "bootstrap-script"` so the trail is preserved.

The script is the **only path to super_admin** because:
- The web `setUserRole` action explicitly rejects `super_admin` grants.
- The Firestore rule on `/admin_audit/{id}` doesn't allow client writes, so a forged audit entry can't lie about a non-existent grant.
- The service-account credentials needed to run this script are environment-only and not exposed to clients.

If the service-account JSON leaks, treat it as a kingdom-wide compromise: rotate the key, audit every grant since rotation, possibly mass-revoke claims to a known-good baseline.

---

## 7. The login-time ban gate

`/api/auth/session POST` is the endpoint that converts a Firebase ID token into a 5-day session cookie. After Phase 3a, it also reads the auth record server-side:

```ts
const userRecord = await adminAuth.getUser(decoded.uid).catch(() => null);
if (!userRecord || userRecord.disabled) {
  return NextResponse.json({ error: "Account suspended" }, { status: 403 });
}
```

`banUser` sets `disabled: true` on the Firebase auth user. The combination is:

1. **Existing sessions** — killed within seconds by `revokeRefreshTokens` + the `checkRevoked: true` flag on `verifySessionCookie`.
2. **New sessions** — refused at this gate.
3. **Direct API calls with a fresh ID token** (rare, race-window) — the ID token was issued before the ban; but `verifyIdToken(token, true)` with `checkRevoked: true` will reject it because the user was disabled.

Belt and braces.

---

## 8. Tier-aware UI

`/admin/layout.tsx` runs `verifyAdminAccess()` on every render and only renders the nav items the current tier can access. Items above the user's tier are filtered out.

Pages within `/admin/*` re-check their own minimum tier in `getMyRole()` calls and `redirect("/admin")` for unauthorised access. Defence-in-depth — the layout filter is convenience; the per-page check is the actual gate.

---

## 9. Race conditions worth knowing

- **Two admins ban the same user simultaneously.** Both attempts win at the auth layer (`updateUser` is idempotent on `disabled: true`); both write audit entries; both Discord-alert. The profile mirror is last-writer-wins on reason — acceptable.
- **Admin grants role to a user while that user is mid-action.** The user's in-flight action completes with their OLD role (their JWT still has old claims). New role takes effect on next sign-in.
- **Bootstrap script + simultaneous web setUserRole.** Both call `setCustomUserClaims` — last writer wins on the `role` field. Both audit-log. Acceptable.
- **Step-up cookie minted; admin's session is then revoked.** Step-up cookie is now orphaned — its uid points at a user with no valid session. Next destructive action's `requireRole("admin")` will throw "Unauthenticated" before `requireStepUp` is even checked. Safe.

---

## 10. Implementation file map

| File | Role |
|---|---|
| `src/lib/auth/roles.ts` | Role type, ROLE_RANK, meetsRole, rolesGrantableBy |
| `src/lib/auth/audit-log.ts` | writeAuditLog helper |
| `src/lib/auth/discord-alert.ts` | sendAdminAlert |
| `src/lib/auth/step-up.ts` | mintStepUpToken, requireStepUp, decode |
| `src/lib/actions/server-auth.ts` | Session + role helpers (getSessionUid, getAdminUid, requireRole, ...) |
| `src/lib/actions/admin.actions.ts` | setUserRole, listRoleHolders, adminSearchUsers, adminGetUser, adminViewUserState, listAuditLog, adminListTournaments, adminGetTournamentDetail, adminListLeagueOwners, getMyRole |
| `src/lib/actions/admin-moderation.actions.ts` | banUser, unbanUser, forceUnlinkRiotAccount, hideContent, unhideContent |
| `src/lib/actions/admin-tournament.actions.ts` | forceFinalizeTournament, forceCancelTournament, forceRefundParticipant |
| `src/app/api/auth/step-up/route.ts` | Step-up cookie mint endpoint |
| `src/app/(main)/admin/layout.tsx` | Admin guard + tier-aware nav |
| `src/app/(main)/admin/**/page.tsx` | Each admin page |
| `src/components/admin/*.tsx` | StepUpModal, useStepUp, AdminUserActions, AdminTournamentActions, AdminParticipantRefundButton |
| `scripts/bootstrap-superadmin.ts` | Offline super_admin grant |
