"use server";

// ─── LoL match-history ingest + accessors ─────────────────────────────────────
//
// Owns the cache under /profiles/{uid}/match_history/{matchId}. Three public
// entry points:
//   - ingestRecentMatchesIfStale(uid)  → fire-and-forget background refresh
//   - refreshMyMatchHistory()           → user-triggered manual refresh, gated
//                                         by a 5-min cooldown
//   - getMyRecentMatches(uid, limit)    → read cache for render
//
// All writes go through the Admin SDK; client code never writes here.

import { getSessionUid } from "./server-auth";
import {
  fetchMatchById,
  fetchMatchIdsByPuuid,
  RiotApiError,
  type RiotMatch,
} from "@/lib/riot/client";
import { isLolPlatformRegion } from "@/lib/riot/regions";
import type { LeagueIntegration } from "@/types/integrations";
import type { MatchParticipantLite, MatchSummaryDoc } from "@/types/match-history";

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
}

// One Riot dev key allows ~20 req/s. We fetch up to 20 match details per
// ingest run (one /by-puuid/ids + N × /matches/{matchId}). To stay friendly,
// cap concurrency at 4 in-flight requests.
const INGEST_BATCH_SIZE       = 20;
const INGEST_CONCURRENCY      = 4;
const INGEST_STALENESS_MS     = 60 * 60 * 1000;  // 1 hour
const MANUAL_REFRESH_COOLDOWN = 5 * 60 * 1000;   // 5 minutes

const toMs = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (v instanceof Date)     return v.getTime();
  const d = (v as { toDate?: () => Date } | undefined)?.toDate?.();
  return d ? d.getTime() : 0;
};

// ── Normalise Riot's `info` block into our cached shape ─────────────────────
//
// Riot has historically published `gameDuration` in seconds (pre-patch 11.20)
// and milliseconds (post). We disambiguate by checking whether
// `gameStartTimestamp` is present: when it is, durations are in seconds.

function toSummary(match: RiotMatch): MatchSummaryDoc {
  const info = match.info;
  const startMs = info.gameStartTimestamp ?? info.gameCreation;
  const durationSec = info.gameStartTimestamp
    ? info.gameDuration
    : Math.round(info.gameDuration / 1000);

  const participants: MatchParticipantLite[] = info.participants.map(p => ({
    puuid:           p.puuid,
    riotIdGameName:  p.riotIdGameName,
    riotIdTagline:   p.riotIdTagline,
    summonerName:    p.summonerName,
    championId:      p.championId,
    championName:    p.championName,
    champLevel:      p.champLevel,
    teamId:          p.teamId,
    teamPosition:    p.teamPosition,
    kills:           p.kills,
    deaths:          p.deaths,
    assists:         p.assists,
    cs:              (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0),
    win:             p.win,
    summoner1Id:     p.summoner1Id,
    summoner2Id:     p.summoner2Id,
    items:           [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6],
    doubleKills:     p.doubleKills ?? 0,
    tripleKills:     p.tripleKills ?? 0,
    quadraKills:     p.quadraKills ?? 0,
    pentaKills:      p.pentaKills ?? 0,
    visionScore:     p.visionScore ?? 0,
    goldEarned:      p.goldEarned ?? 0,
    damageToChamps:  p.totalDamageDealtToChampions ?? 0,
  }));

  return {
    matchId:      match.metadata.matchId,
    queueId:      info.queueId,
    gameMode:     info.gameMode,
    gameVersion:  info.gameVersion,
    mapId:        info.mapId,
    platformId:   info.platformId,
    gameStartAt:  startMs,
    durationSec,
    participants,
    ingestedAt:   Date.now(),
  };
}

// ── Core ingest — used by both background trigger and manual refresh ────────
//
// Idempotent: skips matchIds we've already cached. Errors on a single match
// are swallowed (logged) so a transient 429/5xx for one match doesn't fail
// the whole batch.

interface IngestResult {
  inserted: number;
  skipped:  number;
  failed:   number;
}

async function ingestForIntegration(
  uid:         string,
  integration: LeagueIntegration,
  count:       number,
): Promise<IngestResult> {
  if (!isLolPlatformRegion(integration.account.region)) {
    return { inserted: 0, skipped: 0, failed: 0 };
  }

  const { adminDb } = await import("@/lib/firebase/admin");
  const cacheRef = adminDb.collection("profiles").doc(uid).collection("match_history");

  const matchIds = await fetchMatchIdsByPuuid(
    integration.account.puuid,
    integration.account.region,
    { count },
  );
  if (matchIds.length === 0) return { inserted: 0, skipped: 0, failed: 0 };

  // Which of these are already cached?
  const existing = await cacheRef
    .where("matchId", "in", matchIds.slice(0, 30))
    .get()
    .catch(() => ({ docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] }));
  const have = new Set(existing.docs.map(d => d.id));

  const todo = matchIds.filter(id => !have.has(id));
  if (todo.length === 0) return { inserted: 0, skipped: matchIds.length, failed: 0 };

  let inserted = 0;
  let failed   = 0;

  // Bounded concurrency to be friendly to the dev key's 20 req/s ceiling.
  for (let i = 0; i < todo.length; i += INGEST_CONCURRENCY) {
    const slice = todo.slice(i, i + INGEST_CONCURRENCY);
    const results = await Promise.allSettled(
      slice.map(id => fetchMatchById(id, integration.account.region)),
    );
    const batch = adminDb.batch();
    let touched = 0;
    for (const r of results) {
      if (r.status === "fulfilled") {
        const summary = toSummary(r.value);
        batch.set(cacheRef.doc(summary.matchId), summary);
        touched++;
      } else {
        failed++;
        const err = r.reason;
        // Don't spam logs on 404s for purged matches — Riot drops old data.
        if (!(err instanceof RiotApiError && err.status === 404)) {
          console.error("[match-history] fetchMatchById failed:", err);
        }
      }
    }
    if (touched > 0) {
      await batch.commit();
      inserted += touched;
    }
  }

  // Stamp the integration with the last ingest time so subsequent loads
  // know whether the cache is fresh.
  await adminDb
    .collection("profiles")
    .doc(uid)
    .collection("integrations")
    .doc("league")
    .update({ lastMatchIngestAt: new Date() })
    .catch(() => { /* tolerated — old integration docs may not allow this field via rules */ });

  return { inserted, skipped: matchIds.length - todo.length, failed };
}

// ── Public: fire-and-forget background staleness check ──────────────────────
//
// Called from the LoL profile section. Returns immediately if the cache is
// fresh; otherwise kicks off an ingest in the background and returns. The
// section renders whatever's currently cached.

export async function ingestRecentMatchesIfStale(uid: string): Promise<void> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const integSnap = await adminDb
      .collection("profiles").doc(uid)
      .collection("integrations").doc("league")
      .get();
    if (!integSnap.exists) return;

    const data = integSnap.data() ?? {};
    const lastIngest = toMs(data.lastMatchIngestAt);
    if (Date.now() - lastIngest < INGEST_STALENESS_MS) return;

    const integration: LeagueIntegration = {
      provider:   "league",
      linkedAt:   new Date(toMs(data.linkedAt)),
      lastSyncAt: new Date(toMs(data.lastSyncAt)),
      account:    data.account,
      snapshot:   data.snapshot,
    } as LeagueIntegration;

    // Fire-and-forget — don't await. Errors are logged inside the helper.
    void ingestForIntegration(uid, integration, INGEST_BATCH_SIZE).catch(err => {
      console.error("[match-history] background ingest failed:", err);
    });
  } catch (err) {
    console.error("[ingestRecentMatchesIfStale]", err);
  }
}

// ── Public: user-triggered refresh with cooldown ────────────────────────────

export async function refreshMyMatchHistory(): Promise<ActionResult<{ inserted: number }>> {
  let uid: string;
  try {
    uid = await getSessionUid();
  } catch {
    return { success: false, error: "Sign in to refresh." };
  }

  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const integRef = adminDb
      .collection("profiles").doc(uid)
      .collection("integrations").doc("league");
    const integSnap = await integRef.get();
    if (!integSnap.exists) return { success: false, error: "Link your Riot account first." };

    const data = integSnap.data() ?? {};
    const lastManual = toMs(data.lastMatchRefreshAt);
    const remaining = MANUAL_REFRESH_COOLDOWN - (Date.now() - lastManual);
    if (remaining > 0) {
      const secs = Math.ceil(remaining / 1000);
      return { success: false, error: `Try again in ${secs}s.` };
    }

    const integration: LeagueIntegration = {
      provider:   "league",
      linkedAt:   new Date(toMs(data.linkedAt)),
      lastSyncAt: new Date(toMs(data.lastSyncAt)),
      account:    data.account,
      snapshot:   data.snapshot,
    } as LeagueIntegration;

    const result = await ingestForIntegration(uid, integration, INGEST_BATCH_SIZE);
    await integRef.update({ lastMatchRefreshAt: new Date() }).catch(() => { /* swallow */ });

    return { success: true, data: { inserted: result.inserted } };
  } catch (err) {
    console.error("[refreshMyMatchHistory]", err);
    return { success: false, error: err instanceof Error ? err.message : "Refresh failed" };
  }
}

// ── Public: read cache for render ───────────────────────────────────────────

export async function getMyRecentMatches(
  uid:   string,
  limit: number,
): Promise<MatchSummaryDoc[]> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb
      .collection("profiles").doc(uid)
      .collection("match_history")
      .orderBy("gameStartAt", "desc")
      .limit(limit)
      .get();
    return snap.docs.map(d => d.data() as MatchSummaryDoc);
  } catch (err) {
    console.error("[getMyRecentMatches]", err);
    return [];
  }
}
