# Riot Integration Internals

How the LoL integration + Tournament-V5 auto-verification actually works. Pairs with `../05-integrations-league.md` (user-facing) and `../03-tournaments.md` (tournament feature).

---

## 1. Riot APIs in use

| API | What we use it for | Endpoints | Routing |
|---|---|---|---|
| `account-v1` | Resolve Riot ID → PUUID | `GET /riot/account/v1/accounts/by-riot-id/{name}/{tag}` | **regional** (americas / europe / asia) |
| `summoner-v4` | Summoner level, profile icon, internal ID | `GET /lol/summoner/v4/summoners/by-puuid/{puuid}` | **platform** (na1, euw1, kr, …) |
| `league-v4` | Solo/flex rank, W/L, LP | `GET /lol/league/v4/entries/by-puuid/{puuid}` | **platform** |
| `champion-mastery-v4` | Top 3 champions | `GET /lol/champion-mastery/v4/champion-masteries/by-puuid/{puuid}/top?count=N` | **platform** |
| `tournament-v5` (or `tournament-stub-v5`) | Provider + tournament + code lifecycle | various | **americas regional** (Tournament is single-region global) |

### Authentication
Every request carries the `X-Riot-Token: $RIOT_API_KEY` header. Client lives in `src/lib/riot/client.ts` + `src/lib/riot/tournament.ts`.

### Region mapping
Two maps in `src/lib/riot/regions.ts`:

- **Platform → Regional** for `account-v1`. AMERICAS/EUROPE/ASIA only — `account-v1` does not exist on `sea.api.riotgames.com` (that's match-v5-only). PH/SG/TH/TW/VN/OCE all map to ASIA / AMERICAS accordingly.
- **Platform → Tournament-V5 region enum** (`NA`/`EUW`/`KR`/etc) for Tournament codes. SEA platforms (PH/SG/TH/TW/VN) are NOT supported by Tournament-V5 — those servers don't run tournament custom games.

---

## 2. League integration link flow

Two-step: see `../05-integrations-league.md` for user-facing steps.

Implementation file map:
- `src/lib/actions/integrations.actions.ts`:
  - `startLeagueLinkVerification(uid, riotId, region)` — step 1
  - `confirmLeagueLinkVerification(uid)` — step 2 + transactional claim
  - `cancelLeagueLinkVerification(uid)` — user abandon
  - `unlinkLeagueAccount(uid)` — transactional cleanup
  - `refreshLeagueStats(uid, manual)` — 5min cooldown / 6h staleness
- `src/lib/riot/client.ts` — typed `fetchAccountByRiotId`, `fetchSummonerByPuuid`, `fetchLeagueEntries`, `fetchTopMastery`
- `src/lib/riot/assets.ts` — `championIconUrl`, `profileIconUrl`, `tierColour`, `formatRank`
- `src/components/profile/LeagueLinkPanel.tsx` — three-state UI (idle / verifying / linked)
- `src/components/profile/LinkedGameCard.tsx` — public profile widget

### Profile-icon challenge implementation
`startLeagueLinkVerification`:
1. Validate Riot ID format (`Name#TAG`).
2. `fetchAccountByRiotId` → PUUID.
3. **Pre-check** `/league_account_owners/{puuid}` — short-circuit if already claimed by a different uid.
4. `fetchSummonerByPuuid` → current `profileIconId`.
5. Pick a random icon from `VERIFICATION_ICON_POOL = [1..28]` excluding the current icon. These are the 28 default profile icons every account has unlocked since launch.
6. Write the pending doc with `expiresAt = now + 10 min`.

`confirmLeagueLinkVerification`:
1. Read the pending doc, check expiry.
2. `fetchSummonerByPuuid` again → live `profileIconId`.
3. Compare to the stored target.
4. Build the snapshot (`buildLeagueSnapshot`).
5. Run a transaction:
   - Re-check `/league_account_owners/{puuid}` (race protection).
   - Write the owners doc claiming the PUUID.
   - Write the integration doc.
   - Delete the pending doc.

The transaction wins-exactly-once semantics handle the simultaneous-link-attempt race.

### Why icons 1–28 specifically
Riot has hundreds of profile icons but most are gated (event/seasonal/skin-pack). IDs 1–28 are the default champion-themed icons every account can equip via `Profile → Edit profile icon`. Universally available, instantly reversible. Same set Battlefy / Toornament / Challengermode use.

---

## 3. The Tournament-V5 flow

End-to-end pipeline for auto-verified LoL tournaments.

### Provider registration (once per region per ClanForge instance)
`ensureRiotProvider(region)` (in `src/lib/actions/riot-tournament.actions.ts`):
1. Look up `/system/riot/providers/{REGION}` — if cached, return providerId.
2. Else `registerProvider({ region, url: RIOT_CALLBACK_URL })` → returns int.
3. Cache the providerId on the system doc + log.

### Tournament registration (once per tournament)
`ensureRiotTournament(tournamentId)`:
1. Check tournament doc — needs `gameProvider === "league"` and a `riotRegion`.
2. If `riotTournamentId` already set, return it.
3. Else call `ensureRiotProvider(riotRegion)` then `registerTournament({ providerId, name })` → returns int.
4. Persist `riotTournamentId` on the tournament doc.

### Code minting (one per non-bye match)
`mintMatchCode(tournamentId, matchId)`:
1. Load both participants' linked Riot accounts to get their PUUIDs.
2. If either is missing, refuse (bracket gen swallows the error and proceeds; admin can `regenerateMatchCode` later once the user links).
3. Build `CodeParameters`:
   ```ts
   {
     mapType: "SUMMONERS_RIFT",
     pickType: "TOURNAMENT_DRAFT",
     spectatorType: "LOBBYONLY",
     teamSize: 5,
     enoughPlayers: true,
     allowedParticipants: [captainA_puuid, captainB_puuid],
     metadata: signMetadata({ tournamentId, matchId })
   }
   ```
4. `createTournamentCodes(riotTournamentId, 1, params)` → array of code strings.
5. Save the code on the match doc.

### Metadata signing (`src/lib/riot/tournament-metadata.ts`)
```ts
metaData = `${tournamentId}:${matchId}:${HMAC-SHA256(`${tournamentId}:${matchId}`, RIOT_METADATA_SECRET)}`
```
HMAC-SHA256 with `RIOT_METADATA_SECRET`, hex-encoded. Verified with `timingSafeEqual` to avoid timing leaks.

### Callback (`POST /api/webhooks/riot/tournament`)
1. Parse JSON body.
2. `verifyMetadata(body.metaData)` — HMAC check. 401 on failure.
3. Load the match doc by `{tournamentId, matchId}` from the verified metadata. 404 if absent.
4. Idempotency: if `match.status === "complete"`, return `{ received: true, idempotent: true }`.
5. Cross-check the claimed code against `match.riotTournamentCode`. 401 on mismatch (catches an HMAC-valid attacker pointing the result at a different match).
6. Load both captains' PUUIDs from their league integrations.
7. Match the winning team's PUUIDs (`body.winningTeam[].puuid`) against the captains. The captain whose PUUID is on the winning team is the winner.
8. If neither captain is on the winning team — flag the match `disputed` with a clear reason. Don't auto-finalise. Returns `{ received: true, action: "flagged" }`.
9. Call `finaliseTournamentMatch` (in `src/lib/actions/_match-result-core.ts`) — the shared finaliser used by manual reports, simulate, and webhook. Runs all XP / clan-XP / mission side-effects identically regardless of source.

### Webhook context
The handler wraps everything in `runInWebhookContext(() => ...)` AFTER metadata verification. Downstream helpers (`awardXp`, `trackMissionProgress`) call `inWebhookContext()` and skip their session check, since there's no session cookie on a Riot-originated POST.

---

## 4. Stub vs production

`RIOT_TOURNAMENT_USE_STUB` env flag flips the base path:
- `"true"` (default) → `/lol/tournament-stub/v5/*`
- `"false"` → `/lol/tournament/v5/*`

Stub is enabled on regular dev keys. Production requires Riot Tournament API approval (separate from the regular LoL production key).

### What the stub does NOT do
- **No real callbacks.** The stub never POSTs to your callback URL because there are no real games. You can mint codes that look real but they don't accept players. The `simulateRiotMatchResult` admin action is the dev-mode substitute.
- **`GET /codes/{code}` returns canned data.** `metaData: "metadata"` — not the value we sent. Doesn't affect production (real Tournament-V5 preserves it).

### Switching to production
1. Apply at https://developer.riotgames.com → Apps → Tournament API.
2. Wait for approval (manual review by Riot).
3. Set `RIOT_TOURNAMENT_USE_STUB=false` on Vercel.
4. Re-register the provider (delete the cached `/system/riot/providers/{REGION}` doc → next LoL tournament re-registers via the prod endpoint).
5. Update `RIOT_CALLBACK_URL` to your real production URL (pin a custom domain on Vercel first if you haven't).
6. Redeploy.

---

## 5. Admin / debug levers

In `src/lib/actions/riot-tournament.actions.ts`:

| Action | Tier | Use case |
|---|---|---|
| `mintMatchCode(t, m)` | (creator-side, called by generateBracket) | Bracket generation |
| `regenerateMatchCode(t, m)` | creator or admin | Replay scenarios, accidental codes |
| `simulateRiotMatchResult(t, m, winnerUid)` | admin only | Pre-prod testing — fakes a Riot callback |
| `adminFinalizeMatch(t, m, winnerUid, scoreA, scoreB)` | creator or admin | Manual override for disputes |
| `reconcileLeagueMatch(t, m)` | signed-in | Polling fallback — confirms the code is healthy. Not used in v1 since prod callbacks haven't landed yet. |

All five route through `finaliseTournamentMatch` in `_match-result-core.ts`, so XP/missions/clan-XP fire identically regardless of source. The `resultSource` field on the match doc records which path it came from for audit purposes.

---

## 6. Rate-limiting strategy

Dev keys: **20 req/sec, 100 req/2 min** per region. We stay well under both via:

- **6-hour cache** on the linked-account widget snapshot.
- **5-minute cooldown** on the manual refresh button.
- **Tournament code minting is one-shot per match**, not per render.
- **No bulk listing of Riot data** anywhere.

Production keys have much higher limits (negotiated with Riot). If we ever exceed limits, the user-facing error path returns "Riot API rate-limited — try again in a moment" rather than failing silently.

---

## 7. Error shape

Riot client throws `RiotApiError` / `RiotTournamentError` with `status` + `body`. Server actions catch + map:

```ts
if (err instanceof RiotApiError) {
  if (err.status === 404) return { error: "Riot ID not found in that region" };
  if (err.status === 401 || err.status === 403)
    return { error: "Riot API key invalid or expired" };
  if (err.status === 429) return { error: "Riot API rate-limited" };
  return { error: `Riot API error (${err.status})` };
}
```

The `(no captain on winning team)` case is the only "the callback worked but the result is ambiguous" path — flagged as `disputed` rather than dropped, so the admin can resolve.

---

## 8. PUUID uniqueness invariant

A PUUID can only ever be claimed by one ClanForge profile at a time. Enforced by:

- `/league_account_owners/{puuid}` doc with `{ uid, claimedAt }`.
- Confirmation transaction reads it inside `runTransaction` → only one writer wins on contention.
- Unlink (user-initiated or admin-forced) deletes it.

This is the security property that prevents two users from both claiming the same Riot identity (and thereby both showing the same rank on their public profiles, or competing in the same tournament under one Riot account).

When debugging "I tried to link my account and it says it's already claimed" support cases:
1. Search `/admin/integrations` by puuid prefix to find the current owner.
2. The current owner can `Unlink` themselves OR an admin can `Force-unlink` (audit-logged + Discord-alerted) to release the lock.

---

## 9. Match result audit trail

Every match that gets finalised carries a `resultSource` field:

- `manual` — user submitted via the existing report-result flow.
- `riot_callback` — Riot Tournament-V5 webhook (production).
- `riot_poll` — polling fallback (reserved; not exercised yet).
- `admin_override` — `adminFinalizeMatch`.
- `admin_simulate` — `simulateRiotMatchResult` (dev/staging only).

The bracket view renders distinct badges per source. The match doc also stores `riotResultRaw` (the verbatim callback body) for any callback-sourced result, which preserves Riot's view of the game in case the result is later disputed.
