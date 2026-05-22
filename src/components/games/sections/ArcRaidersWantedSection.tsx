// ─── Arc Raiders — Wanted section ────────────────────────────────────────────
//
// Public board of open + currently-claimed bounties. Reads from the
// /bounties collection scoped to gameSlug. Per the design (mod-vetted intake),
// users don't post bounties from here — they open a Discord ticket. The
// "Submit a bounty" CTA links to that channel. The HowItWorks block below
// documents both the intake (issuer) and claim (hunter) flows for first-time
// visitors — these flows live partly on Discord and partly on the site, so
// the explanation needs to live in the section itself.

import { Crosshair, ExternalLink, MessageSquare, Shield, Eye, Award } from "lucide-react";
import { listBounties } from "@/lib/actions/bounty.actions";
import { getCurrentUserContext } from "@/lib/games/current-user";
import { WantedCard } from "./WantedCard";
import {
  BOUNTY_MIN_XP,
  BOUNTY_MAX_XP,
  BOUNTY_DEFAULT_TTL_DAYS,
} from "@/types/bounty";

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

      {/* ── How it works ─────────────────────────────────────────────────────
          Two-column explainer (stacks on mobile) covering the issuer flow
          (Discord-side intake → mod vetting → published) and the hunter flow
          (claim on-site → submit evidence → mod review). Rendered as a
          decorated <details> on mobile would be nicer eventually but the
          flat panel keeps it discoverable for first-time visitors. */}
      <HowItWorks ticketUrl={TICKET_URL} />

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

// ─── How it works ────────────────────────────────────────────────────────────
//
// Always-visible two-column explainer rendered once between the intake CTA
// and the bounty grid. Issuer column documents the Discord-side intake
// (because that's where the flow starts); hunter column documents the
// on-site claim flow. The footer captures the system bounds (reward range,
// expiry, cooldowns) so users see them once without having to click around.

function HowItWorks({ ticketUrl }: { ticketUrl: string | null }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
        {/* ── Issuer flow ──────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={14} style={{ color: "var(--accent)" }} />
            <h3
              className="font-display font-semibold text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              Posting a bounty
            </h3>
          </div>
          <ol className="space-y-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            <Step n={1}>
              {ticketUrl ? (
                <>
                  <a
                    href={ticketUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-2 hover:underline"
                    style={{ color: "var(--accent)" }}
                  >
                    Open a Discord ticket
                  </a>{" "}
                  with the target&apos;s details — who they are, where to find them, and why they&apos;re on your wanted list.
                </>
              ) : (
                <>Open a Discord ticket with the target&apos;s details — who they are, where to find them, and why they&apos;re on your wanted list.</>
              )}
            </Step>
            <Step n={2}>
              Suggest a reward between <strong style={{ color: "var(--text-primary)" }}>{BOUNTY_MIN_XP}</strong> and <strong style={{ color: "var(--text-primary)" }}>{BOUNTY_MAX_XP} XP</strong>. Bigger bounties draw faster hunters.
            </Step>
            <Step n={3}>
              A moderator reviews your request. If approved, the bounty goes live on this board and pings the <code style={{ background: "var(--bg-elevated)", padding: "0 4px", borderRadius: 3 }}>#bounty-board</code> Discord channel.
            </Step>
            <Step n={4}>
              You can cancel your own bounty 24h after it goes live. Mods can also intervene if needed.
            </Step>
          </ol>
        </div>

        {/* ── Hunter flow ──────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Eye size={14} style={{ color: "var(--accent)" }} />
            <h3
              className="font-display font-semibold text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              Claiming a bounty
            </h3>
          </div>
          <ol className="space-y-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            <Step n={1}>
              Eliminate the target. Record the clip — kill-cam, scoreboard, or any footage that proves identity + kill.
            </Step>
            <Step n={2}>
              Post the clip in the bounty&apos;s Discord ticket (or any host that gives a public URL — YouTube, Streamable, etc.).
            </Step>
            <Step n={3}>
              Click <strong style={{ color: "var(--text-primary)" }}>Claim bounty</strong> below, add notes pointing to the clip, and submit. Mods review and approve / reject.
            </Step>
            <Step n={4}>
              Approved claims credit the reward XP to your profile. Rejected claims lock you out for 15 minutes — other hunters can claim immediately.
            </Step>
          </ol>
        </div>
      </div>

      {/* Footnote with the operational bounds in one place */}
      <div
        className="mt-5 pt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]"
        style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
      >
        <span className="inline-flex items-center gap-1">
          <Award size={10} /> Rewards {BOUNTY_MIN_XP}–{BOUNTY_MAX_XP} XP
        </span>
        <span className="inline-flex items-center gap-1">
          <Crosshair size={10} /> Expires after {BOUNTY_DEFAULT_TTL_DAYS} days
        </span>
        <span className="inline-flex items-center gap-1">
          <Shield size={10} /> Mod-reviewed · evidence required for payout
        </span>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span
        className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold tabular-nums"
        style={{
          background: "rgba(99,102,241,0.10)",
          color:      "var(--accent)",
          border:     "1px solid rgba(99,102,241,0.25)",
        }}
        aria-hidden
      >
        {n}
      </span>
      <span className="flex-1">{children}</span>
    </li>
  );
}
