"use server";

// Server action for the Live Now client island to refresh.
// Per-user soft rate limit — Riot's spectator-v5 quota is shared across the
// whole project, so we cap any single refresh to one call per 30s per session.

import { cookies } from "next/headers";
import { getLiveGames, type LiveGameRow } from "@/lib/riot/live-game";

interface RefreshResult {
  success:  boolean;
  rows?:    LiveGameRow[];
  error?:   string;
}

const lastRefresh = new Map<string, number>();
const COOLDOWN_MS = 30_000;

export async function refreshLiveGames(clanId: string | null): Promise<RefreshResult> {
  try {
    const sessionCookie = cookies().get("session")?.value;
    if (!sessionCookie) return { success: false, error: "Unauthenticated" };

    const { adminAuth } = await import("@/lib/firebase/admin");
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);

    const last = lastRefresh.get(decoded.uid) ?? 0;
    const now  = Date.now();
    if (now - last < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
      return { success: false, error: `Please wait ${wait}s before refreshing again` };
    }
    lastRefresh.set(decoded.uid, now);

    const rows = await getLiveGames({ clanId: clanId ?? undefined });
    return { success: true, rows };
  } catch (err) {
    console.error("[refreshLiveGames]", err);
    return { success: false, error: "Could not refresh" };
  }
}
