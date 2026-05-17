# Admin System

Three role tiers, a dashboard at `/admin`, a per-action audit log, password re-auth (step-up) gating every destructive action, and Discord alerts on critical events. Authorisation is done via Firebase Custom Claims (`auth.token.role`) — tamper-proof, signed JWT, can't be forged via Firestore writes.

---

## 1. Role hierarchy

| Role | Can do | Notes |
|---|---|---|
| **super_admin** | Everything. Grant/revoke admin and moderator. Manage own admins. Cannot grant super_admin via the web (only the offline bootstrap script). | One or two of you. Highest-impact actions Discord-alerted critical. |
| **admin** | Manage users (ban / unban / role grant ≤ moderator / force-unlink Riot). Manage tournaments (force-finalize / force-cancel / per-participant refund). Manage challenges + seasons. View audit log. View any user's full state. | Cannot touch other admins or super_admins. |
| **moderator** | Hide and unhide content (posts / tournaments / clans). View audit log. View admin overview. | Cannot manage users or tournaments. |
| (regular user) | None of the above. | `/admin` redirects them to `/dashboard`. |

Roles are inherited downward — a super_admin satisfies any `admin` or `moderator` requirement.

---

## 2. Granting super_admin (offline only)

The first super_admin (you) is set via a CLI script that runs locally with your service-account credentials. There is no web path; this is the security property.

```bash
npx tsx scripts/bootstrap-superadmin.ts your-email@example.com
```

To revoke:

```bash
npx tsx scripts/bootstrap-superadmin.ts --revoke your-email@example.com
```

After running, **sign out and back in** so your Firebase ID token reflects the new claim. (Custom claims only land in fresh JWTs.)

---

## 3. Granting admin / moderator (web)

`/admin/users` → search → click a user → **Set role: admin** or **Set role: moderator**. Requires:

- You're at least admin (for moderator grants) or super_admin (for admin grants).
- A reason ≥ 5 characters — written into the audit log + Discord embed.

The target user must sign out + back in to pick up the new claim. There's no way to grant super_admin from the web — even another super_admin must use the bootstrap script. This prevents a single hijacked super_admin session from cascading.

---

## 4. Step-up authentication

Even when logged in as admin, **destructive actions** require re-entering your password. The proof of recent re-auth lives in a separate 15-minute `step_up` cookie, distinct from the 5-day session.

### How it works
1. You click a destructive action.
2. Server says `needsStepUp: true`.
3. UI opens a password modal.
4. Password is verified by Firebase (`reauthenticateWithCredential`), giving back a fresh ID token whose `auth_time` is "now".
5. Token is POSTed to `/api/auth/step-up`, which verifies it AND the existing session AND the freshness, then mints the 15-min cookie.
6. The action retries automatically.
7. Subsequent destructive actions inside the 15-minute window skip the modal.

### Actions requiring step-up
- Ban / unban user
- Force-unlink Riot integration
- Force-finalize tournament
- Force-cancel tournament (with refunds)
- Force-refund individual participant

### Actions NOT requiring step-up
- Role grant / revoke (already gated by tier checks + Discord alert)
- Content hide / unhide (moderation should be fast)
- Reads (search, view audit, view user state)

---

## 5. Audit log

Every privileged action (success AND failure) writes an immutable doc to `/admin_audit/{id}`. Visible at `/admin/audit`. Fields per entry:

- **actor** — admin uid who performed the action
- **actorRole** — their role at the time
- **action** — short snake_case verb (`user.ban`, `tournament.force_cancel`, `user.view_state`, …)
- **targetType** + **targetId** — what was affected
- **reason** — required ≥ 5 chars, human-supplied
- **metadata** — action-specific extras (e.g. old/new role, refunded amount)
- **result** — `success` or `failure`
- **errorMsg** — populated on failure
- **ip** — captured from request headers
- **at** — server timestamp

### Reading

`/admin/audit` paginates 50 per page, newest first, with an exact-action filter. Each row expands to show metadata as JSON. Failed attempts have a red left border.

Audit log is **append-only**: writes go through the Admin SDK, never the client; Firestore rule `match /admin_audit/{id} { allow create, update, delete: if false; }` enforces this even server-side outside Admin SDK.

---

## 6. Discord alerts

Critical events post to a private Discord channel via webhook (`DISCORD_ADMIN_WEBHOOK_URL`). Severity levels:

| Level | Colour | Triggers |
|---|---|---|
| `info` | Indigo | Content hide / unhide, unban, role-holder list refresh |
| `warn` | Amber | Force-finalize tournament, force-unlink Riot, role-grant rejection attempts |
| `critical` | Red | Ban, force-cancel tournament (with refunds), force-refund participant, role grant / revoke |

If `DISCORD_ADMIN_WEBHOOK_URL` is unset, alerts are silently dropped — the audit log is the durable record; Discord is convenience.

---

## 7. Admin dashboard pages

### `/admin` — Overview
Stats cards for challenges, seasons, role holders, audit-entries count. Recent admin activity (last 10) in a list. Quick-link buttons.

### `/admin/users` — User management
Live search by uid / email / username (prefix). Below: a "Role holders" panel listing every user with a role, refreshable. Click any row → `/admin/users/[uid]`.

### `/admin/users/[uid]` — User detail
Full profile + auth metadata + role/ban state + Riot integration snippet. **Actions:**
- Set role (admin / moderator) and Revoke role — visible only for what your tier can grant
- Ban / Unban
- Force-unlink Riot integration
- "View full user state →" link to /view (read-only, audit-logged)

### `/admin/users/[uid]/view` — Comprehensive read-only state
Joins profile + auth + integration + last 10 notifications + last 20 tournament registrations + last 10 audit entries targeting this user. **Opening this page is itself audit-logged** as `user.view_state` so we can spot mass-snooping.

### `/admin/tournaments` — Tournament list
Status-filtered (open / locked / live / complete / cancelled / draft / all). Shows participant counts, money, game provider, creator. Click → detail.

### `/admin/tournaments/[id]` — Tournament admin
Read-only tournament card + admin actions:
- **Force finalize** — sets status `complete`. Use for stuck tournaments.
- **Force cancel** — sets status `cancelled` AND refunds every paid participant via Stripe. Tallies failures rather than rolling back ("refunded 8, 1 refund failure(s)").

Participants table with per-row **Refund** button for one-off Stripe refunds.

### `/admin/integrations` — Riot account locks
Live view of every active `/league_account_owners/{puuid}` lock joined with the owning user's profile + Riot ID. Search by PUUID prefix or uid. Per-row **Force-unlink** to release the PUUID and clean up the integration doc + pending verification.

### `/admin/audit` — Audit log viewer
50 per page, newest first. Filter by exact action. Expandable metadata blob per row.

### `/admin/challenges` and `/admin/seasons`
Pre-existing — create / activate / archive challenges + seasons. Admin tier required.

---

## 8. What happens when…

- **You bootstrap yourself but don't sign out.** Your existing session cookie still has the OLD claim (none). `/admin` redirects you to `/dashboard`. Sign out + back in to refresh the cookie with the new claim.
- **You try to ban another admin.** Rejected. Only a super_admin can ban an admin. Super_admins cannot be banned from the UI at all — use the bootstrap script `--revoke` first, then ban.
- **You try to demote yourself.** Rejected. Prevents accidental lockout. Use the bootstrap script if you genuinely need to step down as super_admin.
- **An action's step-up cookie has expired.** Server returns `needsStepUp: true`; the modal opens, you re-auth, the action retries. From your perspective: one password prompt, then the action completes.
- **A refund fails inside Force-cancel.** Tournament still becomes `cancelled`; the failure is logged + alerted; other refunds succeed independently. You'd retry the failed one via `/admin/tournaments/[id]` per-participant refund.
- **Discord webhook URL leaks.** Anyone with it can post embeds in that channel. Rotate via Discord channel settings → Integrations → Webhooks → kebab → Delete + recreate → update `DISCORD_ADMIN_WEBHOOK_URL` on Vercel + redeploy.
- **Your service-account JSON leaks.** Anyone with it can grant themselves super_admin via the bootstrap script. Rotate in Firebase Console → Project settings → Service accounts → Generate new private key. Update `FIREBASE_ADMIN_PRIVATE_KEY` everywhere it's set.
- **An impersonation/view-as-user mode** — not built. See the trade-off explanation in the Phase 3b summary. `/admin/users/[uid]/view` covers the common support case (read-only comprehensive view + audit trail). True session-takeover impersonation can be added later as Phase 3c if needed.
