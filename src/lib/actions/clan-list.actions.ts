"use server";

// ─── Clan listing server action ───────────────────────────────────────────────
//
// Used by ClansClient for:
//   - Paginated public-clan browse (sort + cursor)
//   - Name prefix search across public clans

export type ClanSort = "members" | "newest" | "recruiting";

export interface ClanRow {
  id:           string;
  name:         string;
  slug:         string;
  description?: string;
  bannerUrl?:   string;
  avatarUrl?:   string;
  gameFocus:    string;
  tags:         string[];
  ownerId:      string;
  isPublic:     boolean;
  isRecruiting: boolean;
  memberLimit:  number;
  memberCount:  number;
  xp:           number;
  clanTag?:     string | null;
  createdAt:    number;
  updatedAt:    number;
}

export interface ClansPage {
  items:      ClanRow[];
  nextCursor: string | null;
}

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
}

const PAGE_SIZE = 12;

function mapDoc(d: FirebaseFirestore.QueryDocumentSnapshot): ClanRow {
  const data = d.data();
  const toMs = (v: unknown) =>
    (v as { toDate?: () => Date } | undefined)?.toDate?.().getTime() ?? Date.now();
  return {
    id:           d.id,
    name:         (data.name         as string)  ?? "",
    slug:         (data.slug         as string)  ?? "",
    description:  data.description   as string   | undefined,
    bannerUrl:    data.bannerUrl      as string   | undefined,
    avatarUrl:    data.avatarUrl      as string   | undefined,
    gameFocus:    (data.gameFocus    as string)   ?? "",
    tags:         (data.tags         as string[]) ?? [],
    ownerId:      (data.ownerId      as string)   ?? "",
    isPublic:     (data.isPublic     as boolean)  ?? false,
    isRecruiting: (data.isRecruiting as boolean)  ?? false,
    memberLimit:  (data.memberLimit  as number)   ?? 0,
    memberCount:  (data.memberCount  as number)   ?? 0,
    xp:           (data.xp           as number)   ?? 0,
    clanTag:      data.clanTag       as string    | null ?? null,
    createdAt:    toMs(data.createdAt),
    updatedAt:    toMs(data.updatedAt),
  };
}

// ── Sort config ───────────────────────────────────────────────────────────────

// "recruiting" uses an extra equality filter (isRecruiting==true) rather than
// a different sort field — handled separately in getClanList.
const SORT_CONFIG: Record<
  "members" | "newest",
  { field: string; direction: FirebaseFirestore.OrderByDirection }
> = {
  members: { field: "memberCount", direction: "desc" },
  newest:  { field: "createdAt",   direction: "desc" },
};

// ── Paginated browse ──────────────────────────────────────────────────────────

export async function getClanList(
  sort:        ClanSort,
  cursorDocId?: string | null,
  /** Optional equality filter on the `gameFocus` field (display name, e.g.
   * "League of Legends"). Used by the per-game hub Clans section. When set,
   * this adds an extra (isPublic, gameFocus, sortField) composite index. */
  gameFocus?:  string | null,
): Promise<ActionResult<ClansPage>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");

    let query: FirebaseFirestore.Query = adminDb
      .collection("clans")
      .where("isPublic", "==", true);

    if (gameFocus) {
      query = query.where("gameFocus", "==", gameFocus);
    }

    if (sort === "recruiting") {
      // Filter to recruiting clans only, ordered by member count.
      // Uses the (isPublic, isRecruiting, memberCount desc) composite index
      // — or (isPublic, gameFocus, isRecruiting, memberCount desc) when game
      // filter is also present.
      query = query
        .where("isRecruiting", "==", true)
        .orderBy("memberCount", "desc");
    } else {
      const { field, direction } = SORT_CONFIG[sort];
      query = query.orderBy(field, direction);
    }

    if (cursorDocId) {
      const cursorSnap = await adminDb.collection("clans").doc(cursorDocId).get();
      if (cursorSnap.exists) {
        query = query.startAfter(cursorSnap);
      }
    }

    const snap = await query.limit(PAGE_SIZE + 1).get();
    const hasMore    = snap.docs.length > PAGE_SIZE;
    const items      = snap.docs.slice(0, PAGE_SIZE).map(mapDoc);
    const nextCursor = hasMore ? (snap.docs[PAGE_SIZE - 1]?.id ?? null) : null;

    return { success: true, data: { items, nextCursor } };
  } catch (err) {
    console.error("[getClanList]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load clans",
    };
  }
}

// ── Name prefix search ────────────────────────────────────────────────────────
//
// Requires a (isPublic, name asc) composite index in firestore.indexes.json.

export async function searchClans(
  q: string,
): Promise<ActionResult<ClanRow[]>> {
  if (!q.trim()) return { success: true, data: [] };

  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const normalized = q.trim();

    const snap = await adminDb
      .collection("clans")
      .where("isPublic", "==", true)
      .orderBy("name")
      .startAt(normalized)
      .endAt(normalized + "")
      .limit(24)
      .get();

    return { success: true, data: snap.docs.map(mapDoc) };
  } catch (err) {
    console.error("[searchClans]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Search failed",
    };
  }
}
