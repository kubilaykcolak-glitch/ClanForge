import type {
  ClanRole,
  MatchStatus,
  ParticipantStatus,
  PaymentStatus,
  PrizePayoutStatus,
  PrizeSplit,
  TournamentFormat,
  TournamentStatus,
} from "./index";

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface Profile {
  id?: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  country?: string;
  steamUrl?: string;
  xboxGamertag?: string;
  psnId?: string;
  discordTag?: string;
  twitchUrl?: string;
  xp: number;
  tournamentsPlayed: number;
  tournamentsWon: number;
  isVerified: boolean;
  isAdmin: boolean;
  /** When true the profile is excluded from all search and directory queries. */
  isPrivate?: boolean;
  /** Firestore document ID of the clan this user belongs to. */
  clanId?: string | null;
  /** Denormalised from /clans/{clanId}.clanTag — avoids a join on profile reads. */
  clanTag?: string | null;
  /** Denormalised from /clans/{clanId}.slug — used to build the clan page link. */
  clanSlug?: string | null;
  /** Denormalised from /clans/{clanId}.name — display name of the clan. */
  clanName?: string | null;
  /** Timestamp of the most recent clan departure. Drives the join cooldown
   * (CLAN_JOIN_COOLDOWN_HOURS in src/lib/xp.ts) so users can't farm join XP
   * by repeatedly joining and leaving. */
  lastClanLeaveAt?: Date | null;
  /** URL of the user's custom profile banner image. */
  bannerUrl?: string | null;
  /** ID matching one of the ANIMATED_BACKGROUNDS entries in lib/profile-backgrounds.ts. */
  backgroundId?: string | null;
  /** URL of the user's custom full-page profile background image. Takes
   * precedence over backgroundId when set. */
  backgroundImageUrl?: string | null;
  /** Hex colour string e.g. '#6366f1' — user-chosen accent override. */
  accentColour?: string | null;
  /** Earned badge slugs, e.g. ["challenge_champion", "first_blood"]. */
  badges?: string[];
  /** Display title, e.g. "Season 1 Champion". */
  title?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── GameRecord ───────────────────────────────────────────────────────────────

export interface GameRecord {
  id?: string;
  userId: string;
  gameName: string;
  platform: string;
  wins: number;
  losses: number;
  draws: number;
  peakRank?: string;
  hoursPlayed: number;
  notes?: string;
  isFeatured: boolean;
  createdAt: Date;
}

// ─── Clan ─────────────────────────────────────────────────────────────────────

export interface Clan {
  id?: string;
  name: string;
  slug: string;
  description?: string;
  bannerUrl?: string;
  avatarUrl?: string;
  gameFocus: string;
  tags: string[];
  ownerId: string;
  isPublic: boolean;
  isRecruiting: boolean;
  memberLimit: number;
  memberCount: number;
  xp: number;
  /** Denormalised clan level derived from xp. Updated by awardClanXp on level-up. */
  level?: number;
  /** Max 4 uppercase letters, e.g. "WOLF". Null until the leader sets one. */
  clanTag?: string | null;
  /** Normalised, case-folded, punctuation-stripped form of `name`.
   * Used as the uniqueness key (along with the /clanNameKeys/{nameKey}
   * index doc) to block copycat names like "Shadow Clan" vs "ShadowClan"
   * vs "Sh4d0w Cl4n". Compute with src/lib/clan-name.ts → normalizeClanName. */
  nameKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── ClanMember ───────────────────────────────────────────────────────────────

export interface ClanMember {
  id?: string;
  role: ClanRole;
  joinedAt: Date;
  displayName: string;
  avatarUrl?: string;
}

// ─── ClanPost ─────────────────────────────────────────────────────────────────

export interface ClanPost {
  id?: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl?: string;
  content: string;
  imageUrl?: string;
  likesCount: number;
  createdAt: Date;
}

// ─── Tournament ───────────────────────────────────────────────────────────────

export interface Tournament {
  id?: string;
  name: string;
  description?: string;
  game: string;
  format: TournamentFormat;
  status: TournamentStatus;
  maxParticipants: number;
  /** Entry fee in pence (e.g. 500 = £5). 0 for free tournaments. */
  entryFee: number;
  /** Current prize pool in pence. Auto-grows on paid registrations,
   * shrinks on refunds. Set explicitly to 0 for free tournaments. */
  prizePool: number;
  /** When true, registration requires a Stripe payment of `entryFee`. */
  isPaid?: boolean;
  /** Preset that controls how `prizePool` is distributed to top finishers. */
  prizeSplit?: PrizeSplit;
  /** Platform fee % applied at registration time (captured for the historical
   * record so existing tournaments aren't affected by future fee changes). */
  platformFeePct?: number;
  rules?: string;
  bannerUrl?: string;
  creatorId: string;
  startsAt: Date;
  registrationClosesAt: Date;
  rosterLockedAt: Date;
  participantCount: number;
  createdAt: Date;
}

// ─── TournamentParticipant ────────────────────────────────────────────────────

export interface TournamentParticipant {
  id?: string;
  userId: string;
  clanId?: string;
  seed: number;
  status: ParticipantStatus;
  registeredAt: Date;
  /** Payment lifecycle for this entry. "free" for free tournaments. */
  paymentStatus?: PaymentStatus;
  /** Stripe Checkout Session id — used to reconcile webhook events. */
  stripeCheckoutSessionId?: string;
  /** Stripe PaymentIntent id — required to issue a refund. */
  stripePaymentIntentId?: string;
  /** Amount actually paid in pence at registration time. */
  paidAmount?: number;
  paidAt?: Date;
  refundedAt?: Date;
}

// ─── PrizePayout ──────────────────────────────────────────────────────────────
// Stored as a subcollection: /tournaments/{tournamentId}/prizes/{prizeId}

export interface PrizePayout {
  id?: string;
  tournamentId: string;
  /** Winning participant's user id (matches /tournaments/{id}/participants/{userId}). */
  participantId: string;
  /** Placement, 1 = winner, 2 = runner-up, etc. */
  position: number;
  /** Award amount in pence. */
  amount: number;
  status: PrizePayoutStatus;
  /** Short human-readable code shown to the user when they message support
   * in Discord, e.g. "TOURN-abc1-1". */
  claimReference: string;
  computedAt: Date;
  claimedAt?: Date;
  paidAt?: Date;
}

// ─── TournamentMatch ──────────────────────────────────────────────────────────

export interface TournamentMatch {
  id?: string;
  round: number;
  matchNumber: number;
  participantAId: string;
  participantBId: string;
  winnerId?: string;
  scoreA: number;
  scoreB: number;
  status: MatchStatus;
  scheduledAt?: Date;
  completedAt?: Date;
}

// ─── ClanChallenge ────────────────────────────────────────────────────────────

export type ChallengeType =
  | "tournament_participate"
  | "tournament_win"
  | "post_create"
  | "member_recruit"
  | "xp_earn"
  | "match_win";

export type ChallengeDuration = "daily" | "weekly" | "monthly" | "seasonal";

export type ChallengeStatus = "upcoming" | "active" | "completed" | "cancelled";

export interface ClanChallenge {
  id?: string;
  title: string;
  description: string;
  type: ChallengeType;
  duration: ChallengeDuration;
  /** Collective target — e.g. 5 posts, 3 tournament wins, 1000 XP earned. */
  targetValue: number;
  /** Challenge-points awarded to the clan on completion. */
  pointValue: number;
  /** XP awarded to each contributing member on completion. */
  memberXpReward: number;
  /** XP added to the clan document on completion. */
  clanXpReward: number;
  /** Badge slug to award to contributing members. Optional. */
  badgeReward?: string | null;
  /** Title string to award to contributing members. Optional. */
  titleReward?: string | null;
  /** Links this challenge to a season. Null = standalone. */
  seasonId?: string | null;
  startAt: Date;
  endAt: Date;
  status: ChallengeStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── ClanChallengeEntry ───────────────────────────────────────────────────────
// Stored as /challenges/{challengeId}/entries/{clanId}

export interface ClanChallengeEntry {
  clanId:         string;
  clanName:       string;
  clanSlug:       string;
  clanAvatarUrl?: string | null;
  clanTag?:       string | null;
  progress:       number;
  completed:      boolean;
  completedAt?:   Date | null;
  pointsEarned:   number;
  /** uid → contribution count */
  contributors:   Record<string, number>;
  updatedAt:      Date;
}

// ─── ClanSeason ───────────────────────────────────────────────────────────────

export interface ClanSeason {
  id?: string;
  name: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  status: "upcoming" | "active" | "completed";
  createdAt: Date;
}

// ─── ClanPoints ───────────────────────────────────────────────────────────────
// One document per clan at /clan_points/{clanId}. Denormalised leaderboard
// data — updated atomically whenever a challenge is completed.

export interface ClanPoints {
  clanId:         string;
  clanName:       string;
  clanSlug:       string;
  clanAvatarUrl?: string | null;
  clanTag?:       string | null;
  memberCount:    number;
  totalPoints:    number;
  weeklyPoints:   number;
  monthlyPoints:  number;
  /** seasonId → points earned in that season */
  seasonPoints:   Record<string, number>;
  /** ISO week key used to detect when to reset weeklyPoints, e.g. "2026-W20" */
  currentWeekKey:  string;
  /** "YYYY-MM" key used to detect when to reset monthlyPoints */
  currentMonthKey: string;
  updatedAt: Date;
}

// ─── Notification ─────────────────────────────────────────────────────────────
// Stored as /notifications/{uid}/items/{notifId}

export type NotificationType =
  | "challenge_started"
  | "challenge_completed"
  | "rank_up"
  | "rank_down"
  | "reward_earned"
  | "rival_overtook"
  | "clan_level_up";

export interface Notification {
  id?: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  /** Optional click-through URL */
  href?: string;
  clanId?: string;
  challengeId?: string;
  createdAt: Date;
}
