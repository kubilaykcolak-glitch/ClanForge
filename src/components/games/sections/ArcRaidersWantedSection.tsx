// ─── Arc Raiders — Wanted section ────────────────────────────────────────────
//
// Public board of open + currently-claimed bounties. Reads from the
// /bounties collection scoped to gameSlug. Per the design (mod-vetted intake),
// users don't post bounties from here — they open a Discord ticket. The
// "Submit a bounty" CTA links to that channel.

import { Crosshair, ExternalLink } from "lucide-react";
import { listBounties } from "@/lib/actions/bounty.actions";
import { getCurrentUserContext } from "@/lib/games/current-user";
import { WantedCard } from "./WantedCard";

const TICKET_URL = process.env.NEXT_PUBLIC_DISCORD_BOUNTY_TICKET_URL ?? null;

export default async function ArcRaidersWantedSection() {
  const [bounties, viewer] = await Promise.all([
    listBounties("arc-raiders", ["open", "claimed"]),
    getCurrentUserContext(),
  ]);

  return (
    <section className="space-y-4">
      {/* Intake CTA + scope */}
      <div
        className="rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-start gap-3">
          <Crosshair size={20} style={{ color: "var(--accent)" }} />
          <div>
            <p className="font-display font-semibold" style={{ color: "var(--text-primary)" }}>
              {bounties.length} active {bounties.length === 1 ? "bounty" : "bounties"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Bounties are vetted by moderators before publishing. Claim evidence (video + screenshot) is reviewed before XP is awarded.
            </p>
          </div>
        </div>
        {TICKET_URL && (
          <a
            href={TICKET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold whitespace-nowrap"
            style={{ background: "var(--accent)", color: "white" }}
          >
            <ExternalLink size={14} />
            Submit a bounty (Discord)
          </a>
        )}
      </div>

      {bounties.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No active bounties right now.
          </p>
          {TICKET_URL && (
            <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
              Want to put up the first one? Open a ticket via the button above.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {bounties.map(b => (
            <WantedCard
              key={b.id}
              bounty={b}
              viewerUid={viewer?.uid ?? null}
              ticketUrl={TICKET_URL}
            />
          ))}
        </div>
      )}
    </section>
  );
}
