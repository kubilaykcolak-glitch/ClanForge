import { getTournamentTab } from "@/lib/actions/tournament-list.actions";
import { TournamentsClient } from "@/components/tournament/TournamentsClient";

// ── Data fetch ────────────────────────────────────────────────────────────────

async function getInitialData() {
  const [openRes, liveRes, upcomingRes, completedRes] = await Promise.all([
    getTournamentTab("open",     "soonest"),
    getTournamentTab("live",     "soonest"),
    getTournamentTab("locked",   "soonest"),
    getTournamentTab("complete", "soonest"),
  ]);

  return {
    initialOpen:            openRes.data?.items      ?? [],
    initialLive:            liveRes.data?.items      ?? [],
    initialUpcoming:        upcomingRes.data?.items  ?? [],
    initialCompleted:       completedRes.data?.items ?? [],
    initialOpenCursor:      openRes.data?.nextCursor      ?? null,
    initialLiveCursor:      liveRes.data?.nextCursor      ?? null,
    initialUpcomingCursor:  upcomingRes.data?.nextCursor  ?? null,
    initialCompletedCursor: completedRes.data?.nextCursor ?? null,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TournamentsPage() {
  const data = await getInitialData();
  return <TournamentsClient {...data} />;
}
