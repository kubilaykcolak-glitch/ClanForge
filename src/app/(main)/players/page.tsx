import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getPlayers } from "@/lib/actions/player-list.actions";
import PlayersClient from "@/components/player/PlayersClient";

export default async function PlayersPage() {
  // Resolve the current uid via the session cookie. Middleware does not match
  // /players, so there's no x-user-id header to read here.
  let uid: string | null = null;
  try {
    const sessionCookie = cookies().get("session")?.value;
    if (sessionCookie) {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
      uid = decoded.uid;
    }
  } catch {
    // Invalid session — treat as logged out
  }

  // Initial page render uses the default sort (Top XP). Subsequent pages and
  // sort changes are fetched client-side via the same getPlayers action.
  const initial = await getPlayers("xp_desc", null);
  const players = initial.success && initial.data ? initial.data.items     : [];
  const cursor  = initial.success && initial.data ? initial.data.nextCursor : null;

  let ownIsPrivate = false;
  if (uid) {
    const ownSnap = await adminDb.collection("profiles").doc(uid).get();
    if (ownSnap.exists) {
      ownIsPrivate = (ownSnap.data()?.isPrivate as boolean) ?? false;
    }
  }

  return (
    <PlayersClient
      initialPlayers={players}
      initialCursor={cursor}
      uid={uid}
      initialIsPrivate={ownIsPrivate}
    />
  );
}
