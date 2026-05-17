# Internal / Operational Documentation

Engineering reference for ClanForge — the stuff you need to operate, deploy, debug, and extend the platform. Distinct from the feature docs in `../` which describe what users see; these describe how it actually works under the hood and what an on-call engineer needs to know.

## Contents

1. **[Operations](./operations.md)** — environment variables, secrets, key rotation, deployment commands (Vercel + Firebase), CLI scripts.
2. **[Architecture](./architecture.md)** — folder structure, server-action conventions, webhook context, AsyncLocalStorage, idempotency patterns.
3. **[Firestore Schema](./firestore-schema.md)** — collection map, document shapes, security-rule contracts.
4. **[Admin Internals](./admin-internals.md)** — how the role / claim / audit / step-up / Discord-alert system actually works.
5. **[Riot Integration Internals](./riot-internals.md)** — Riot API endpoints we use, stub vs prod toggling, the Tournament-V5 callback handler, HMAC metadata signing.
6. **[Stripe Internals](./stripe-internals.md)** — payment flow, refund flow, webhook reconciliation.

## Who should read this

- **Owner / future self** — when you (or future-you) need to remember how something works after time away.
- **A new engineer** — onboarding pass to understand the codebase without reading every file.
- **An on-call engineer** — debugging a production incident at 2am.
- **An AI agent picking up work** — pair this with `docs/HANDOFF.md` for full context.

## Layering

```
docs/
├── README.md                       feature documentation index
├── 01-profile.md ... 06-admin.md   feature documentation (user-facing behaviour)
├── HANDOFF.md                      point-in-time session snapshot
├── security-guidelines.md          security runbook (when writing new actions)
├── ui-design-guidelines.md         UI runbook (Arena system, performance)
└── internal/                       ← you are here — operational + technical
    ├── README.md
    ├── operations.md
    ├── architecture.md
    ├── firestore-schema.md
    ├── admin-internals.md
    ├── riot-internals.md
    └── stripe-internals.md
```
