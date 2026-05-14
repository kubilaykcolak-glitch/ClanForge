"use server";

// ─── Tournament listing server action ─────────────────────────────────────────
//
// Used by TournamentsClient for:
//   - Per-status-tab paginated fetches (sort + cursor)
//   - Name prefix search across all statuses

export type TournamentStatusTab = "open" | "live" | "locked" | "complete";

export type TournamentSort = "soonest" | "prize" | "participants" | "newest";

export interface TournamentRow {
  id:                   string;
  name:                 string;
  game:                 string;
  status:               string;
  format:               string;
  maxParticipants:      number;
  participantCount:     number;
  prizePool:            number;
  entryFee:             number;
  isPaid:               boolean;
  bannerUrl?:           string;
  description?:         string;
  creatorId:            string;
  startsAt:             number;
  registrationClosesAt: number;
  rosterLockedAt:       number;
  createdAt:            number;
}

export interface TournamentsPage {
  items:      TournamentRow[];
  nextCursor: string | null;
}

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
}

const PAGE_SIZE = 12;

// Fields used for each sort option (all require a (status, field) composite index)
const SORT_FIELD: Record<
  TournamentSort,
  { field: string; direction: FirebaseFirestore.OrderByDirection }
> = {
  soonest:      { field: "startsAt",         direction: "asc"  },
  prize:        { field: "prizePool",        direction: "desc" },
  participants: { field: "participantCount", direction: "desc" },
  newest:       { field: "createdAt",        direction: "desc" },
};

function mapDoc(d: FirebaseFirestore.QueryDocumentSnapshot): TournamentRow {
  const data = d.data();
  const toMs = (v: unknown) =>
    (v as { toDate?: () => Date } | undefined)?.toDate?.().getTime() ?? Date.now();
  return {
    id:                   d.id,
    name:                 (data.name             as string) ?? "",
    game:                 (data.game             as string) ?? "",
    status:               (data.status           as string) ?? "",
    format:               (data.format           as string) ?? "",
    maxParticipants:      (data.maxParticipants  as number) ?? 0,
    participantCount:     (data.participantCount as number) ?? 0,
    prizePool:            (data.prizePool        as number) ?? 0,
    entryFee:             (data.entryFee         as number) ?? 0,
    isPaid:               (data.isPaid           as boolean) ?? false,
    bannerUrl:            data.bannerUrl         as string | undefined,
    description:          data.description       as string | undefined,
    creatorId:            (data.creatorId        as string) ?? "",
    startsAt:             toMs(data.startsAt),
    registrationClosesAt: toMs(data.registrationClosesAt),
    rosterLockedAt:       toMs(data.rosterLockedAt),
    createdAt:            toMs(data.createdAt),
  };
}

// ── Per-tab paginated fetch ───────────────────────────────────────────────────

export async function getTournamentTab(
  status:      TournamentStatusTab,
  sort:        TournamentSort,
  cursorDocId?: string | null,
): Promise<ActionResult<TournamentsPage>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const { field, direction } = SORT_FIELD[sort];

    let query = adminDb
      .collection("tournaments")
      .where("status", "==", status)
      .orderBy(field, direction);

    if (cursorDocId) {
      const cursorSnap = await adminDb.collection("tournaments").doc(cursorDocId).get();
      if (cursorSnap.exists) {
        query = query.startAfter(cursorSnap);
      }
    }

    const snap = await query.limit(PAGE_SIZE + 1).get();
    const hasMore = snap.docs.length > PAGE_SIZE;
    const items   = snap.docs.slice(0, PAGE_SIZE).map(mapDoc);
    const nextCursor = hasMore ? (snap.docs[PAGE_SIZE - 1]?.id ?? null) : null;

    return { success: true, data: { items, nextCursor } };
  } catch (err) {
    console.error("[getTournamentTab]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load tournaments",
    };
  }
}

// ── Name prefix search (across all statuses) ─────────────────────────────────
//
// Uses Firestore's lexicographic range to approximate a "starts with" query.
// The single-field index on `name` is automatic — no composite index needed
// because we don't combine with a status equality filter.

export async function searchTournaments(
  q: string,
): Promise<ActionResult<TournamentRow[]>> {
  if (!q.trim()) return { success: true, data: [] };

  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const normalized = q.trim();
    const end = normalized + "";

    const snap = await adminDb
      .collection("tournaments")
      .orderBy("name")
      .startAt(normalized)
      .endAt(end)
      .limit(24)
      .get();

    return { success: true, data: snap.docs.map(mapDoc) };
  } catch (err) {
    console.error("[searchTournaments]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Search failed",
    };
  }
}
