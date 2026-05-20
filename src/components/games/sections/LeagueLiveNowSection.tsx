// ─── LoL hub: Live Now ────────────────────────────────────────────────────────
//
// Server component. Probes spectator-v5 for the viewer's clanmates (capped at
// 20) and renders whoever is currently in a game. Without a clan, falls back
// to the first 20 linked accounts globally.
//
// Riot's spectator endpoint is rate-limit sensitive — we cap cohort size in
// the lib helper and gate manual refresh via a 30s-per-user cooldown server
// action.

import { Swords } from "lucide-react";
import { getCurrentUserContext } from "@/lib/games/current-user";
import { getLiveGames } from "@/lib/riot/live-game";
import { LeagueLiveNowClient } from "./LeagueLiveNowClient";

export default async function LeagueLiveNowSection() {
  const viewer = await getCurrentUserContext();
  const clanId = viewer?.clanId ?? null;

  const rows = await getLiveGames({ clanId: clanId ?? undefined });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>
            Scope
          </p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {clanId ? "Your clanmates" : "Top 20 linked players globally"}
            {" — "}
            <span style={{ color: rows.length > 0 ? "var(--success)" : "var(--text-muted)" }}>
              {rows.length} in game
            </span>
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
        >
          <Swords size={32} style={{ color: "var(--text-muted)" }} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Nobody{clanId ? " in your clan" : ""} is in a live game right now
          </p>
          <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
            Live games refresh on demand — Riot rate limits prevent us from polling continuously.
          </p>
        </div>
      ) : null}

      <LeagueLiveNowClient initialRows={rows} clanId={clanId} />
    </section>
  );
}
