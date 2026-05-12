import {
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
  Timestamp,
} from "firebase/firestore";
import type { Clan, ClanPost, Profile, Tournament, TournamentMatch } from "@/types";

// ─── Helper: convert any Timestamp fields to Date ─────────────────────────────

function tsToDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value as string | number);
}

// ─── Profile converter ────────────────────────────────────────────────────────

export const profileConverter: FirestoreDataConverter<Profile> = {
  toFirestore(profile: Profile) {
    return {
      ...profile,
      createdAt: Timestamp.fromDate(profile.createdAt),
      updatedAt: Timestamp.fromDate(profile.updatedAt),
    };
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): Profile {
    const data = snapshot.data(options);
    return {
      ...(data as Profile),
      id: snapshot.id,
      createdAt: tsToDate(data.createdAt),
      updatedAt: tsToDate(data.updatedAt),
    };
  },
};

// ─── Clan converter ───────────────────────────────────────────────────────────

export const clanConverter: FirestoreDataConverter<Clan> = {
  toFirestore(clan: Clan) {
    return {
      ...clan,
      createdAt: Timestamp.fromDate(clan.createdAt),
      updatedAt: Timestamp.fromDate(clan.updatedAt),
    };
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): Clan {
    const data = snapshot.data(options);
    return {
      ...(data as Clan),
      id: snapshot.id,
      createdAt: tsToDate(data.createdAt),
      updatedAt: tsToDate(data.updatedAt),
    };
  },
};

// ─── ClanPost converter ───────────────────────────────────────────────────────

export const postConverter: FirestoreDataConverter<ClanPost> = {
  toFirestore(post: ClanPost) {
    return {
      ...post,
      createdAt: Timestamp.fromDate(post.createdAt),
    };
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): ClanPost {
    const data = snapshot.data(options);
    return {
      ...(data as ClanPost),
      id: snapshot.id,
      createdAt: tsToDate(data.createdAt),
    };
  },
};

// ─── Tournament converter ─────────────────────────────────────────────────────

export const tournamentConverter: FirestoreDataConverter<Tournament> = {
  toFirestore(tournament: Tournament) {
    return {
      ...tournament,
      startsAt: Timestamp.fromDate(tournament.startsAt),
      registrationClosesAt: Timestamp.fromDate(tournament.registrationClosesAt),
      rosterLockedAt: Timestamp.fromDate(tournament.rosterLockedAt),
      createdAt: Timestamp.fromDate(tournament.createdAt),
    };
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): Tournament {
    const data = snapshot.data(options);
    return {
      ...(data as Tournament),
      id: snapshot.id,
      startsAt: tsToDate(data.startsAt),
      registrationClosesAt: tsToDate(data.registrationClosesAt),
      rosterLockedAt: tsToDate(data.rosterLockedAt),
      createdAt: tsToDate(data.createdAt),
    };
  },
};

// ─── TournamentMatch converter ────────────────────────────────────────────────

export const matchConverter: FirestoreDataConverter<TournamentMatch> = {
  toFirestore(match: TournamentMatch) {
    return {
      ...match,
      scheduledAt: match.scheduledAt ? Timestamp.fromDate(match.scheduledAt) : null,
      completedAt: match.completedAt ? Timestamp.fromDate(match.completedAt) : null,
    };
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): TournamentMatch {
    const data = snapshot.data(options);
    return {
      ...(data as TournamentMatch),
      id: snapshot.id,
      scheduledAt: data.scheduledAt ? tsToDate(data.scheduledAt) : undefined,
      completedAt: data.completedAt ? tsToDate(data.completedAt) : undefined,
    };
  },
};
