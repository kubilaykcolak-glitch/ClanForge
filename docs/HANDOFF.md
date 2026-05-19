# ClanForge — Session Handoff

> Snapshot of the work shipped in this conversation. Read this end-to-end
> before resuming — each section refers to later ones, and many decisions
> made early shape what's in production now.
>
> Repo: `https://github.com/kubilaykcolak-glitch/ClanForge`
> Branch: `main`
> Latest commit at time of handoff: **`09b880b`**
>
> Predecessor: the earlier handoff (commit `1476f35`) covered admin
> infrastructure, LoL account linking, Tournament-V5, and the initial
> Discord webhook embeds. Everything in this document was shipped on top
> of that baseline.

---

## 1. Commit timeline

31 commits in chronological order. Every commit passed
`tsc --noEmit` and `next lint --max-warnings=0` before pushing.
Firestore rules deployed 4× this session. Firestore indexes deployed 3×.

| # | Commit | Title |
|---|---|---|
|  1 | `bc161c2` | feat(admin/discord): cleaner embeds — actor in author block, no redundancy |
|  2 | `a6c8664` | feat(admin/tournaments): context-aware force-cancel UI |
|  3 | `a65ef54` | feat(games): per-game hub framework with registry-driven sections |
|  4 | `6ecf7b0` | fix(games): drop unused param to satisfy no-unused-vars in CI lint |
|  5 | `5ade587` | fix(games): prod-safe RSC boundary + per-section error fallback |
|  6 | `057a25f` | perf(games): persistent LoL link status + per-request cache + tab-switch skeleton |
|  7 | `d5e04a1` | refactor(games): hub shows only user's active tournaments |
|  8 | `13ed6d3` | refactor(games): drop Create button from hub Clans section |
|  9 | `dd61ca1` | feat(games/league): spec #2a — My Profile section with match history |
| 10 | `fe7e2c7` | feat(games/league): spec #2b — stats overview, queue filters, champion search |
| 11 | `c13a92e` | security: close profile.isAdmin self-elevation chain (C1-C5) |
| 12 | `a986447` | security: close three independent critical findings (C6, C7, C8) |
| 13 | `12e7921` | security: identity hydration + cross-user write guards (H1-H3 + adjacents) |
| 14 | `f098591` | fix(audit): dead links, info leaks, admin-UI cleanup (H5-H8, L3, M8) |
| 15 | `587f5ca` | security: tighten tournament participant + match rules; cap dispute reason (M2, M3, L7) |
| 16 | `0b6ef75` | security: opponent-confirmation flow for non-LoL match results (H4) |
| 17 | `d593c65` | security: server-only username + clan-slug reservation (L1, L2) |
| 18 | `595b95b` | fix(clans): atomic disband transaction (L6) |
| 19 | `77b7bea` | security: add CSP + hardening response headers (M6) |
| 20 | `bf7b15f` | fix(stripe): opaque signature-verify error response (M5) |
| 21 | `9cbcba2` | fix(challenges): bounds-validate numeric + temporal payloads (M1) |
| 22 | `6eb882a` | security: claim-based admin override on remaining tournament actions (M4 + missed C3-C5 sites) |
| 23 | `3028bde` | fix(actions): sanitise toast-bound error messages (M9 partial) |
| 24 | `74aa0a4` | fix(clans/create): inline field errors on required inputs (M10) |
| 25 | `2e46b24` | ux: empty-state copy + CTAs on notifications and dashboard clan feed (M12) |
| 26 | `23a5d9c` | fix(riot): fetch + cache live Data Dragon version (L4) |
| 27 | `52c0a57` | fix(actions): dedupe clientIp + BYE-match guards (L5, L8) |
| 28 | `1f14c80` | fix(lint): drop ignored args + unused Link import (CI fix-up) |
| 29 | `61e4f5d` | refactor(clans): route join/leave/post/like/delete through server actions |
| 30 | `22999cc` | feat(games/league): recent-form stats card on LoL Overview |
| 31 | `09b880b` | fix: profile-page RSC crash + collection-group index for participants.userId |

---

## 2. Discord webhook polish (`bc161c2`, `a6c8664`)

The admin Discord embeds were redundant — the actor's name appeared in
the body sentence, again in an "Actor" field, then once more as a raw
UID. Now uses Discord's structured slots:

- **Author block**: `👤 Kubilay (@kubilay) · super_admin`
- **Title** with action emoji: `🏁 Tournament force-finalized`
- **Description** = a short action sentence with the actor stripped
- **Inline fields** for context (Tournament, Refunded, Reason, etc.)
- **Footer** carries the raw UID

`info` severity colour flipped from indigo to green so the scale reads
green → amber → red.

Force-cancel UX (`a6c8664`) — button label / confirmation prompt /
helper text / success toast adapt to whether the tournament has 0, free,
or paid participants. The server action `forceCancelTournament` was
already correct (refund loop is a no-op when no one paid); only the UI
was misleading.

### Files
- `src/lib/auth/discord-alert.ts` — `AdminAlert.actor` field wires into
  `embed.author` + `embed.footer`.
- `src/lib/actions/admin.actions.ts`, `admin-moderation.actions.ts`,
  `admin-tournament.actions.ts` — every alert site updated.
- `src/components/admin/AdminTournamentActions.tsx` — adaptive UI.

---

## 3. Game hub framework (`a65ef54`, `6ecf7b0`, `5ade587`, `057a25f`, `d5e04a1`, `13ed6d3`)

ClanForge is now League-of-Legends-flagship with Arc Raiders as the
second tracked game (Valorant deferred — its API is heavily restricted;
Arc Raiders has no stats API but will host the upcoming Wanted/Bounty
system).

### Architecture — registry-driven

Two source-of-truth files under `src/lib/games/`:

```
src/lib/games/
  types.ts       — GameSlug union, GameSection, GameDefinition
  meta.ts        — GAMES_META: slug → static metadata (CLIENT-SAFE,
                   no React, no server-only imports). Sidebar + game
                   picker import from here.
  registry.ts    — GAMES: slug → GameDefinition with section loaders
                   (dynamic import). Server-only by transitive
                   firebase-admin import.
```

The split is **load-bearing**. The registry transitively pulls
firebase-admin via its section loaders. Importing it from a
`"use client"` file breaks the build with "You're importing a
component that needs server-only". `meta.ts` exists so the sidebar
can render game tiles without dragging server code into the client
bundle.

### Routing

```
/games                                → game-picker landing
/games/[gameSlug]                     → renders default section (Overview)
/games/[gameSlug]/[sectionSlug]       → renders requested section
```

Slug + section both validated at the route level. Unknown slug OR
unknown/hidden section → `notFound()`. Hidden sections are
pre-registered (slot reserved); flipping `status: "hidden"` →
`"live"` and pointing the loader at a real component ships the
feature.

### Sections (current state)

|                | LoL                  | Arc Raiders        |
|---|---|---|
| Overview       | ✅ live (rich)       | ✅ live (placeholder) |
| Tournaments    | ✅ live              | ✅ live |
| Matchmaking    | ✅ live (placeholder pointing at /players) | ✅ live |
| Clans          | ✅ live              | ✅ live |
| Challenges     | ✅ live              | ✅ live |
| My Profile     | ✅ live (spec #2a+#2b) | hidden |
| Ladder         | hidden               | — |
| Live Now       | hidden               | — |
| Wanted         | —                    | hidden |
| Guides         | —                    | hidden |
| Items          | —                    | hidden |
| Locations      | —                    | hidden |
| Updates        | —                    | hidden |

### Layout chrome

- Banner with gradient + game accent colour + tagline.
- LoL banner gains a **persistent linked-Riot chip** showing Riot ID +
  region + rank — visible on every section of the LoL hub.
- Tab nav rendered server-side from the registry. Active state via
  `usePathname` in a thin client island.

### Tab-switch perf

`/games/[gameSlug]/loading.tsx` renders an instant skeleton on tab
navigation. React `cache()` wraps per-request viewer / integration
lookups (`src/lib/games/current-user.ts`) so banner + section don't
fire duplicate Firestore reads. The LoL banner chip is wrapped in
Suspense so it streams in after the banner paints.

### Existing-surface dedup (`d5e04a1`, `13ed6d3`)

The hub does NOT duplicate global pages:

- Hub **Tournaments tab** = only the viewer's active tournaments for
  this game (`status in ['open','locked','live']`, participant docs
  from a collection-group query). No create button. "View all →" →
  `/tournaments`.
- Hub **Clans tab** = discovery only. No create button. "View all →"
  → `/clans`.
- Overview block 1 ("Your tournaments") uses the same participant
  query — limited to 3 cards.

### Files

- `src/lib/games/{types,meta,registry,current-user}.ts`
- `src/app/(main)/games/page.tsx`
- `src/app/(main)/games/[gameSlug]/{layout,page,loading}.tsx`
- `src/app/(main)/games/[gameSlug]/[sectionSlug]/page.tsx`
- `src/components/games/{GameHubBanner,GameHubTabs,SectionErrorFallback,LeagueBannerStatus}.tsx`
- `src/components/games/sections/{Overview,Tournaments,Matchmaking,Clans,Challenges,Hidden}Section.tsx`
- `src/components/layout/Sidebar.tsx` — collapsible "Games" group

### Firestore indexes added

```
tournaments  (status ASC, game ASC, startsAt ASC)
clans        (isPublic ASC, gameFocus ASC, memberCount DESC)
```

Both deployed to `clan-vault`.

---

## 4. LoL data modules — spec #2a + #2b (`dd61ca1`, `fe7e2c7`, `22999cc`)

The LoL hub's **My Profile** section renders match history +
filterable stats + queue filters + champion search.

### Backing infra

```
src/lib/riot/client.ts                — match-v5 endpoints
                                         (fetchMatchIdsByPuuid, fetchMatchById)
src/lib/riot/ddragon.ts               — getDdragonVersion() with 24h cache (L4)
src/lib/riot/match-stats.ts           — deriveStats(matches, viewerPuuid)
                                         (extracted so Overview can reuse)
src/lib/actions/match-history.actions — ingestRecentMatchesIfStale (1h),
                                         refreshMyMatchHistory (5min cooldown),
                                         getMyRecentMatches
```

Cached match summaries live at
`/profiles/{uid}/match_history/{matchId}` — owner-only read in
Firestore rules, server-only writes via Admin SDK.

### Ingest behaviour

- **Stale-check** on every LoL My Profile / Overview render. If
  cached `lastMatchIngestAt` > 1h old, fire-and-forget ingest.
- **Bounded concurrency**: 4 in-flight match-v5 requests per run,
  capped at 20 matches.
- **Idempotent**: only fetches matchIds not already cached.

### Manual refresh

5-minute per-user cooldown, server-enforced. Wired to a Refresh
button in the My Profile section header.

### Filterable client island (`fe7e2c7`)

`LeagueMatchesClient.tsx` — queue tabs (All / Solo / Flex / ARAM),
champion-search input, stats summary card via `useMemo` over filtered
matches, match list. Filtering is in-memory over the 20-doc cache —
no extra Firestore reads per tab click.

### LoL Overview stats card (`22999cc`)

The same `LeagueStatsOverview` presentational component renders on
the LoL hub Overview tab as a quick-glance card — W/L ring + KDA +
top 3 champions + role bars. Section header links to
`/games/league-of-legends/profile` for the drill-down.

### Files

- `src/components/games/sections/LeagueProfileSection.tsx`
- `src/components/games/sections/LeagueMatchesClient.tsx`
- `src/components/games/sections/LeagueStatsOverview.tsx`
- `src/components/games/sections/RefreshMatchHistoryButton.tsx`
- `src/types/match-history.ts`
- `src/lib/actions/match-history.actions.ts`
- `src/lib/riot/{match-stats,ddragon,client}.ts`

### Not shipped yet

- **Ladder** section — clan/global LP ladder, nightly refresh.
- **Live Now** section — spectator-v5 polling.
- **Per-match drill-down** — clicking a match row currently doesn't expand.
- **H4 confirm/dispute UI** — server-side state machine is in (§6 / H4);
  no surface invokes `reportMatchResult` yet.

---

## 5. Audit overview

A code-reviewer agent audited the whole repo: **32 findings** across
broken links, UI/UX, and security. Severity breakdown: 8 Critical,
8 High, 12 Medium, 8 Low.

**Every finding has been addressed.** Two items (M11 + a sanity check)
needed no code change. Everything else has a code fix, rule change, or
documented deferred-by-design decision.

The headline cluster C1–C5 is documented in §6. The remaining items
are in §7–§9. Re-running the audit against the current code should
produce essentially zero findings.

---

## 6. The C1–C5 privilege-escalation chain (`c13a92e`)

The single highest-impact bug in the audit. Five linked weaknesses:

| Finding | File | What |
|---|---|---|
| **C1** | `profile.actions.ts:17` | `updateProfile` wrote any `Profile` field — including `isAdmin`, `xp`, `bannedAt`. |
| **C2** | `firestore.rules` `/profiles` | `allow write: if isOwner(uid)` let a client-SDK call write the same privileged fields directly. |
| **C3** | `riot-tournament.actions.ts` | Two admin-override sites read `profiles.isAdmin`. |
| **C4** | `clan.actions.ts:823` | `deletePost` admin gate read `profiles.isAdmin`. |
| **C5** | `tournament-payment.actions.ts:746` | `markPrizePaid` admin gate read `profiles.isAdmin`. |

**Exploit**: signed-in user POSTs `updateProfile(myUid, { isAdmin: true })`
(or writes directly via client SDK), and the three admin gates start
treating them as admin — unlocking force-finalize, force-cancel,
refund-any-participant, delete-any-clan-post, mark-prize-paid.

### Fixes

1. **`updateProfile` field allowlist.** Hardcoded list of cosmetic /
   identity fields. Anything else is silently dropped server-side.
2. **Firestore `/profiles/{userId}` rule** split into create / update /
   delete. `create` requires `isSafeInitialProfile()` — pins `isAdmin`,
   `isVerified`, `xp`, `tournamentsPlayed`/`Won` to safe defaults and
   forbids `bannedAt`, `bannedBy`, `bannedReason`, `badges`, `title` on
   first write. `update` restricts writeable fields to a `hasOnly()`
   allowlist. `delete` is server-only.
3. **Three admin gates swapped** to `getSessionWithRole()` +
   `meetsRole("admin")`. JWT claim is the only authoritative source.

### Adjacent missed sites (`6eb882a`)

The first pass missed three more occurrences of the same pattern:

- `generateBracket`, `lockTournament` (tournament.actions)
- `cancelTournament`, `finalizeTournament` (tournament-payment.actions)

All swapped to JWT-claim role.

### Things to know

- `server-auth.getSessionWithRole` still has a legacy `profiles.isAdmin`
  fallback for users without a custom claim. No longer exploitable
  (clients can't write isAdmin post-C2). Remove once every admin is
  confirmed to have the JWT claim set via the bootstrap script.
- Page-level admin UI gates still read `profiles.isAdmin` — belt-and-
  braces affordances. The actual mutations all go through `requireRole`.

---

## 7. Other critical fixes (`a986447`)

### C6 — `createNotification` server-action auth

Was exported from `notification.actions.ts` (`"use server"`) with NO
auth check. Any signed-in user could POST forged notifications into
any other user's inbox.

**Fix**: moved to `src/lib/server/notifications.ts` guarded by
`import "server-only"`. Callers (clan-xp.actions, clan.actions) import
from the new path.

### C7 — `/api/upload` ownership + SVG block

Enforced ownership only on personal paths. `clan-assets/`,
`clan-posts/`, `tournament-banners/` were wide open. Also accepted
SVG (XSS risk).

**Fix**:
- Per-prefix ownership: tournament-banners → creator; clan-assets →
  leader/officer; clan-posts → non-pending member.
- MIME allowlist narrowed to raster (PNG/JPEG/WebP/GIF). SVG rejected.
- **Magic-byte sniffing** on the first 12 bytes — forged `file.type`
  can't smuggle non-image bytes.
- `contentType` saved to Storage uses the sniffed value.
- Error responses opaque.

### C8 — Tournament participants Firestore rule

`/tournaments/{id}/participants/{pid}` had `allow create: if isOwner(pid)`,
bypassing `registerForTournament`'s capacity/status/rank/paywall
guards. Switched to `allow create: if false`. Both registration paths
already use Admin SDK so no callsite change needed.

---

## 8. High-severity cluster (`12e7921`, `f098591`, `587f5ca`, `0b6ef75`)

### H1 + H2 — Server-side identity hydration

`registerForTournament`, `createClan`, `joinClan`, `createPost`,
`createClanAnnouncement` accepted caller-supplied identity strings
(displayName, avatarUrl, username) and wrote them onto persisted docs
that other users render. Forged bylines were trivial.

**Fix**: every site reads `/profiles/{uid}` inside its
batch/transaction and uses the server-resolved identity. Caller args
removed entirely (`1f14c80` cleanup).

### H3 — Cross-user mission / XP guards

`trackMissionProgress`, `trackClanMissionProgress`, `awardXp`,
`awardClanXp` accepted any `uid` with only auth-exists check. A
signed-in attacker could spam any victim's mission/XP progress.

**Fix**: each function now requires `sessionUid === uid` OR
`inWebhookContext()`. Cross-user advancement (the match-result core
awarding the winner) runs inside `runInTrustedServerContext` — a
new alias for `runInWebhookContext` in `src/lib/webhook-context.ts`.
Same underlying AsyncLocalStorage flag; the alias exists for
code-search clarity. `finaliseTournamentMatch` wraps its post-finalise
side-effects in this context.

### H4 — Opponent-confirmation match-result flow (`0b6ef75`)

Was: `reportMatchResult` finalised immediately on the first call. The
loser could claim victory and finalise before the winner reacted —
XP, clan-XP, mission progress, bracket advancement all fired.

**Fix**: new `MatchStatus` value `pending_confirmation`. State machine:

```
pending ──reportMatchResult──▶ pending_confirmation
            │
            ├──confirmMatchResult(opponent)──▶ complete
            └──disputeMatch(either)──▶ disputed ──▶
                                        adminFinalizeMatch ──▶ complete
```

LoL tournaments unaffected — the Riot Tournament-V5 callback calls
`finaliseTournamentMatch` directly and bypasses `pending_confirmation`.

**Not shipped**: the participant-facing UI ("Player A reported you
lost 3-1 — Confirm or Dispute" banner on each `pending_confirmation`
match in the bracket view). No surface currently invokes
`reportMatchResult`, so the server-side fix is complete on its own.

### H5–H8 + L3, M8 — Dead links + info leaks (`f098591`)

- **H5** — `/forgot-password` page created (Firebase
  `sendPasswordResetEmail`). Response neutral so the endpoint doesn't
  double as an account-existence oracle.
- **H6** — `/about` added to middleware's `PUBLIC_EXACT`.
- **H7** — "Admin: create a challenge" link removed from
  `ChallengesSection` empty state.
- **H8** — `isAdmin` / `bannedAt`/`By`/`Reason` stripped from
  `PlayerRow` (public players-directory).
- **L3** — Navbar profile link routes to `/dashboard/onboarding` for
  users without a username (was `/profile/me` → 404).
- **M8** — `/api/auth/session` + `/api/auth/refresh-claims` return
  opaque `Unauthorized` 401 on ban / token-mismatch / no-session.

---

## 9. Medium + Low fixes

### Tournament rules tightening (`587f5ca`, M2 + M3 + L7)

- Participant `update` rule: NEGATIVE blocklist → POSITIVE `hasOnly()`
  allowlist of `['status','seed','displayName','avatarUrl']`.
- Match `update` rule: dropped the `isMatchParticipant` branch. All
  participant-driven changes flow through server actions; only the
  creator can update from the client.
- L7: `disputeMatch` reason capped at 500 chars.

### Username / clan-slug squatting (`d593c65`, L1 + L2)

- `/clanSlugs/{slug}` → server-only writes.
- `/usernames/{name}` → server-only writes. New `claimUsername` server
  action handles initial reservation AND rename inside a transaction
  (uniqueness check + atomic old-doc cleanup + profile field stamp).
- Onboarding + profile-edit migrated.
- `updateProfile` allowlist no longer contains `username`.

### Atomic disband (`595b95b`, L6)

`disbandClan` wrapped in `runTransaction`. Concurrent `joinClan`
either retries against the new state or aborts — no more stranded
`/profiles/{newUid}.clanId` after disband. 200-member ceiling to stay
under Firestore's 500-write tx limit.

### CSP + hardening headers (`77b7bea`, M6)

`next.config.mjs` returns CSP (production-only — dev skips so HMR
isn't broken), HSTS, X-Content-Type-Options, X-Frame-Options,
Referrer-Policy, Permissions-Policy. CSP is domain-restrictive but
keeps `'unsafe-inline'` on scripts/styles (Next 14 hydration +
inline-style usage). External-host allowlist covers Firebase, Riot
CDNs, Google Sign-In, Stripe Checkout.

### Other

- **M5** (`bf7b15f`) — Stripe webhook returns uniform
  `Signature verification failed` 400; raw err in server log only.
- **M1** (`9cbcba2`) — `createChallenge`/`updateChallenge` validate
  numeric + temporal bounds (`validateChallengeFields` shared helper).
- **M9 partial** (`3028bde`) — `src/lib/actions/_errors.ts` →
  `friendlyActionError(err, fallback)`. Returns fallback when err
  looks internal (Firestore status codes, Firebase auth codes, stack
  fragments, oversized payloads). **31 of 107** catch sites swept;
  the rest migrate organically when touched.
- **M10** (`74aa0a4`) — `clans/create` form gains inline field errors
  with aria-invalid + red border instead of toast-only.
- **M12** (`2e46b24`) — Notifications + dashboard clan-feed empty
  states get accurate copy + CTA buttons.
- **L4** (`23a5d9c`) — Hard-coded `DDRAGON_VERSION` replaced by
  `getDdragonVersion()` from `src/lib/riot/ddragon.ts` — 24h cache,
  1h retry on failure, baseline fallback.
- **L5** (`52c0a57`) — Three `clientIp()` helpers deduped into
  `src/lib/actions/_client-ip.ts`. Precedence:
  `x-vercel-forwarded-for` → `x-real-ip` → `x-forwarded-for`. Audit
  hint only, never an auth input.
- **L8** (`52c0a57`) — `reportMatchResult` + `disputeMatch` reject BYE
  matches.

---

## 10. Architecture fix — clan UI on server actions (`61e4f5d`)

The audit cleanup surfaced a hidden architecture issue: the live clan
UI was bypassing the server-side action layer for FIVE write paths
(join, leave, post, like/unlike, delete-post). Instead they wrote
directly to Firestore via a parallel client-SDK helper at
`src/lib/clan-actions.ts`. Every server-side protection added in the
audit was silently inert for the live flow.

**Fix**:
- `joinClan` server action extended to accept `mode: "member" | "pending"`.
  Pending mode skips recruiting / member-limit checks (point of
  pending is to join closed clans) but enforces duplicate-membership
  and the 10h leave cooldown. memberCount + profile-clan-denorm
  stamp only on confirmed joins.
- Four UI callers (`ClanCardJoinButton`, `ClanActions`, `ComposePost`,
  `ClanPost`) migrated to server actions. Every clan write now actually
  goes through identity-hydration (H2), claim-based admin checks (C4),
  recruiting/limit/cooldown guards, `friendlyActionError` sanitisation.
- `src/lib/clan-actions.ts` **deleted**.

This was a Big Fix masquerading as a small one — without it, the entire
audit cleanup would have been theatre for clan flows.

---

## 11. Operational notes

### Riot dev key rotation (every 24h)

```bash
# 1. Update local .env.local: RIOT_API_KEY=RGAPI-...

# 2. Vercel production
npx vercel env rm RIOT_API_KEY production --yes
echo "RGAPI-..." | npx vercel env add RIOT_API_KEY production

# 3. Vercel development (used by preview deploys)
npx vercel env rm RIOT_API_KEY development --yes
echo "RGAPI-..." | npx vercel env add RIOT_API_KEY development

# 4. Redeploy — Vercel only picks up new env at build time
npx vercel --prod --yes
```

### Vercel project IDs (for runtime-logs MCP)

- Project: `prj_R7yjA01i5GnmoASMB2iYhFLBUWWI`
- Team:    `team_zMayq5ApBr6eSTiv7bjAWQVh`
- Production alias: `clan-forge.vercel.app`

Use `mcp__8013beb8-...__get_runtime_logs` for production logs by
level + query. Build logs come from `npx vercel inspect <url> --logs`.

### Firestore collection-group index gotcha (`09b880b`)

Firestore does **not** auto-create the COLLECTION_GROUP scope on
single-field indexes. Collection-group equality queries
(`collectionGroup('foo').where('bar','==',x)`) need an explicit
`fieldOverrides` entry in `firestore.indexes.json`:

```json
{
  "collectionGroup": "participants",
  "fieldPath": "userId",
  "indexes": [
    { "order": "ASCENDING",  "queryScope": "COLLECTION" },
    { "order": "DESCENDING", "queryScope": "COLLECTION" },
    { "order": "ASCENDING",  "queryScope": "COLLECTION_GROUP" }
  ]
}
```

Without this, the query throws `FAILED_PRECONDITION` at runtime. The
action try/catches absorb it (returns empty list) so the page doesn't
crash — but the data silently never arrives. This bit the LoL Overview's
"Your tournaments" block until the index was added.

**Other collection-group queries in the codebase** to keep an eye on:

- `participants.userId` — **indexed** (above).
- `members.userId` (collectionGroup) — used in profile fallback
  discovery if a profile is missing `clanId`. **Not currently
  indexed** — would silently fail under the same conditions. Flagged
  for future attention; the fallback path is unlikely to fire for
  current users since `clanId` denorm has been stable for a while.

### Firestore → RSC serialisation gotcha (`09b880b`)

Don't blind-spread Firestore docs across the server→client boundary.
`Timestamp` instances (and any class with methods) trip Next.js's
"Only plain objects can be passed to Client Components" serialiser
even when you're going to override the field afterwards.

Build the object EXPLICITLY field-by-field if it crosses to a client
component. Reference fix:
`/profile/[username]/page.tsx` integrations reconstruction.

### Vercel ESLint behaviour

The repo's ESLint config (`next/typescript`) does NOT honour the
underscore-prefix convention for unused vars. Drop the dead args
entirely instead of underscoring them — that was the cause of the
`1f14c80` CI fix-up commit.

---

## 12. Verification status at handoff

After `09b880b`:

- `npx tsc --noEmit` — **clean**
- `npx next lint --max-warnings=0` — **clean**
- Firestore rules — deployed
- Firestore indexes — deployed (incl. collection-group override)
- Vercel Production — `clan-forge.vercel.app`
- Riot dev API key — current value lives in `.env.local` + both
  Vercel envs

Outstanding production issues: **none known**. The profile-page crash
+ index gap were the live errors right before this handoff and both
are fixed.

If working tree is unexpected when you resume:

```bash
cd clanforge
npx tsc --noEmit
npx next lint --max-warnings=0
rm -rf .next && npm run build
```

---

## 13. Where each system lives (quick map)

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/                       — forceRefresh on sign-in
│   │   ├── register/
│   │   └── forgot-password/             — H5
│   ├── (main)/
│   │   ├── admin/                       — admin dashboard (mostly unchanged)
│   │   ├── games/                       — game-hub framework (§3)
│   │   │   ├── page.tsx                 — picker landing
│   │   │   └── [gameSlug]/
│   │   │       ├── layout.tsx           — banner + tab nav
│   │   │       ├── page.tsx             — default section (Overview)
│   │   │       ├── loading.tsx          — tab-switch skeleton
│   │   │       └── [sectionSlug]/page.tsx
│   │   ├── clans/                       — global clan list + detail
│   │   ├── dashboard/                   — XP + missions + clan feed
│   │   ├── notifications/               — M12 empty-state polish
│   │   ├── profile/[username]/          — explicit Firestore→RSC
│   │   │                                   field-by-field rebuild
│   │   └── tournaments/                 — global tournament list
│   └── api/
│       ├── auth/                        — opaque error responses
│       ├── upload/                      — C7-hardened
│       └── webhooks/
│           ├── stripe/                  — M5 opaque error
│           └── riot/tournament/         — Tournament-V5 callback
├── components/
│   ├── admin/                           — admin actions UI
│   ├── games/
│   │   ├── GameHubBanner.tsx
│   │   ├── GameHubTabs.tsx
│   │   ├── LeagueBannerStatus.tsx       — persistent LoL chip
│   │   ├── SectionErrorFallback.tsx
│   │   └── sections/                    — Overview, Tournaments,
│   │                                       Matchmaking, Clans,
│   │                                       Challenges, Hidden,
│   │                                       LeagueProfileSection,
│   │                                       LeagueMatchesClient,
│   │                                       LeagueStatsOverview,
│   │                                       RefreshMatchHistoryButton
│   ├── clan/                            — server-action callers
│   │                                       after the §10 migration
│   ├── profile/                         — LeagueLinkPanel,
│   │                                       LinkedGameCard
│   └── tournament/
├── lib/
│   ├── actions/
│   │   ├── _client-ip.ts                — L5
│   │   ├── _errors.ts                   — M9
│   │   ├── username.actions.ts          — L2
│   │   ├── match-history.actions.ts     — spec #2a
│   │   ├── tournament.actions.ts        — H4 state machine
│   │   ├── clan.actions.ts              — H2 hydration + C4 gate +
│   │   │                                  joinClan(mode) extension
│   │   ├── notification.actions.ts      — public reads only
│   │   └── ...
│   ├── auth/                            — roles, audit-log,
│   │                                       discord-alert,
│   │                                       discord-formatting,
│   │                                       step-up
│   ├── games/
│   │   ├── types.ts
│   │   ├── meta.ts                      — CLIENT-SAFE
│   │   ├── registry.ts                  — server-only via loaders
│   │   └── current-user.ts              — cache()-wrapped lookups
│   ├── riot/
│   │   ├── client.ts                    — match-v5 added
│   │   ├── ddragon.ts                   — L4
│   │   ├── match-stats.ts               — extracted, shared
│   │   ├── regions.ts
│   │   ├── tournament.ts
│   │   ├── tournament-metadata.ts
│   │   └── assets.ts
│   ├── server/
│   │   └── notifications.ts             — C6 server-only helper
│   └── webhook-context.ts               — runInTrustedServerContext
└── types/
    ├── firestore.ts
    ├── integrations.ts
    └── match-history.ts                 — new

firebase/
├── rules/firestore.rules                — C2 + L1 + L2 + M2 + M3 +
│                                         C8 + match_history rule
└── firestore.indexes.json               — game-filtered tournaments +
                                          game-filtered clans +
                                          participants.userId
                                          collection-group override

scripts/
└── bootstrap-superadmin.ts              — still the only path to
                                          super_admin

next.config.mjs                          — CSP + hardening headers (M6)
```

---

## 14. How to resume

### Games-hub bug

1. Check Vercel runtime logs with path filter `/games/...`.
2. Most common silent-empty cause: missing Firestore index. Check
   `firebase/firestore.indexes.json` against the action's query.
   Collection-group queries need explicit `fieldOverrides` (see §11).
3. Section errors are caught by `SectionErrorFallback` — the rest of
   the hub stays alive.

### Profile / RSC error

1. Pull runtime logs filtered by `query: "Only plain objects"`.
2. Almost certainly a Firestore doc being blind-spread into a client
   component prop. Reference fix:
   `/profile/[username]/page.tsx` integrations reconstruction (§11).

### Riot integration bug

1. Confirm dev key still valid (rotation in §11).
2. Check rate-limit headers via runtime logs.

### New privileged server action

1. `requireRole("admin")` or `"moderator"`.
2. Destructive? add `requireStepUp(session.uid)`.
3. Hydrate caller identity from `/profiles/{uid}` server-side — never
   trust client display strings.
4. Cross-user XP/mission side-effects wrap in
   `runInTrustedServerContext`.
5. `writeAuditLog(...)` + `sendAdminAlert(...)`.
6. Update Firestore rules if a new collection / write path is involved.
   For any collection-group query, add the `fieldOverrides` entry.
7. Use `friendlyActionError(err, "Could not …")` in the catch block.

### Vercel build fails on lint

Repo's ESLint config doesn't honour the underscore-prefix convention.
Drop dead args entirely.

---

## 15. Recommended next moves

These were on the table at end-of-session but not picked up:

1. **Wire the H4 confirm/dispute UI**. Server-side state machine
   is done; the bracket view (`BracketView.tsx`) needs a participant
   panel for `pending_confirmation` matches with two buttons. No
   current UI calls `reportMatchResult`, so this is a feature build
   on top of the security fix.
2. **Ladder section** (LoL Overview hidden slot). LP leaderboard
   across linked players in the viewer's clan + globally. Nightly
   refresh job. Probably 1-2 days.
3. **Live Now section** (LoL hidden slot). Spectator-v5 polling.
4. **Per-match drill-down** in My Profile — expand a row to see full
   participants, items, perks, damage breakdown.
5. **Arc Raiders content sections** — Guides / Items / Locations /
   Updates content authoring + admin UI.
6. **Arc Raiders Wanted/Bounty system** (the big differentiator from
   the earlier brainstorm). Discord ticket → mod review → publish →
   hunter claim → reward economy. Designed conceptually; not coded.
7. **Migrate remaining M9 catch sites** (76 of 107). Optional —
   organic migration is fine.
8. **Remove the `getSessionWithRole` legacy `profiles.isAdmin`
   fallback** (§6 closing note). Confirm every admin has the JWT
   claim first.
