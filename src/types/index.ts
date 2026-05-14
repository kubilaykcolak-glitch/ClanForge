// ─── String union types ───────────────────────────────────────────────────────

export type ClanRole = "leader" | "officer" | "member" | "pending";

export type TournamentFormat = "single_elim" | "double_elim" | "round_robin";

export type TournamentStatus = "draft" | "open" | "locked" | "live" | "complete" | "cancelled";

export type MatchStatus = "pending" | "live" | "complete" | "disputed";

export type ParticipantStatus = "registered" | "checkedIn" | "eliminated" | "winner";

/**
 * Preset prize-pool distributions. Stored on the tournament doc when a
 * paid tournament is created. The percentages live in
 * src/lib/prize-splits.ts.
 */
export type PrizeSplit = "winner_takes_all" | "top_3" | "top_4" | "top_5";

/**
 * Payment lifecycle for a tournament participant.
 *   free            — free tournament, no payment required
 *   pending_payment — Stripe Checkout session created; awaiting webhook
 *   paid            — Stripe confirmed the payment via webhook
 *   refunded        — refund issued (kept briefly for audit before deletion)
 */
export type PaymentStatus = "free" | "pending_payment" | "paid" | "refunded";

/** State of a single prize-pool payout. */
export type PrizePayoutStatus = "pending" | "claim_initiated" | "paid";

// ─── Firestore document interfaces ───────────────────────────────────────────

export type {
  Clan,
  ClanMember,
  ClanPost,
  ClanChallenge,
  ClanChallengeEntry,
  ClanSeason,
  ClanPoints,
  ChallengeType,
  ChallengeDuration,
  ChallengeStatus,
  Notification,
  NotificationType,
  GameRecord,
  PrizePayout,
  Profile,
  Tournament,
  TournamentMatch,
  TournamentParticipant,
} from "./firestore";

// ─── Convenience / extended types ────────────────────────────────────────────

import type { Clan, ClanMember, GameRecord, Profile, Tournament, TournamentParticipant } from "./firestore";

export type ClanWithMembers = Clan & { members: ClanMember[] };

export type ProfileWithGames = Profile & { gameRecords: GameRecord[] };

export type TournamentWithParticipants = Tournament & { participants: TournamentParticipant[] };
