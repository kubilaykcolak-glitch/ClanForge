# ClanForge — Handoff Document

**Last updated:** 2026-05-12  
**Repo:** https://github.com/kubilaykcolak-glitch/ClanForge  
**Vercel deployment:** https://clan-forge-qbhnjs06a-kubilaykcolak-glitchs-projects.vercel.app  
**Stack:** Next.js 14 (App Router) · Firebase (Auth, Firestore, Storage) · Tailwind CSS · TypeScript · Resend (email) · Sonner (toasts)

---

## Goal

ClanForge is a gaming social platform. Phase 1 covers:
- Clan creation, browsing, and membership
- Tournament creation, registration, and bracket viewing
- Player profiles with game records, XP, and stats
- Authentication (email/password + Google OAuth) via Firebase
- File uploads (avatars, banners, clan images) via server-side proxy

Phase 2 (not yet started) covers: paid tournaments (Stripe), clan challenges, LFG board, achievements system, clan post API, match result emails.

---

## Current State

### What is working (locally confirmed)
- Full authentication flow: register, login, Google OAuth, session cookie management
- Dashboard with clan feed, active tournaments, recommended clans, gaming news RSS
- Clan pages: browse, create, detail view, member roster, clan post feed
- Tournament pages: browse, create (multi-step with DateTimePicker), detail view, registration
- Player leaderboard with filters
- Profile pages: view (with game records, stats, clan info), edit (avatar upload, bio, platform links, game records)
- File uploads via `/api/upload` server-side proxy (bypasses Firebase Storage CORS)
- Slow-operation warnings (8s threshold) and error states across all interactive pages
- Email functions: tournament registration, clan invite, match result (Resend)
- Firestore composite indexes deployed
- Auth-aware routing: signed-in users redirected from landing page to `/dashboard`

### What is in progress / needs verification on Vercel
- **OAuth sign-in** — was blocked by missing `NEXT_PUBLIC_APP_URL` env var (now added) and incorrect `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` value. See "Next Steps" below.
- **File uploads on Vercel** — untested; depends on Firebase Admin env vars being correct
- **Email sending on Vercel** — untested; depends on `RESEND_API_KEY` being set

---

## Architecture

```
src/
├── app/
│   ├── (auth)/              # Login, register pages (no sidebar)
│   ├── (main)/              # All authenticated pages (navbar + sidebar layout)
│   │   ├── dashboard/       # Home dashboard + onboarding flow
│   │   ├── clans/           # Browse, create, [slug] detail
│   │   ├── tournaments/     # Browse, create, [id] detail
│   │   ├── players/         # Leaderboard
│   │   └── profile/         # [username] view, edit
│   ├── api/
│   │   ├── auth/session/    # POST (create session), DELETE (sign out)
│   │   ├── upload/          # POST — server-side Firebase Storage proxy
│   │   ├── slug-check/      # GET — clan slug availability
│   │   ├── username-check/  # GET — username availability
│   │   └── clans|posts|tournaments|users/  # Phase 2 stubs (export {} only)
│   ├── page.tsx             # Landing page (redirects signed-in users to /dashboard)
│   └── layout.tsx           # Root layout (fonts, Toaster)
├── components/
│   ├── layout/              # Navbar, Sidebar, Footer
│   ├── clan/                # ClanCard, ClanFeed, ClanActions, ComposePost, MemberRow, ClanPost
│   ├── tournament/          # TournamentCard, TournamentRegistration, BracketView, CountdownTimer, TournamentTabs
│   ├── profile/             # ProfileTabs, GameRecordCard
│   ├── player/              # PlayerCard, PlayerFilters
│   └── ui/                  # Badge, DateTimePicker, ComingSoon, GlowCard, button, tabs, sheet
├── lib/
│   ├── firebase/
│   │   ├── admin.ts         # Firebase Admin SDK (server-only guard)
│   │   ├── client.ts        # Firebase client SDK
│   │   ├── converters.ts    # Firestore data converters
│   │   └── hooks.ts         # React hooks: useCurrentUser, useClanPosts, etc.
│   ├── actions/             # Server actions: clan, profile, gamerecord, tournament
│   ├── emails.ts            # Resend email functions
│   ├── helpers.ts
│   └── utils.ts
├── middleware.ts             # Edge middleware: session cookie → redirect guard
└── types/                   # Firestore document types
```

---

## Key Files Changed (this session)

| File | What changed |
|---|---|
| `src/components/ui/DateTimePicker.tsx` | Created — fully custom calendar + time picker, no library |
| `src/app/(main)/tournaments/create/page.tsx` | Wired DateTimePicker replacing `datetime-local` inputs; dates now `Date \| null` |
| `src/app/page.tsx` | Added auth redirect — signed-in users go straight to `/dashboard` |
| `src/components/layout/Navbar.tsx` | Logo + "Home" link go to `/dashboard` when authenticated |
| `src/app/(main)/profile/edit/page.tsx` | Fixed sticky save bar: `left-0` → `md:left-60` (was rendering under sidebar) |
| `src/components/profile/ProfileTabs.tsx` | Phase 2 badge moved inline to tab trigger; empty state sized proportionally |
| `src/lib/emails.ts` | Created — 3 Resend email functions (tournament registration, clan invite, match result) |
| `src/app/api/upload/route.ts` | Server-side upload proxy — all file uploads now go through here |
| `src/lib/firebase/admin.ts` | Added `import "server-only"` guard; added `adminStorage` export |
| `firebase/firestore.indexes.json` | Added missing 2-field composite index (`isPublic + memberCount`) |
| `vercel.json` | Created — tells Vercel this is a Next.js project |
| `src/app/api/clans\|posts\|tournaments\|users/route.ts` | Restored as `export {}` stubs after being emptied |

---

## Environment Variables

All of these must be set in **Vercel → Settings → Environment Variables**.

| Variable | Where to find it | Notes |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Console → Project Settings → Web app | |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Console → Project Settings → Web app | Must be `your-project-id.firebaseapp.com` — NOT the Vercel URL |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Console → Project Settings | |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Console → Project Settings | |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Console → Project Settings | |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase Console → Project Settings | |
| `FIREBASE_ADMIN_PROJECT_ID` | Firebase Console → Project Settings | |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Firebase Console → Service Accounts → Generate key | |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Same JSON file — paste entire key including `-----BEGIN/END-----` headers | Vercel handles `\n` automatically — do not convert |
| `NEXT_PUBLIC_APP_URL` | Your live domain | e.g. `https://clan-forge-xyz.vercel.app` — used in email links |
| `RESEND_API_KEY` | resend.com → API Keys | |

---

## Failed Attempts / Lessons Learned

### Firebase Storage CORS
- **Problem:** Browser uploads directly to Firebase Storage blocked by CORS preflight
- **Attempted:** `gsutil cors set`, `firebase deploy --only storage` — both failed (gsutil not installed, Storage not configured via CLI)
- **Solution:** Created `/api/upload` server-side proxy — browser POSTs to Next.js, server uploads via Admin SDK, returns permanent download URL

### Profile page build error (`Can't resolve 'fs'`)
- **Problem:** `profile/edit/page.tsx` (`"use client"`) had a dead dynamic import of `admin.ts` inside an `onSave` function. Adding `adminStorage` to `admin.ts` pulled in `@google-cloud/storage` → `gcp-metadata` → `fs`
- **Solution:** Removed the dead import; added `import "server-only"` to `admin.ts` as a permanent guard

### Vercel build failures (ESLint)
- **Problem:** Vercel runs ESLint as part of the build — local dev doesn't surface these as hard errors
- **Files fixed:** `BracketView.tsx` (unused `Badge` import), `tournament.actions.ts` (unused `TournamentFormat`), `hooks.ts` (unused `matchConverter`), `clans/create/page.tsx` (unused `value` prop), `profile/edit/page.tsx` (`<img>` without eslint-disable comment)

### Empty API route stubs
- **Problem:** Several `route.ts` files existed but were completely empty (0 bytes). TypeScript rejects these as "not a module"
- **Solution:** Added `export {}` to each — valid TypeScript module, no functionality, kept as Phase 2 placeholders

### Vercel output directory error
- **Problem:** Vercel wasn't recognising the project as Next.js — looked for `public/` output instead of `.next/`
- **Solution:** Added `vercel.json` with `{ "framework": "nextjs" }`

### Firebase OAuth on Vercel
- **Problem:** `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` was set to the Vercel deployment URL instead of `project-id.firebaseapp.com`. Firebase loads a hidden auth iframe at `authDomain/__/auth/iframe` — Vercel has no idea how to handle that route
- **Solution:** Set `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` to `your-project-id.firebaseapp.com` in Vercel env vars

---

## Next Steps

### Immediate (to get Vercel fully working)
1. **Fix `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`** in Vercel → must be `your-project-id.firebaseapp.com`
2. **Redeploy** after the env var change
3. **Test auth** — sign in with email/password, then Google OAuth
4. **Test file upload** — create a clan with an image, check it appears in Firebase Storage
5. **Test email** — register for a tournament, check inbox

### Recommended before going live
- Add a **custom domain** in Vercel and add it to Firebase authorized domains
- Update `NEXT_PUBLIC_APP_URL` to the custom domain
- Update `FROM` in `src/lib/emails.ts` from `onboarding@resend.dev` to your verified Resend domain
- Set up **Firestore security rules** — currently open for development
- Set up **Firebase Storage security rules**

### Phase 2 features (stubs already in place)
- `/api/clans/route.ts` — REST endpoints for clan operations
- `/api/posts/route.ts` — REST endpoints for clan posts
- `/api/tournaments/route.ts` — REST endpoints for tournament operations
- `/api/users/route.ts` — REST endpoints for user management
- `sendMatchResultEmail()` in `src/lib/emails.ts` — wire up when match results are recorded
- `sendClanInviteEmail()` in `src/lib/emails.ts` — wire up when clan invites are implemented
- Achievements tab on profile page — UI placeholder ready, needs data model
- Paid tournaments (Stripe integration)
- Clan challenges
- LFG board
