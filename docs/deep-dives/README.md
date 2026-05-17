# Deep Dives

Long-form explanations of how specific systems actually work, with worked examples and the maths spelled out. Sits between the user-facing feature docs (which describe behaviour) and the engineering docs (which describe wiring).

When the right answer to "how does X work?" is more than two paragraphs, it goes here.

## Contents

1. **[Tournament Mechanics](./tournament-mechanics.md)** — bracket generation, byes, format options (single vs double vs round-robin), why we only ship single-elim, the round-2-advancement gap, prize-split math with worked examples.
2. **[XP & Missions](./xp-and-missions.md)** — canonical XP table, dedup rule types (`once_global` / `once_per_target` / `daily_cap`), mission generation algorithm (deterministic shuffle), reward snapshotting, anti-farming patterns.

## Reading order

If you came from a feature doc and want more detail, jump straight to the section that interests you. Each page is self-contained; no need to read the others first.

If you're new to the codebase entirely, start with `docs/README.md` (feature index) → `docs/internal/architecture.md` (folder structure) → then any deep-dive that matches what you're working on.
