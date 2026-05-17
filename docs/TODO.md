# ClanForge — Deferred TODO / Bug Tracker

Items the project owner has flagged for later. Each entry is self-contained
so any session (current or future) can pick one up cold.

> **Convention:** the user says "TODO - <description>" anytime in chat and an
> entry is added here. Resolved items are moved to the **Resolved** section
> at the bottom with the resolving commit hash.

---

## Open

### 1. Prevent registration + withdrawal XP farming during tournament application
**Status:** open
**Logged:** 2026-05-17

**Problem:** A user can earn XP for registering to a tournament, then withdraw,
then re-register, and pick up the `tournament_register` XP each time — turning
a one-time reward into a renewable resource. Same suspicion for any other XP
trigger tied to tournament participation.

**Where to look:**
- `src/lib/actions/tournament.actions.ts` → `registerForTournament` calls
  `trackMissionProgress("tournament_register")`. Should be gated by an
  idempotency key (e.g. `once_per_target` keyed by tournamentId+uid) — verify
  whether that's already wired.
- `src/lib/actions/tournament.actions.ts` → `withdrawFromTournament`. Check
  whether it currently reverses the XP / mission credit. Either it should, or
  the XP grant on register should be once-per-(tournamentId, uid) for life.
- `src/lib/actions/xp.actions.ts` and `src/lib/missions.ts` for the existing
  dedup primitives.
- Same risk on the paid path via Stripe webhook (`confirmPaidParticipant` →
  `trackMissionProgress`).

**Acceptance criteria:**
- Withdrawing and re-registering MUST NOT grant additional registration XP.
- Withdrawing MUST NOT grant XP either.
- Test: register → withdraw → re-register → verify XP unchanged from after
  the first register.

---

## Resolved

_(none yet)_
