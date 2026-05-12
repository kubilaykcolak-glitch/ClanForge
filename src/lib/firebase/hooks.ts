"use client";

import { collection, doc, limit, orderBy, query } from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { useCollectionData, useDocumentData } from "react-firebase-hooks/firestore";
import type { User } from "firebase/auth";
import type { Clan, ClanPost, Profile, Tournament } from "@/types";
import { auth, db } from "./client";
import {
  clanConverter,
  matchConverter,
  postConverter,
  profileConverter,
  tournamentConverter,
} from "./converters";

// ─── useCurrentUser ───────────────────────────────────────────────────────────

export function useCurrentUser(): { user: User | null; loading: boolean } {
  const [user, loading] = useAuthState(auth);
  return { user: user ?? null, loading };
}

// ─── useProfile ───────────────────────────────────────────────────────────────

export function useProfile(uid: string | null): {
  profile: Profile | null;
  loading: boolean;
  error: unknown;
} {
  const ref = uid ? doc(db, "profiles", uid).withConverter(profileConverter) : null;
  const [profile, loading, error] = useDocumentData(ref);
  return { profile: profile ?? null, loading, error };
}

// ─── useClan ──────────────────────────────────────────────────────────────────

export function useClan(clanId: string | null): { clan: Clan | null; loading: boolean } {
  const ref = clanId ? doc(db, "clans", clanId).withConverter(clanConverter) : null;
  const [clan, loading] = useDocumentData(ref);
  return { clan: clan ?? null, loading };
}

// ─── useClanPosts ─────────────────────────────────────────────────────────────

export function useClanPosts(clanId: string | null): {
  posts: ClanPost[];
  loading: boolean;
  error: Error | undefined;
} {
  const ref = clanId
    ? query(
        collection(db, "clans", clanId, "posts").withConverter(postConverter),
        orderBy("createdAt", "desc"),
        limit(20)
      )
    : null;
  const [posts, loading, error] = useCollectionData(ref);
  return { posts: posts ?? [], loading, error };
}

// ─── useTournament ────────────────────────────────────────────────────────────

export function useTournament(tournamentId: string | null): {
  tournament: Tournament | null;
  loading: boolean;
} {
  const ref = tournamentId
    ? doc(db, "tournaments", tournamentId).withConverter(tournamentConverter)
    : null;
  const [tournament, loading] = useDocumentData(ref);
  return { tournament: tournament ?? null, loading };
}
