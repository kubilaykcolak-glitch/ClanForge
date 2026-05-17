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

// Riot publishes Data Dragon versions at https://ddragon.leagueoflegends.com/api/versions.json
// We snapshot a known-good version per refresh; clients build asset URLs from it.
// Hardcoded for v1 — a future enhancement can fetch the latest at sync time.
const DDRAGON_VERSION = "14.24.1";

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
  // All three calls key off PUUID — fire them in parallel.
  const [summoner, leagueEntries, masteries] = await Promise.all([
    fetchSummonerByPuuid(puuid, region),
    fetchLeagueEntries(puuid, region).catch(() => []),
    fetchTopMastery(puuid, region, 3).catch(() => []),
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
    ddragonVersion: DDRAGON_VERSION,
  };
}

// ─── linkLeagueAccount ────────────────────────────────────────────────────────
//
// Resolves the user-entered Riot ID + region to a PUUID, fetches an initial
// snapshot, and writes /profiles/{uid}/integrations/league. Owner-only.

export async function linkLeagueAccount(
  uid: string,
  riotId: string,
  region: string,
): Promise<ActionResult<{
  gameName: string;
  tagLine:  string;
  snapshot: LeagueSnapshot;
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

    const account = await fetchAccountByRiotId(parsed.gameName, parsed.tagLine, region);
    const snapshot = await buildLeagueSnapshot(account.puuid, region);

    const { adminDb } = await import("@/lib/firebase/admin");
    const now = new Date();

    const doc: LeagueIntegration = {
      provider:   "league",
      linkedAt:   now,
      lastSyncAt: now,
      account: {
        puuid:    account.puuid,
        region,
        gameName: account.gameName,
        tagLine:  account.tagLine,
      },
      snapshot,
    };

    await adminDb
      .collection("profiles")
      .doc(uid)
      .collection("integrations")
      .doc("league")
      .set(doc);

    return {
      success: true,
      data: { gameName: account.gameName, tagLine: account.tagLine, snapshot },
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
    const message = err instanceof Error ? err.message : "Failed to link account";
    console.error("[linkLeagueAccount]", err);
    return { success: false, error: message };
  }
}

// ─── unlinkLeagueAccount ──────────────────────────────────────────────────────

export async function unlinkLeagueAccount(uid: string): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");
    await adminDb
      .collection("profiles")
      .doc(uid)
      .collection("integrations")
      .doc("league")
      .delete();

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
