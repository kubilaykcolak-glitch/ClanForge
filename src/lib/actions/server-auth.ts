import { cookies } from "next/headers";
import { inWebhookContext } from "@/lib/webhook-context";
import { isRole, meetsRole, type Role } from "@/lib/auth/roles";

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

// ─── Role-tier helpers ───────────────────────────────────────────────────────
//
// Authorization source-of-truth is the Firebase Custom Claim `role` set on
// the auth user. We fall back to the legacy `profiles.isAdmin` field during
// the migration period so existing admin users keep working until the
// bootstrap script (or admin grant flow) has set their claims. Once every
// admin has a claim, the fallback can be removed.

interface SessionWithRole {
  uid:  string;
  role: Role | null;
}

/**
 * Resolves the session uid AND their elevated role (if any) in a single
 * pass. Reads the Custom Claim from the verified session cookie; falls back
 * to the legacy `profiles.isAdmin` boolean for users who haven't been
 * migrated to claims yet (in which case the inferred role is "admin").
 */
export async function getSessionWithRole(): Promise<SessionWithRole> {
  const { adminAuth, adminDb } = await import("@/lib/firebase/admin");
  const sessionCookie = cookies().get("session")?.value;
  if (!sessionCookie) throw new Error("Unauthenticated");

  const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
  const claimRole = decoded.role;
  if (isRole(claimRole)) {
    return { uid: decoded.uid, role: claimRole };
  }

  // Legacy fallback — read profiles.isAdmin. Remove once all admins migrated.
  const snap = await adminDb.collection("profiles").doc(decoded.uid).get();
  if (snap.exists && snap.data()?.isAdmin) {
    return { uid: decoded.uid, role: "admin" };
  }

  return { uid: decoded.uid, role: null };
}

/**
 * Like getSessionUid but asserts the user has the required role tier.
 * Throws "Unauthenticated" if no session, "Forbidden" if session lacks the
 * required tier.
 *
 * Hierarchy: super_admin > admin > moderator. Requesting `moderator` is
 * satisfied by any of the three; requesting `super_admin` is satisfied only
 * by `super_admin`.
 */
export async function requireRole(required: Role): Promise<SessionWithRole> {
  const session = await getSessionWithRole();
  if (!meetsRole(session.role, required)) throw new Error("Forbidden");
  return session;
}

/** Returns the session uid iff the user is at least `admin`. */
export async function getAdminUid(): Promise<string> {
  const session = await requireRole("admin");
  return session.uid;
}

/** Returns the session uid iff the user is `super_admin`. */
export async function getSuperAdminUid(): Promise<string> {
  const session = await requireRole("super_admin");
  return session.uid;
}

/** Returns the session uid iff the user is at least `moderator`. */
export async function getModeratorUid(): Promise<string> {
  const session = await requireRole("moderator");
  return session.uid;
}
