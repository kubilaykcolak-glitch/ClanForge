// ─── String union types ───────────────────────────────────────────────────────

export type ClanRole = "leader" | "officer" | "member" | "pending";

export type TournamentFormat = "single_elim" | "double_elim" | "round_robin";

export type TournamentStatus = "draft" | "open" | "locked" | "live" | "complete";

export type MatchStatus = "pending" | "live" | "complete" | "disputed";

export type ParticipantStatus = "registered" | "checkedIn" | "eliminated" | "winner";

// ─── Firestore document interfaces ───────────────────────────────────────────

export type {
  Clan,
  ClanMember,
  ClanPost,
  GameRecord,
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
