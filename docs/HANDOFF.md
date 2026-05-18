# ClanForge — Session Handoff

> Snapshot of the work shipped in this conversation. Read this end-to-end
> before resuming — each section refers to later ones, and many decisions
> made early shape what's in production now.
>
> Repo: `https://github.com/kubilaykcolak-glitch/ClanForge`
> Branch: `main`
> Latest commit at time of handoff: **`abcddb5`**
>
> Predecessor: the earlier handoff (commits `80b4e5d` … `ef3a64f`) covered
> missions, security audit, and Arena UI. Everything in this document was
> shipped on top of that baseline.

---

## 1. Commit timeline

24 commits, in chronological order. Each was verified with `tsc --noEmit`,
ESLint on touched files, and `next build` before pushing.

| # | Commit | Title | Scope |
|---|---|---|---|
| 1 | `72528f4` | feat(integrations): League of Legends account linking + live profile widget | First Riot API integration |
| 2 | `8fe4122` | feat(integrations): success modal with pulled stats after linking | UX polish |
| 3 | `8d57902` | fix(integrations): use league-v4 by-puuid endpoint + correct SEA routing | Riot API deprecation fix |
| 4 | `10b8eee` | feat(tournament): auto-verify LoL matches via Riot Tournament-V5 | Stub-V5 wiring + callback handler |
| 5 | `893999e` | feat(tournament): admin controls for LoL matches + shared result core | Per-match admin panel |
| 6 | `ac606bd` | feat(integrations): League ownership verification + PUUID uniqueness | Profile-icon challenge |
| 7 | `5bb91b9` | feat(admin): role-tiered admin foundation (super_admin / admin / moderator) | Phase 1 of admin overhaul |
| 8 | `1f333b9` | feat(admin): step-up auth + admin moderation/tournament actions (Phase 2) | Server-side admin actions |
| 9 | `e0f3057` | docs: add deferred TODO / bug tracker | Initial `docs/TODO.md` |
| 10 | `232e4e8` | chore: keep docs/TODO.md local-only | Untrack from index |
| 11 | `824696e` | chore: gitignore docs/TODO.md so updates stay local | Add to `.gitignore` |
| 12 | `d579e9a` | feat(admin): admin dashboard UI + step-up modal (Phase 3a) | Step-up modal + users + audit pages |
| 13 | `3f0634a` | feat(admin): tournament admin + integrations + user-state pages (Phase 3b) | Tournament/integration admin + view-state |
| 14 | `3b1f173` | docs: comprehensive feature documentation | `docs/01-…` through `docs/06-…` |
| 15 | `5f3af1c` | docs: internal / operational documentation tree | `docs/internal/` |
| 16 | `2f93dde` | docs: deep-dive companions + fix feature-doc inaccuracies | `docs/deep-dives/` |
| 17 | `7120cab` | feat: close 4 open TODOs + round-2 bracket advancement gap | Big consolidated fix |
| 18 | `7fab2d4` | fix(firestore): add posts(isAnnouncement, createdAt) composite index | Clan-announcement query support |
| 19 | `e1aa303` | fix(auth): force-refresh ID token at sign-in + /api/auth/refresh-claims | Custom-claim propagation fix |
| 20 | `d9e15a4` | feat(admin): in-sidebar admin-mode toggle + role-gated visibility | Discreet sidebar entry |
| 21 | `fcd73c6` | fix(admin): step-up modal supports Google OAuth re-auth | Google sign-up support |
| 22 | `93620e3` | feat(challenges): expandable description + full details on widgets & admin | User + admin readability |
| 23 | `36d7268` | feat(admin/challenges): edit any field + reactivate completed/cancelled | Challenge edit + reactivate |
| 24 | `a4a970b` | feat(admin/challenges): reactivation resets clan progress + run-scoped rewards | Run-number system |
| 25 | `abcddb5` | feat(admin/discord): enrich Discord alerts with display names + entity titles | Readable webhook embeds |

---

## 2. League of Legends integration (`72528f4`, `8fe4122`, `8d57902`, `ac606bd`)

### Provider link flow
- User enters Riot ID (`Name#TAG`) + region on `/profile/edit` → "Link Account".
- Server resolves PUUID via `account-v1`, then validates the user owns the
  account via a **profile-icon challenge** (Battlefy / Toornament / Challenger-
  mode standard since Riot RSO isn't available to us):
  1. Pick a random icon from the 28 default profile icons every account has
     (icon IDs 1–28). Picks one *different* from their current icon.
  2. UI displays the target icon + instructions + 10-minute countdown.
  3. User changes their LoL icon → clicks Confirm.
  4. Server re-fetches `summoner-v4`, compares `profileIconId` to target.
- **PUUID uniqueness** is enforced via `/league_account_owners/{puuid}` doc.
  Each link runs a Firestore transaction that re-checks the owners doc,
  claims the PUUID, writes the integration, and deletes the pending doc.
  Two simultaneous link attempts → one wins, one gets a clear error.

### Widget on public profile (`LinkedGameCard`)
- Renders in the Game Records tab of `/profile/<username>`.
- Shows: Riot ID + region, rank tier+division+LP chip, W/L + win-rate, top 3
  mastery champion icons (CommunityDragon CDN), "Updated Xm ago" + Refresh.
- Refresh policy: auto every 6h on widget render, manual once per 5 min.

### Critical Riot API fixes from live testing
- `league-v4 entries/by-summoner/{id}` → **`entries/by-puuid/{puuid}`**.
  Riot deprecated the summoner-id endpoint; old one 403s.
- `account-v1` does **not exist** on `sea.api.riotgames.com`. Re-mapped PH/
  SG/TH/TW/VN/OCE to `asia` / `americas` for account-v1.

### Files
- `src/lib/riot/regions.ts` — platform → regional routing maps
- `src/lib/riot/client.ts` — typed account/summoner/league/mastery client
- `src/lib/riot/assets.ts` — icon URLs, tier colours, `TIER_RANK`,
  `PICKABLE_TIERS`, `tierLabel`, `formatRank`
- `src/lib/actions/integrations.actions.ts` — `startLeagueLinkVerification`,
  `confirmLeagueLinkVerification`, `cancelLeagueLinkVerification`,
  `unlinkLeagueAccount`, `refreshLeagueStats`
- `src/types/integrations.ts` — generic `IntegrationDoc<T>`, `LeagueIntegration`,
  `LeaguePendingVerification`
- `src/components/profile/LeagueLinkPanel.tsx` — three-state link UI
- `src/components/profile/LinkedGameCard.tsx` — public profile widget

---

## 3. LoL Tournament-V5 auto-verification (`10b8eee`, `893999e`)

### Flow
1. Tournament created with `game: "League of Legends"` + a region → flagged
   `gameProvider: "league"`.
2. On `generateBracket`:
   - `ensureRiotProvider(region)` — registers ClanForge with Riot once per
     region, caches `providerId` at `/system/riot/providers/{REGION}`.
   - `ensureRiotTournament(tournamentId)` — registers the tournament with
     Riot, persists `riotTournamentId` on the tournament doc.
   - `mintMatchCode(tournamentId, matchId)` — one code per non-bye match,
     `allowedParticipants` whitelisted to both captains' PUUIDs, `metadata`
     = HMAC-signed `tournamentId:matchId:hex` for callback verification.
3. Bracket UI renders the code as a chip with a copy button on each pending
   LoL match. Players paste into the LoL client → Play → Tournaments.
4. When the game ends, Riot POSTs to `/api/webhooks/riot/tournament` with
   the result + the `metaData` blob.
5. Webhook handler:
   - Verifies HMAC of `metaData`. Forged callbacks → 401.
   - Cross-checks the claimed code against the stored code on the match.
   - Identifies the winning captain by PUUID against linked-account records.
   - Calls the shared finaliser → match `complete`, XP / clan-XP / missions
     fire identically to a manual report.
6. Match box renders an `AUTO-VERIFIED` badge.

### Stub vs production
- `RIOT_TOURNAMENT_USE_STUB=true` (default) routes all calls to
  `tournament-stub-v5`. Works on a regular dev key without Riot approval.
  Stub **does not send real callbacks** — admin can fake one via the
  "Simulate Winner" admin panel on each match for dev testing.
- Production access pending Riot approval. Switching: flip the env var,
  delete cached `/system/riot/providers/{REGION}` doc, redeploy.

### Per-match admin controls (LoL only)
On each pending LoL match a creator/admin sees an **Admin** toggle that opens:
- **Regenerate code** — fresh code, e.g. after a lag-out.
- **Simulate winner: A / B** — fakes a Riot callback, dev tool.
- **Force winner: A / B** — manual override (`adminFinalizeMatch`).

All paths route through `finaliseTournamentMatch` in
`src/lib/actions/_match-result-core.ts` so XP / mission tracking are
identical regardless of source. `match.resultSource` records the path.

### Files
- `src/lib/riot/tournament.ts` — Tournament-V5 client (stub-aware)
- `src/lib/riot/tournament-metadata.ts` — HMAC sign / verify
- `src/lib/actions/riot-tournament.actions.ts` — provider/tournament/code lifecycle
- `src/lib/actions/_match-result-core.ts` — shared finaliser + lazy bracket advance
- `src/app/api/webhooks/riot/tournament/route.ts` — callback handler

---

## 4. Admin system overhaul (`5bb91b9`, `1f333b9`, `d579e9a`, `3f0634a`)

### Three-tier role hierarchy
Authorization source-of-truth is the Firebase **Custom Claim**
`auth.token.role` — *not* a Firestore field. Tamper-proof, signed JWT,
checked server-side at every request.

| Role | Can do | Notes |
|---|---|---|
| `super_admin` | Everything. Grant any role (except super_admin via web). | Only granted via `scripts/bootstrap-superadmin.ts` |
| `admin` | Tournaments, refunds, bans, force-unlink Riot, content moderation, role-grant up to moderator | Cannot touch other admins or super_admins |
| `moderator` | Content hide/unhide, view audit log + overview | No money / ban / role actions |
| (none) | Regular user | `/admin` redirects to `/dashboard` |

### Bootstrap script (`scripts/bootstrap-superadmin.ts`)
- **Only** path to super_admin. Runs locally with the service-account creds
  in `.env.local`.
- `npx tsx scripts/bootstrap-superadmin.ts your-email@example.com`
- `--revoke` flag to demote.
- Sets `customClaims.role = "super_admin"`, mirrors `profiles.isAdmin = true`
  for legacy reads, writes an audit log entry with `actor: "bootstrap-script"`.

### Step-up authentication
- Separate **15-minute** httpOnly cookie `step_up`, HMAC-signed `{uid}:{exp}`.
- Mint endpoint `POST /api/auth/step-up`: verifies a fresh Firebase ID token
  (`auth_time` within last 5 min) tied to the existing session.
- Server actions that mutate state call `requireStepUp(session.uid)`. Throws
  `"step_up_required"` → action returns `{ needsStepUp: true }` → UI opens
  the `<StepUpModal />`, user re-auths, hook retries the action automatically.
- Required on: ban, unban, force-unlink Riot, force-finalize tournament,
  force-cancel, force-refund.
- Modal supports **both** password (`reauthenticateWithCredential`) and
  **Google OAuth** (`reauthenticateWithPopup`) — auto-detects user's provider
  from `auth.currentUser.providerData`.

### Audit log
- `/admin_audit/{auto-id}` — immutable. Server-only writes.
- Every privileged action: success AND failure. Privilege-escalation attempts
  Discord-alert as `warn`.
- Sensitive reads (`/admin/users/[uid]/view`) also logged so mass-snooping
  shows up.
- Viewer at `/admin/audit` — 50/page, exact-action filter, expandable
  metadata blob.

### Discord webhook alerts
- Env: `DISCORD_ADMIN_WEBHOOK_URL` (set up in this session with a real
  private channel).
- Severity:
  - `info` — content hide/unhide, unban
  - `warn` — force-finalize, force-unlink, escalation rejections
  - `critical` — bans, force-cancel, force-refund, role grants
- Embeds are enriched (`abcddb5`) with display names + entity titles, not
  raw uids. Example:
  > **Kubilay (@kubilay) · super_admin** cancelled **"Spring Showdown"
  > (47lgky…)** — 8 paid participants refunded.
- Best-effort: silent no-op when env unset; failures never propagate.

### Admin pages (URL → capability)
| URL | Tier | What |
|---|---|---|
| `/admin` | moderator+ | Overview cards + recent audit |
| `/admin/users` | admin+ | Search (uid/email/username) + role-holder list |
| `/admin/users/[uid]` | admin+ | Detail + role / ban / Riot-unlink actions |
| `/admin/users/[uid]/view` | admin+ | Read-only **comprehensive** user state (profile, integration, last 10 notifs, last 20 tournament regs, last 10 audit targeting them). Open audit-logs as `user.view_state`. |
| `/admin/tournaments` | admin+ | List + status filter |
| `/admin/tournaments/[id]` | admin+ | Detail + force-finalize / force-cancel / per-participant refund |
| `/admin/integrations` | admin+ | Riot PUUID lock viewer + force-unlink |
| `/admin/audit` | admin+ | Paginated audit log |
| `/admin/challenges` | admin+ | Expandable rows with full detail, Edit + Activate + Cancel + Reactivate |
| `/admin/challenges/new` | admin+ | (pre-existing) |
| `/admin/challenges/[id]/edit` | admin+ | New — edit any field on a challenge |
| `/admin/seasons` | admin+ | (pre-existing) |

### Sidebar toggle (`d9e15a4`)
- Discreet "Admin mode" link in the main sidebar, below LFG Board,
  separated by a dashed line, with a role badge ("SUPER ADMIN" red, "ADMIN"
  indigo, "MODERATOR" green).
- Visibility gated server-side via `userRole` prop sourced from the verified
  JWT claim. A non-admin's `userRole` is `null` → link never renders.
- Clicking it navigates to `/admin`; the sidebar swaps to admin nav and a
  "← Back to user view" link replaces the toggle.
- Defence-in-depth: even if the prop were forged client-side, the admin
  layout's `verifyAdminAccess` redirects non-admins independently.

### Session/claim propagation (`e1aa303`)
- Login + register pages call `cred.user.getIdToken(true)` (forceRefresh) so
  the session cookie embeds the CURRENT claims rather than a cached token's.
  Without this, role grants required a 1-hour wait before the user saw
  effect.
- New `POST /api/auth/refresh-claims` endpoint — re-mints the session cookie
  from a freshly-issued ID token. Lets an admin force-update their session
  without re-authenticating. `src/lib/auth/refresh-claims-client.ts` is the
  client helper.

### Files
- `src/lib/auth/roles.ts` — `Role`, `ROLE_RANK`, `meetsRole`, `rolesGrantableBy`
- `src/lib/auth/audit-log.ts` — `writeAuditLog`
- `src/lib/auth/discord-alert.ts` — `sendAdminAlert`
- `src/lib/auth/discord-formatting.ts` — name-resolution helpers (`abcddb5`)
- `src/lib/auth/step-up.ts` — `mintStepUpToken`, `requireStepUp`
- `src/lib/auth/refresh-claims-client.ts` — client refresh helper
- `src/lib/actions/server-auth.ts` — `getSessionWithRole`, `requireRole`,
  `getAdminUid`, `getSuperAdminUid`, `getModeratorUid`
- `src/lib/actions/admin.actions.ts` — role mgmt, user search, audit list,
  user view-state
- `src/lib/actions/admin-moderation.actions.ts` — ban/unban/force-unlink/hide
- `src/lib/actions/admin-tournament.actions.ts` — force-finalize/cancel/refund
- `src/components/admin/StepUpModal.tsx` — re-auth modal (password + Google)
- `src/components/admin/useStepUp.tsx` — hook wrapping action calls
- `src/components/admin/AdminUserActions.tsx`, `AdminTournamentActions.tsx`,
  `AdminParticipantRefundButton.tsx`
- `src/app/api/auth/step-up/route.ts` — step-up cookie mint
- `src/app/api/auth/refresh-claims/route.ts` — claim refresh endpoint
- `src/app/(main)/admin/**` — all dashboard pages
- `src/components/layout/Sidebar.tsx` — toggle + admin-mode nav swap
- `scripts/bootstrap-superadmin.ts` — offline super_admin grant

---

## 5. TODO closures (`7120cab`)

Five distinct fixes shipped in one commit (verified independently first):

### Withdraw button stuck loading (TODO #2)
`TournamentRegistration.tsx`: `setBusy(false)` after `router.refresh()` on
both free + paid withdraw paths. The previous comment claimed React would
re-mount the button; in practice the same instance re-rendered with
`busy=true` stuck. Fix is one line per path.

### Register/withdraw XP farming (TODO #1)
- Changed `tournament_register` XP rule type from `daily_cap` (×4) to
  `once_per_target`. Re-registering the same tournament after withdraw
  grants 0 XP forever.
- Moved the awardXp call from client component into the server action.
- Mission progress + clan-XP fanout now gated on
  `awardXp.data.awarded > 0` (i.e. "first-time" signal).
- Applied to both `registerForTournament` and `confirmPaidParticipant`
  (Stripe webhook path).

### LoL rank-tier restriction (TODO #3)
- New optional `Tournament.riotRankRestriction = { minTier, maxTier,
  allowUnranked }`. Backward-compatible — existing tournaments without it
  accept any rank.
- Tournament creation form Step 1 (only when game = LoL) gains a "Rank
  Restriction" section: From/To dropdowns + "Allow unranked" checkbox.
  Sanity validation: min cannot exceed max.
- `registerForTournament` reads soloRank from linked-account snapshot,
  enforces with messages like "This tournament requires Diamond or higher.
  You're Gold."

### Clan announcements with fanout (TODO #5)
- `ClanPost` extended with `isAnnouncement` + optional `pinnedUntil`.
- New `createClanAnnouncement` server action: leader-only, rate-limited
  to **3 per clan per 24h**, fans out in-app notifications to every
  confirmed (non-pending) member.
- ComposePost shows a leader-only "📣 Announce" toggle.
- ClanPost renders announcements with accent border + glow + visible
  "📣 Announcement" pill.
- Firestore rule lockdown: client `create` rejects `isAnnouncement: true`;
  `update` rejects any attempt to flip the flag or `pinnedUntil`.
  Announcements can ONLY be created via the server action.
- Required composite index `posts(isAnnouncement ASC, createdAt ASC)`
  added in `7fab2d4` for the rate-limit query.

### Round 2+ bracket advancement (was a known gap, not a TODO)
- `advanceBracketIfReady(tournamentId)` in `_match-result-core.ts`. Runs at
  the end of every match finalisation regardless of source.
- Lazy creation: when all matches in the current top round are complete,
  pair winners by match-number into the next round. Single winner →
  tournament `status: complete`. Odd winners → bye in next round.
- For LoL tournaments, mints fresh Tournament-V5 codes for each new match.
- Recursive: bye-only rounds advance immediately.
- `reportMatchResult` refactored to route through the shared finaliser so
  every entry point triggers advancement.

---

## 6. Challenges enhancements (`93620e3`, `36d7268`, `a4a970b`)

### User-side description access
- `ClanChallengesWidget` (single-challenge widget on clan/dashboard pages)
  and `DashboardChallengesWidget` (multi-challenge list) both gain a small
  `(i)` info icon next to each challenge title. Click → inline "How to
  complete" panel expands below with the FULL description + action / target
  / rewards / end-time grid.
- Description uses `whitespace-pre-wrap` so any newlines in the admin's
  written description survive.

### Admin /admin/challenges expanded rows
- Each row is now a native `<details>` element (no client JS, stays SSR).
- Summary row keeps the existing one-liner + action buttons.
- Expansion reveals **Description**, **Identification** (id, type, duration,
  season), **Goal** (target, points), **Rewards** (member XP, clan XP,
  badge, title), **Timeline** (starts, ends, created at, created by).

### Edit + Reactivate
- **Edit** link on every challenge row → `/admin/challenges/[id]/edit`.
  Same form layout as new-challenge with every field pre-filled. Status is
  NOT touched — fields only.
- **Reactivate** button on completed/cancelled challenges. Behaviour:
  - `endAt` in past → refuses with "Edit the challenge to extend the end
    date before reactivating." Error shown in red banner above the list.
  - `endAt` future → recomputes status (active/upcoming) from dates.
  - Bumps `currentRunNumber` on the challenge doc.
  - **Wipes every clan's entry doc** in 400-doc batches so progress starts
    fresh.
  - **1-hour cooldown** between reactivations of the same challenge — defends
    against accidental double-clicks (`REACTIVATION_COOLDOWN_MS`).
  - Writes audit-log entry as `challenge.reactivate`.

### Run-scoped reward dedup
- The XP `once_per_target` rule was keyed by `${challengeId}_${clanId}` —
  meaning a clan that completed a previous run couldn't earn XP on the new
  run. Fixed by suffixing the targetId with `_run{N}` from
  `challenge.currentRunNumber` (suffix omitted on run 1 for backward
  compatibility):
  - clan XP: `${challengeId}_run{N}`
  - member XP: `${challengeId}_${clanId}_run{N}`
- Existing run-1 completion records keep their original targetIds, so the
  upgrade is non-breaking.

### Files
- `src/lib/actions/challenge.actions.ts` — `updateChallenge`,
  `reactivateChallenge`, `getChallengeById`, run-suffix in `_issueCompletionRewards`
- `src/types/firestore.ts` — `ClanChallenge.currentRunNumber`,
  `lastReactivatedAt`, `ClanPost.isAnnouncement`, `pinnedUntil`
- `src/components/challenges/ClanChallengesWidget.tsx` + `DashboardChallengesWidget.tsx`
- `src/app/(main)/admin/challenges/page.tsx` (expanded rows, Edit/Reactivate)
- `src/app/(main)/admin/challenges/[id]/edit/page.tsx` — new

---

## 7. Documentation produced

Sixteen markdown files structured in three layers under `docs/`:

```
docs/
├── README.md                       index of feature docs
├── 01-profile.md                   feature
├── 02-clans.md                     feature (incl. announcements)
├── 03-tournaments.md               feature (incl. LoL auto-verify)
├── 04-missions-xp.md               feature (canonical XP table)
├── 05-integrations-league.md       feature (link flow, widget)
├── 06-admin.md                     feature (roles, audit, step-up, dashboard)
├── HANDOFF.md                      THIS FILE
├── security-guidelines.md          (pre-existing agent runbook)
├── ui-design-guidelines.md         (pre-existing agent runbook)
├── deep-dives/
│   ├── README.md
│   ├── tournament-mechanics.md     bracket gen, prize splits, round advance
│   └── xp-and-missions.md          XP rules, dedup types, mission generation
└── internal/
    ├── README.md
    ├── operations.md               env vars, secrets, rotation, deploy, scripts
    ├── architecture.md             folder map, server-action patterns
    ├── firestore-schema.md         every collection + rule contract
    ├── admin-internals.md          claims, step-up, audit, Discord
    ├── riot-internals.md           Riot endpoints, stub vs prod, HMAC
    └── stripe-internals.md         payment + refund flows
```

The user prefers `docs/TODO.md` (local tracker) **stays gitignored** — it
exists on disk but is never committed. Convention: when the user says
"TODO - <thing>" in chat, append a new entry; don't push.

---

## 8. Open items / deferred work

### Pending product decisions
- **TODO #4 — tournament invites with notifications.** Design exists in
  `docs/TODO.md`. Blocker: the `friends_only` privacy mode needs a friends
  / follows graph that doesn't exist in ClanForge today. User must decide:
  (a) ship without `friends_only`, or (b) build a minimal follow system
  first.

### Deferred to "later if needed"
- **Phase 3c — full impersonation mode** (view-as-user with red banner +
  write block). Would require adding `assertNotImpersonating()` to ~18
  mutating server actions + rewiring page-level data fetching. The
  `/admin/users/[uid]/view` page covers 90% of support cases (read-only
  comprehensive state + audit-logged opens). Worth picking up only if a
  real support workflow demands it.
- **Riot Tournament-V5 production access.** Currently stubbed via
  `RIOT_TOURNAMENT_USE_STUB=true`. Flip env + delete cached provider doc
  to switch. User needs a stable production domain before submitting the
  application — see notes in `docs/internal/riot-internals.md §4`.

### Known operational gotchas
- **Custom-claim propagation lag fixed in `e1aa303`** but documented here
  because it bites repeatedly:
  - After `setUserRole` or the bootstrap script runs, the target user must
    sign out + back in **OR** call the `/api/auth/refresh-claims` endpoint
    to pick up the new claim. The forceRefresh fix means a fresh sign-in
    always works now, but if a user reports "I was made admin but `/admin`
    redirects me to /dashboard", the answer is **sign out + back in**.
- **Riot dev API key expires every 24 hours.** When you see 401s from
  Riot, the dev key in `.env.local` and Vercel both need rotating.
- **Stub-V5 doesn't send real callbacks.** Use the "Simulate Winner"
  admin panel on each match to test the result-handling chain end-to-end.

---

## 9. Environment variables in use

Set on **both** `.env.local` (local dev) AND Vercel (Production +
Development). See `docs/internal/operations.md §1` for the full table with
rotation procedures. Highlights added this session:

| Name | Purpose |
|---|---|
| `RIOT_API_KEY` | Riot API auth — `X-Riot-Token` header. Dev keys expire 24h. |
| `RIOT_TOURNAMENT_USE_STUB` | `"true"` (default) routes Tournament-V5 to stub. |
| `RIOT_METADATA_SECRET` | HMAC for tournament callback metadata. |
| `RIOT_CALLBACK_URL` | URL Riot POSTs match results to. |
| `STEP_UP_SECRET` | HMAC for the 15-min step-up cookie. |
| `DISCORD_ADMIN_WEBHOOK_URL` | Private Discord channel for admin alerts. |

---

## 10. Where each system lives

```
src/
├── app/
│   ├── (auth)/                       sign in / register (forceRefresh fix)
│   ├── (main)/
│   │   ├── admin/                    full admin dashboard
│   │   ├── challenges/...             (pre-existing)
│   │   ├── clans/[slug]/              clan page (announcement leader flag)
│   │   ├── profile/edit/              LeagueLinkPanel wired in
│   │   ├── profile/[username]/        LinkedGameCard rendered in tabs
│   │   └── tournaments/
│   │       ├── create/                LoL region + rank-restriction
│   │       └── [id]/                  bracket + admin per-match controls
│   └── api/
│       ├── auth/
│       │   ├── session/route.ts       login-time ban gate added
│       │   ├── step-up/route.ts       step-up cookie mint
│       │   └── refresh-claims/route.ts re-mint session from fresh ID token
│       └── webhooks/
│           ├── stripe/route.ts        (pre-existing)
│           └── riot/tournament/route.ts callback handler
├── components/
│   ├── admin/                        StepUpModal, useStepUp, *Actions, *Refund
│   ├── challenges/                   widgets gain (i) expand
│   ├── clan/                         ComposePost (announce toggle), ClanPost (pill)
│   ├── layout/Sidebar.tsx            admin-mode toggle + role badge
│   ├── profile/                      LeagueLinkPanel, LinkedGameCard
│   └── tournament/
│       ├── BracketView.tsx           code chip + admin panel
│       └── TournamentRegistration.tsx withdraw fix + server-action register
├── lib/
│   ├── auth/                         roles, audit-log, discord-alert,
│   │                                 discord-formatting, step-up,
│   │                                 refresh-claims-client
│   ├── riot/                         client, regions, tournament, assets,
│   │                                 tournament-metadata
│   └── actions/                      server actions (admin.*, riot-tournament,
│                                     _match-result-core, integrations, …)
└── types/
    ├── firestore.ts                  (extended throughout)
    └── integrations.ts               LeagueIntegration + LeaguePendingVerification

scripts/
└── bootstrap-superadmin.ts           offline super_admin grant

firebase/
├── rules/firestore.rules             admin_audit, integrations, owners,
│                                     posts (isAnnouncement guards)
└── firestore.indexes.json            posts(isAnnouncement, createdAt) added
```

---

## 11. How to resume

### If the user reports an admin-side bug
1. Check `/admin/audit` for the recent action — every privileged action is logged.
2. Check `#admin-alerts` Discord channel for the same event with enriched names.
3. Compare to Vercel logs around the same timestamp.
4. Most "I don't see admin UI" reports → sign out + back in to pick up
   custom claims (see §8 "Operational gotchas").

### If the user reports a Riot integration bug
1. Confirm dev key is still valid: `npx tsx -e "..."` snippet at end of
   `docs/internal/riot-internals.md §1`.
2. Check rate-limit headers — we should stay well under thresholds via
   6h widget cache + 5min manual refresh.
3. If "challenge dates in the past, can't reactivate" → admin should Edit
   the dates first.

### If the user wants a new privileged action
1. Read `docs/security-guidelines.md` (pre-existing runbook).
2. Use `requireRole("admin")` or higher.
3. Add `requireStepUp(session.uid)` if destructive.
4. Add `writeAuditLog(...)` + `sendAdminAlert(...)` calls — use the
   `discord-formatting.ts` helpers to keep embeds enriched.
5. Update Firestore rules if a new collection / write path is involved.

### If the user wants to ship Tournament-V5 to production
1. Apply at https://developer.riotgames.com → Apps → Tournament API.
   Working prototype is already in place; user has shown it via the stub.
2. Once approved: set `RIOT_TOURNAMENT_USE_STUB=false` on Vercel.
3. Delete `/system/riot/providers/{REGION}` doc(s) so the next bracket
   generation re-registers via prod.
4. Update `RIOT_CALLBACK_URL` to point at a stable custom domain (Vercel
   preview URLs change per-deploy and won't work as a callback target).
5. Redeploy.

---

## 12. Verification status

Last verified after `abcddb5`:
- `npx tsc --noEmit` — **clean** (no errors)
- `npx eslint <touched-files>` — **clean** (no warnings)
- `npm run build` — **green** on all routes
- Firestore rules — deployed (`firebase deploy --only firestore:rules`)
- Firestore indexes — deployed (`firebase deploy --only firestore:indexes`)
- Vercel — Production redeployed via `npx vercel --prod --yes`
- Live Discord webhook test — preview embed format confirmed visually

If a session resumes and the working tree has unexpected diffs:

```bash
npx tsc --noEmit
npx eslint <touched-files>
rm -rf .next && npm run build
```
