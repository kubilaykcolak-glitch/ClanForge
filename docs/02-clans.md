# Clans

A clan is a persistent group of players. Each clan has a public hub page, its own feed, member roles, and shared progression via clan XP + clan missions.

---

## 1. Creating a clan

Any signed-in user can create one via `/clans/create`. Required:

- **Clan name** — 3–32 characters.
- **Clan tag** — 1–4 uppercase letters, used as a player-prefix (e.g. `[LCK]`). Globally unique.
- **Slug** — auto-derived from the name; reserved at creation in a `/clanSlugs/{slug}` doc so two clans can't share a URL.
- **Description, banner, avatar** — optional cosmetic fields.
- **Game focus** — free text describing the clan's primary game(s).
- **Privacy:**
  - **Public (default):** anyone can read the clan page, see members, see posts, and request to join.
  - **Private:** only members can read the clan page or posts. Non-members see a join-request screen.

The creator is automatically made the clan **leader** and is the only member at creation.

---

## 2. Roles

Each member's role lives at `/clans/{clanId}/members/{userId}.role`:

| Role | Can manage members | Can edit clan settings | Can transfer ownership | Notes |
|---|---|---|---|---|
| **leader** | yes | yes | yes | Exactly one per clan. Can grant/revoke officer. |
| **officer** | yes (accept/reject joins, kick members) | partial (cosmetic only) | no | Multiple allowed. |
| **member** | no | no | no | Default for everyone who joins. |
| **pending** | n/a | n/a | n/a | Transient state for clans with manual approval. |

### Leader-only actions
- Transfer ownership to another member (promotes them to leader, demotes the current leader to officer).
- Edit `clanTag` (uppercase 1–4 chars, globally unique).
- Delete the clan (also deletes the slug reservation).

### Officer-and-above
- Kick a regular member.
- Accept or reject pending join requests.
- Pin clan posts (cosmetic).

---

## 3. Joining a clan

From a public clan page, any non-member can hit **Join**. Two paths:

- **Open join** (default for public clans): the user becomes a member immediately.
- **Approval required**: clan opt-in. New requests land as `pending` members; an officer or leader accepts or rejects from the members panel.

Joining is gated by a **10-hour cooldown** after leaving a clan (`CLAN_JOIN_COOLDOWN_HOURS` in `src/lib/xp.ts`) — prevents farming join XP. Note: the `clan_join` XP rule is additionally `once_per_target` so re-joining the same clan grants nothing regardless of cooldown.

---

## 4. The clan feed (`/clans/<slug>`)

Member-only feed of clan posts:

- **Compose post** — any member can post. Text + optional image upload.
- **Likes** — anyone signed in can like a post; the like count is denormalised on the post doc and the underlying like lives at `/clans/{clanId}/posts/{postId}/likes/{userId}`.
- **Author-only delete/edit** — only the post author can modify their post.

Posts are read-restricted by clan privacy (see §1).

### Announcements (leader-only)

Clan leaders see an extra **📣 Announce** toggle on the compose box. Posts created with the toggle on:

- Get an `isAnnouncement: true` flag on the doc and render with an accent border + "📣 Announcement" pill, distinct from regular posts.
- **Fan out an in-app notification to every confirmed clan member** (the bell icon in the navbar; deep-links to the announcement's anchor on the clan page).
- Are **rate-limited to 3 announcements per clan per rolling 24 hours** to prevent notification spam.

Non-leaders cannot create announcements — the UI toggle is hidden AND the server action re-verifies leader role AND a Firestore rule blocks any client-side write that tries to set `isAnnouncement: true`. Defence in depth.

`pinnedUntil` field exists in the schema for future "stick this announcement to the top" behaviour but isn't surfaced in the compose UI yet.

---

## 5. Clan missions

In addition to personal missions (see [04-missions-xp.md](./04-missions-xp.md)), every clan gets **its own daily and weekly mission set** that all members contribute to collaboratively.

- **5 daily** templates, **6 weekly** templates. Examples:
  - `member_active_day` — N members log in on a given day.
  - `tournament_match_win` — clan members win N tournament matches.
  - `tournament_solo_streak` — a single member hits 3 tournament wins in one bracket.
  - `tournament_clan_squad` — 3+ clan members all in the same tournament.
  - `tournament_top_place` — clan member finishes top 3 in any tournament.
  - `tournament_run_complete` — a clan member's own tournament finalises.
- **Reward distribution on completion:**
  - The clan gets a one-shot `clanXpReward` deposit.
  - Every contributing member gets a one-shot `memberXpReward` deposit on their personal XP ledger.
- The contributors map (`{ [uid]: count }`) is server-only — clients can never write it, so a member can't fake contribution.

By design the action pool is high-effort + externally validated. There is no "post 5 messages in the feed" mission — that would be trivially farmable.

---

## 6. Clan XP and level

Clan XP is a separate ledger from personal XP. Sources:

- Tournament wins by members.
- Tournament wins by members of *finalised* tournaments (one-shot).
- Clan-mission completion.

`ClanLevelBadge` renders the level + tier (Bronze → Silver → Gold → Platinum → Diamond etc.), derived from `clanXp` thresholds in `src/lib/xp.ts`.

---

## 7. What happens when…

- **The leader leaves.** Disallowed. They must transfer ownership first, or delete the clan.
- **The last member leaves.** Clan stays in Firestore as an empty husk; cleanup is manual via the admin tools — automatic deletion would be hard to undo if accidental.
- **A member is kicked mid-tournament.** Their tournament registration is unaffected — clan and tournament participation are independent.
- **A clan is deleted.** Member docs and post docs are *not* cascaded; they become orphaned. The slug reservation is released so the slug can be reused.
