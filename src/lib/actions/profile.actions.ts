"use server";

import type { Profile } from "@/types";
import { getSessionUid } from "./server-auth";

// ── Response shape ────────────────────────────────────────────────────────────

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Field allowlist ─────────────────────────────────────────────────────────
//
// The shape of `Profile` includes privileged fields (isAdmin, xp, isVerified,
// banned*, tournamentsPlayed/Won) that must NEVER be writable from a
// `"use server"` endpoint reachable over the network — anything reachable via
// the RSC action body protocol is effectively a public mutation surface.
//
// We declare a hard allowlist and filter incoming `data` against it. Anything
// outside the allowlist is silently dropped so old/forged client payloads
// can't elevate state. The same allowlist is mirrored in Firestore rules so
// the direct-client-SDK write path can't be used to bypass either layer.
//
// Adding a new user-editable field is intentionally TWO edits (here AND in
// firestore.rules `isProfileFieldAllowed`) so we never forget the rule side.
type WriteableProfileKey =
  | "displayName"
  | "username"
  | "bio"
  | "country"
  | "steamUrl"
  | "xboxGamertag"
  | "psnId"
  | "discordTag"
  | "twitchUrl"
  | "avatarUrl"
  | "bannerUrl"
  | "backgroundId"
  | "backgroundImageUrl"
  | "accentColour";

const WRITEABLE_KEYS: ReadonlySet<WriteableProfileKey> = new Set<WriteableProfileKey>([
  "displayName",
  "username",
  "bio",
  "country",
  "steamUrl",
  "xboxGamertag",
  "psnId",
  "discordTag",
  "twitchUrl",
  "avatarUrl",
  "bannerUrl",
  "backgroundId",
  "backgroundImageUrl",
  "accentColour",
]);

// ── updateProfile ─────────────────────────────────────────────────────────────
// Merges `data` into /profiles/{uid}. The caller must be authenticated as uid.
// Only the WRITEABLE_KEYS allowlist is honoured — privileged fields supplied
// by a forged client are dropped before the Firestore write.

export async function updateProfile(
  uid: string,
  data: Partial<Omit<Profile, "id" | "createdAt">>,
): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    // Filter the caller payload down to the allowlist. Anything else is
    // silently dropped so stale client builds don't error out, but no
    // privileged field ever reaches the doc.
    const filtered: Record<string, unknown> = {};
    for (const key of Object.keys(data) as Array<keyof typeof data>) {
      if ((WRITEABLE_KEYS as Set<string>).has(key as string)) {
        filtered[key as string] = (data as Record<string, unknown>)[key as string];
      }
    }
    if (Object.keys(filtered).length === 0) {
      return { success: true };
    }

    const { adminDb } = await import("@/lib/firebase/admin");
    await adminDb.collection("profiles").doc(uid).update({
      ...filtered,
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
