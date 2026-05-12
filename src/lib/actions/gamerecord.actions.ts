"use server";

import type { GameRecord } from "@/types";

// ── Response shape ────────────────────────────────────────────────────────────

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

// ── addGameRecord ─────────────────────────────────────────────────────────────
// Adds a new game record to /profiles/{uid}/gameRecords.
// Returns the newly created document ID.

export async function addGameRecord(
  uid: string,
  data: Omit<GameRecord, "id" | "userId" | "createdAt">,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");

    const ref = await adminDb
      .collection("profiles")
      .doc(uid)
      .collection("gameRecords")
      .add({
        ...data,
        userId: uid,
        createdAt: new Date(),
      });

    return { success: true, data: { id: ref.id } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add game record";
    console.error("[addGameRecord]", err);
    return { success: false, error: message };
  }
}

// ── updateGameRecord ──────────────────────────────────────────────────────────
// Verifies the record lives under /profiles/{uid}/gameRecords/{recordId}
// (i.e. the record belongs to this user), then applies the patch.

export async function updateGameRecord(
  uid: string,
  recordId: string,
  data: Partial<Omit<GameRecord, "id" | "userId" | "createdAt">>,
): Promise<ActionResult> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");

    // Ownership check — if the document doesn't exist under this uid's
    // subcollection, a real user can't own it.
    const recordRef = adminDb
      .collection("profiles")
      .doc(uid)
      .collection("gameRecords")
      .doc(recordId);

    const snap = await recordRef.get();
    if (!snap.exists) {
      return { success: false, error: "Game record not found or access denied" };
    }

    await recordRef.update({ ...data });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update game record";
    console.error("[updateGameRecord]", err);
    return { success: false, error: message };
  }
}

// ── deleteGameRecord ──────────────────────────────────────────────────────────
// Verifies ownership then permanently removes the document.

export async function deleteGameRecord(
  uid: string,
  recordId: string,
): Promise<ActionResult> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");

    const recordRef = adminDb
      .collection("profiles")
      .doc(uid)
      .collection("gameRecords")
      .doc(recordId);

    // Ownership is implicit: the path includes uid — if the doc doesn't
    // exist here, the record either never existed or belongs to someone else.
    const snap = await recordRef.get();
    if (!snap.exists) {
      return { success: false, error: "Game record not found or access denied" };
    }

    await recordRef.delete();

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete game record";
    console.error("[deleteGameRecord]", err);
    return { success: false, error: message };
  }
}
