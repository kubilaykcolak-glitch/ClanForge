// ─── Server-only notification helpers ────────────────────────────────────────
//
// NOT a "use server" file. Anything exported from a "use server" module is
// reachable as an RSC action endpoint by any signed-in client, which is the
// opposite of what we want for inbox writes: we never want a user to be able
// to inject arbitrary notifications (with their forged title / body / href)
// into another user's inbox.
//
// `import "server-only"` here triggers a build-time error if a client module
// transitively imports this file, defence-in-depth against accidental
// bundling. Use this from inside server actions and webhook routes ONLY.

import "server-only";

interface NotificationInput {
  type:         string;
  title:        string;
  body?:        string;
  href?:        string | null;
  clanId?:      string | null;
  challengeId?: string | null;
}

interface CreateResult {
  success: boolean;
  error?:  string;
}

export async function createNotification(
  uid:   string,
  notif: NotificationInput,
): Promise<CreateResult> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    await adminDb
      .collection("notifications").doc(uid)
      .collection("items")
      .add({ ...notif, read: false, createdAt: new Date() });
    return { success: true };
  } catch (err) {
    console.error("[createNotification]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to create notification" };
  }
}
