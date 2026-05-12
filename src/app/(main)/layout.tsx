import { cookies } from "next/headers";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";
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

    // Will throw if cookie is invalid/expired
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);

    // Try to fetch profile — may not exist yet (e.g. Google sign-in without onboarding)
    const snap = await adminDb.collection("profiles").doc(decoded.uid).get();
    if (!snap.exists) {
      // Valid session but no profile doc yet — still authenticated
      return { profile: null, isAuthenticated: true };
    }

    const data = snap.data()!;

    // Firestore Timestamp objects are class instances and cannot be passed from
    // Server Components to Client Components. Convert every date field to a
    // plain Date (React's serialiser supports the Date built-in).
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
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="flex flex-1">
        <Sidebar profile={profile} isAuthenticated={isAuthenticated} />

        <div className="flex flex-col flex-1 min-w-0">
          <main className="flex-1 p-6">
            {children}
          </main>
          <Footer />
        </div>
      </div>
    </div>
  );
}
