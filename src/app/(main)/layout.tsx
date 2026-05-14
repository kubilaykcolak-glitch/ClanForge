import { cookies } from "next/headers";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";
import { NotificationBell } from "@/components/layout/NotificationBell";
import type { Profile } from "@/types";

interface SessionResult {
  profile:            Profile | null;
  isAuthenticated:    boolean;
  initialUnreadCount: number;
}

async function getSessionData(): Promise<SessionResult> {
  try {
    const { adminAuth, adminDb } = await import("@/lib/firebase/admin");

    const cookieStore = cookies();
    const sessionCookie = cookieStore.get("session")?.value;
    if (!sessionCookie) return { profile: null, isAuthenticated: false, initialUnreadCount: 0 };

    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);

    // Fetch profile + unread notification count in parallel
    const [snap, unreadSnap] = await Promise.all([
      adminDb.collection("profiles").doc(decoded.uid).get(),
      adminDb
        .collection("notifications").doc(decoded.uid)
        .collection("items").where("read", "==", false).get(),
    ]);

    if (!snap.exists) {
      return { profile: null, isAuthenticated: true, initialUnreadCount: 0 };
    }

    const data = snap.data()!;

    const profile: Profile = {
      ...(data as Omit<Profile, "id" | "createdAt" | "updatedAt">),
      id:        snap.id,
      createdAt: data.createdAt?.toDate?.()  ?? new Date(),
      updatedAt: data.updatedAt?.toDate?.()  ?? new Date(),
    };

    return { profile, isAuthenticated: true, initialUnreadCount: unreadSnap.size };
  } catch {
    return { profile: null, isAuthenticated: false, initialUnreadCount: 0 };
  }
}

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, isAuthenticated, initialUnreadCount } = await getSessionData();

  return (
    <>
      <div
        className="min-h-screen flex flex-col"
        style={{ background: "var(--bg-base)" }}
      >
        <div className="flex flex-1">
          <Sidebar profile={profile} isAuthenticated={isAuthenticated} />

          <div className="flex flex-col flex-1 min-w-0">
            <main className="flex-1 px-6 py-6 pl-16 md:pl-6">
              {children}
            </main>
            <Footer />
          </div>
        </div>
      </div>

      {/* Floating notification bell — fixed bottom-right, visible on all authenticated pages */}
      {profile?.id && <NotificationBell uid={profile.id} initialUnreadCount={initialUnreadCount} />}
    </>
  );
}
