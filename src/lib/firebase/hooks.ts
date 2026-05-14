"use client";

import { collection, doc, limit, orderBy, query } from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { useCollectionData, useDocumentData } from "react-firebase-hooks/firestore";
import type { User } from "firebase/auth";
import type { Clan, ClanPost, Notification, Profile, Tournament } from "@/types";
import { auth, db } from "./client";
import {
  clanConverter,
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
//
// Streams the most-recent `pageLimit` posts in real-time. To paginate, the
// caller raises pageLimit (typically by PAGE_SIZE per Load More click).
//
// We over-fetch by 1 so the consumer can tell whether there's another page
// without an extra query: if we receive (pageLimit + 1) docs, `hasMore` is
// true; otherwise we've hit the end and the +1 is just unused.

export function useClanPosts(
  clanId:    string | null,
  pageLimit: number = 15,
): {
  posts:   ClanPost[];
  loading: boolean;
  error:   Error | undefined;
  hasMore: boolean;
} {
  const ref = clanId
    ? query(
        collection(db, "clans", clanId, "posts").withConverter(postConverter),
        orderBy("createdAt", "desc"),
        limit(pageLimit + 1),
      )
    : null;
  const [rows, loading, error] = useCollectionData(ref);
  const all     = rows ?? [];
  const hasMore = all.length > pageLimit;
  const posts   = hasMore ? all.slice(0, pageLimit) : all;
  return { posts, loading, error, hasMore };
}

// ─── useNotifications ─────────────────────────────────────────────────────────
//
// Real-time listener on /notifications/{uid}/items.
// Pass enabled=false to skip opening the listener (e.g. before the panel opens).

export function useNotifications(
  uid:     string | null,
  enabled: boolean = true,
): {
  notifications: Notification[];
  unreadCount:   number;
  loading:       boolean;
} {
  const ref = (uid && enabled)
    ? query(
        collection(db, "notifications", uid, "items"),
        orderBy("createdAt", "desc"),
        limit(20),
      )
    : null;

  const [rows, loading] = useCollectionData(ref);
  const all         = (rows ?? []) as Notification[];
  const unreadCount = all.filter(n => !n.read).length;
  return { notifications: all, unreadCount, loading };
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
