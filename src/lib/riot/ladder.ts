// ─── LoL ladder aggregation ──────────────────────────────────────────────────
//
// Builds a ranked list of linked LoL players by their solo-queue tier + LP.
// Uses a collection-group query across every /profiles/{uid}/integrations/
// document where provider === 'league'. Sorted in-memory because tier is a
// categorical string Firestore can't sort on directly.
//
// Reads scale with the number of linked accounts — fine for hundreds, would
// need a denormalised /ladder collection if it grew into the thousands.
//
// The result is wrapped in React `cache()` so a single request rendering
// the section + the navbar Suspense doesn't fire duplicate Firestore reads.

import { cache } from "react";
import type { LeagueRankSnapshot, LeagueIntegration } from "@/types/integrations";

// Tier rank — higher is better. Master+ tiers ignore division.
export const TIER_RANK: Record<string, number> = {
  IRON:        1,
  BRONZE:      2,
  SILVER:      3,
  GOLD:        4,
  PLATINUM:    5,
  EMERALD:     6,
  DIAMOND:     7,
  MASTER:      8,
  GRANDMASTER: 9,
  CHALLENGER:  10,
};

const DIVISION_RANK: Record<string, number> = {
  IV: 0, III: 1, II: 2, I: 3,
};

/** Returns a numeric score suitable for descending sort. Higher = better. */
export function rankScore(snap: LeagueRankSnapshot | null | undefined): number {
  if (!snap) return -1;
  const tier = TIER_RANK[snap.tier?.toUpperCase()] ?? 0;
  const div  = DIVISION_RANK[snap.division?.toUpperCase()] ?? 0;
  // tier × 10000 + div × 1000 + lp (clamped to 4 digits)
  return tier * 10_000 + div * 1_000 + Math.min(snap.lp ?? 0, 999);
}

export interface LadderRow {
  uid:         string;
  displayName: string;
  avatarUrl?:  string | null;
  riotIdGameName: string;
  riotIdTagline:  string;
  region:      string;
  tier:        string;
  division:    string;
  lp:          number;
  wins:        number;
  losses:      number;
  score:       number;
}

interface GetLeagueLadderOpts {
  /** If set, restrict to members of this clan. */
  clanId?:  string;
  /** Max rows returned. Default 50. */
  limit?:   number;
}

/**
 * Fetches the top-ranked linked LoL players.
 *
 * NOTE: requires the collection-group field override for `integrations.provider`
 * (see firestore.indexes.json). Without it the query throws FAILED_PRECONDITION
 * at runtime.
 */
export const getLeagueLadder = cache(async (opts: GetLeagueLadderOpts = {}): Promise<LadderRow[]> => {
  const limit = opts.limit ?? 50;
  try {
    const { adminDb } = await import("@/lib/firebase/admin");

    let memberFilter: Set<string> | null = null;
    if (opts.clanId) {
      const membersSnap = await adminDb
        .collection("clans").doc(opts.clanId)
        .collection("members").get();
      memberFilter = new Set(membersSnap.docs.map(d => d.id));
      if (memberFilter.size === 0) return [];
    }

    const integrationsSnap = await adminDb
      .collectionGroup("integrations")
      .where("provider", "==", "league")
      .get();

    const rows: LadderRow[] = [];
    const profileFetches: Promise<void>[] = [];

    integrationsSnap.docs.forEach(doc => {
      // doc.ref.path === /profiles/{uid}/integrations/league — uid is the
      // grandparent id (path segment before /integrations/).
      const uid = doc.ref.parent.parent?.id;
      if (!uid) return;
      if (memberFilter && !memberFilter.has(uid)) return;

      const data = doc.data() as LeagueIntegration;
      const solo = data.snapshot?.soloRank ?? null;
      if (!solo) return;
      const score = rankScore(solo);
      if (score < 0) return;

      const row: LadderRow = {
        uid,
        displayName:    "",
        avatarUrl:      null,
        riotIdGameName: data.account?.gameName ?? "",
        riotIdTagline:  data.account?.tagLine  ?? "",
        region:         (data.account?.region as string | undefined) ?? "",
        tier:           solo.tier ?? "",
        division:       solo.division ?? "",
        lp:             solo.lp ?? 0,
        wins:           solo.wins ?? 0,
        losses:         solo.losses ?? 0,
        score,
      };
      rows.push(row);
    });

    // Sort + truncate before the profile-name hydration so we only fetch the
    // names we'll actually render.
    rows.sort((a, b) => b.score - a.score);
    const top = rows.slice(0, limit);

    // Hydrate display names. Best-effort, fire concurrently.
    top.forEach(row => {
      profileFetches.push(
        adminDb.collection("profiles").doc(row.uid).get().then(snap => {
          if (snap.exists) {
            const p = snap.data();
            row.displayName = (p?.displayName as string) ?? "Unknown";
            row.avatarUrl   = (p?.avatarUrl   as string | null) ?? null;
          } else {
            row.displayName = "Unknown";
          }
        }).catch(() => {
          row.displayName = "Unknown";
        })
      );
    });
    await Promise.all(profileFetches);

    return top;
  } catch (err) {
    console.error("[getLeagueLadder]", err);
    return [];
  }
});

// `formatRank(tier, division)` lives in `@/lib/riot/assets` — append `${lp} LP`
// at the call site for the ladder display.
