"use server";

// ─── Leaderboard server actions ────────────────────────────────────────────────

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
}


export interface LeaderboardEntry {
  rank:         number;
  clanId:       string;
  clanName:     string;
  clanSlug:     string;
  clanAvatarUrl: string | null;
  clanTag:      string | null;
  memberCount:  number;
  points:       number;
  /** Total clan XP — used to display the level badge on the leaderboard. */
  clanXp:       number;
}

export type LeaderboardPeriod = "weekly" | "monthly" | "alltime" | "season";

export async function getClanLeaderboard(
  period:   LeaderboardPeriod,
  seasonId?: string,
  limit:    number = 25,
): Promise<ActionResult<LeaderboardEntry[]>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");

    let snap: FirebaseFirestore.QuerySnapshot;

    if (period === "weekly") {
      snap = await adminDb
        .collection("clan_points")
        .orderBy("weeklyPoints", "desc")
        .limit(limit)
        .get();
    } else if (period === "monthly") {
      snap = await adminDb
        .collection("clan_points")
        .orderBy("monthlyPoints", "desc")
        .limit(limit)
        .get();
    } else if (period === "season" && seasonId) {
      // Season points are a map field — sort in JS (Firestore can't sort map sub-fields)
      const allSnap = await adminDb.collection("clan_points").get();
      const entries: LeaderboardEntry[] = allSnap.docs
        .map((d, i) => {
          const data = d.data();
          const pts = ((data.seasonPoints as Record<string, number>) ?? {})[seasonId] ?? 0;
          return {
            rank:          i + 1,
            clanId:        (data.clanId        as string) ?? d.id,
            clanName:      (data.clanName      as string) ?? "",
            clanSlug:      (data.clanSlug      as string) ?? "",
            clanAvatarUrl: (data.clanAvatarUrl as string | null) ?? null,
            clanTag:       (data.clanTag       as string | null) ?? null,
            memberCount:   (data.memberCount   as number) ?? 0,
            points:        pts,
            clanXp:        (data.clanXp        as number) ?? 0,
          };
        })
        .filter(e => e.points > 0)
        .sort((a, b) => b.points - a.points)
        .slice(0, limit)
        .map((e, i) => ({ ...e, rank: i + 1 }));
      return { success: true, data: entries };
    } else {
      // alltime
      snap = await adminDb
        .collection("clan_points")
        .orderBy("totalPoints", "desc")
        .limit(limit)
        .get();
    }

    const entries: LeaderboardEntry[] = snap.docs.map((d, i) => {
      const data  = d.data();
      const pts =
        period === "weekly"  ? (data.weeklyPoints  as number) ?? 0 :
        period === "monthly" ? (data.monthlyPoints as number) ?? 0 :
                               (data.totalPoints   as number) ?? 0;
      return {
        rank:          i + 1,
        clanId:        (data.clanId        as string) ?? d.id,
        clanName:      (data.clanName      as string) ?? "",
        clanSlug:      (data.clanSlug      as string) ?? "",
        clanAvatarUrl: (data.clanAvatarUrl as string | null) ?? null,
        clanTag:       (data.clanTag       as string | null) ?? null,
        memberCount:   (data.memberCount   as number) ?? 0,
        points:        pts,
        clanXp:        (data.clanXp        as number) ?? 0,
      };
    }).filter(e => e.points > 0);

    return { success: true, data: entries };
  } catch (err) {
    console.error("[getClanLeaderboard]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to load leaderboard" };
  }
}

// ── Player XP leaderboard ─────────────────────────────────────────────────────

export interface PlayerLeaderboardEntry {
  rank:        number;
  uid:         string;
  username:    string;
  displayName: string;
  avatarUrl:   string | null;
  xp:          number;
  level:       number;
}

export async function getPlayerLeaderboard(
  limit = 25,
): Promise<ActionResult<PlayerLeaderboardEntry[]>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");

    // Fetch extra entries to account for private profiles being filtered out
    const snap = await adminDb
      .collection("profiles")
      .orderBy("xp", "desc")
      .limit(limit * 3)
      .get();

    const entries: PlayerLeaderboardEntry[] = snap.docs
      .map(d => {
        const data = d.data();
        const xp   = (data.xp as number) ?? 0;
        return {
          rank:        0,
          uid:         d.id,
          username:    (data.username    as string) ?? "",
          displayName: (data.displayName as string) ?? "",
          avatarUrl:   (data.avatarUrl   as string | null) ?? null,
          xp,
          level:       Math.floor(xp / 1000) + 1,
          isPrivate:   (data.isPrivate   as boolean) ?? false,
        };
      })
      .filter(e => !e.isPrivate && e.username)
      .slice(0, limit)
      .map((e, i) => {
        const { isPrivate: _, ...rest } = e as typeof e & { isPrivate: boolean };
        return { ...rest, rank: i + 1 };
      });

    return { success: true, data: entries };
  } catch (err) {
    console.error("[getPlayerLeaderboard]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to load player leaderboard" };
  }
}

export async function getClanRank(
  clanId:  string,
  period:  LeaderboardPeriod,
): Promise<ActionResult<number | null>> {
  try {
    const result = await getClanLeaderboard(period, undefined, 100);
    if (!result.success || !result.data) return { success: true, data: null };
    const entry = result.data.find(e => e.clanId === clanId);
    return { success: true, data: entry?.rank ?? null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to get rank" };
  }
}
