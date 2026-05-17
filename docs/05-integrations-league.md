# League of Legends Integration

Link a Riot account to a ClanForge profile. Once linked + verified, the user's live League rank, W/L, and top mastery champions render as a widget on their public profile, and they become eligible to enter LoL-provider tournaments.

---

## 1. Linking flow (two-step, with ownership verification)

From `/profile/edit` → **My Games** → **Linked Accounts** → **Link League of Legends**.

### Step 1 — Identify

User enters their **Riot ID** (`Name#TAG`) and **platform region** (NA, EUW, EUNE, KR, JP, BR, LAN, LAS, OCE, TR, RU, PH2, SG2, TH2, TW2, VN2).

Server-side:
1. Riot's account-v1 endpoint resolves the Riot ID → PUUID.
2. A **pre-check** runs against `/league_account_owners/{puuid}` — if the PUUID is already claimed by another ClanForge profile, the user gets a clear "already linked to another profile, unlink there first" error before the icon challenge.
3. Riot's summoner-v4 endpoint reads the user's **current profile icon** so the verification target can deliberately not be that.
4. A random icon is picked from the **28 default profile icons** every account has access to (icon IDs 1–28).
5. A pending-verification doc is written at `/profiles/{uid}/integrations_pending/league` with a **10-minute expiry**.
6. The UI swaps to step 2 with the target icon displayed large.

### Step 2 — Verify

User is shown:
- The target icon (big, with a glow).
- Step-by-step instructions: open LoL client → click profile icon → pick this icon → apply.
- A live 10-minute countdown.

User changes their LoL icon in the client → clicks **I've changed my icon → Confirm**.

Server-side:
1. summoner-v4 is re-fetched.
2. If the live `profileIconId` matches the target, the link is accepted. Otherwise: clear error ("still showing your old icon — it can take 30s to refresh, try again").
3. A snapshot is built (summoner level, solo+flex rank, top 3 mastery champs).
4. Inside a **Firestore transaction**:
   - Re-check `/league_account_owners/{puuid}` (race protection).
   - Claim the PUUID for this user.
   - Write the integration doc at `/profiles/{uid}/integrations/league`.
   - Delete the pending doc.

The user sees a **success modal** with their pulled rank, level, and mastery champs.

---

## 2. Why a profile-icon challenge?

Without Riot RSO/OAuth (which requires a separate partnership tier most projects can't get), the canonical ownership proof — used by Battlefy, Toornament, Challengermode — is to ask the user to change something inside the LoL client that a third party can't change without their password. The profile icon is universal (every account has the 28 defaults) and reversible.

10 minutes is a balance: long enough that a real user can comfortably hit it, short enough that a social-engineering window stays narrow.

---

## 3. The profile widget (`LinkedGameCard`)

On the user's public profile, in the Game Records tab, ahead of any manual records:

- **Game name** (League of Legends) + **Linked** chip.
- **Riot ID and region** (`Name#KR1 · KR`).
- **Rank chip** — tier + division + LP, coloured by tier (Iron-brown → Challenger-yellow). Shows "Unranked" if neither solo nor flex queue has any games.
- **W/L line** — current season wins, losses, and win-rate %.
- **Top 3 champions** — mastery icons (from CommunityDragon) with mastery level badges in the corner.
- **"Updated Xm ago"** + **Refresh** button (only visible to the profile owner).

Champion icons come from `https://raw.communitydragon.org/.../champion-icons/{id}.png` so we don't need to ship a championId → name map on the client.

---

## 4. Refresh policy

Two refresh paths:

- **Manual refresh** — owner clicks the **Refresh** button on the widget. Rate-limited to **once per 5 minutes** per user.
- **Auto-refresh** — when the widget is rendered AND the snapshot is older than **6 hours**, a background refresh fires.

Both write the same snapshot shape and the result is what powers the next render.

---

## 5. Unlink

From `/profile/edit` → Linked Accounts → **Unlink**. Triggers a Firestore transaction that:

1. Deletes the integration doc.
2. Releases `/league_account_owners/{puuid}` (only if it still points at the unlinking user — defensive against a stale write).

After unlink, the user can re-link the same or a different Riot account. The released PUUID is also re-linkable on a different ClanForge profile.

---

## 6. Tournament eligibility (LoL provider)

A tournament created with **League of Legends** as the game and a **region** picked gets `gameProvider: "league"` on the tournament doc. Registration into such a tournament additionally requires:

- The registering user has a linked + verified Riot account on `/profiles/{uid}/integrations/league`.
- (Future) The user's tier matches the tournament's tier restriction — see deferred TODO #3.

See [03-tournaments.md §6](./03-tournaments.md#6-lol-auto-verification-flow) for the full Tournament-V5 auto-verification flow.

---

## 7. Admin actions on integrations

From `/admin/integrations` (admin tier or higher):

- Search for any PUUID lock by PUUID prefix or ClanForge uid.
- **Force-unlink** a Riot account — useful when the user has lost access to their Riot account, or when two ClanForge profiles inadvertently shared one PUUID before uniqueness was enforced.
- Force-unlink runs the same transactional cleanup as the user-initiated unlink: deletes the integration doc, releases the owners doc, clears any pending verification.

Step-up password required. Audit-logged + Discord-alerted as `warn`.

---

## 8. What happens when…

- **The dev API key expires.** Every Riot call 401s with "Riot API key invalid or expired". Regenerate at https://developer.riotgames.com (dev keys last 24 hours), update `RIOT_API_KEY` in `.env.local` and on Vercel, redeploy.
- **Riot is rate-limiting us.** 429 responses surface a user-facing "rate-limited, try again in a moment" toast. Each per-user cache (6h widget, 5min manual refresh) is sized to stay well under the per-app limits.
- **The user's Riot ID changes (rename).** The stored `gameName`/`tagLine` go stale; the PUUID is still valid. Re-linking refreshes the stored name. Future enhancement: periodic auto-refresh of the account-v1 name fields.
- **The user transfers Riot accounts cross-region.** PUUID is global — still uniquely owned by them on ClanForge. Cached `region` may be stale but does not affect uniqueness or correctness for `summoner-v4`-keyed reads (those would 404; the polling fallback handles that gracefully).
- **A user banned in LoL.** summoner-v4 may 404 on next refresh. Snapshot stays at last-known values; the widget displays the cached rank until a successful refresh replaces it.
- **Two users simultaneously confirm verification for the same PUUID** (race). Both pass the icon check; the Firestore transaction lets exactly one win; the other gets a clear "already linked to another profile" error and the verification doc is preserved so they can retry against a different account.
