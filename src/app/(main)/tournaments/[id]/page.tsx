import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type {
  PrizePayout,
  Tournament,
  TournamentMatch,
  TournamentParticipant,
} from "@/types";
import { Badge } from "@/components/ui/Badge";
import { BracketView } from "@/components/tournament/BracketView";
import { TournamentRegistration } from "@/components/tournament/TournamentRegistration";
import { TournamentCreatorActions } from "@/components/tournament/TournamentCreatorActions";
import { TournamentFinalize } from "@/components/tournament/TournamentFinalize";
import { TournamentPrizeClaim } from "@/components/tournament/TournamentPrizeClaim";
import { formatDate, getInitials } from "@/lib/utils";
import {
  computePayouts,
  formatPence,
  getPresetLabel,
  positionLabel,
} from "@/lib/prize-splits";

// ── Types ─────────────────────────────────────────────────────────────────────

const FORMAT_LABELS: Record<string, string> = {
  single_elim: "Single Elimination",
  double_elim: "Double Elimination",
  round_robin:  "Round Robin",
};

const STATUS_VARIANTS: Record<
  string,
  Parameters<typeof Badge>[0]["variant"]
> = {
  open:     "success",
  live:     "live",
  locked:   "warning",
  complete: "default",
  draft:    "default",
};

// ── Data fetch ────────────────────────────────────────────────────────────────

interface ParticipantRow extends TournamentParticipant {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

interface PrizeRow extends PrizePayout {
  id: string;
}

interface PageData {
  tournament:       Tournament;
  participants:     ParticipantRow[];
  matches:          TournamentMatch[];
  participantNames: Record<string, string>; // userId → displayName
  currentUid:       string | null;
  isRegistered:     boolean;
  isAdmin:          boolean;
  currentDisplayName: string;
  currentAvatarUrl?:  string;
  /** Prizes belonging to the current user (so they see their own claim cards). */
  myPrizes:         PrizeRow[];
  winner?: { displayName: string; avatarUrl?: string } | null;
}

async function getPageData(id: string): Promise<PageData | null> {
  const { adminDb, adminAuth } = await import("@/lib/firebase/admin");

  const [tournamentSnap, participantsSnap, matchesSnap] = await Promise.all([
    adminDb.collection("tournaments").doc(id).get(),
    adminDb
      .collection("tournaments")
      .doc(id)
      .collection("participants")
      .orderBy("seed", "asc")
      .limit(64)
      .get(),
    adminDb
      .collection("tournaments")
      .doc(id)
      .collection("matches")
      .orderBy("round", "asc")
      .get(),
  ]);

  if (!tournamentSnap.exists) return null;

  const tData = tournamentSnap.data()!;
  let tournament: Tournament = {
    id:                   tournamentSnap.id,
    ...(tData as Omit<Tournament,
      "id" | "createdAt" | "startsAt" | "registrationClosesAt" | "rosterLockedAt"
    >),
    createdAt:             tData.createdAt?.toDate?.()             ?? new Date(),
    startsAt:              tData.startsAt?.toDate?.()              ?? new Date(),
    registrationClosesAt:  tData.registrationClosesAt?.toDate?.()  ?? new Date(),
    rosterLockedAt:        tData.rosterLockedAt?.toDate?.()        ?? new Date(),
  };

  // ── Auto-update status: open → locked if registration has closed ──
  if (
    tournament.status === "open" &&
    tournament.registrationClosesAt < new Date()
  ) {
    await adminDb.collection("tournaments").doc(id).update({ status: "locked" });
    tournament = { ...tournament, status: "locked" };
  }

  // ── Participants ──
  const participants: ParticipantRow[] = participantsSnap.docs.map(d => {
    const data = d.data();
    return {
      id:           d.id,
      userId:       d.id,
      seed:         (data.seed as number) ?? 0,
      status:       data.status ?? "registered",
      registeredAt: data.registeredAt?.toDate?.() ?? new Date(),
      displayName:  (data.displayName as string) ?? "Unknown",
      avatarUrl:    data.avatarUrl as string | undefined,
    } as ParticipantRow;
  });

  // ── Matches ──
  const matches: TournamentMatch[] = matchesSnap.docs.map(d => {
    const data = d.data();
    return {
      id:             d.id,
      round:          data.round as number,
      matchNumber:    data.matchNumber as number,
      participantAId: data.participantAId as string,
      participantBId: data.participantBId as string,
      winnerId:       data.winnerId as string | undefined,
      scoreA:         (data.scoreA as number) ?? 0,
      scoreB:         (data.scoreB as number) ?? 0,
      status:         data.status ?? "pending",
      scheduledAt:    data.scheduledAt?.toDate?.(),
      completedAt:    data.completedAt?.toDate?.(),
    } as TournamentMatch;
  });

  // ── participantNames map (uid → displayName) ──
  const participantNames: Record<string, string> = {};
  participants.forEach(p => {
    participantNames[p.userId] = p.displayName;
  });

  // ── Winner (for completed tournaments) ──
  let winner: { displayName: string; avatarUrl?: string } | null = null;
  if (tournament.status === "complete") {
    const winnerParticipant = participants.find(p => p.status === "winner");
    if (winnerParticipant) {
      winner = {
        displayName: winnerParticipant.displayName,
        avatarUrl:   winnerParticipant.avatarUrl,
      };
    }
  }

  // ── Session ──
  let currentUid:          string | null   = null;
  let isRegistered:        boolean         = false;
  let isAdmin:             boolean         = false;
  let currentDisplayName:  string          = "";
  let currentAvatarUrl:    string | undefined;

  try {
    const cookieStore   = cookies();
    const sessionCookie = cookieStore.get("session")?.value;
    if (sessionCookie) {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
      currentUid    = decoded.uid;
      isRegistered  = participantsSnap.docs.some(d => d.id === currentUid);

      const profileSnap = await adminDb.collection("profiles").doc(currentUid).get();
      if (profileSnap.exists) {
        const pData        = profileSnap.data()!;
        currentDisplayName = (pData.displayName as string) ?? "";
        currentAvatarUrl   = pData.avatarUrl as string | undefined;
        isAdmin            = (pData.isAdmin as boolean) === true;
      }
    }
  } catch {
    // unauthenticated
  }

  // ── My prizes for this tournament (only fetched when status is complete) ──
  let myPrizes: PrizeRow[] = [];
  if (currentUid && tournament.status === "complete") {
    const prizesSnap = await adminDb
      .collection("tournaments").doc(id)
      .collection("prizes")
      .where("participantId", "==", currentUid)
      .get();

    myPrizes = prizesSnap.docs
      .map(d => {
        const data = d.data();
        return {
          id:             d.id,
          tournamentId:   id,
          participantId:  data.participantId,
          position:       data.position,
          amount:         data.amount,
          status:         data.status,
          claimReference: data.claimReference,
          computedAt:     data.computedAt?.toDate?.() ?? new Date(),
          claimedAt:      data.claimedAt?.toDate?.(),
          paidAt:         data.paidAt?.toDate?.(),
        } as PrizeRow;
      })
      .sort((a, b) => a.position - b.position);
  }

  return {
    tournament,
    participants,
    matches,
    participantNames,
    currentUid,
    isRegistered,
    isAdmin,
    currentDisplayName,
    currentAvatarUrl,
    myPrizes,
    winner,
  };
}

// ── Participant status badge ──────────────────────────────────────────────────

const PARTICIPANT_STATUS_VARIANTS: Record<
  string,
  Parameters<typeof Badge>[0]["variant"]
> = {
  registered: "info",
  checkedIn:  "success",
  eliminated: "default",
  winner:     "warning",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TournamentPage({
  params,
}: {
  params: { id: string };
}) {
  const data = await getPageData(params.id);
  if (!data) notFound();

  const {
    tournament,
    participants,
    matches,
    participantNames,
    currentUid,
    isRegistered,
    isAdmin,
    currentDisplayName,
    currentAvatarUrl,
    myPrizes,
    winner,
  } = data;

  const hasPrize    = tournament.prizePool > 0;
  const isFree      = tournament.entryFee === 0;
  const isCreator   = currentUid !== null && currentUid === tournament.creatorId;
  const canCancel   = isCreator && tournament.status !== "complete" && tournament.status !== "cancelled";
  const canFinalize = isCreator && tournament.status !== "complete" && tournament.status !== "cancelled" && participants.length > 0;

  return (
    <div className="max-w-5xl mx-auto">

      {/* ── Cancelled banner ── */}
      {tournament.status === "cancelled" && (
        <div
          className="rounded-2xl px-5 py-4 mb-6 flex items-center gap-3"
          style={{
            background: "rgba(239,68,68,0.06)",
            border:     "1px solid rgba(239,68,68,0.25)",
          }}
        >
          <span className="text-2xl">⛔</span>
          <div>
            <p className="font-display font-semibold" style={{ color: "var(--danger)" }}>
              Tournament cancelled
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              This tournament was cancelled by the creator. Any paid entry fees have been refunded automatically.
            </p>
          </div>
        </div>
      )}

      {/* ── Hero header ── */}
      {tournament.bannerUrl && (
        <div
          className="w-full rounded-2xl overflow-hidden mb-8"
          style={{ height: 180 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={tournament.bannerUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* ── Two-column layout ── */}
      <div className="flex gap-6">

        {/* ── Main content ── */}
        <div className="flex-1 min-w-0">

          {/* Identity */}
          <div className="mb-8">
            <h1
              className="font-display font-bold mb-3 leading-tight"
              style={{ fontSize: 36, color: "var(--text-primary)" }}
            >
              {tournament.name}
            </h1>

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Badge variant="tournament">{tournament.game}</Badge>
              <Badge variant="info">
                {FORMAT_LABELS[tournament.format] ?? tournament.format}
              </Badge>
              <Badge variant={STATUS_VARIANTS[tournament.status] ?? "default"}>
                {tournament.status === "live"
                  ? "🔴 Live"
                  : tournament.status === "open"
                  ? "Open for Registration"
                  : tournament.status === "locked"
                  ? "Starting Soon"
                  : tournament.status === "complete"
                  ? "Completed"
                  : tournament.status}
              </Badge>
            </div>

            {/* Prize pool */}
            {hasPrize && (
              <p
                className="font-display font-bold text-3xl mb-2"
                style={{ color: "var(--warning)" }}
              >
                {formatPence(tournament.prizePool)} Prize Pool
              </p>
            )}

            {/* Entry fee */}
            <p className="text-sm mb-1" style={{ color: "var(--text-muted)" }}>
              Entry:{" "}
              <span
                style={{ color: isFree ? "var(--success)" : "var(--text-primary)" }}
              >
                {isFree ? "Free" : formatPence(tournament.entryFee)}
              </span>
            </p>

            {/* Prize split breakdown — paid tournaments with a split set */}
            {tournament.isPaid && tournament.prizeSplit && tournament.prizePool > 0 && (
              <div
                className="mt-3 inline-block rounded-lg p-3"
                style={{
                  background: "var(--bg-surface)",
                  border:     "1px solid var(--border-default)",
                }}
              >
                <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                  Prize split — <span style={{ color: "var(--text-secondary)" }}>{getPresetLabel(tournament.prizeSplit)}</span>
                </p>
                <ul className="text-sm flex flex-wrap gap-x-4 gap-y-1" style={{ color: "var(--text-secondary)" }}>
                  {computePayouts(tournament.prizePool, tournament.prizeSplit).map(p => (
                    <li key={p.position}>
                      <span style={{ color: "var(--text-muted)" }}>{positionLabel(p.position)}</span>{" "}
                      <strong style={{ color: "var(--text-primary)" }}>{formatPence(p.amount)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Date */}
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Starts: <span style={{ color: "var(--text-secondary)" }}>
                {formatDate(tournament.startsAt)}
              </span>
            </p>

            {/* Description */}
            {tournament.description && (
              <p
                className="mt-4 text-sm leading-relaxed max-w-2xl"
                style={{ color: "var(--text-secondary)" }}
              >
                {tournament.description}
              </p>
            )}
          </div>

          {/* ── Bracket ── */}
          <section className="mb-10">
            <h2
              className="font-display font-bold text-2xl mb-4"
              style={{ color: "var(--text-primary)" }}
            >
              Bracket
            </h2>
            <div
              className="rounded-xl p-4"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <BracketView
                matches={matches}
                participantNames={participantNames}
              />
            </div>
          </section>

          {/* ── Participants ── */}
          <section className="mb-10">
            <h2
              className="font-display font-bold text-2xl mb-4"
              style={{ color: "var(--text-primary)" }}
            >
              Participants ({tournament.participantCount})
            </h2>

            {participants.length > 0 ? (
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--text-muted)" }}
                      >
                        #
                      </th>
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Player
                      </th>
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map((p, idx) => (
                      <tr
                        key={p.id}
                        style={{ borderBottom: "1px solid var(--border-subtle)" }}
                      >
                        {/* Seed */}
                        <td className="px-4 py-3">
                          <span
                            className="text-xs font-mono"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {p.seed > 0 ? `#${p.seed}` : `${idx + 1}`}
                          </span>
                        </td>

                        {/* Player */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 overflow-hidden"
                              style={{ background: "var(--accent)" }}
                            >
                              {p.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={p.avatarUrl}
                                  alt={p.displayName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                getInitials(p.displayName)
                              )}
                            </div>
                            <span
                              className="font-medium"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {p.displayName}
                            </span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              PARTICIPANT_STATUS_VARIANTS[p.status] ?? "default"
                            }
                          >
                            {p.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center rounded-xl py-12 text-center"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <span className="text-4xl mb-3 opacity-30">👥</span>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  No participants yet — be the first to register!
                </p>
              </div>
            )}
          </section>

          {/* ── Rules ── */}
          {tournament.rules && (
            <section className="mb-10">
              <h2
                className="font-display font-bold text-2xl mb-4"
                style={{ color: "var(--text-primary)" }}
              >
                Rules
              </h2>
              <pre
                className="rounded-xl p-5 text-sm leading-relaxed whitespace-pre-wrap"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-secondary)",
                  fontFamily: "inherit",
                }}
              >
                {tournament.rules}
              </pre>
            </section>
          )}
        </div>

        {/* ── Right panel ── */}
        <aside className="shrink-0 flex flex-col gap-4" style={{ width: 280, alignSelf: "flex-start", position: "sticky", top: "5rem" }}>
          <TournamentRegistration
            tournamentId={tournament.id ?? ""}
            status={tournament.status}
            registrationClosesAt={tournament.registrationClosesAt}
            maxParticipants={tournament.maxParticipants}
            participantCount={tournament.participantCount}
            entryFee={tournament.entryFee}
            prizePool={tournament.prizePool}
            currentUid={currentUid}
            isRegistered={isRegistered}
            currentDisplayName={currentDisplayName}
            currentAvatarUrl={currentAvatarUrl}
            winner={winner}
          />

          {/* Prize claim cards — visible to the winning user once the
              tournament has been finalized. */}
          {myPrizes.length > 0 && currentUid && (
            <>
              {myPrizes.map(prize => (
                <TournamentPrizeClaim
                  key={prize.id}
                  tournamentId={tournament.id ?? ""}
                  prizeId={prize.id}
                  position={prize.position}
                  amountPence={prize.amount}
                  status={prize.status}
                  claimReference={prize.claimReference}
                  currentUid={currentUid}
                  isAdmin={isAdmin}
                />
              ))}
            </>
          )}

          {canFinalize && currentUid && (
            <TournamentFinalize
              tournamentId={tournament.id ?? ""}
              currentUid={currentUid}
              prizeSplit={tournament.prizeSplit ?? null}
              prizePool={tournament.prizePool}
              participants={participants.map(p => ({ userId: p.userId, displayName: p.displayName }))}
              participantCount={tournament.participantCount}
            />
          )}

          {canCancel && currentUid && (
            <TournamentCreatorActions
              tournamentId={tournament.id ?? ""}
              currentUid={currentUid}
              isPaid={Boolean(tournament.isPaid)}
              participantCount={tournament.participantCount}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
