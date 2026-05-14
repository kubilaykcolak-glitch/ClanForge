"use server";

import type { Profile } from "@/types";
import { getSessionUid } from "./server-auth";

// ── Response shape ────────────────────────────────────────────────────────────

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

// ── updateProfile ─────────────────────────────────────────────────────────────
// Merges `data` into /profiles/{uid}. The caller must be authenticated as uid.

export async function updateProfile(
  uid: string,
  data: Partial<Omit<Profile, "id" | "createdAt">>,
): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

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

// ── setProfilePrivacy ─────────────────────────────────────────────────────────

export async function setProfilePrivacy(
  uid: string,
  isPrivate: boolean,
): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");
    await adminDb.collection("profiles").doc(uid).update({
      isPrivate,
      updatedAt: new Date(),
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update privacy";
    console.error("[setProfilePrivacy]", err);
    return { success: false, error: message };
  }
}

// ── checkUsernameAvailable ────────────────────────────────────────────────────

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
// Persists a Storage download URL. The caller must be authenticated as uid.

export async function uploadAvatarUrl(
  uid: string,
  downloadUrl: string,
): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

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
