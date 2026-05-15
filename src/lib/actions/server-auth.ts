import { cookies } from "next/headers";
import { inWebhookContext } from "@/lib/webhook-context";

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
 * Soft "auth-exists" gate for helpers that don't need the caller's UID — they
 * just need to confirm the call is reachable (either via a signed-in user
 * session OR via a verified webhook context). Used by awardXp, awardClanXp,
 * trackMissionProgress, trackClanMissionProgress: each is called server-to-
 * server from trusted contexts where a session cookie may not be present
 * (e.g. inside the Stripe webhook handler). Returns silently if a webhook
 * context is set; otherwise behaves like getSessionUid.
 *
 * NEVER use this where you actually need the caller's UID — call getSessionUid
 * directly and compare against the parameter. The webhook context bypass is
 * deliberately narrow.
 */
export async function requireAuthContext(): Promise<void> {
  if (inWebhookContext()) return;
  await getSessionUid();
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
