import "server-only";

// ─── Outbound Discord webhook module ─────────────────────────────────────────
//
// Single audit surface for every Discord post the app makes. Imported by
// bounty.actions.ts and (in time) any other feature that needs to notify
// the community Discord. Hosts the embed builder, the retry policy, and
// the env-var contract so individual callers don't reinvent any of it.
//
// Architecture decisions (locked in brainstorming Section 1):
//   - Webhook-only — no bot, no OAuth, no gateway connection. POSTing to
//     the channel webhook URL is enough for everything in v1.
//   - Two channels — public `#bounty-board` (announcements) and mod-only
//     `#bounty-mod-log` (audit + review queue). Each maps to one env var.
//   - Personal pings — when the issuer / claimer / winner has filled in
//     their `discordUserId` snowflake on their profile, we mention them
//     in the embed description so they get a real Discord notification.
//   - Role pings — opt-in via the `Bounty Hunter` role inside Discord.
//     Used only on bounty-published announcements so chat doesn't
//     constantly @-everyone the role.
//   - Fire-and-forget — every webhook POST has a 5s timeout and exactly
//     one retry on transport error. On final failure we log and return —
//     a failed Discord post NEVER prevents the on-site action from
//     completing. Bounties publish even when Discord is down.
//
// `server-only` import keeps this module out of any client bundle in case
// a Server Component ever accidentally re-exports it.

import type { GameSlug } from "@/lib/games/types";

// ─── Env-var contract ────────────────────────────────────────────────────────
//
// Read lazily on each call so a missing env var degrades the feature
// gracefully (we no-op the post) rather than crashing the action that
// tried to send it. Treated as secrets — never NEXT_PUBLIC_*.

function envWebhookUrl(channel: "board" | "mod-log"): string | null {
  const key = channel === "board"
    ? "DISCORD_BOUNTY_BOARD_WEBHOOK_URL"
    : "DISCORD_BOUNTY_MOD_LOG_WEBHOOK_URL";
  const value = process.env[key];
  if (!value) return null;
  // Defensive: log once if it doesn't look like a Discord webhook URL.
  // We don't reject — the operator might be hosting a custom shim — but
  // the warning helps surface env-var typos in production logs.
  if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(value)) {
    console.warn(`[discord/webhooks] ${key} doesn't look like a Discord webhook URL`);
  }
  return value;
}

function envHunterRoleId(): string | null {
  const value = process.env.DISCORD_BOUNTY_HUNTER_ROLE_ID;
  if (!value) return null;
  if (!/^\d{17,20}$/.test(value)) {
    console.warn("[discord/webhooks] DISCORD_BOUNTY_HUNTER_ROLE_ID isn't a snowflake");
    return null;
  }
  return value;
}

// ─── Public payload shape ────────────────────────────────────────────────────
//
// Each `postBounty*` event takes a payload describing the bounty and the
// participants. The webhook module formats this into Discord's embed
// structure; callers stay decoupled from Discord's wire format.

export type BountyEventKind =
  | "published"
  | "claim_opened"
  | "claim_approved"
  | "claim_rejected"
  | "cancelled"
  | "expired";

export interface BountyEventPayload {
  kind:        BountyEventKind;
  gameSlug:    GameSlug;
  bountyId:    string;
  title:       string;
  /** Short target description as shown on the public card — e.g. a
   *  Discord handle, in-game name, or descriptive phrase. */
  targetLabel: string;
  rewardXp:    number;
  /** Display name + optional snowflake for the bounty issuer. */
  issuer:      { displayName: string; discordUserId?: string | null };
  /** Hunter — present once a claim exists. */
  hunter?:     { displayName: string; discordUserId?: string | null };
  /** Mod's free-form reason text, used on rejection / cancellation. */
  reason?:     string | null;
  /** Optional Discord intake-ticket URL (carried over from publish). */
  discordTicketUrl?: string | null;
}

// ─── Public API ──────────────────────────────────────────────────────────────
//
// One function per channel. Callers pick which channel(s) to send to based
// on the event-channel matrix from the brainstorm. We don't combine into
// a `sendBountyEvent(kind)` super-function on purpose: keeping the channel
// choice at the call-site makes audits trivial ("grep postBountyModLog and
// see every mod-only notification we send").

export async function postBountyBoard(payload: BountyEventPayload): Promise<void> {
  const url = envWebhookUrl("board");
  if (!url) return;
  await post(url, buildEmbed(payload, "board"));
}

export async function postBountyModLog(payload: BountyEventPayload): Promise<void> {
  const url = envWebhookUrl("mod-log");
  if (!url) return;
  await post(url, buildEmbed(payload, "mod-log"));
}

// ─── Embed builder ───────────────────────────────────────────────────────────
//
// Discord embeds render consistently across desktop + mobile and let us
// attach a clickable URL back to the site without flooding chat with raw
// links. Accent colour is event-driven so a quick glance at chat tells
// the reader what kind of event this was:
//   - Indigo  → newly published bounty (matches site accent)
//   - Amber   → claim opened (something pending mod review)
//   - Green   → claim approved (a hunter just earned XP)
//   - Red     → rejected / cancelled (corrective state)

// Event-keyed accent colour. `published` and `claim_approved` use deep
// crimson on the public board so the kill-call and the kill-confirmation
// land with visual weight; the cooler colours stay for mod-internal noise.
const COLOUR: Record<BountyEventKind, number> = {
  published:       0xb91c1c, // crimson (kill-call)
  claim_opened:    0xf59e0b, // amber
  claim_approved:  0x7f1d1d, // deep crimson (kill-confirmation)
  claim_rejected:  0xef4444, // red
  cancelled:       0x94a3b8, // slate (neutral close)
  expired:         0x64748b, // slate-deeper (auto-close)
};

const HEADLINE: Record<BountyEventKind, string> = {
  published:      "🩸 BOUNTY LIVE",
  claim_opened:   "🛎️ Claim submitted",
  claim_approved: "💀 TARGET ELIMINATED",
  claim_rejected: "🚫 Claim rejected",
  cancelled:      "🛑 Bounty cancelled",
  expired:        "⌛ Bounty expired",
};

interface DiscordEmbed {
  title:       string;
  description: string;
  color:       number;
  url:         string;
  fields:      Array<{ name: string; value: string; inline?: boolean }>;
  timestamp:   string;
  footer:      { text: string };
}

interface DiscordWebhookBody {
  content?:          string;
  embeds:            DiscordEmbed[];
  /** Restrict @-mentions so a forged payload can never @everyone the server. */
  allowed_mentions:  { parse: string[]; users: string[]; roles: string[] };
}

function buildEmbed(payload: BountyEventPayload, channel: "board" | "mod-log"): DiscordWebhookBody {
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://clanforge.gg";
  const deepLink   = `${siteOrigin}/games/${payload.gameSlug}/wanted#bounty-${payload.bountyId}`;

  // Build mention list and the corresponding `allowed_mentions.users` so
  // Discord won't auto-suppress the ping. We only ping people who have
  // filled in their discordUserId AND whose ping is appropriate for the
  // channel: hunters on approved/rejected (their action got resolved),
  // issuers on cancelled/expired (their bounty went away).
  const mentionedUsers: string[] = [];
  const mention = (id: string | null | undefined) => {
    if (!id || !/^\d{17,20}$/.test(id)) return null;
    if (!mentionedUsers.includes(id)) mentionedUsers.push(id);
    return `<@${id}>`;
  };

  // Field list. The target is intentionally OMITTED here for `published`
  // and `claim_approved` — those two events promote the target into the
  // description as the visual focal point so it reads like a wanted poster
  // rather than a stat box. The other events keep target as a plain field
  // because they're informational / administrative rather than dramatic.
  const fields: DiscordEmbed["fields"] = [];
  const targetIsHeadline = payload.kind === "published" || payload.kind === "claim_approved";
  if (!targetIsHeadline) {
    fields.push({ name: "Target", value: trunc(payload.targetLabel, 256), inline: true });
  }
  fields.push(
    { name: "Reward",    value: `${payload.rewardXp} XP`,                  inline: true },
    { name: "Issued by", value: trunc(payload.issuer.displayName, 256),    inline: true },
  );

  let description: string;
  let rolePing    = "";

  switch (payload.kind) {
    case "published": {
      // Wanted-poster styling. The `diff` codeblock paints the target line
      // red in Discord's renderer; combined with the crimson embed accent
      // and skull headline, it reads as a kill-call rather than a chore.
      description =
        `## ☠️ TARGET\n` +
        "```diff\n" +
        `- ${trunc(payload.targetLabel, 200)}\n` +
        "```\n" +
        `🩸 A new bounty is live on ClanForge. **${payload.rewardXp} XP** to the hunter who closes it.`;
      // Opt-in role ping only on publish — chat-level signal that there's
      // new work available without spamming everyone with the role.
      if (channel === "board") {
        const roleId = envHunterRoleId();
        if (roleId) rolePing = `<@&${roleId}> `;
      }
      if (payload.discordTicketUrl) {
        fields.push({ name: "Intake ticket", value: `[Open in Discord](${payload.discordTicketUrl})`, inline: false });
      }
      break;
    }
    case "claim_opened": {
      const hunterMention = payload.hunter ? (mention(payload.hunter.discordUserId) ?? payload.hunter.displayName) : "Someone";
      description = `${hunterMention} just claimed this bounty. Mods, review the evidence and approve / reject.`;
      break;
    }
    case "claim_approved": {
      // Same wanted-poster styling as `published`, recoloured as the
      // confirmation. The deep-crimson accent + "ELIMINATED" headline +
      // strike-through target name reads as the kill-confirmation moment.
      const winnerMention = payload.hunter
        ? (mention(payload.hunter.discordUserId) ?? `**${payload.hunter.displayName}**`)
        : "The hunter";
      description =
        `## 💀 TARGET DOWN\n` +
        "```diff\n" +
        `- ~~${trunc(payload.targetLabel, 196)}~~\n` +
        "```\n" +
        `🏆 ${winnerMention} claimed the bounty and banked **${payload.rewardXp} XP**.`;
      break;
    }
    case "claim_rejected": {
      // Mod-log only: ping the claimer with the reason so they know why.
      const claimerMention = payload.hunter
        ? (mention(payload.hunter.discordUserId) ?? payload.hunter.displayName)
        : "the claimer";
      description = `${claimerMention}, the mod team couldn't approve this claim.${payload.reason ? `\n**Reason:** ${trunc(payload.reason, 1024)}` : ""}`;
      break;
    }
    case "cancelled": {
      const issuerMention = mention(payload.issuer.discordUserId) ?? payload.issuer.displayName;
      description = `${issuerMention} cancelled this bounty.${payload.reason ? `\n**Reason:** ${trunc(payload.reason, 1024)}` : ""}`;
      break;
    }
    case "expired": {
      description = `This bounty reached its expiry without being claimed.`;
      break;
    }
  }

  const embed: DiscordEmbed = {
    title:       trunc(`${HEADLINE[payload.kind]} — ${payload.title}`, 256),
    description: trunc(description, 4096),
    color:       COLOUR[payload.kind],
    url:         deepLink,
    fields,
    timestamp:   new Date().toISOString(),
    footer:      { text: `ClanForge · ${gameLabel(payload.gameSlug)}` },
  };

  return {
    content:          rolePing.trim() ? rolePing.trim() : undefined,
    embeds:           [embed],
    allowed_mentions: {
      // Empty parse + explicit users/roles arrays = ONLY the mentions
      // we explicitly enumerated ping. Forged payloads can't @everyone.
      parse: [],
      users: mentionedUsers,
      roles: rolePing.trim() && channel === "board"
        ? [envHunterRoleId()].filter((x): x is string => !!x)
        : [],
    },
  };
}

// ─── HTTP layer ──────────────────────────────────────────────────────────────
//
// fetch() with manual AbortController (Node's built-in is fine on Vercel /
// modern Node 18+). One retry on transport / 5xx; never throws upward.

async function post(url: string, body: DiscordWebhookBody): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(url, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify(body),
        signal:  ctrl.signal,
        cache:   "no-store",
      });
      clearTimeout(timer);
      // 2xx = success. 4xx = our bug or stale URL — don't retry. 5xx /
      // 429 = transient — retry once.
      if (res.ok) return;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        const text = await res.text().catch(() => "");
        console.error(`[discord/webhooks] ${res.status} — ${text.slice(0, 200)}`);
        return;
      }
      if (attempt === 2) {
        console.error(`[discord/webhooks] ${res.status} after retry — giving up`);
      }
    } catch (err) {
      if (attempt === 2) {
        console.error("[discord/webhooks] transport error after retry:", err);
      }
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trunc(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function gameLabel(slug: GameSlug): string {
  switch (slug) {
    case "league-of-legends": return "League of Legends";
    case "arc-raiders":       return "Arc Raiders";
  }
}
