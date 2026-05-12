"use server";

import type { Profile } from "@/types";

// ── Response shape ────────────────────────────────────────────────────────────

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

// ── updateProfile ─────────────────────────────────────────────────────────────
// Merges `data` into /profiles/{uid}, always stamping updatedAt.
// NOTE: does NOT migrate the /usernames collection — call a dedicated rename
// action if the username field changes.

export async function updateProfile(
  uid: string,
  data: Partial<Omit<Profile, "id" | "createdAt">>,
): Promise<ActionResult> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");

    await adminDb.collection("profiles").doc(uid).update({
      ...data,
      updatedAt: new Date(),
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update profile";
    console.error("[updateProfile]", err);
    return { success: false, error: message };
  }
}

// ── checkUsernameAvailable ────────────────────────────────────────────────────
// Looks up /usernames/{username.toLowerCase()}.
// Returns data.available = true when the doc does NOT exist.

export async function checkUsernameAvailable(
  username: string,
): Promise<ActionResult<{ available: boolean }>> {
  try {
    if (!username || username.length < 3) {
      return { success: true, data: { available: false } };
    }

    const { adminDb } = await import("@/lib/firebase/admin");

    const snap = await adminDb
      .collection("usernames")
      .doc(username.toLowerCase())
      .get();

    return { success: true, data: { available: !snap.exists } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to check username";
    console.error("[checkUsernameAvailable]", err);
    return { success: false, error: message };
  }
}

// ── uploadAvatarUrl ───────────────────────────────────────────────────────────
// Persists a Storage download URL that was already uploaded client-side.

export async function uploadAvatarUrl(
  uid: string,
  downloadUrl: string,
): Promise<ActionResult> {
  try {
    if (!downloadUrl.startsWith("https://")) {
      return { success: false, error: "Invalid download URL" };
    }

    const { adminDb } = await import("@/lib/firebase/admin");

    await adminDb.collection("profiles").doc(uid).update({
      avatarUrl: downloadUrl,
      updatedAt: new Date(),
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save avatar URL";
    console.error("[uploadAvatarUrl]", err);
    return { success: false, error: message };
  }
}
