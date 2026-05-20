// ─── LoL hub: Ladder ──────────────────────────────────────────────────────────
//
// Server component. Fetches the global top 50 + the viewer's clan ladder in
// parallel and hands both to the client island for tab switching. Reuses
// the cached snapshot already on each LeagueIntegration doc — no live Riot
// API calls fire here.

import Link from "next/link";
import { Trophy } from "lucide-react";
import { getCurrentUserContext } from "@/lib/games/current-user";
import { getLeagueLadder } from "@/lib/riot/ladder";
import { LeagueLadderClient } from "./LeagueLadderClient";

export default async function LeagueLadderSection() {
  const viewer = await getCurrentUserContext();
  const clanId = viewer?.clanId ?? null;

  // Parallel fetch: global ladder + (optional) viewer's clan ladder.
  const [global, clan] = await Promise.all([
    getLeagueLadder({ limit: 50 }),
    clanId ? getLeagueLadder({ clanId, limit: 50 }) : Promise.resolve([]),
  ]);

  if (global.length === 0) {
    return (
      <div
        className="rounded-2xl p-10 text-center"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
      >
        <Trophy size={32} style={{ color: "var(--text-muted)" }} className="mx-auto mb-3 opacity-40" />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          No ranked players yet
        </p>
        <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
          Link your League of Legends account from your{" "}
          <Link href="/profile/me" className="underline" style={{ color: "var(--accent)" }}>
            profile
          </Link>{" "}
          to appear on the ladder.
        </p>
      </div>
    );
  }

  return (
    <LeagueLadderClient
      global={global}
      clan={clan}
      hasClan={!!clanId}
      viewerUid={viewer?.uid ?? null}
    />
  );
}
