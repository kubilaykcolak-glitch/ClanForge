# XP & Missions Deep Dive

How XP is awarded, how missions are generated, why neither is farmable. Reference for `04-missions-xp.md`.

---

## 1. The XP rules table (canonical)

Lives in `src/lib/xp.ts → XP_RULES`. Every XP grant goes through `awardXp` which reads from this table.

| Reason | Amount | Type | Cap / dedup |
|---|---|---|---|
| `onboarding_complete` | 100 | `once_global` | One time ever per user |
| `clan_create` | 200 | `once_global` | One time ever (first clan only) |
| `clan_join` | 50 | `once_per_target` | Once per distinct clan |
| `tournament_create` | 100 | `daily_cap` | Up to 2 per 24h |
| `tournament_register` | 25 | `daily_cap` | Up to 4 per 24h |
| `tournament_match_win` | 50 | `once_per_target` | Once per match ID |
| `tournament_place_1` | 500 | `once_per_target` | Once per tournament ID |
| `tournament_place_2` | 300 | `once_per_target` | Once per tournament ID |
| `tournament_place_3` | 200 | `once_per_target` | Once per tournament ID |
| `tournament_place_4_5` | 100 | `once_per_target` | Once per tournament ID |
| `post_create` | 10 | `daily_cap` | 1 per 24h (anti-spam) |
| `post_receive_like` | 2 | `daily_cap` | Up to 20 per 24h |
| `challenge_complete` | 75 | `once_per_target` | Once per challenge |
| `member_recruit` | 30 | `once_per_target` | Once per recruited user |
| `daily_mission_complete` | (snapshot) | `once_per_target` | Once per `mission:<uid>:<dateKey>:<templateId>` |
| `weekly_mission_complete` | (snapshot) | `once_per_target` | Once per `mission:<uid>:<weekKey>:<templateId>` |
| `clan_mission_contribute` | (snapshot) | `once_per_target` | Once per `clan_mission:<clanId>:<key>:<templateId>:<uid>` |

### Three rule types

#### `once_global`
The user can earn this XP exactly once, ever. Stored as a flag on the per-user XP ledger. Used for true milestones (onboarding, first clan creation).

#### `once_per_target`
The user can earn this once per distinct `targetId`. The `targetId` is a stable identifier (matchId, tournamentId, recruitedUid, mission key). Re-firing with the same targetId is a no-op.

Examples:
- `awardXp(uid, "tournament_match_win", matchId)` — winning the same match twice (e.g. a webhook retry) doesn't double-grant.
- `awardXp(uid, "clan_join", clanId)` — joining the same clan twice (left → rejoined) doesn't re-grant. Joining a *different* clan does.

#### `daily_cap`
The user can earn this up to `dailyCap` times per rolling 24h window. The 24h is a true rolling window, not a calendar day. `tournament_register` has `dailyCap: 4` — you can register for 4 tournaments in any 24h period; the 5th gets no XP (registration succeeds, just no XP).

### The mission-snapshot exception

For mission completion rewards, the `amount` field in `XP_RULES` is **a placeholder**. The actual amount is read from the per-user mission doc at award time:

```ts
// inside awardXp
if (reason === "daily_mission_complete" || reason === "weekly_mission_complete") {
  const missionDoc = await db.collection("profiles").doc(uid)
    .collection(reason === "daily_mission_complete" ? "missions_daily" : "missions_weekly")
    .doc(parseTargetIdToKey(targetId))
    .get();
  amount = missionDoc.data().xpReward;  // snapshot value, set at mission generation time
}
```

Why: rewards are snapshotted into the per-user mission doc when the mission is generated. Tweaking the template rewards later doesn't retroactively change rewards already promised to users. The caller of `awardXp` cannot supply an amount — it's always derived server-side from data the server controls.

### The 1000-XP per-call cap

`awardXp` rejects any computed amount > 1000 with an error. Defense-in-depth: even if a bug let a caller forge a 50000 XP grant, the cap stops the damage.

---

## 2. Levels and XP thresholds

Levels are computed from cumulative XP. The thresholds curve grows quadratically:

```
level = floor(sqrt(xp / 50))      (illustrative — see xp.ts for actual function)
```

- Level 1 → 0 XP
- Level 2 → 50 XP
- Level 5 → 1250 XP
- Level 10 → 5000 XP
- Level 20 → 20000 XP

Clan levels work the same way, with a separate XP ledger and a different threshold curve (slightly steeper — clans accumulate XP from many members).

---

## 3. Personal mission templates

Live in `src/lib/missions.ts → MISSION_TEMPLATES`. Five daily + four weekly. The user gets 3 of the 5 dailies (deterministic per-user shuffle) and 1 of the 4 weeklies.

### Dailies

| Template ID | Action | Target | XP | Clan XP |
|---|---|---|---|---|
| `d_login_1` | `daily_login` | 1 | 10 | 5 |
| `d_post_1` | `post_create` | 1 | 15 | 10 |
| `d_match_win_1` | `tournament_match_win` | 1 | 30 | 15 |
| `d_match_win_2` | `tournament_match_win` | 2 | 60 | 30 |
| `d_tourney_join_1` | `tournament_register` | 1 | 20 | 10 |

### Weeklies

| Template ID | Action | Target | XP | Clan XP |
|---|---|---|---|---|
| `w_login_5` | `daily_login` | 5 (distinct days) | 120 | 60 |
| `w_post_3` | `post_create` | 3 | 100 | 50 |
| `w_match_win_5` | `tournament_match_win` | 5 | 250 | 120 |
| `w_tourney_join_2` | `tournament_register` | 2 | 150 | 75 |

### Action allowlist

`isMissionAction()` validates `trackMissionProgress` input against a hard-coded enum. Only these four actions can increment mission progress; anything else 400s. The allowlist is the security boundary — even if a caller supplied a forged "action" string, it'd be rejected before touching any doc.

---

## 4. Mission generation algorithm

`getOrGenerateDailyMissions(uid)` (in `missions.actions.ts`) — called from the dashboard widget AND from `trackMissionProgress` (whichever fires first).

### Step-by-step

1. **Compute the date key** for today (UTC): `2026-05-17`.
2. **Check** if `/profiles/{uid}/missions_daily/{dateKey}` already exists. If yes, return as-is.
3. **Deterministic per-user shuffle.** Seed: FNV-1a hash of `${uid}:${dateKey}`. PRNG: Mulberry32. Shuffle the 5 daily templates with this PRNG. Pick the first 3.
4. **Snapshot the rewards.** Build the per-user mission doc with `xpReward` + `clanXpReward` copied from the templates at this moment. The template can change later without affecting this doc.
5. **Race-safe write.** Use a Firestore transaction:
   ```ts
   await db.runTransaction(async tx => {
     const snap = await tx.get(missionRef);
     if (snap.exists) return;       // someone else generated it first; bail
     tx.set(missionRef, missionDoc);
   });
   ```
   Two simultaneous calls (e.g. user opens the dashboard right as `trackMissionProgress` fires from a tournament register) will both attempt to create the doc; the transaction guarantees only one wins.

### Why deterministic shuffle?

If two browser tabs both call `getOrGenerateDailyMissions` simultaneously, they'd otherwise pick *different* random missions for the same day, and the transaction's race condition would leave one set "winning" arbitrarily. Deterministic shuffle means both tabs compute the *same* 3 missions, so the race resolution is irrelevant — both writers produce identical docs.

It also means the missions are predictable per-day-per-user, which makes debugging easier ("you should be seeing X, Y, Z today; if not, the templates changed").

### Weekly missions

Same algorithm, weekly key (`2026-W20`), 1 mission picked from 4 templates. Resets at Monday 00:00 UTC.

---

## 5. Tracking progress

`trackMissionProgress(uid, action)` is called from inside every server action that can trigger mission progress — `registerForTournament`, `confirmPaidParticipant`, `reportMatchResult`, `getDashboardMissions` itself (for the daily-login action), and the Riot tournament webhook handler.

### What it does

1. **Session-exists check** — `requireAuthContext()`. Either a regular session OR a webhook context. The webhook context is set inside `runInWebhookContext` so trusted server-to-server calls work without a session cookie.
2. **Lazy-generate** today's daily missions + this week's weekly mission if they don't exist (same transactional pattern).
3. **Check each mission** for whether it tracks `action`. Increment `progress` by 1.
4. **If progress hits target**, set `completedAt` AND fire `awardXp(uid, "daily_mission_complete", missionTargetId)` (or weekly equivalent).
5. **For each completed mission**, also fire `awardClanXp(uid, "...", missionTargetId)` if the user is in a clan. The amount is the snapshotted `clanXpReward`.

### The daily-login dedup

For `daily_login` specifically, we don't want every page-load to bump the counter — only the first visit of the day. Dedup is keyed on `profile.lastDailyLoginDate`:

```ts
const today = dailyKey();
if (profile.lastDailyLoginDate !== today) {
  await profileRef.update({ lastDailyLoginDate: today });
  await trackMissionProgress(uid, "daily_login");
}
```

Same pattern for clan missions' `member_active_day` action via `profile.lastClanActiveDate`.

---

## 6. Clan mission contributors

Clan missions (`/clans/{clanId}/clan_missions_daily/{key}`) have a per-member contributor map:

```
contributors: {
  "uid_alice": 2,
  "uid_bob":   1,
  ...
}
```

Each member's action contributes (server-only — clients can never write here). On completion:
1. Clan gets `clanXpReward` (one-shot).
2. Each contributor gets `memberXpReward` deposited to their personal XP ledger via `awardXp(uid, "clan_mission_contribute", "clan_mission:{clanId}:{key}:{templateId}:{uid}")`.
3. The `targetId` includes the contributor's uid so the per-mission-per-contributor pair is dedup'd via `once_per_target`. A member who contributed to two different clan missions in the same week gets two `clan_mission_contribute` rewards.

### Anti-spam contribution pool

The clan-mission action list is deliberately narrow:

- `member_active_day`
- `tournament_match_win`
- `tournament_solo_streak`
- `tournament_clan_squad`
- `tournament_top_place`
- `tournament_run_complete`

There is no "post in feed" or "like a post" clan mission — those would be trivially farmable by a leader spamming low-content posts. Every clan-mission action is either externally validated (tournament wins are reported via match resolution) or per-user-per-day deduplicated.

---

## 7. Anti-farming defenses summary

| Vector | Defense |
|---|---|
| Re-trigger XP grants by replaying actions | `once_per_target` dedup keyed by stable IDs (matchId, tournamentId, clanId) |
| Pump XP via repeated daily actions | `daily_cap` on `post_create` (1×), `tournament_register` (4×), etc. |
| Inflate mission rewards via tuning attacks | Rewards snapshotted into user docs at generation; caller cannot supply the amount |
| Join/leave clans to farm `clan_join` XP | `once_per_target` keyed by clanId means a re-join awards nothing; PLUS a 10-hour cooldown blocks fresh joins after leaving |
| Forge fake match wins via direct Firestore writes | `/tournaments/{id}/matches/{id}` is writable only by creator OR match participant; the participant's report goes through `reportMatchResult` which validates `winnerId ∈ {A, B}` |
| Forge Riot tournament-V5 callbacks | HMAC-signed `metaData` blob; forgeries 401 |
| Tamper with mission progress directly | `missions_daily` / `missions_weekly` are server-only-write at the Firestore rule level |
| Tamper with the audit log | `admin_audit` is append-only — no client write path exists |

---

## 8. Edge cases worth knowing

- **A mission gets harder mid-day** (you tune `target` upward in `missions.ts` and deploy). Users who already have the mission keep the OLD target — their snapshot doc isn't touched. Users generated AFTER the deploy get the new target.
- **You add a new template.** It joins the pool. Tomorrow's generation can pick it; today's already-generated docs are unaffected.
- **You delete a template.** Already-generated user docs reference an unknown `templateId`; the dashboard widget falls back to a generic label. Cosmetic only — the progress + reward still work because they're snapshotted.
- **A user's clan changes mid-mission.** Past clan-mission contributions stay in the old clan's contributors map (they were a member when they contributed). They don't earn the `clan_mission_contribute` reward when their old clan's mission completes (only current members qualify at completion time).
- **Daily-login dedup spans days incorrectly because of timezones.** We use UTC `dailyKey` deliberately to avoid this. A user in UTC-12 will see their daily reset at noon local; they're already getting all 5 days of `w_login_5` if they log in once every UTC day.
- **`tournament_register` fires twice for the same tournament (e.g. register → withdraw → re-register).** Currently: yes, each registration grants XP up to the daily cap of 4. This is the gap the TODO #1 tracker entry covers — should be tightened so a single tournament-uid pair only ever grants once.
