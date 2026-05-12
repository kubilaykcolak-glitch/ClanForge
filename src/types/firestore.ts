import type { ClanRole, MatchStatus, ParticipantStatus, TournamentFormat, TournamentStatus } from "./index";

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
  /** URL of the user's custom profile banner image. */
  bannerUrl?: string | null;
  /** ID matching one of the ANIMATED_BACKGROUNDS entries in lib/profile-backgrounds.ts. */
  backgroundId?: string | null;
  /** Hex colour string e.g. '#6366f1' — user-chosen accent override. */
  accentColour?: string | null;
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
  /** Max 4 uppercase letters, e.g. "WOLF". Null until the leader sets one. */
  clanTag?: string | null;
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
  entryFee: number;
  prizePool: number;
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
