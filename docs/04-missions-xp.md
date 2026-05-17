# Missions, XP & Progression

Three layered systems: **personal XP** (your account level), **clan XP** (your clan's level), and **missions** (daily/weekly tasks that grant both).

---

## 1. Personal XP

Earned passively as you use the site. Canonical table from `src/lib/xp.ts → XP_RULES`:

| Reason | Amount | Rule type | Cap / dedup |
|---|---|---|---|
| `onboarding_complete` | 100 | `once_global` | First sign-up only |
| `clan_create` | 200 | `once_global` | First clan created only |
| `clan_join` | 50 | `once_per_target` | Once per distinct clanId; 10h cooldown after leaving |
| `tournament_create` | 100 | `daily_cap` | Up to 2 / 24h |
| `tournament_register` | 25 | `daily_cap` | Up to 4 / 24h |
| `tournament_match_win` | 50 | `once_per_target` | Once per matchId |
| `tournament_place_1` | 500 | `once_per_target` | Once per tournamentId |
| `tournament_place_2` | 300 | `once_per_target` | Once per tournamentId |
| `tournament_place_3` | 200 | `once_per_target` | Once per tournamentId |
| `tournament_place_4_5` | 100 | `once_per_target` | Once per tournamentId |
| `post_create` | 10 | `daily_cap` | 1 / 24h (anti-spam) |
| `post_receive_like` | 2 | `daily_cap` | Up to 20 / 24h |
| `challenge_complete` | 75 | `once_per_target` | Once per challengeId |
| `member_recruit` | 30 | `once_per_target` | Once per recruited uid |
| `daily_mission_complete` | snapshot | `once_per_target` | Once per (uid, day, templateId) |
| `weekly_mission_complete` | snapshot | `once_per_target` | Once per (uid, week, templateId) |
| `clan_mission_contribute` | snapshot | `once_per_target` | Once per (clan, mission, uid) |

**Hard cap:** 1000 personal XP per call. **Idempotency:** every grant carries a target id (or is `once_global` / `daily_cap`), so retries never double-grant.

**`daily_login` has no standalone XP reason** — the once-per-day login reward comes via the `d_login_1` mission template (10 XP), not directly from an XP rule.

For the full mechanics including dedup formats, mission generation algorithm, and anti-farming defenses, see [deep-dives/xp-and-missions.md](./deep-dives/xp-and-missions.md).

---

## 2. Levels

Personal XP → level via thresholds defined in `src/lib/xp.ts`. Level affects:

- The level badge shown on your profile hero and across the site.
- Sort order in the player directory (one of several sort modes).
- Leaderboard position during a season (see §6).

Clan XP works the same with a separate threshold table.

---

## 3. Daily missions (personal)

Each user gets **3 daily missions** at midnight UTC, picked deterministically from a pool of 5 templates. Currently:

- `daily_login` — log in today.
- `post_create` — make a clan post.
- `tournament_register` — register for any tournament.
- `tournament_match_win` — win one tournament match.

Templates carry their own progress target (e.g. "win 2 matches") and reward (snapshotted into the per-user mission doc at generation time — future template changes never alter rewards already promised).

On completion, both personal XP and clan XP (if you're in a clan) are awarded.

### Generation

Lazy: missions are generated **either** when you open the dashboard widget **or** when a mission-tracking event fires — whichever comes first. Generation is atomic via a Firestore transaction so concurrent fires can't create duplicate docs. The pick is seeded by `uid:dateKey` so the same user gets the same 3 missions every time on a given day (deterministic).

---

## 4. Weekly missions (personal)

Same shape as daily, but **1 mission per week**, drawn from 4 templates. Higher rewards. Resets on Monday UTC.

---

## 5. Clan missions

See [02-clans.md §5](./02-clans.md#5-clan-missions) for the full list of templates and how contributors get rewarded.

In summary: every clan gets its own daily + weekly missions; every member's qualifying action counts towards the clan's progress; on completion, the clan gets clan XP and every contributing member gets a personal XP deposit.

---

## 6. Seasons

A season is a fixed-duration leaderboard window. Default: 3 months. Managed from `/admin/seasons`.

- One season is `active` at a time.
- Past seasons are archived but readable.
- Per-season XP totals are tracked separately from lifetime XP.
- The leaderboard at `/leaderboard` ranks by season XP descending.
- The Season Banner on the dashboard shows the current season name, end date, and your position in the top 10 (or "you're #N" if outside).

---

## 7. Challenges

Time-bound competitive events created by admins from `/admin/challenges`. Distinct from tournaments:

- Challenges are not bracket-based — they're "complete X by date Y" goals.
- Status lifecycle: `upcoming → active → complete`.
- Any user can opt in once active; progress is tracked per-user.
- Rewards (XP, badges, etc.) drop on completion via the same XP machinery used everywhere else.

---

## 8. Leaderboards

`/leaderboard` shows:

- **Players tab** — top players by season XP, then lifetime XP, then tournaments won. Multiple sort modes are toggleable.
- **Clans tab** — same shape for clans, sorted by clan XP.
- **Season banner** — current active season at the top with end-date countdown and your position.

Pagination is cursor-based; Load More button appends to the visible list.

---

## 9. What happens when…

- **You log in twice on the same day.** Second login is a no-op for `daily_login` — server-side dedup by `lastDailyLoginDate` on your profile doc.
- **A mission expires un-completed.** The doc stays in Firestore but progress is moot — the next day's generation replaces it. No penalty.
- **You join a clan mid-week.** You're eligible to contribute to that clan's current weekly mission from the moment you join.
- **You leave a clan mid-mission.** Your past contributions count stays in the contributors map but you no longer get the `clan_mission_contribute` deposit if the mission completes after you leave — by design; only current members get the reward.
- **A season ends.** The season's `endsAt` triggers status transition; a new season can be drafted in the admin and made active. Leaderboard data is preserved.
