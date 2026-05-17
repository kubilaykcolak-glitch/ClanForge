# ClanForge — Feature Documentation

Reference for every feature shipped on the site. Organised by area; each
page is meant to be skimmable, with deeper detail only where decisions or
edge cases matter.

## Contents

1. **[Profile & Account](./01-profile.md)** — sign up, profile fields, customisation, privacy, banned users, linked game accounts (entry point).
2. **[Clans](./02-clans.md)** — creating and joining clans, member roles, the clan feed, clan missions, clan XP.
3. **[Tournaments](./03-tournaments.md)** — creating tournaments, registration, paid entry, brackets, matches, the LoL auto-verification flow.
4. **[Missions, XP & Progression](./04-missions-xp.md)** — daily / weekly missions (personal + clan), XP sources, levels, seasons, challenges, leaderboards.
5. **[League of Legends Integration](./05-integrations-league.md)** — linking, profile-icon ownership verification, the live profile widget, refresh, force-unlink.
6. **[Admin System](./06-admin.md)** — the three-tier role system, the admin dashboard, step-up auth, audit log, Discord alerts.

## Reading the docs

- **Default behaviour** is what regular users see. Options that change behaviour are called out separately with their outcomes.
- **Where options have permission requirements** (e.g. only a tournament creator can lock the bracket) it's noted inline.
- **Implementation notes** are in italics and can be skipped if you only care about behaviour.
- **Edge cases** that have caught us before are written up as "What happens if…" sub-sections.

## Deep dives

For "how does X actually work?" answers that need worked examples and the maths spelled out:

- **[Deep Dives Index](./deep-dives/README.md)** — tournament mechanics (bracket generation, prize splits, round-2 gap), XP & missions (rules table, generation algorithm, anti-farming).

## Internal / operational docs

For the engineering-side of the platform — how to operate, deploy, debug, and extend:

- **[Internal Docs Index](./internal/README.md)** — operations, architecture, schema, admin internals, Riot internals, Stripe internals.

## Adjacent docs

- [`security-guidelines.md`](./security-guidelines.md) — agent runbook for security work (auth, server actions, IDOR, webhooks).
- [`ui-design-guidelines.md`](./ui-design-guidelines.md) — agent runbook for UI work (Arena design system, performance patterns, accessibility).
