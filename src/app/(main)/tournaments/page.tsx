import Link from "next/link";
import type { Tournament } from "@/types";
import { TournamentTabs } from "@/components/tournament/TournamentTabs";

// ── Helper: convert Firestore doc → Tournament ────────────────────────────────

function toTournament(d: FirebaseFirestore.QueryDocumentSnapshot): Tournament {
  const data = d.data();
  return {
    id:                    d.id,
    ...(data as Omit<Tournament,
      "id" | "createdAt" | "startsAt" | "registrationClosesAt" | "rosterLockedAt"
    >),
    createdAt:              data.createdAt?.toDate?.()              ?? new Date(),
    startsAt:               data.startsAt?.toDate?.()               ?? new Date(),
    registrationClosesAt:   data.registrationClosesAt?.toDate?.()   ?? new Date(),
    rosterLockedAt:         data.rosterLockedAt?.toDate?.()         ?? new Date(),
  };
}

// ── Data fetch ────────────────────────────────────────────────────────────────

async function getTournaments() {
  const { adminDb } = await import("@/lib/firebase/admin");

  // Parallel fetch per status.
  // Open / live / locked: status + startsAt ASC (index exists).
  // Completed: status + createdAt DESC (index exists) — the status+startsAt DESC
  // index is still building; swap back to startsAt once it shows "Enabled" in console.
  const [openSnap, liveSnap, lockedSnap, completedSnap] = await Promise.all([
    adminDb
      .collection("tournaments")
      .where("status", "==", "open")
      .orderBy("startsAt", "asc")
      .limit(12)
      .get(),
    adminDb
      .collection("tournaments")
      .where("status", "==", "live")
      .orderBy("startsAt", "asc")
      .limit(12)
      .get(),
    adminDb
      .collection("tournaments")
      .where("status", "==", "locked")
      .orderBy("startsAt", "asc")
      .limit(12)
      .get(),
    adminDb
      .collection("tournaments")
      .where("status", "==", "complete")
      .orderBy("createdAt", "desc")   // ← uses existing status+createdAt index
      .limit(12)
      .get(),
  ]);

  return {
    open:      openSnap.docs.map(toTournament),
    live:      liveSnap.docs.map(toTournament),
    upcoming:  lockedSnap.docs.map(toTournament),
    completed: completedSnap.docs.map(toTournament),
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TournamentsPage() {
  const { open, live, upcoming, completed } = await getTournaments();

  return (
    <div className="max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1
            className="font-display font-bold text-4xl"
            style={{ color: "var(--text-primary)" }}
          >
            Tournaments
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Compete, climb the bracket, claim the prize.
          </p>
        </div>
        <Link
          href="/tournaments/create"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white shrink-0 transition-all"
          style={{ background: "var(--accent)" }}
        >
          + Create Tournament
        </Link>
      </div>

      {/* ── Tabbed grid ── */}
      <TournamentTabs
        open={open}
        live={live}
        upcoming={upcoming}
        completed={completed}
      />
    </div>
  );
}
