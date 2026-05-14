"use server";

// ─── Clan-name availability checks + backfill ─────────────────────────────────
//
// The uniqueness index lives at /clanNameKeys/{normalizedKey} with shape:
//   { clanId: string }
// Doc id = the output of normalizeClanName(name).
//
// On any path that creates or renames a clan, the caller MUST:
//   1. Compute the key with normalizeClanName(name)
//   2. Call checkClanNameAvailable to look up /clanNameKeys
//   3. Write the new key doc as part of the same batch / transaction as the
//      clan doc — never on its own
//
// On disband or rename, the OLD key doc must be deleted.

import { MIN_NAME_KEY_LENGTH, normalizeClanName } from "@/lib/clan-name";

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
}

export interface NameCheckResult {
  available: boolean;
  /** Computed normalisation key (empty string when the name normalised to nothing). */
  nameKey:   string;
  /** When unavailable, "taken" tells the UI to show the copycat-protection wording. */
  reason?:   "too_short" | "taken" | "invalid";
}

/**
 * Check whether a clan name is unique enough to be created.
 *
 * @param name           the raw user-entered name
 * @param excludeClanId  pass the current clan's id when renaming, so a clan
 *                       isn't told "your existing name is taken by you"
 */
export async function checkClanNameAvailable(
  name:           string,
  excludeClanId?: string,
): Promise<ActionResult<NameCheckResult>> {
  try {
    const trimmed = (name ?? "").trim();
    if (!trimmed) {
      return { success: true, data: { available: false, nameKey: "", reason: "invalid" } };
    }

    const nameKey = normalizeClanName(trimmed);
    if (nameKey.length < MIN_NAME_KEY_LENGTH) {
      return { success: true, data: { available: false, nameKey, reason: "too_short" } };
    }

    const { adminDb } = await import("@/lib/firebase/admin");
    const keyRef = adminDb.collection("clanNameKeys").doc(nameKey);
    const snap = await keyRef.get();

    if (!snap.exists) {
      return { success: true, data: { available: true, nameKey } };
    }

    const existingClanId = (snap.data()?.clanId as string | undefined) ?? null;

    // Same clan checking their own name (e.g. rename without actually changing it).
    if (excludeClanId && existingClanId === excludeClanId) {
      return { success: true, data: { available: true, nameKey } };
    }

    return { success: true, data: { available: false, nameKey, reason: "taken" } };
  } catch (err) {
    console.error("[checkClanNameAvailable]", err);
    const message = err instanceof Error ? err.message : "Failed to check clan name";
    return { success: false, error: message };
  }
}

// ─── Lazy backfill ────────────────────────────────────────────────────────────
//
// Existing clans (created before this index was introduced) have no nameKey
// and no /clanNameKeys/{key} entry. Until they pick one up, they're invisible
// to checkClanNameAvailable — meaning a brand-new clan could pick an
// identical name to an old one.
//
// We patch this by calling backfillClanNameKey() from any server path that
// loads a clan. Over a short window of normal app use, every clan that's
// actually visited gets indexed.

export async function backfillClanNameKey(clanId: string): Promise<void> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const clanRef = adminDb.collection("clans").doc(clanId);

    const snap = await clanRef.get();
    if (!snap.exists) return;
    const data = snap.data()!;
    if (data.nameKey) return; // already indexed

    const nameKey = normalizeClanName((data.name as string) ?? "");
    if (!nameKey || nameKey.length < MIN_NAME_KEY_LENGTH) return;

    const keyRef = adminDb.collection("clanNameKeys").doc(nameKey);
    const keySnap = await keyRef.get();

    // If the key is already pointing at a DIFFERENT clan, do NOT steal it —
    // leave the older one as the canonical owner. This particular clan
    // just stays un-indexed (its name will still be allowed by the check
    // because the key points elsewhere). Real-world impact: minimal; only
    // happens when two legacy clans happen to normalise identically.
    if (keySnap.exists) {
      const owner = keySnap.data()?.clanId;
      if (owner && owner !== clanId) return;
    }

    const batch = adminDb.batch();
    batch.update(clanRef, { nameKey });
    batch.set(keyRef, { clanId });
    await batch.commit();
  } catch (err) {
    // Backfill is best-effort — never break the calling page if it fails.
    console.error("[backfillClanNameKey]", err);
  }
}
