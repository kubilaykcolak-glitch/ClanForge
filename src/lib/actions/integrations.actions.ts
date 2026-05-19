"use server";

import { getSessionUid } from "@/lib/actions/server-auth";
import {
  fetchAccountByRiotId,
  fetchSummonerByPuuid,
  fetchLeagueEntries,
  fetchTopMastery,
  RiotApiError,
} from "@/lib/riot/client";
import {
  isLolPlatformRegion,
  type LolPlatformRegion,
} from "@/lib/riot/regions";
import type {
  LeagueIntegration,
  LeagueSnapshot,
  LeagueRankSnapshot,
} from "@/types/integrations";

// ─── Constants ────────────────────────────────────────────────────────────────

// Data Dragon version is fetched + cached by src/lib/riot/ddragon.ts
// (24h TTL, falls back to a baseline on network failure). Snapshotted onto
// each LeagueIntegration so the client can build deterministic asset URLs
// without re-fetching the version list per page.

const MANUAL_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;   // 5 minutes
const AUTO_REFRESH_STALENESS_MS  = 6 * 60 * 60 * 1000; // 6 hours

// ─── Result shape ─────────────────────────────────────────────────────────────

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Riot ID validation ───────────────────────────────────────────────────────

const RIOT_TAG_LINE_RE = /^[A-Za-z0-9]{2,5}$/;

// Lightweight format check — Riot performs the authoritative validation
// inside account-v1, returning 404 for anything malformed. We just ensure the
// shape is plausible (length bounds, no control chars, single tag delimiter).
function parseRiotId(raw: string): { gameName: string; tagLine: string } | null {
  const trimmed = raw.trim();
  const hashIdx = trimmed.lastIndexOf("#");
  if (hashIdx === -1) return null;
  const gameName = trimmed.slice(0, hashIdx).trim();
  const tagLine  = trimmed.slice(hashIdx + 1).trim();
  if (gameName.length < 3 || gameName.length > 16) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f#]/.test(gameName))               return null;
  if (!RIOT_TAG_LINE_RE.test(tagLine))             return null;
  return { gameName, tagLine };
}

// ─── Snapshot builder ─────────────────────────────────────────────────────────

function entryToRank(entry: { tier: string; rank: string; leaguePoints: number; wins: number; losses: number }): LeagueRankSnapshot {
  return {
    tier:     entry.tier,
    division: entry.rank ?? "",
    lp:       entry.leaguePoints ?? 0,
    wins:     entry.wins ?? 0,
    losses:   entry.losses ?? 0,
  };
}

async function buildLeagueSnapshot(
  puuid: string,
  region: LolPlatformRegion,
): Promise<LeagueSnapshot> {
  const { getDdragonVersion } = await import("@/lib/riot/ddragon");
  // All four calls fire in parallel — three keyed by PUUID, plus the
  // Data Dragon version resolver. The version call is essentially free
  // after the first cache-warm (24h in-process cache).
  const [summoner, leagueEntries, masteries, ddragonVersion] = await Promise.all([
    fetchSummonerByPuuid(puuid, region),
    fetchLeagueEntries(puuid, region).catch(() => []),
    fetchTopMastery(puuid, region, 3).catch(() => []),
    getDdragonVersion(),
  ]);

  const solo = leagueEntries.find(e => e.queueType === "RANKED_SOLO_5x5");
  const flex = leagueEntries.find(e => e.queueType === "RANKED_FLEX_SR");

  return {
    summonerLevel:  summoner.summonerLevel,
    profileIconId:  summoner.profileIconId,
    soloRank:       solo ? entryToRank(solo) : null,
    flexRank:       flex ? entryToRank(flex) : null,
    topChampions:   masteries.map(m => ({
      championId: m.championId,
      level:      m.championLevel,
      points:     m.championPoints,
    })),
    ddragonVersion,
  };
}

// ─── Ownership verification configuration ────────────────────────────────────
//
// Anti-fraud measure. Without RSO/OAuth (which requires separate Riot
// partnership approval) the next-best ownership proof is the profile-icon
// challenge — same approach Battlefy/Toornament/Challengermode use.
//
// We pick a target icon from the 28 default League profile icons (icon IDs
// 1..28) — these come with every account at creation and never need to be
// unlocked. The user has 10 minutes to set their LoL profile icon to it.

const VERIFICATION_ICON_POOL: readonly number[] = Array.from({ length: 28 }, (_, i) => i + 1);
const VERIFICATION_TTL_MS = 10 * 60 * 1000;

function pickTargetIcon(excludeIconId: number): number {
  // Exclude the icon the user currently has so they MUST take action.
  const choices = VERIFICATION_ICON_POOL.filter(i => i !== excludeIconId);
  return choices[Math.floor(Math.random() * choices.length)];
}

// ─── startLeagueLinkVerification ──────────────────────────────────────────────
//
// Step 1 of the two-step link flow:
//   1. Validate the Riot ID and resolve PUUID.
//   2. Pre-check PUUID uniqueness — short-circuit early if someone else
//      already owns this account (no point making the user wait through the
//      icon challenge for a doomed link).
//   3. Capture their current profile icon and pick a different target icon.
//   4. Persist a pending-verification doc and return the target icon details
//      to the UI.

export async function startLeagueLinkVerification(
  uid: string,
  riotId: string,
  region: string,
): Promise<ActionResult<{
  targetIconId:  number;
  initialIconId: number;
  gameName:      string;
  tagLine:       string;
  expiresAt:     string;
  ddragonVersion: string;
}>> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    if (!isLolPlatformRegion(region)) {
      return { success: false, error: "Unknown region" };
    }
    const parsed = parseRiotId(riotId);
    if (!parsed) {
      return { success: false, error: "Riot ID must look like Name#TAG" };
    }

    const account  = await fetchAccountByRiotId(parsed.gameName, parsed.tagLine, region);
    const { adminDb } = await import("@/lib/firebase/admin");

    // Early uniqueness check (the authoritative one is the transaction in
    // confirmLeagueLinkVerification — this just gives the user a fast "no"
    // before they bother changing their icon).
    const ownerSnap = await adminDb.collection("league_account_owners").doc(account.puuid).get();
    if (ownerSnap.exists) {
      const ownerUid = (ownerSnap.data() as { uid?: string }).uid;
      if (ownerUid && ownerUid !== uid) {
        return {
          success: false,
          error:   "This Riot account is already linked to another ClanForge profile. Unlink it there first.",
        };
      }
    }

    const { fetchSummonerByPuuid } = await import("@/lib/riot/client");
    const { getDdragonVersion }    = await import("@/lib/riot/ddragon");
    const [summoner, ddragonVersion] = await Promise.all([
      fetchSummonerByPuuid(account.puuid, region),
      getDdragonVersion(),
    ]);

    const initialIconId = summoner.profileIconId ?? 0;
    const targetIconId  = pickTargetIcon(initialIconId);
    const now           = new Date();
    const expiresAt     = new Date(now.getTime() + VERIFICATION_TTL_MS);

    await adminDb
      .collection("profiles").doc(uid)
      .collection("integrations_pending").doc("league")
      .set({
        puuid:         account.puuid,
        region,
        gameName:      account.gameName,
        tagLine:       account.tagLine,
        targetIconId,
        initialIconId,
        startedAt:     now,
        expiresAt,
      });

    return {
      success: true,
      data: {
        targetIconId,
        initialIconId,
        gameName:       account.gameName,
        tagLine:        account.tagLine,
        expiresAt:      expiresAt.toISOString(),
        ddragonVersion,
      },
    };
  } catch (err) {
    if (err instanceof RiotApiError) {
      if (err.status === 404) return { success: false, error: "Riot ID not found in that region" };
      if (err.status === 401 || err.status === 403) {
        return { success: false, error: "Riot API key invalid or expired — regenerate at developer.riotgames.com" };
      }
      if (err.status === 429) return { success: false, error: "Riot API rate-limited — try again in a moment" };
      return { success: false, error: `Riot API error (${err.status})` };
    }
    const message = err instanceof Error ? err.message : "Failed to start verification";
    console.error("[startLeagueLinkVerification]", err);
    return { success: false, error: message };
  }
}

// ─── confirmLeagueLinkVerification ────────────────────────────────────────────
//
// Step 2 of the two-step link flow:
//   1. Re-fetch summoner-v4 and verify the live profileIconId matches the
//      target we issued.
//   2. Build the initial snapshot.
//   3. Inside a Firestore transaction:
//        a. Re-check the owners doc for the PUUID. If someone else claimed it
//           in the meantime (race), abort cleanly.
//        b. Claim the PUUID for this uid (set /league_account_owners/{puuid}).
//        c. Write the LeagueIntegration doc.
//        d. Delete the pending-verification doc.
//   Returns the same shape as the old linkLeagueAccount so the UI's success
//   modal still works unchanged.

export async function confirmLeagueLinkVerification(
  uid: string,
): Promise<ActionResult<{
  gameName: string;
  tagLine:  string;
  snapshot: LeagueSnapshot;
}>> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");
    const pendingRef = adminDb
      .collection("profiles").doc(uid)
      .collection("integrations_pending").doc("league");

    const pendingSnap = await pendingRef.get();
    if (!pendingSnap.exists) {
      return { success: false, error: "No verification in progress. Start the link flow again." };
    }

    const pending = pendingSnap.data() as {
      puuid?:        string;
      region?:       string;
      gameName?:     string;
      tagLine?:      string;
      targetIconId?: number;
      expiresAt?:    { toDate?: () => Date } | Date | null;
    };

    const expiresAtMs = pending.expiresAt instanceof Date
      ? pending.expiresAt.getTime()
      : (pending.expiresAt as { toDate?: () => Date } | undefined)?.toDate?.().getTime() ?? 0;
    if (Date.now() > expiresAtMs) {
      await pendingRef.delete().catch(() => {});
      return { success: false, error: "Verification expired. Please start again." };
    }

    if (!pending.puuid || !pending.region || !isLolPlatformRegion(pending.region) || typeof pending.targetIconId !== "number") {
      return { success: false, error: "Pending verification is malformed. Start again." };
    }

    // Live check: does their profileIconId match what we asked for?
    const { fetchSummonerByPuuid } = await import("@/lib/riot/client");
    const summoner = await fetchSummonerByPuuid(pending.puuid, pending.region);
    if (summoner.profileIconId !== pending.targetIconId) {
      return {
        success: false,
        error:   `Profile icon doesn't match yet. Make sure you've changed it in the LoL client (it can take ~30s to refresh) and try again.`,
      };
    }

    // Build the snapshot before the transaction so the transaction stays short.
    const snapshot = await buildLeagueSnapshot(pending.puuid, pending.region);

    // ── Transactional uniqueness claim ───────────────────────────────────────
    const ownersRef = adminDb.collection("league_account_owners").doc(pending.puuid);
    const integrationRef = adminDb
      .collection("profiles").doc(uid)
      .collection("integrations").doc("league");
    const now = new Date();

    await adminDb.runTransaction(async tx => {
      const ownerSnap = await tx.get(ownersRef);
      if (ownerSnap.exists) {
        const ownerUid = (ownerSnap.data() as { uid?: string }).uid;
        if (ownerUid && ownerUid !== uid) {
          throw new Error("This Riot account is already linked to another ClanForge profile.");
        }
      }

      tx.set(ownersRef, {
        uid,
        puuid:     pending.puuid,
        claimedAt: now,
      });

      // Region was validated by isLolPlatformRegion above — safe cast.
      const integration: LeagueIntegration = {
        provider:   "league",
        linkedAt:   now,
        lastSyncAt: now,
        account: {
          puuid:    pending.puuid as string,
          region:   pending.region as LeagueIntegration["account"]["region"],
          gameName: pending.gameName ?? "",
          tagLine:  pending.tagLine ?? "",
        },
        snapshot,
      };
      tx.set(integrationRef, integration);
      tx.delete(pendingRef);
    });

    return {
      success: true,
      data: {
        gameName: pending.gameName ?? "",
        tagLine:  pending.tagLine ?? "",
        snapshot,
      },
    };
  } catch (err) {
    if (err instanceof RiotApiError) {
      if (err.status === 429) return { success: false, error: "Riot API rate-limited — try again in a moment" };
      return { success: false, error: `Riot API error (${err.status})` };
    }
    const message = err instanceof Error ? err.message : "Failed to confirm verification";
    console.error("[confirmLeagueLinkVerification]", err);
    return { success: false, error: message };
  }
}

// ─── cancelLeagueLinkVerification ─────────────────────────────────────────────
// Lets the user abandon a pending verification (e.g. they got the wrong icon
// or want to start over with a different Riot ID).

export async function cancelLeagueLinkVerification(uid: string): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");
    await adminDb
      .collection("profiles").doc(uid)
      .collection("integrations_pending").doc("league")
      .delete();
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to cancel";
    console.error("[cancelLeagueLinkVerification]", err);
    return { success: false, error: message };
  }
}

// ─── unlinkLeagueAccount ──────────────────────────────────────────────────────

export async function unlinkLeagueAccount(uid: string): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");

    // Read the integration to learn the PUUID — we need it to release the
    // uniqueness lock so the account can be re-linked elsewhere.
    const integrationRef = adminDb
      .collection("profiles").doc(uid)
      .collection("integrations").doc("league");
    const snap = await integrationRef.get();
    const puuid = snap.exists
      ? (snap.data() as { account?: { puuid?: string } }).account?.puuid ?? null
      : null;

    // Transactional cleanup: delete the integration doc + the uniqueness
    // claim, but ONLY release the claim if it actually points at this user
    // (defence against a stale write from a previous owner).
    await adminDb.runTransaction(async tx => {
      tx.delete(integrationRef);
      if (puuid) {
        const ownersRef = adminDb.collection("league_account_owners").doc(puuid);
        const ownerSnap = await tx.get(ownersRef);
        if (ownerSnap.exists && (ownerSnap.data() as { uid?: string }).uid === uid) {
          tx.delete(ownersRef);
        }
      }
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to unlink";
    console.error("[unlinkLeagueAccount]", err);
    return { success: false, error: message };
  }
}

// ─── refreshLeagueStats ───────────────────────────────────────────────────────
//
// `manual` true => triggered by a user click. Enforces a 5-minute cooldown.
// `manual` false => background refresh; only proceeds if snapshot is stale.

export async function refreshLeagueStats(
  uid: string,
  manual: boolean,
): Promise<ActionResult<{ lastSyncAt: string }>> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");
    const ref = adminDb.collection("profiles").doc(uid).collection("integrations").doc("league");
    const snap = await ref.get();
    if (!snap.exists) return { success: false, error: "No League account linked" };

    const existing = snap.data() as LeagueIntegration;
    const now      = new Date();

    const lastSyncMs = existing.lastSyncAt instanceof Date
      ? existing.lastSyncAt.getTime()
      : (existing.lastSyncAt as { toDate?: () => Date } | undefined)?.toDate?.().getTime()
        ?? 0;

    if (manual) {
      const lastManualMs = existing.lastManualRefreshAt instanceof Date
        ? existing.lastManualRefreshAt.getTime()
        : (existing.lastManualRefreshAt as { toDate?: () => Date } | undefined)?.toDate?.().getTime()
          ?? 0;
      if (now.getTime() - lastManualMs < MANUAL_REFRESH_COOLDOWN_MS) {
        return { success: false, error: "Please wait a few minutes before refreshing again" };
      }
    } else {
      // Auto refresh — skip if not stale.
      if (now.getTime() - lastSyncMs < AUTO_REFRESH_STALENESS_MS) {
        return { success: true, data: { lastSyncAt: new Date(lastSyncMs).toISOString() } };
      }
    }

    const region = existing.account.region as LolPlatformRegion;
    if (!isLolPlatformRegion(region)) {
      return { success: false, error: "Stored region is invalid" };
    }

    const fresh = await buildLeagueSnapshot(existing.account.puuid, region);

    await ref.update({
      snapshot:   fresh,
      lastSyncAt: now,
      ...(manual ? { lastManualRefreshAt: now } : {}),
    });

    return { success: true, data: { lastSyncAt: now.toISOString() } };
  } catch (err) {
    if (err instanceof RiotApiError && err.status === 429) {
      return { success: false, error: "Riot API rate-limited — try again in a moment" };
    }
    const message = err instanceof Error ? err.message : "Failed to refresh";
    console.error("[refreshLeagueStats]", err);
    return { success: false, error: message };
  }
}
