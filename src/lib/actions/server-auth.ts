import { cookies } from "next/headers";

/**
 * Extracts and verifies the session cookie, returning the authenticated UID.
 * Throws with "Unauthenticated" if no valid session exists.
 * Use inside any server action that mutates user-owned data.
 */
export async function getSessionUid(): Promise<string> {
  const { adminAuth } = await import("@/lib/firebase/admin");
  const sessionCookie = cookies().get("session")?.value;
  if (!sessionCookie) throw new Error("Unauthenticated");
  const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
  return decoded.uid;
}

/**
 * Like getSessionUid but also asserts the user has isAdmin=true on their profile.
 * Throws "Forbidden" if the session is valid but the user is not an admin.
 * Use inside server actions that are admin-only (challenge/season management, etc.).
 * NOTE: Next.js layout guards only run in the browser; server actions are callable
 * directly via HTTP POST, so every admin action must verify this independently.
 */
export async function getAdminUid(): Promise<string> {
  const { adminAuth, adminDb } = await import("@/lib/firebase/admin");
  const sessionCookie = cookies().get("session")?.value;
  if (!sessionCookie) throw new Error("Unauthenticated");
  const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
  const snap = await adminDb.collection("profiles").doc(decoded.uid).get();
  if (!snap.exists || !snap.data()?.isAdmin) throw new Error("Forbidden");
  return decoded.uid;
}
