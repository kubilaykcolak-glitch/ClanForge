"use server";

// ─── Username reservation server action ──────────────────────────────────────
//
// Username uniqueness lives at /usernames/{username.toLowerCase()} → { uid }.
// Pre-audit-fix-L2, the client SDK wrote that doc directly during onboarding
// AND profile-edit. The Firestore rule only checked that the doc's `uid`
// matched the caller — so a single account could squat unlimited usernames
// by repeatedly creating different docs.
//
// claimUsername centralises the write through a transaction so:
//   1. We can reject if /usernames/{newName} already exists (uniqueness).
//   2. On a rename, we atomically remove the old /usernames/{oldName} doc
//      so the freed slot is immediately reusable.
//   3. profiles/{uid}.username stays in sync with the reservation doc.
//
// Direct client writes to /usernames are now blocked by the Firestore rule.

import { getSessionUid } from "./server-auth";
import { FieldValue } from "firebase-admin/firestore";

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
}

// Mirrors the regex used at the schema layer on the onboarding form.
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function normaliseUsername(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Reserve `newUsername` for the caller. Handles both initial claim
 * (no existing username) and rename (clears the previous reservation).
 *
 * Returns:
 *   - { success: true } on a successful claim
 *   - { success: true, data: { unchanged: true } } when the requested
 *     username is already the caller's own (idempotent no-op)
 *   - { success: false, error: ... } on validation / collision / forbidden
 */
export async function claimUsername(
  newUsername: string,
): Promise<ActionResult<{ unchanged?: boolean }>> {
  try {
    const sessionUid = await getSessionUid();
    const normalised = normaliseUsername(newUsername);

    if (!USERNAME_RE.test(normalised)) {
      return {
        success: false,
        error: "Username must be 3–20 chars, lowercase letters / numbers / underscores only.",
      };
    }

    const { adminDb } = await import("@/lib/firebase/admin");

    const profileRef    = adminDb.collection("profiles").doc(sessionUid);
    const newUserNameRef = adminDb.collection("usernames").doc(normalised);

    const result = await adminDb.runTransaction(async tx => {
      const [profileSnap, newSnap] = await Promise.all([
        tx.get(profileRef),
        tx.get(newUserNameRef),
      ]);

      const currentUsername = profileSnap.exists
        ? (profileSnap.data()!.username as string | undefined)
        : undefined;

      // Idempotent no-op: caller already owns this username.
      if (currentUsername === normalised) {
        return { unchanged: true as const };
      }

      // Collision: someone else has it. (Or — defensive — a stranded doc
      // pointing at this uid. The uid check below makes the latter case
      // an idempotent claim rather than a collision.)
      if (newSnap.exists) {
        const owner = (newSnap.data() as { uid?: string } | undefined)?.uid;
        if (owner && owner !== sessionUid) {
          return { error: "That username is already taken." };
        }
        // Stranded reservation pointing at us — overwrite cleanly below.
      }

      // Clear the previous reservation if this is a rename. We DO NOT
      // delete a doc that points at someone else (would happen if state
      // was inconsistent) — only one that points at us.
      if (currentUsername && currentUsername !== normalised) {
        const oldRef = adminDb.collection("usernames").doc(currentUsername);
        const oldSnap = await tx.get(oldRef);
        if (oldSnap.exists && (oldSnap.data() as { uid?: string }).uid === sessionUid) {
          tx.delete(oldRef);
        }
      }

      // Claim the new one and stamp the profile.
      tx.set(newUserNameRef, { uid: sessionUid });
      if (profileSnap.exists) {
        tx.update(profileRef, {
          username:  normalised,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      return { ok: true as const };
    });

    if ("error" in result && result.error) {
      return { success: false, error: result.error };
    }
    if ("unchanged" in result && result.unchanged) {
      return { success: true, data: { unchanged: true } };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to reserve username";
    console.error("[claimUsername]", err);
    return { success: false, error: message };
  }
}
