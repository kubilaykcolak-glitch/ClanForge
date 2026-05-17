# Firestore Schema

Top-down map of every collection ClanForge writes. Field-level detail is documented inline in `src/types/firestore.ts` and `src/types/integrations.ts`; this page is the bird's-eye view + rule contract for each.

---

## Top-level collections

### `/profiles/{userId}`
User profile + lifetime stats. Owner-write, signed-in read.

**Key fields:** `username`, `displayName`, `avatarUrl`, `bio`, `country`, platform links, `xp`, `tournamentsPlayed`, `tournamentsWon`, `isVerified`, `isAdmin` (legacy mirror), `isPrivate`, `clanId`/`clanTag`/`clanSlug`/`clanName` (denormalised), `bannerUrl`, `backgroundId`, `backgroundImageUrl`, `accentColour`, `lastClanLeaveAt`, `bannedAt`/`bannedBy`/`bannedReason`, `lastDailyLoginDate`, `lastClanActiveDate`.

**Rule:** `allow read: if isSignedIn(); allow write: if isOwner(userId);`

#### `/profiles/{userId}/gameRecords/{recordId}`
Manually-entered game records (non-integrated games). Owner-only read/write.

#### `/profiles/{userId}/missions_daily/{dateKey}`
Today's 3 daily missions for this user. Owner-read, **server-only write** (snapshotted rewards must not be client-writable).

#### `/profiles/{userId}/missions_weekly/{weekKey}`
This week's weekly mission. Same contract.

#### `/profiles/{userId}/integrations/{provider}`
Linked third-party game accounts. Signed-in read (for public profile widgets), server-only write. Currently `provider === "league"` only.

#### `/profiles/{userId}/integrations_pending/{provider}`
Mid-flight profile-icon verification. Owner-read, server-only write. Cleared after success / expiry.

---

### `/usernames/{username}`
Username uniqueness reservation. `{ uid }`. Public read (for live availability check), authenticated create, no update/delete.

---

### `/clans/{clanId}`
Clan documents.

**Key fields:** `name`, `slug`, `clanTag` (1–4 uppercase), `description`, `avatarUrl`, `bannerUrl`, `ownerId`, `memberCount`, `isPublic`, `requiresApproval`, `xp`, `gameFocus`, `recruitingStatus`, `createdAt`.

**Rule:** Public clans readable by any signed-in user; private clans readable only by members. Update by owner only (with extra clauses for `clanTag` mutation by leader).

#### `/clans/{clanId}/members/{userId}`
**Fields:** `userId`, `role` (`leader | officer | member | pending`), `joinedAt`.
**Rule:** Read by clan members or the member's owner; create by owner of the same uid; update/delete by self or leader/officer.

#### `/clans/{clanId}/posts/{postId}`
Clan feed posts. Read by clan members; create by clan members; update/delete by author only.

##### `/clans/{clanId}/posts/{postId}/likes/{userId}`
One like per user per post. Owner-write.

#### `/clans/{clanId}/clan_missions_daily/{dateKey}`
Daily clan mission set. Member-read, server-only write. Contributors map (`{ [uid]: count }`) is the integrity surface — never client-writable.

#### `/clans/{clanId}/clan_missions_weekly/{weekKey}`
Same contract as daily.

---

### `/clanSlugs/{slug}`
Clan slug uniqueness reservation. Public read, authenticated create.

---

### `/tournaments/{tournamentId}`
Tournament documents.

**Key fields:** `name`, `description`, `game`, `format`, `status` (`draft|open|locked|live|complete|cancelled`), `maxParticipants`, `participantCount`, `entryFee` (pence), `prizePool` (pence), `isPaid`, `prizeSplit`, `platformFeePct`, `rules`, `bannerUrl`, `creatorId`, `startsAt`, `registrationClosesAt`, `rosterLockedAt`, `createdAt`, plus the LoL-provider fields (`gameProvider`, `riotRegion`, `riotTournamentId`), and the admin-override fields (`forceCompletedAt`, `forceCompletedBy`, `forceCancelledAt`, `forceCancelledBy`).

**Rule:** Read by any signed-in user; create with `creatorId == request.auth.uid`; update/delete by creator only.

#### `/tournaments/{tournamentId}/participants/{userId}`
**Fields:** `userId`, `displayName`, `avatarUrl`, `seed`, `status`, `registeredAt`, plus payment fields (`paymentStatus`, `stripeCheckoutSessionId`, `stripePaymentIntentId`, `paidAmount`, `paidAt`, `refundedAt`).
**Rule:** Read by signed-in users; create by uid-owner; update by tournament creator EXCEPT for payment fields (server-only); delete by creator.

#### `/tournaments/{tournamentId}/matches/{matchId}`
**Fields:** `round`, `matchNumber`, `participantAId`, `participantBId`, `winnerId`, `scoreA`, `scoreB`, `status` (`pending|live|complete|disputed`), `scheduledAt`, `completedAt`, plus LoL integration (`riotTournamentCode`, `riotResultRaw`, `resultSource`).
**Rule:** Read by signed-in users; create by creator; update by creator OR match participant; delete by creator.

#### `/tournaments/{tournamentId}/prizes/{prizeId}`
Prize payouts. Computed at finalisation. Public read by signed-in users; server-only write.

---

### `/league_account_owners/{puuid}`
Global uniqueness lock for Riot PUUIDs. `{ uid, puuid, claimedAt }`. Signed-in read, server-only write inside a Firestore transaction.

---

### `/notifications/{userId}`
Container only. Read/write blocked at top level.

#### `/notifications/{userId}/items/{itemId}`
The actual notifications. Owner-read, owner-update (only to flip `read` flag), server-only create/delete.

---

### `/admin_audit/{id}`
Immutable audit log of every privileged admin action.

**Fields:** `actor`, `actorRole`, `action`, `targetType`, `targetId`, `reason`, `metadata`, `result`, `errorMsg`, `ip`, `at`.

**Rule:** Read by users with the `admin` or `super_admin` JWT claim (deliberately reads the signed claim, NOT `profiles.isAdmin` — the audit log is itself part of the security boundary). All writes go through the Admin SDK.

---

### `/system/riot/providers/{region}`
Singleton lookups for Riot Tournament-V5 provider IDs (one per region per ClanForge instance). Server-only.

### `/system/*`
No explicit rule. Default-deny → only Admin SDK can read/write.

---

## Subcollection rules summary

| Path | Read | Write |
|---|---|---|
| `/profiles/{uid}/gameRecords/*` | owner | owner |
| `/profiles/{uid}/missions_daily/*` | owner | server-only |
| `/profiles/{uid}/missions_weekly/*` | owner | server-only |
| `/profiles/{uid}/integrations/*` | signed-in | server-only |
| `/profiles/{uid}/integrations_pending/*` | owner | server-only |
| `/clans/{id}/members/*` | clan members | self or leader/officer |
| `/clans/{id}/posts/*` | clan members | clan member create; author edit/delete |
| `/clans/{id}/posts/*/likes/*` | signed-in | owner |
| `/clans/{id}/clan_missions_*/* ` | clan members | server-only |
| `/tournaments/{id}/participants/*` | signed-in | uid-owner create; creator non-payment update |
| `/tournaments/{id}/matches/*` | signed-in | creator or match participant |
| `/tournaments/{id}/prizes/*` | signed-in | server-only |
| `/notifications/{uid}/items/*` | owner | owner-update `read` only |
| `/admin_audit/*` | admin claim | server-only |
| `/league_account_owners/*` | signed-in | server-only |

---

## Composite indexes

Live in `firebase/firestore.indexes.json`. Add a new entry whenever you write a query that combines `where(...).orderBy(...)` on different fields. Common ones already in place:

- `matches.where("winnerId").where("status").get()` — used by the solo-streak detector.
- `admin_audit.where("action").orderBy("at")` — audit-log filter.
- `tournaments.where("status").orderBy("createdAt")` — admin list page.

If a query throws "FAILED_PRECONDITION: query requires an index" with a Firebase Console link, click the link to auto-add, then sync `firestore.indexes.json` from the console.
