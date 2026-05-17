# Profile & Account

Everything tied to a single user identity.

---

## 1. Account creation

Sign up via **email + password** (Firebase Authentication). On registration the user picks:

- **Display name** — shown across the site. 1–40 characters. Editable later.
- **Username** — `lowercase_letters_numbers_underscores`, 3–20 chars. Used in the profile URL (`/profile/<username>`). Editable later, but the URL changes accordingly.

After sign-up the user is redirected through the onboarding dashboard which surfaces the daily mission grant for that day.

### Banned accounts

A banned user cannot sign in. The session-cookie endpoint refuses to mint a session for an auth user whose `disabled` flag is set. Existing sessions are also invalidated within seconds of the ban — Firebase revokes refresh tokens, and the next request fails `verifySessionCookie(_, checkRevoked: true)`.

---

## 2. Public profile (`/profile/<username>`)

Anyone signed in can view someone else's public profile. It surfaces:

- **Hero card:** avatar, display name + username, clan tag (if any), bio, country, optional custom banner + animated background.
- **Stats row:** tournaments played, tournaments won, win rate, current clan.
- **Game Records tab:** linked-game widgets (e.g. League of Legends) followed by the user's manually-entered game records.
- **Clan section:** the user's clan card if they're in one, or a "Browse clans" CTA if not.

If the profile is **private** (toggle in settings), anyone except the owner sees a "this profile is private" screen instead — only the hero card with display name + clan tag remains visible.

---

## 3. Profile edit (`/profile/edit`)

Owner-only. Sections from top to bottom:

### Avatar
JPG/PNG/WebP, max 5 MB. Uploaded server-side to avoid CORS. Live progress bar; live preview before save.

### Basic Info
Display name, username (with live availability check), bio (max 200 chars, with live char counter), country dropdown.

### Platform Links
Optional Steam URL, Xbox Gamertag, PSN ID, Discord tag, Twitch URL. Visible on the public profile when set.

### My Games
**Manual game records.** Add games you play with W/L/D, peak rank, hours, notes. One record can be flagged "featured" to surface it first. Manual records are owner-claimed (no verification).

Plus the **Linked Accounts** section — currently League of Legends only — which goes through the verification flow detailed in [05-integrations-league.md](./05-integrations-league.md).

### Privacy
- **Private profile** (toggle):
  - **Off (default):** profile appears in player search and is fully visible to anyone signed in.
  - **On:** profile is excluded from search and directory queries; visitors see a privacy screen with only your display name + clan tag.

### Appearance
- **Banner image** (top of profile hero, optional, custom upload).
- **Page background:** a selectable animated theme (`aurora`, `pulse`, etc.) OR a custom uploaded image. Custom image takes precedence when set.
- **Accent colour** — overrides the default Arena indigo for your profile only.

All appearance changes are scoped to your own profile only — they don't affect other users' rendering.

---

## 4. What happens when…

- **You change your username.** The old profile URL stops resolving; visitors land on a 404. Anyone with the old link should be re-pointed.
- **You leave a clan.** A 10-hour cooldown begins before you can re-join a clan. Additionally, the `clan_join` XP grant is once-per-clan-id, so re-joining the same clan never grants XP again regardless of cooldown.
- **You unlink a Riot account.** Cached stats are deleted, the PUUID lock is released, and the account becomes re-linkable on any ClanForge profile.
- **An admin bans you.** All sessions are revoked, you can no longer sign in, and your profile shows a banned badge to admins viewing your detail page.
