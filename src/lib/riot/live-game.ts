// ─── LoL Live Now aggregator ─────────────────────────────────────────────────
//
// Polls Riot's spectator-v5 endpoint for each linked LoL account in the
// viewer's clan (or globally, capped) and returns whoever is currently in a
// game. This is rate-limit sensitive — every linked account is one Riot
// request per refresh — so we:
//
//   - Cap the cohort to 20 puuids per call.
//   - Run with bounded concurrency (4 in-flight).
//   - Swallow 404s ("player not in game") via fetchActiveGameByPuuid.
//   - Wrap the whole thing in React `cache()` so a single render dedups
//     duplicate calls within the same request.
//
// The page-level refresh interval (60s default) is governed by the client
// island — not this module — so refresh cadence and rate-limit accounting
// stay co-located with the user-facing control.

import { cache } from "react";
import { fetchActiveGameByPuuid } from "@/lib/riot/client";
import type { LolPlatformRegion } from "@/lib/riot/regions";

export interface LiveGameRow {
  uid:           string;
  displayName:   string;
  avatarUrl?:    string | null;
  riotIdGameName: string;
  riotIdTagline:  string;
  region:        LolPlatformRegion;
  championId:    number;
  /** Seconds since game start. Negative / 0 means champ select / loading. */
  gameLengthSec: number;
  gameMode:      string;
  queueId:       number;
}

const MAX_COHORT = 20;
const CONCURRENCY = 4;

interface GetLiveGamesOpts {
  clanId?: string;
}

export const getLiveGames = cache(async (opts: GetLiveGamesOpts = {}): Promise<LiveGameRow[]> => {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");

    // ── Pick cohort: clan members, falling back to top global ladder ──
    const cohort: Array<{ uid: string; region: LolPlatformRegion; puuid: string; gameName: string; tagLine: string }> = [];

    if (opts.clanId) {
      const membersSnap = await adminDb
        .collection("clans").doc(opts.clanId)
        .collection("members").get();
      const memberUids = membersSnap.docs.map(d => d.id);
      if (memberUids.length === 0) return [];

      // Fetch each member's league integration in parallel (small clan-bounded set).
      const results = await Promise.all(
        memberUids.slice(0, MAX_COHORT).map(uid =>
          adminDb.collection("profiles").doc(uid)
            .collection("integrations").doc("league").get()
            .then(snap => ({ uid, snap }))
            .catch(() => ({ uid, snap: null as null }))
        )
      );
      for (const { uid, snap } of results) {
        if (!snap || !snap.exists) continue;
        const data = snap.data();
        const account = data?.account;
        if (!account?.puuid) continue;
        cohort.push({
          uid,
          region:   account.region as LolPlatformRegion,
          puuid:    account.puuid as string,
          gameName: (account.gameName as string) ?? "",
          tagLine:  (account.tagLine as string)  ?? "",
        });
      }
    } else {
      const integrationsSnap = await adminDb
        .collectionGroup("integrations")
        .where("provider", "==", "league")
        .limit(MAX_COHORT)
        .get();
      for (const doc of integrationsSnap.docs) {
        const uid = doc.ref.parent.parent?.id;
        if (!uid) continue;
        const data = doc.data();
        const account = data.account;
        if (!account?.puuid) continue;
        cohort.push({
          uid,
          region:   account.region as LolPlatformRegion,
          puuid:    account.puuid as string,
          gameName: (account.gameName as string) ?? "",
          tagLine:  (account.tagLine as string)  ?? "",
        });
      }
    }

    if (cohort.length === 0) return [];

    // ── Bounded-concurrency spectator probe ──
    const live: LiveGameRow[] = [];
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= cohort.length) return;
        const c = cohort[idx];
        try {
          const game = await fetchActiveGameByPuuid(c.puuid, c.region);
          if (!game) continue;
          const me = game.participants.find(p => p.puuid === c.puuid);
          if (!me) continue;
          live.push({
            uid:            c.uid,
            displayName:    "", // hydrated below
            avatarUrl:      null,
            riotIdGameName: c.gameName,
            riotIdTagline:  c.tagLine,
            region:         c.region,
            championId:     me.championId,
            gameLengthSec:  game.gameLength,
            gameMode:       game.gameMode,
            queueId:        game.gameQueueConfigId,
          });
        } catch (err) {
          console.error("[getLiveGames] spectator failure", { puuid: c.puuid, err });
          /* swallow — one bad puuid shouldn't block the rest */
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cohort.length) }, () => worker()));

    // ── Hydrate display names for the LIVE rows only ──
    await Promise.all(live.map(row =>
      adminDb.collection("profiles").doc(row.uid).get().then(snap => {
        if (snap.exists) {
          const p = snap.data();
          row.displayName = (p?.displayName as string) ?? "Unknown";
          row.avatarUrl   = (p?.avatarUrl   as string | null) ?? null;
        } else {
          row.displayName = "Unknown";
        }
      }).catch(() => { row.displayName = "Unknown"; })
    ));

    // Sort by longest game first (most likely to be exciting / mid-late game).
    live.sort((a, b) => b.gameLengthSec - a.gameLengthSec);
    return live;
  } catch (err) {
    console.error("[getLiveGames]", err);
    return [];
  }
});

/** Format a game length (seconds) as "12:34". */
export function formatGameLength(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
