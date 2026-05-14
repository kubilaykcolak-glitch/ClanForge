"use server";

// ─── Player listing server action ─────────────────────────────────────────────
//
// Single entry point used by both the server-component initial render of
// /players AND the client-side Load More button. Returns a slice of public
// player profiles for the requested sort order, with a serialisable cursor.
//
// Private filtering is done in JS (no composite index required). To absorb
// the loss from filtering, we over-fetch by 2x and slice down to PAGE_SIZE.
// If fewer than PAGE_SIZE survive the filter we just return what we have
// and rely on `nextCursor === null` to signal exhaustion.

import type { PlayerRow } from "@/components/player/PlayersClient";

export type PlayerSort =
  | "xp_desc"
  | "wins_desc"
  | "tournaments_desc"
  | "newest";

const PAGE_SIZE       = 24;
const OVERFETCH_RATIO = 2; // fetch 48, filter privates, return up to 24

const SORT_FIELD: Record<PlayerSort, { field: string; direction: "asc" | "desc" }> = {
  xp_desc:          { field: "xp",                direction: "desc" },
  wins_desc:        { field: "tournamentsWon",    direction: "desc" },
  tournaments_desc: { field: "tournamentsPlayed", direction: "desc" },
  newest:           { field: "createdAt",         direction: "desc" },
};

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
}

export interface PlayersPage {
  items:      PlayerRow[];
  /** Doc id of the last raw doc fetched (before privacy filtering). Pass back
   *  to getPlayers as `cursorDocId` to fetch the next page. */
  nextCursor: string | null;
}

const toMs = (v: unknown) =>
  (v as { toDate?: () => Date } | undefined)?.toDate?.().getTime() ?? Date.now();

function mapDoc(d: FirebaseFirestore.QueryDocumentSnapshot): PlayerRow {
  const data = d.data();
  return {
    id:                d.id,
    username:          (data.username           as string)        ?? "",
    displayName:       (data.displayName        as string)        ?? "",
    avatarUrl:         (data.avatarUrl          as string | undefined),
    bio:               (data.bio                as string | undefined),
    country:           (data.country            as string | undefined),
    steamUrl:          (data.steamUrl           as string | undefined),
    xboxGamertag:      (data.xboxGamertag       as string | undefined),
    psnId:             (data.psnId              as string | undefined),
    discordTag:        (data.discordTag         as string | undefined),
    twitchUrl:         (data.twitchUrl          as string | undefined),
    xp:                (data.xp                 as number)        ?? 0,
    tournamentsPlayed: (data.tournamentsPlayed  as number)        ?? 0,
    tournamentsWon:    (data.tournamentsWon     as number)        ?? 0,
    isVerified:        (data.isVerified         as boolean)       ?? false,
    isAdmin:           (data.isAdmin            as boolean)       ?? false,
    isPrivate:         (data.isPrivate          as boolean)       ?? false,
    clanId:            (data.clanId             as string | null) ?? null,
    clanTag:           (data.clanTag            as string | null) ?? null,
    clanSlug:          (data.clanSlug           as string | null) ?? null,
    clanName:          (data.clanName           as string | null) ?? null,
    bannerUrl:         (data.bannerUrl          as string | null) ?? null,
    backgroundId:      (data.backgroundId       as string | null) ?? null,
    accentColour:      (data.accentColour       as string | null) ?? null,
    createdAt:         toMs(data.createdAt),
    updatedAt:         toMs(data.updatedAt),
  };
}

export async function getPlayers(
  sort:         PlayerSort,
  cursorDocId?: string | null,
): Promise<ActionResult<PlayersPage>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const { field, direction } = SORT_FIELD[sort];

    let query = adminDb.collection("profiles").orderBy(field, direction);

    if (cursorDocId) {
      const cursorSnap = await adminDb.collection("profiles").doc(cursorDocId).get();
      if (cursorSnap.exists) {
        query = query.startAfter(cursorSnap);
      }
    }

    const overfetch = PAGE_SIZE * OVERFETCH_RATIO;
    const snap = await query.limit(overfetch).get();

    const filtered = snap.docs.filter(d => (d.data().isPrivate as boolean | undefined) !== true);
    const visible  = filtered.slice(0, PAGE_SIZE).map(mapDoc);

    // Cursor uses the last RAW doc (not the last visible one) so the next
    // page resumes correctly after privacy filtering.
    const lastRaw = snap.docs[snap.docs.length - 1];
    // If we fetched fewer than overfetch, Firestore has nothing more.
    const nextCursor = snap.docs.length < overfetch ? null : (lastRaw?.id ?? null);

    return { success: true, data: { items: visible, nextCursor } };
  } catch (err) {
    console.error("[getPlayers]", err);
    const message = err instanceof Error ? err.message : "Failed to load players";
    return { success: false, error: message };
  }
}
