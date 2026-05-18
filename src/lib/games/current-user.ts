// ─── Per-request current-user context for game hubs ──────────────────────────
//
// Game-hub layout, banner, and Overview all need the same two facts:
//   - who is the viewer (uid + display info)
//   - if the hub is for League of Legends, do they have a linked integration
//
// Wrapping the lookup in React `cache()` means the layout + section can each
// call it without firing duplicate Firestore reads — the second caller gets
// the cached promise from the first. This is the request-scoped dedup the
// Next.js app-router docs recommend for shared data fetching.

import { cache } from "react";
import { cookies } from "next/headers";
import type { LeagueIntegration } from "@/types/integrations";

export interface CurrentUserContext {
  uid:          string;
  displayName:  string;
  avatarUrl?:   string | null;
  clanId?:      string | null;
}

export const getCurrentUserContext = cache(async (): Promise<CurrentUserContext | null> => {
  try {
    const sessionCookie = cookies().get("session")?.value;
    if (!sessionCookie) return null;

    const { adminAuth, adminDb } = await import("@/lib/firebase/admin");
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);

    const profSnap = await adminDb.collection("profiles").doc(decoded.uid).get();
    const prof = profSnap.exists ? profSnap.data() : null;

    return {
      uid:         decoded.uid,
      displayName: (prof?.displayName as string | undefined) ?? "",
      avatarUrl:   (prof?.avatarUrl   as string | undefined) ?? null,
      clanId:      (prof?.clanId      as string | null | undefined) ?? null,
    };
  } catch {
    return null;
  }
});

export const getCurrentLeagueIntegration = cache(async (): Promise<LeagueIntegration | null> => {
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;

  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb
      .collection("profiles")
      .doc(ctx.uid)
      .collection("integrations")
      .doc("league")
      .get();
    if (!snap.exists) return null;

    const data = snap.data();
    if (!data) return null;

    const toDate = (v: unknown): Date =>
      (v as { toDate?: () => Date } | undefined)?.toDate?.() ?? new Date(0);

    return {
      provider:            "league",
      linkedAt:            toDate(data.linkedAt),
      lastSyncAt:          toDate(data.lastSyncAt),
      lastManualRefreshAt: data.lastManualRefreshAt ? toDate(data.lastManualRefreshAt) : undefined,
      account:             data.account,
      snapshot:            data.snapshot,
    } as LeagueIntegration;
  } catch (err) {
    console.error("[getCurrentLeagueIntegration]", err);
    return null;
  }
});
