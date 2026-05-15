"use server";

// ─── Season server actions ─────────────────────────────────────────────────────

import { getAdminUid } from "./server-auth";

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
}

const toMs = (v: unknown) =>
  (v as { toDate?: () => Date } | undefined)?.toDate?.().getTime() ?? Date.now();

export interface SeasonRow {
  id:          string;
  name:        string;
  description: string;
  startAt:     number;
  endAt:       number;
  status:      "upcoming" | "active" | "completed";
  createdAt:   number;
}

function mapSeason(d: FirebaseFirestore.QueryDocumentSnapshot): SeasonRow {
  const data = d.data();
  return {
    id:          d.id,
    name:        (data.name        as string) ?? "",
    description: (data.description as string) ?? "",
    startAt:     toMs(data.startAt),
    endAt:       toMs(data.endAt),
    status:      (data.status      as SeasonRow["status"]) ?? "upcoming",
    createdAt:   toMs(data.createdAt),
  };
}

export async function createSeason(input: {
  name:         string;
  description?: string;
  startAt:      Date;
  endAt:        Date;
}): Promise<ActionResult<{ id: string }>> {
  try {
    await getAdminUid();

    const { adminDb } = await import("@/lib/firebase/admin");
    const now = new Date();
    const status = input.startAt > now ? "upcoming" : input.endAt < now ? "completed" : "active";

    const ref = await adminDb.collection("seasons").add({
      ...input,
      description: input.description ?? "",
      status,
      createdAt: now,
    });

    return { success: true, data: { id: ref.id } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to create season" };
  }
}

export async function getAllSeasons(): Promise<ActionResult<SeasonRow[]>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb
      .collection("seasons")
      .orderBy("startAt", "desc")
      .limit(20)
      .get();
    return { success: true, data: snap.docs.map(mapSeason) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to fetch seasons" };
  }
}

export async function getActiveSeason(): Promise<ActionResult<SeasonRow | null>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb
      .collection("seasons")
      .where("status", "==", "active")
      .orderBy("startAt", "desc")
      .limit(1)
      .get();

    return {
      success: true,
      data:    snap.empty ? null : mapSeason(snap.docs[0]),
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to fetch season" };
  }
}

export async function updateSeasonStatus(
  seasonId: string,
  status:   "upcoming" | "active" | "completed",
): Promise<ActionResult> {
  try {
    await getAdminUid();

    const { adminDb } = await import("@/lib/firebase/admin");
    await adminDb.collection("seasons").doc(seasonId).update({ status });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to update" };
  }
}
