# Architecture

How the codebase is laid out and the conventions that hold across it.

---

## 1. Stack

- **Next.js 14 App Router** — file-based routing with `(main)` and `(auth)` route groups.
- **React Server Components** by default; client components opt in via `"use client"`.
- **Firebase** — Auth (sign-in, custom claims), Firestore (data), Storage (uploads).
- **Stripe** — payments + refunds.
- **Riot Games API** — League integration + Tournament-V5.
- **Resend** — transactional email.
- **Tailwind CSS + custom CSS variables** — Arena design system.
- **Hosted on Vercel** (Production + Preview branches).
- **Sonner** for toasts; **react-hook-form + zod** for form validation; **lucide-react** for icons.

---

## 2. Folder structure

```
clanforge/
├── docs/                                       ← documentation
│   ├── README.md
│   ├── 01-profile.md ... 06-admin.md           feature docs
│   ├── HANDOFF.md / *.md                       runbooks
│   └── internal/                               (this section)
├── firebase/
│   ├── rules/firestore.rules                   security rules
│   ├── rules/storage.rules
│   └── firestore.indexes.json                  composite indexes
├── scripts/
│   └── bootstrap-superadmin.ts                 offline CLI tools
├── src/
│   ├── app/
│   │   ├── (auth)/                             login / register
│   │   ├── (main)/                             all signed-in pages
│   │   │   ├── dashboard/
│   │   │   ├── clans/
│   │   │   ├── tournaments/
│   │   │   ├── leaderboard/
│   │   │   ├── notifications/
│   │   │   ├── players/
│   │   │   ├── profile/
│   │   │   ├── settings/
│   │   │   └── admin/                          admin dashboard
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── session/route.ts            session cookie endpoints
│   │   │   │   └── step-up/route.ts            step-up cookie endpoint
│   │   │   ├── upload/route.ts                 server-side file proxy
│   │   │   ├── username-check/route.ts         live availability
│   │   │   └── webhooks/
│   │   │       ├── stripe/route.ts
│   │   │       └── riot/tournament/route.ts
│   │   ├── error.tsx / not-found.tsx / loading.tsx
│   │   └── globals.css                         design tokens + utilities
│   ├── components/                             organised by domain
│   │   ├── admin/                              admin UI components
│   │   ├── clan/
│   │   ├── layout/                             navbar, sidebar, footer
│   │   ├── missions/
│   │   ├── profile/
│   │   ├── tournament/
│   │   └── ui/                                 design-system primitives
│   ├── lib/
│   │   ├── actions/                            all server actions
│   │   ├── auth/                               roles + audit + step-up + alerts
│   │   ├── firebase/                           admin + client SDK init
│   │   ├── riot/                               Riot API clients
│   │   ├── stripe.ts
│   │   ├── webhook-context.ts                  AsyncLocalStorage flag
│   │   ├── xp.ts                               XP rules + level thresholds
│   │   ├── missions.ts                         personal mission templates
│   │   ├── clan-missions.ts                    clan mission templates
│   │   ├── prize-splits.ts
│   │   └── ...                                 small helpers
│   └── types/
│       ├── index.ts                            re-exports
│       ├── firestore.ts                        document interfaces
│       └── integrations.ts                     Riot integration types
└── package.json
```

---

## 3. Server actions pattern

Every mutating operation is a `"use server"` function in `src/lib/actions/`. Conventions:

1. **First line is always `const sessionUid = await getSessionUid();`** (or `getAdminUid` / `requireRole` for admin paths).
2. **If the action takes `uid` as a parameter:** `if (sessionUid !== uid) return { success: false, error: "Forbidden" };` — defends against IDOR (a client can call any server action with any uid).
3. **All writes go through the Admin SDK** (`adminDb`) — bypasses Firestore rules (rules exist as a defence-in-depth layer for any client that does write directly).
4. **Multi-document writes that need atomicity use Firestore transactions** (`adminDb.runTransaction`). Examples: tournament registration (count + participant doc), Riot link confirmation (owners doc + integration doc + pending deletion), unlink (integration + owners release).
5. **Returns `ActionResult<T> = { success, data?, error?, needsStepUp? }`** — clients destructure and toast on failure.
6. **Snapshot-derived rewards.** Never trust amount inputs from the caller. E.g. mission XP rewards are read from the user-scoped mission doc inside `awardXp`, not from the caller's request. Caller-supplied amounts would let a client inflate their own rewards.

### Server-auth helpers (`src/lib/actions/server-auth.ts`)

| Helper | Use when |
|---|---|
| `getSessionUid()` | You need the calling user's uid for an IDOR check. |
| `requireAuthContext()` | Helpers that don't need the uid but want to confirm the call is reachable — e.g. `awardXp` called from a webhook AsyncLocalStorage context where there's no session cookie. |
| `getSessionWithRole()` | You need both uid and role (e.g. admin actions that branch on tier). |
| `requireRole(min)` | Strict tier-or-above gate. Throws "Forbidden" if below. |
| `getAdminUid()` | Admin+. Wraps `requireRole("admin")` returning uid. |
| `getSuperAdminUid()` | Super-admin only. |
| `getModeratorUid()` | Moderator+. |

---

## 4. Webhook context (`src/lib/webhook-context.ts`)

Webhooks have no session cookie. To let server-side helpers (`awardXp`, `awardClanXp`, `trackMissionProgress`, `trackClanMissionProgress`) work inside a webhook without bypassing their auth check, we use Node's `AsyncLocalStorage`:

```ts
export function runInWebhookContext<T>(fn: () => Promise<T>): Promise<T> {
  return _store.run(true, fn);
}
export function inWebhookContext(): boolean {
  return _store.getStore() === true;
}
```

Webhook route handlers (`/api/webhooks/stripe`, `/api/webhooks/riot/tournament`) wrap their body in `runInWebhookContext(() => ...)` AFTER signature verification. Downstream helpers call `inWebhookContext()` and skip the session check if true.

The flag is only set inside `runInWebhookContext` — clients can never invoke a code path that flips it.

---

## 5. Idempotency

Actions that can be retried (webhooks, button-mash) must be safe to re-run. Patterns:

- **`once_per_target` XP awards** — `awardXp(uid, "tournament_match_win", matchId)` keys the dedup record by `matchId`. Re-call is a no-op.
- **Matched-by-status guards** — `if (match.status === "complete") return { success: true, idempotent: true };` early-return in the Riot callback handler.
- **Snapshot dates on profile** — `lastDailyLoginDate`, `lastClanActiveDate` for once-per-day mission triggers.
- **Stripe Checkout Session IDs** — reconciled in the participant doc so a re-fired webhook doesn't double-credit.

---

## 6. Naming conventions

- Server actions: verb-first camelCase (`createTournament`, `banUser`).
- Client components: PascalCase, suffixed with the component shape if generic (`StepUpModal`, `LinkedGameCard`).
- Server actions live in `src/lib/actions/<domain>.actions.ts`. Reserved prefix `_match-result-core.ts` for shared internals not directly callable from client.
- Firestore collections: plural snake_case for top-level (`tournaments`, `admin_audit`, `league_account_owners`), camelCase for subcollections (`gameRecords`, `missions_daily`, `integrations_pending`).
- Types: PascalCase, no `I` prefix.

---

## 7. Error handling

- Server actions never throw to the client — they return `{ success: false, error }`.
- Client-side, `try { ... } catch` only around fetches we genuinely expect to fail (e.g. Stripe redirect retries). Otherwise we let React Error Boundaries handle it.
- Production: `error.tsx` and `not-found.tsx` provide global fallbacks themed with the Arena design.

---

## 8. UI architecture

- **Arena design system** primitives in `src/components/ui/` — Button, Badge, MonoPill, RankChevron, StatBlock, ArenaCard, etc.
- Foundation tokens in `src/app/globals.css` — colours (`--accent`, `--magenta`, `--cyan`, …), surface (`--bg-base`, `--bg-surface`, `--bg-elevated`, `--bg-overlay`), utility classes (`.arena-cta`, `.arena-input`, `.arena-glow-card`, …).
- Page-level data fetching: server components by default; client components only where state / interactivity is needed.
- Loading skeletons: `loading.tsx` in each major route segment.

See `docs/ui-design-guidelines.md` for the deep-dive runbook.

---

## 9. Performance patterns

Established during the security/performance sweep (HANDOFF.md §2):

- **Parallel fetches** with `Promise.all` for any sequential awaits inside a server component.
- **`useMemo` / `useCallback`** on derived values inside large client components.
- **Cursor-based pagination** for any list that can grow unbounded — players, clans, tournaments, audit log, leaderboard.
- **Denormalised hot fields** to avoid joins — `profiles.clanTag` / `clanSlug` / `clanName` are mirrored from `/clans/{id}` so the profile hero render is one doc fetch.
