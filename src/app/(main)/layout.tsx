import { cookies } from "next/headers";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";
import { NotificationBell } from "@/components/layout/NotificationBell";
import type { Profile } from "@/types";

interface SessionResult {
  profile: Profile | null;
  isAuthenticated: boolean;
}

async function getSessionData(): Promise<SessionResult> {
  try {
    const { adminAuth, adminDb } = await import("@/lib/firebase/admin");

    const cookieStore = cookies();
    const sessionCookie = cookieStore.get("session")?.value;
    if (!sessionCookie) return { profile: null, isAuthenticated: false };

    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);

    const snap = await adminDb.collection("profiles").doc(decoded.uid).get();
    if (!snap.exists) {
      return { profile: null, isAuthenticated: true };
    }

    const data = snap.data()!;

    const profile: Profile = {
      ...(data as Omit<Profile, "id" | "createdAt" | "updatedAt">),
      id:        snap.id,
      createdAt: data.createdAt?.toDate?.()  ?? new Date(),
      updatedAt: data.updatedAt?.toDate?.()  ?? new Date(),
    };

    return { profile, isAuthenticated: true };
  } catch {
    return { profile: null, isAuthenticated: false };
  }
}

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, isAuthenticated } = await getSessionData();

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
      {profile?.id && <NotificationBell uid={profile.id} />}
    </>
  );
}
