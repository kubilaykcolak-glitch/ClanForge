// Compact linked-account chip shown inside the LoL banner on every section
// of the LoL hub. Server component — uses the per-request cached
// integration lookup so it shares its Firestore read with anything else
// on the page that calls getCurrentLeagueIntegration.

import Link from "next/link";
import { Plug } from "lucide-react";
import { getCurrentLeagueIntegration } from "@/lib/games/current-user";
import { formatRank, tierColour } from "@/lib/riot/assets";

export async function LeagueBannerStatus() {
  const integration = await getCurrentLeagueIntegration();

  if (!integration) {
    return (
      <Link
        href="/profile/edit"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors"
        style={{
          background: "var(--bg-elevated)",
          border:     "1px solid var(--border-default)",
          color:      "var(--text-secondary)",
        }}
      >
        <Plug size={11} />
        Link Riot account
      </Link>
    );
  }

  const rank   = integration.snapshot.soloRank ?? integration.snapshot.flexRank;
  const colour = tierColour(rank?.tier ?? null);
  const region = integration.account.region;

  return (
    <Link
      href="/profile/edit"
      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors"
      style={{
        background: "var(--bg-elevated)",
        border:     "1px solid var(--border-default)",
        color:      "var(--text-primary)",
      }}
      title="Linked Riot account"
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: "var(--success)" }}
        aria-hidden
      />
      <span className="truncate max-w-[140px]">
        {integration.account.gameName}#{integration.account.tagLine}
      </span>
      <span className="opacity-50" aria-hidden>·</span>
      <span style={{ color: "var(--text-muted)" }}>{region}</span>
      {rank && (
        <>
          <span className="opacity-50" aria-hidden>·</span>
          <span style={{ color: colour }}>
            {formatRank(rank.tier, rank.division)} · {rank.lp} LP
          </span>
        </>
      )}
    </Link>
  );
}
