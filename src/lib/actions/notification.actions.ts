"use server";

// ─── Notification server actions ───────────────────────────────────────────────
//
// In-app notifications stored at /notifications/{uid}/items/{notifId}.
// The client reads these via a real-time hook (useNotifications in hooks.ts).

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
}

const toMs = (v: unknown) =>
  (v as { toDate?: () => Date } | undefined)?.toDate?.().getTime() ?? Date.now();

export interface NotificationRow {
  id:          string;
  type:        string;
  title:       string;
  body:        string;
  read:        boolean;
  href:        string | null;
  clanId:      string | null;
  challengeId: string | null;
  createdAt:   number;
}

function mapNotif(d: FirebaseFirestore.QueryDocumentSnapshot): NotificationRow {
  const data = d.data();
  return {
    id:          d.id,
    type:        (data.type        as string) ?? "",
    title:       (data.title       as string) ?? "",
    body:        (data.body        as string) ?? "",
    read:        (data.read        as boolean) ?? false,
    href:        (data.href        as string | null) ?? null,
    clanId:      (data.clanId      as string | null) ?? null,
    challengeId: (data.challengeId as string | null) ?? null,
    createdAt:   toMs(data.createdAt),
  };
}

export async function getNotifications(
  uid:   string,
  limit: number = 20,
): Promise<ActionResult<NotificationRow[]>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb
      .collection("notifications").doc(uid)
      .collection("items")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    return { success: true, data: snap.docs.map(mapNotif) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to fetch notifications" };
  }
}

export async function getUnreadCount(uid: string): Promise<ActionResult<number>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb
      .collection("notifications").doc(uid)
      .collection("items")
      .where("read", "==", false)
      .get();

    return { success: true, data: snap.size };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to count" };
  }
}

export async function markNotificationRead(
  uid:    string,
  notifId: string,
): Promise<ActionResult> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    await adminDb
      .collection("notifications").doc(uid)
      .collection("items").doc(notifId)
      .update({ read: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to mark read" };
  }
}

export async function markAllNotificationsRead(uid: string): Promise<ActionResult> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb
      .collection("notifications").doc(uid)
      .collection("items")
      .where("read", "==", false)
      .get();

    if (snap.empty) return { success: true };

    const batch = adminDb.batch();
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to mark all read" };
  }
}

export async function createNotification(
  uid:   string,
  notif: Omit<NotificationRow, "id" | "createdAt" | "read">,
): Promise<ActionResult> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    await adminDb
      .collection("notifications").doc(uid)
      .collection("items")
      .add({ ...notif, read: false, createdAt: new Date() });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to create notification" };
  }
}
