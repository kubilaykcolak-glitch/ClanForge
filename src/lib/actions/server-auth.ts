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
