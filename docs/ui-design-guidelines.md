# ClanForge — UI & Design Guidelines (Agent Runbook)

> **How to use this file:** This is an agent runbook, not a tutorial. Read the **Pre-Implementation Checks** before designing any new UI. Apply the **During-Implementation Checks** as each component is written. Run the **Post-Implementation Verification** before declaring the work done. The **Design System Log** section is the source of truth — every rule in this document is derived from the patterns actually present in the codebase today.

---

## Table of Contents

1. [Design System Log: Observed Patterns & Tokens](#1-design-system-log-observed-patterns--tokens)
2. [Performance Patterns Log: Fixes Applied to the Codebase](#2-performance-patterns-log-fixes-applied-to-the-codebase)
3. [Pre-Implementation Checks](#3-pre-implementation-checks)
4. [During-Implementation Checks](#4-during-implementation-checks)
5. [Post-Implementation Verification Checklist](#5-post-implementation-verification-checklist)
6. [Reference: Component & Token Locations](#6-reference-component--token-locations)

---

## 1. Design System Log: Observed Patterns & Tokens

This is the canonical inventory of every design primitive used in the codebase. Match these exactly when adding new UI — never introduce parallel versions.

### 1.1 Stack

| Layer | Technology | Location |
|---|---|---|
| Styling | Tailwind CSS 3.4 (utility-first) | `tailwind.config.ts` |
| Theme tokens | CSS custom properties | `src/app/globals.css` |
| Base components | shadcn/ui (Base Nova style) + Base UI React | `src/components/ui/` |
| Variant API | `class-variance-authority` (CVA) | inside each ui component |
| Icons | `lucide-react` | imported per file |
| Toasts | Sonner | mounted in `src/app/layout.tsx` |
| Animations | `tailwindcss-animate` + keyframes in config | `tailwind.config.ts` |

### 1.2 Colour Tokens (verbatim from `globals.css`)

**Backgrounds — outer-to-inner stacking order:**
| CSS Var | Hex | Tailwind | Use |
|---|---|---|---|
| `--bg-base` | `#0a0a0f` | `bg-base` | App background, page root |
| `--bg-surface` | `#111118` | `bg-surface` | Cards, containers, sidebars |
| `--bg-elevated` | `#1a1a24` | `bg-elevated` | Dropdowns, hover layers, secondary panels |
| `--bg-overlay` | `#22222e` | `bg-overlay` | Modals, tooltips, popovers |

**Accent / brand:**
| CSS Var | Hex | Tailwind | Use |
|---|---|---|---|
| `--accent` | `#6366f1` | `bg-accent` / `text-accent` | Primary CTAs, links, active states, progress |
| `--accent-hover` | `#4f46e5` | `bg-accent-hover` | Hover state on accent |
| `--accent-glow` | `rgba(99,102,241,0.15)` | used in `shadow-glow` | Glow shadow |
| `--violet` | `#8b5cf6` | `bg-violet` | Secondary accent, gradients |

**Semantic:**
| CSS Var | Hex | Tailwind | Use |
|---|---|---|---|
| `--success` | `#22c55e` | `text-success` | Confirmed, paid, active |
| `--warning` | `#f59e0b` | `text-warning` | Pending, closing soon |
| `--danger`  | `#ef4444` | `text-danger`  | Errors, destructive |
| `--info`    | `#3b82f6` | `text-info`    | Neutral informational |

**Text:**
| CSS Var | Hex | Tailwind | Use |
|---|---|---|---|
| `--text-primary` | `#f8fafc` | `text-primary` | Headings, body |
| `--text-secondary` | `#94a3b8` | `text-secondary` | Supporting text |
| `--text-muted` | `#475569` | `text-muted` | Captions, disabled, placeholders |

**Borders:**
| CSS Var | Tailwind | Use |
|---|---|---|
| `--border-subtle` (rgba 6%) | `border-subtle` | Dividers, low contrast |
| `--border-default` (rgba 10%) | `border-default` | Cards, inputs (most common) |
| `--border-strong` (rgba 18%) | `border-strong` | Focus, emphasis |

### 1.3 Typography Log

| Font | Source | Weight Used | Applied To |
|---|---|---|---|
| Rajdhani | Google Fonts (imported in `globals.css`) | 600 default, 700 bold | All `h1`–`h6` globally; `font-display` utility |
| DM Sans | Google Fonts (imported in `globals.css`) | 400, 500 | Body text (default via `body { font-family }`) |
| Geist Mono | Local `src/app/fonts/GeistMonoVF.woff` | 400 | `font-mono` — code, IDs, references |

**Global heading rule from `globals.css`:**
```css
h1, h2, h3, h4, h5, h6 {
  font-family: 'Rajdhani', sans-serif;
  font-weight: 600;
  letter-spacing: 0.01em;
}
```

### 1.4 Border Radius Log

| Tailwind | Value | Observed Use |
|---|---|---|
| `rounded-lg` | `0.5rem` (8px) | Standard card radius — used on every card in `ClanCard`, `TournamentCard`, dashboard tiles |
| `rounded-md` | `~6px` | Buttons, inputs, badges |
| `rounded-sm` | `~4px` | Tags, inline pills |
| `rounded-full` | full | Avatars, circular badges |

**Never observed in the codebase:** `rounded-xl`, `rounded-2xl`, `rounded-3xl` on standard cards.

### 1.5 Box Shadow Log

| Tailwind | Definition | Use |
|---|---|---|
| `shadow-glow` | `0 0 20px var(--accent-glow), 0 0 40px var(--accent-glow)` | Featured/highlighted surfaces only (GlowCard) |
| `shadow-glow-sm` | `0 0 10px var(--accent-glow)` | Hover emphasis |

### 1.6 Component Inventory (verbatim from `src/components/ui/`)

| Component | File | Variants / sizes |
|---|---|---|
| `Button` | `button.tsx` | variants: default, outline, secondary, ghost, destructive, link · sizes: xs, sm, default, lg, icon, icon-xs, icon-sm, icon-lg |
| `Badge` | `Badge.tsx` | variants: default, success, warning, danger, info, clan, tournament, live |
| `GlowCard` | `GlowCard.tsx` | Featured surface with glow shadow |
| `Tabs` | `tabs.tsx` | shadcn primitive |
| `Sheet` | `sheet.tsx` | Drawer / side panel |
| `Toggle` | `Toggle.tsx` | Switch primitive |
| `DateTimePicker` | `DateTimePicker.tsx` | Date+time form input |
| `LoadMoreButton` | `LoadMoreButton.tsx` | Pagination CTA with built-in loading state |
| `SortDropdown` | `SortDropdown.tsx` | Sort selector for lists |
| `ComingSoon` | `ComingSoon.tsx` | Phase-2 placeholder |

### 1.7 Layout Pattern Log

**Page wrapper (every `(main)` page uses this):**
```tsx
<div className="space-y-6 p-4 sm:p-6">
```

**Standard card pattern (observed across the codebase):**
```tsx
<div className="bg-surface rounded-lg border border-default/10 p-4 space-y-3">
  <h3 className="font-display text-base font-semibold text-primary">…</h3>
  <p className="text-sm text-secondary">…</p>
</div>
```

**Two-column layout with sticky sidebar (clan detail, profile):**
```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div className="lg:col-span-2">{/* main */}</div>
  <div className="lg:sticky lg:top-6 space-y-4">{/* sidebar */}</div>
</div>
```

**Stats grid (dashboard):**
```tsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
```

**Breadcrumb (every sub-page):**
```tsx
<nav className="flex items-center gap-2 text-sm text-muted mb-4">
  <Link href="/parent" className="hover:text-secondary transition-colors">Parent</Link>
  <ChevronRight className="h-3 w-3" />
  <span className="text-secondary">{current}</span>
</nav>
```

### 1.8 Sidebar Offset

The fixed sidebar is **240px wide on desktop**. Any fixed/absolute positioned full-bleed element (profile backgrounds, modals taking full viewport) must account for it. Existing animated profile backgrounds use `left: 240px` for this reason.

---

## 2. Performance Patterns Log: Fixes Applied to the Codebase

This is the log of every performance fix applied during the audit phase. New code must follow the same patterns — they are not optional.

### 2.1 Sequential → Parallel Firestore Reads

Independent Firestore reads were serialised, doubling page latency. Fixed by `Promise.all`.

| # | File | Function | Fix |
|---|---|---|---|
| 1 | `src/lib/actions/challenge.actions.ts` | `getClanActiveChallenges` | Entry doc + top-5 entries fetched in parallel |
| 2 | `src/lib/actions/challenge.actions.ts` | `trackChallengeProgress` | Per-challenge loop changed to `await Promise.all(...map(async))` |

**Pattern:**
```typescript
// ✅ Correct — parallel
const [a, b] = await Promise.all([readA(), readB()]);

// ❌ Wrong — sequential
const a = await readA();
const b = await readB();
```

### 2.2 Missing `useCallback` Causing Re-renders

Event handlers passed to child components were re-created on every render, causing unnecessary re-renders down the tree.

| # | File | Handlers wrapped |
|---|---|---|
| 3 | `src/components/clan/ClansClient.tsx` | `handleSearchChange`, `handleSortChange`, `handleLoadMore` |
| 4 | `src/components/tournament/TournamentsClient.tsx` | Same three handlers |

**Pattern:**
```typescript
const handleSearchChange = useCallback((v: string) => setQuery(v), []);
```

### 2.3 Per-Render Derived Computation in Lists

`timeRemaining(challenge.endAt)` was called inline in JSX, recomputing on every render for every item.

| # | File | Fix |
|---|---|---|
| 5 | `src/components/challenges/ClanChallengesWidget.tsx` | `const timeLeft = useMemo(() => timeRemaining(challenge.endAt), [challenge.endAt])` |
| 6 | `src/components/challenges/DashboardChallengesWidget.tsx` | Pre-computed `timeLabels` map via `useMemo` keyed by challenge id |

**Pattern:**
```typescript
const derived = useMemo(() => expensiveFn(input), [input]);
```

### 2.4 Universal Performance Rules Going Forward

Derived from the fixes above:

- Every event handler passed as a prop is wrapped in `useCallback`.
- Every derived value used in JSX more than once, or feeding a `useEffect`/`useCallback` dep, is wrapped in `useMemo`.
- Every set of independent Firestore reads in a Server Component is wrapped in `Promise.all`.
- Every Firestore query has a `.limit()`.
- Every list item key is a document ID, never the array index.

---

## 3. Pre-Implementation Checks

> Run these BEFORE writing any UI code. The goal is to map the new feature onto existing patterns so you don't introduce parallel versions.

### 3.1 Visual Inventory

- [ ] **What pages does this feature add or modify?** Identify which `app/(main)/[feature]/page.tsx` files will exist.
- [ ] **What server-rendered data does each page need?** List the Firestore reads; mark which can run in parallel (almost always: yes).
- [ ] **What client interactivity is required?** Plan the Server/Client component split: Server fetches → passes serialisable props → Client handles events.

### 3.2 Component Reuse Audit

Before designing any new visual element, search the existing component inventory (§1.6):

- [ ] **Buttons** — use `<Button>` with an existing variant. Do not build new styled buttons.
- [ ] **Status indicators** — use `<Badge>` with a semantic variant (success / warning / danger / info / live).
- [ ] **Featured surfaces** — use `<GlowCard>`. Do not apply `shadow-glow` manually.
- [ ] **Pagination** — use `<LoadMoreButton>`.
- [ ] **Sort selectors** — use `<SortDropdown>`.
- [ ] **Drawers / side panels** — use `<Sheet>`.
- [ ] **Tabs** — use `<Tabs>`.

If a new primitive is genuinely required, add it to `src/components/ui/` with CVA variants — do not inline custom styles in feature components.

### 3.3 Token Audit

- [ ] **Every colour** the new design uses maps to a token in §1.2. If a desired colour does not exist, add the token to `globals.css` AND `tailwind.config.ts` — do not introduce raw hex values in TSX.
- [ ] **Every font usage** is one of: heading (`font-display`), body (default DM Sans), mono (`font-mono`).
- [ ] **Every spacing value** is a Tailwind class — no inline `style={{ margin: ... }}`.
- [ ] **Every radius** is `rounded-lg` (cards), `rounded-md` (inputs/buttons/badges), `rounded-sm` (tags), or `rounded-full` (avatars). Nothing else.

---

## 4. During-Implementation Checks

> Apply these AS each component is being written. Each rule cites the log entry it derives from.

### 4.1 Server / Client Split

```tsx
// app/(main)/[feature]/page.tsx — Server Component
const sessionCookie = cookies().get("session")?.value;
if (!sessionCookie) redirect("/login");
const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);

const [a, b] = await Promise.all([readA(), readB()]);  // §2.1

return <FeatureClient uid={decoded.uid} initialA={a} initialB={b} />;
```

```tsx
// components/[feature]/FeatureClient.tsx — Client Component
"use client";
import { useCallback, useMemo, useState } from "react";

export default function FeatureClient({ uid, initialA, initialB }: Props) {
  const [query, setQuery] = useState("");
  const handleSearch = useCallback((v: string) => setQuery(v), []);  // §2.2
  const filtered = useMemo(() => initialA.filter(...), [initialA, query]);  // §2.3
  // ...
}
```

### 4.2 Card / Layout Rules

- [ ] **Every card uses `bg-surface rounded-lg border border-default/10`** (§1.7).
- [ ] **Internal card spacing uses `space-y-3` or `space-y-4`**, not ad hoc margins.
- [ ] **Every sub-page has a breadcrumb** above the page title (§1.7).
- [ ] **Page wrapper is `space-y-6 p-4 sm:p-6`** — do not invent new page-level padding.

### 4.3 Typography Rules

- [ ] **Every heading element has `font-display` explicitly**, even though the global CSS sets it on `h1`–`h6` (belt + braces).
- [ ] **Body text uses `text-sm text-secondary`** as default.
- [ ] **Captions / meta use `text-xs text-muted`**.
- [ ] **No `font-bold` on body text** — use `font-medium` at most.

### 4.4 Colour Rules

- [ ] **No raw hex codes in TSX** (§1.2).
- [ ] **No arbitrary Tailwind colours like `text-green-400`, `bg-slate-800`** — use semantic tokens.
- [ ] **Status colours always go through `<Badge>`** rather than raw `text-success` etc.

### 4.5 Performance Rules

- [ ] **Every event handler passed to a child is wrapped in `useCallback`** (§2.2).
- [ ] **Every derived value used more than once in a render is wrapped in `useMemo`** (§2.3).
- [ ] **Every list `key` is a document ID, not the array index**.
- [ ] **Every Server Component runs independent Firestore reads in `Promise.all`** (§2.1).
- [ ] **Every Firestore query has a `.limit()`**.

### 4.6 Data Lifecycle States

Every data-driven component must render correctly in all three states:

- [ ] **Loading** — skeleton or shimmer matching the final layout's shape.
- [ ] **Empty** — a brief message + a contextual action (when applicable).
- [ ] **Error** — a brief message + a retry button.

Plus, for any operation expected to take >5 seconds, a "still loading…" hint after a threshold (existing pattern: `ClanFeed.tsx` uses 8s).

### 4.7 Notifications

- [ ] **All user feedback goes through Sonner** (`toast.success`, `toast.error`, `toast.info`, `toast.warning`).
- [ ] **No `alert()`, `window.confirm()`, or custom notification divs**.
- [ ] **After every server action call**, show a toast based on the `{ success, error }` shape.

### 4.8 Server Action Contract

- [ ] **Every server action returns `{ success: boolean; data?: T; error?: string }`**.
- [ ] **Client handles both paths:** on `!success`, `toast.error(result.error ?? "Something went wrong")`; on success, `toast.success(...)`.

---

## 5. Post-Implementation Verification Checklist

> Run this AFTER the feature is fully written, before declaring it complete. This is the agent's self-review gate.

### 5.1 Static Audit (read each new file)

For each new TSX file:

- [ ] **Search for `#` (hex colour) — count must be 0** outside of `globals.css` and `tailwind.config.ts`.
- [ ] **Search for `text-green-`, `text-red-`, `text-blue-`, `text-slate-`, `bg-zinc-`, etc. — count must be 0**. Replace with semantic tokens.
- [ ] **Search for `style={{` — count must be 0** (except for dynamic background images / transforms where a class won't work).
- [ ] **Every `<Button>`, `<Badge>`, etc. uses an existing variant** — no inline class overrides duplicating variant logic.
- [ ] **Every `h1`–`h6` has `font-display`** explicitly.
- [ ] **Every card uses the canonical pattern `bg-surface rounded-lg border border-default/10`**.

### 5.2 Performance Audit

For each new client component:

- [ ] **Every handler prop is wrapped in `useCallback`** with correct deps.
- [ ] **Every JSX-rendered computed expression appearing twice or more is wrapped in `useMemo`**.
- [ ] **No `useEffect` is being used where `useMemo` would suffice**.
- [ ] **No list uses index as key**.

For each new server component:

- [ ] **All independent reads are inside one `Promise.all`**.
- [ ] **All `.collection(...)` queries have `.limit(...)`**.
- [ ] **No `onSnapshot` in a server component** (Admin SDK doesn't support it; would be a runtime crash).

### 5.3 State Coverage Audit

For each new data-driven component:

- [ ] Loading state renders correctly (verify with throttled network).
- [ ] Empty state renders correctly (verify with empty data).
- [ ] Error state renders correctly (verify with simulated failure).

### 5.4 Server/Client Boundary Audit

- [ ] **No `adminDb`, `adminAuth`, or anything from `firebase-admin` is imported in a `"use client"` file** (would crash at runtime — `firebase/admin.ts` has a `"server-only"` guard).
- [ ] **No `Date` or Firestore `Timestamp` is passed directly from Server → Client props** — convert to `number` (ms) first.
- [ ] **No client component calls `cookies()` or `headers()`** from `next/headers`.

### 5.5 Notification Audit

- [ ] **Every successful mutation triggers `toast.success` with a concrete message** (not just "Done").
- [ ] **Every failure triggers `toast.error(result.error ?? "...")`**.
- [ ] **No `alert(...)` or `console.log(...)` is being used for user-visible feedback**.

### 5.6 Visual Walkthrough

Open each new screen and verify:

- [ ] Renders correctly on **mobile** (test at 375px wide).
- [ ] Renders correctly on **desktop** with the sidebar present (offset is handled).
- [ ] Breadcrumb is present on all sub-pages.
- [ ] No overflow / horizontal scroll on mobile.
- [ ] Focus states are visible (keyboard nav works).

### 5.7 Final Sign-off

- [ ] **Every new visual element maps to a pattern in §1.6 or §1.7** — or a new primitive was added to `src/components/ui/` with CVA variants.
- [ ] **Every new colour, font, radius, shadow maps to a token in §1.2–§1.5** — or a new token was added to `globals.css` + `tailwind.config.ts`.
- [ ] **Performance fixes §2.1–§2.3 are applied** to every new component and action.
- [ ] **`security-guidelines.md` post-implementation checklist has been run** in parallel.

---

## 6. Reference: Component & Token Locations

| Thing | Location |
|---|---|
| Design tokens (CSS vars) | `src/app/globals.css` |
| Tailwind aliases | `tailwind.config.ts` |
| UI primitives | `src/components/ui/` |
| Feature components | `src/components/clan/`, `tournament/`, `profile/`, `player/`, `challenges/`, `layout/` |
| Server actions | `src/lib/actions/` |
| Firebase client hooks | `src/lib/firebase/hooks.ts` |
| Firebase Admin SDK (server-only) | `src/lib/firebase/admin.ts` |
| Shared types | `src/types/index.ts`, `src/types/firestore.ts` |
| Root layout (fonts, Toaster) | `src/app/layout.tsx` |
| Main app layout (sidebar, footer) | `src/app/(main)/layout.tsx` |
| Utilities (`cn`, `formatDate`, `timeAgo`, `slugify`) | `src/lib/utils.ts` |
