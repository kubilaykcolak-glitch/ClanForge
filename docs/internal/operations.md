# Operations

Everything needed to operate ClanForge — env vars, secrets, deployment, key rotation, CLI scripts.

---

## 1. Environment variables

All set in `.env.local` (local dev, gitignored) AND mirrored as encrypted env on Vercel for Production + Development. Add to **both** when introducing a new one.

### Firebase
| Name | Purpose | Where set |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Client SDK config | All |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Client SDK config | All |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Client SDK config | All |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Client SDK config | All |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Client SDK config | All |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Client SDK config | All |
| `FIREBASE_ADMIN_PROJECT_ID` | Admin SDK | All |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Admin SDK service account | All |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Admin SDK service account | All (escape `\n` to `\\n` when pasting) |

### Stripe
| Name | Purpose | Where set |
|---|---|---|
| `STRIPE_SECRET_KEY` | Server-side Stripe client | All |
| `STRIPE_WEBHOOK_SECRET` | Verifies the `/api/webhooks/stripe` payload signature | All |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client redirect to Checkout | All |

### Email
| Name | Purpose | Where set |
|---|---|---|
| `RESEND_API_KEY` | Transactional email (verification, payment receipts) | All |

### Riot
| Name | Purpose | Where set |
|---|---|---|
| `RIOT_API_KEY` | Server-side Riot API auth (`X-Riot-Token` header) | All |
| `RIOT_TOURNAMENT_USE_STUB` | `"true"` (default) routes Tournament endpoints to `tournament-stub-v5`; `"false"` goes to production `tournament-v5` (requires Riot approval) | All |
| `RIOT_METADATA_SECRET` | HMAC-SHA256 secret for the `metaData` blob round-tripped via Tournament codes; defeats forged callbacks | All |
| `RIOT_CALLBACK_URL` | URL Riot's servers POST tournament match results to | All |

### Admin
| Name | Purpose | Where set |
|---|---|---|
| `STEP_UP_SECRET` | HMAC-SHA256 secret for the 15-minute step-up cookie | All |
| `DISCORD_ADMIN_WEBHOOK_URL` | Discord webhook for admin alerts; alerts are silently dropped if unset | All (optional) |

### Misc
| Name | Purpose | Where set |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Base URL used in absolute-link generation (emails, Stripe redirects) | Prod only |

---

## 2. Secret rotation

Treat each as a "if this leaks, rotate immediately" runbook.

### Firebase service-account key
**Impact if leaked:** full Admin SDK access — grant super_admin, read/write any Firestore doc.

1. Firebase Console → Project settings → Service accounts → **Generate new private key** → download JSON.
2. Update `FIREBASE_ADMIN_PRIVATE_KEY` (escape newlines), `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PROJECT_ID` in `.env.local` and on Vercel.
3. Firebase Console → revoke the leaked key from the service-accounts page.
4. Redeploy.

### Riot API key
**Impact if leaked:** rate-limit exhaustion against your app, possible Riot suspension. Not catastrophic — keys are short-lived.

1. https://developer.riotgames.com → top of dashboard → **Regenerate API Key**.
2. Update `RIOT_API_KEY` in `.env.local` and on Vercel.
3. Redeploy. Dev keys expire every 24h anyway; treat the rotation as a no-op compared to normal lifecycle.

### Riot metadata secret
**Impact if leaked:** attacker can forge Tournament-V5 callbacks claiming arbitrary match results.

1. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Update `RIOT_METADATA_SECRET` in `.env.local` and Vercel.
3. Redeploy.

**Watch out:** in-flight tournament codes that were minted with the old secret will fail verification on callback. Acceptable — there are typically zero active codes if you rotate during low-traffic.

### Step-up secret
**Impact if leaked:** attacker with an admin session cookie could forge their own step-up cookie and bypass the password re-auth gate.

1. Generate as above.
2. Update `STEP_UP_SECRET`.
3. Redeploy. All active step-up cookies become invalid; admins re-enter password on next destructive action. Acceptable.

### Discord webhook URL
**Impact if leaked:** anyone can post embeds in the admin alerts channel.

1. Discord channel ⚙️ → Integrations → Webhooks → kebab on "ClanForge" → Delete.
2. Create a new one with the same name.
3. Update `DISCORD_ADMIN_WEBHOOK_URL` on Vercel + `.env.local`.
4. Redeploy.

### Stripe keys
1. Stripe Dashboard → Developers → API keys → roll the secret key.
2. Update `STRIPE_SECRET_KEY`.
3. Webhook signing secret: Stripe Dashboard → Developers → Webhooks → choose the endpoint → roll signing secret.
4. Update `STRIPE_WEBHOOK_SECRET`.
5. Redeploy.

---

## 3. Deployment

### Vercel (Next.js app)
Auto-deploys on push to `main`. Manual deploy:
```bash
npx --yes vercel@latest --prod --yes
```
Production URL: `clan-forge-kubilaykcolak-glitchs-projects.vercel.app` (stable alias — does not change per deploy). Custom domain not yet configured.

Each `vercel ... --prod` run prints the deployment-specific URL plus the stable alias.

### Firebase Firestore rules
Live in `firebase/rules/firestore.rules`. Auto-deploys are not configured; deploy manually after any rule change:
```bash
npx --yes firebase-tools deploy --only firestore:rules
```
The first run will require `firebase login`. Project is `clan-vault`.

### Firebase Storage rules
`firebase/storage.rules`. Deploy:
```bash
npx --yes firebase-tools deploy --only storage
```

### Firebase Firestore indexes
`firebase/firestore.indexes.json`. Add composite indexes here when a query needs them; deploy:
```bash
npx --yes firebase-tools deploy --only firestore:indexes
```

---

## 4. CLI scripts

In `scripts/`. Run with `npx tsx`.

### `bootstrap-superadmin.ts`
Grant or revoke `super_admin` on a user. **The only path that can produce a super_admin.**
```bash
npx tsx scripts/bootstrap-superadmin.ts user@example.com
npx tsx scripts/bootstrap-superadmin.ts --revoke user@example.com
```
- Looks up the user by email via Firebase Auth.
- Sets `customClaims.role = "super_admin"` (or `null` on revoke).
- Mirrors to `profiles.isAdmin` for legacy reads.
- Writes an audit-log entry with `actor: "bootstrap-script"`.
- **User must sign out + back in** for the new claim to be reflected in their session JWT.

---

## 5. Common debugging steps

### "I made myself super_admin but `/admin` still redirects me to /dashboard"
Your session cookie has the OLD claim. Sign out + back in. (The session cookie is minted at sign-in and embeds the JWT claims at that moment.)

### "Riot API calls are all 401ing"
Dev key expired (they last 24h). Regenerate on developer.riotgames.com, update `RIOT_API_KEY` in both `.env.local` and Vercel, redeploy.

### "Step-up modal keeps reopening even after I enter my password"
Check the browser dev console for errors from `/api/auth/step-up`. Most likely causes:
- `STEP_UP_SECRET` not set in the running environment.
- Session cookie missing or expired (sign in again).
- Clock skew between client and server (rare; auth_time freshness window is 5 minutes).

### "Discord alerts not firing"
- `DISCORD_ADMIN_WEBHOOK_URL` not set → alerts are silent no-ops by design.
- Webhook URL was deleted in Discord → server logs `[discord-alert] webhook returned 404`.
- Webhook URL was rotated and the env wasn't updated → same as above.

### "Tournament code not minting on bracket generation"
- `RIOT_TOURNAMENT_USE_STUB` is `"true"` and the dev key was just rotated; first call may 403 briefly during Riot-side warmup. Retry once.
- One of the participants doesn't have a linked Riot account — bracket gen mints codes match-by-match and skips broken ones; check the bracket admin panel for `(no code)` indicators and resolve via `regenerateMatchCode`.

### "Firestore writes succeed locally but fail in production"
- Rules deployed locally but not pushed → run `npx firebase-tools deploy --only firestore:rules`.
- Production rules out of sync with local — diff `firebase/rules/firestore.rules` against the Firebase Console rules tab.

---

## 6. Observability

We don't run a dedicated APM. Signal channels:

- **Vercel logs** — `vercel logs <deployment-url>` or the Vercel dashboard. Captures Next.js server errors, server-action throws, webhook handler logs.
- **Firebase Console → Cloud Firestore → Usage** — read/write counts, rule denials.
- **Discord `#admin-alerts`** — every privileged action posts here. Absence of expected alerts is itself a signal.
- **`/admin/audit`** — searchable per-action history, including failures.

For incident response, the canonical chain is: Discord alert → audit log entry → Vercel logs near that timestamp → Firestore doc state.
