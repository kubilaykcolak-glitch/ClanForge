// ─── Bounty webhook smoke-test ───────────────────────────────────────────────
//
// Fires one sample embed for every BountyEventKind to the real Discord
// webhooks, routing each event to the right channel(s) per the brainstorm
// matrix:
//
//   published       → board (+ role ping if DISCORD_BOUNTY_HUNTER_ROLE_ID set)
//   claim_opened    → mod-log
//   claim_approved  → board + mod-log
//   claim_rejected  → mod-log
//   cancelled       → mod-log
//   expired         → mod-log
//
// Run with:
//   npx tsx scripts/test-bounty-webhooks.ts
//
// Reads DISCORD_BOUNTY_BOARD_WEBHOOK_URL + DISCORD_BOUNTY_MOD_LOG_WEBHOOK_URL
// from .env.local (loaded manually so we don't have to add a dotenv dep).
// All payloads use fake IDs / names so nothing in this script touches Firestore.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ── Load .env.local manually ────────────────────────────────────────────────
// We don't want to assume a dotenv dependency. The file is tiny and the
// format we care about is just `KEY=VALUE` per line, stripping comments
// and any blank lines.

function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) {
    console.warn("[test-webhooks] .env.local not found at", path);
    return;
  }
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key   = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    // Don't clobber values already injected by the shell (e.g. CI). First
    // wins so the script behaves consistently across environments.
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvLocal();

// Real webhook module — imported as a type-only ref for the payload shape
// (so TS still checks our sample payloads). The runtime import happens
// inside the async IIFE below, AFTER env vars are loaded, so the module's
// process.env reads see the .env.local values.
import type { postBountyBoard as PostBoardT, postBountyModLog as PostModLogT } from "../src/lib/discord/webhooks";
type BountyEventPayload = Parameters<typeof PostBoardT>[0];
// Force-import type-only symbols so TS doesn't drop them in the emit.
type _T = typeof PostModLogT;
void ({} as _T);

// ── Sample payloads ─────────────────────────────────────────────────────────
//
// Same shape the real lifecycle posts use. discordUserId is intentionally
// left null on the issuer side and filled on the hunter side so you can see
// what a ping vs. plain-name renders like side-by-side. If you want to ping
// your own Discord account, drop your snowflake in `MY_DISCORD_USER_ID`
// below — leave null otherwise and the test will use a non-mentioning name.

const MY_DISCORD_USER_ID: string | null = null; // e.g. "241834892101947392"

const baseShared = {
  gameSlug:    "arc-raiders" as const,
  bountyId:    "test-" + Date.now(),
  title:       "[TEST] Eliminate Husk-Hunter-77",
  targetLabel: "Discord: HuskHunter77 · Last seen on Dam (Friday evenings UTC)",
  rewardXp:    500,
  issuer:      { displayName: "TestIssuer", discordUserId: null },
};

const payloads: Array<{
  label:   string;
  channel: "board" | "mod-log" | "both";
  payload: BountyEventPayload;
}> = [
  {
    label:   "published",
    channel: "board",
    payload: {
      ...baseShared,
      kind: "published",
      discordTicketUrl: "https://discord.com/channels/1234/5678/9012",
    },
  },
  {
    label:   "claim_opened",
    channel: "mod-log",
    payload: {
      ...baseShared,
      kind:   "claim_opened",
      hunter: { displayName: "TestHunter", discordUserId: MY_DISCORD_USER_ID },
    },
  },
  {
    label:   "claim_approved",
    channel: "both",
    payload: {
      ...baseShared,
      kind:   "claim_approved",
      hunter: { displayName: "TestHunter", discordUserId: MY_DISCORD_USER_ID },
    },
  },
  {
    label:   "claim_rejected",
    channel: "mod-log",
    payload: {
      ...baseShared,
      kind:   "claim_rejected",
      hunter: { displayName: "TestHunter", discordUserId: MY_DISCORD_USER_ID },
      reason: "Video evidence didn't show the kill confirmation screen — resubmit with the death-cam recording.",
    },
  },
  {
    label:   "cancelled",
    channel: "mod-log",
    payload: {
      ...baseShared,
      kind:   "cancelled",
      reason: "Target no longer playing.",
    },
  },
  {
    label:   "expired",
    channel: "mod-log",
    payload: { ...baseShared, kind: "expired" },
  },
];

// ── Run ─────────────────────────────────────────────────────────────────────

(async () => {
  // webhooks.ts starts with `import "server-only"`, which throws at runtime
  // when loaded outside a Next.js bundle. We're running in a plain Node
  // script, so neutralise it by pre-populating the require cache with an
  // empty module before importing. Safe — `server-only` is a build-time
  // guard, not a runtime contract.
  const Module = await import("node:module");
  const req = Module.createRequire(import.meta.url);
  const serverOnlyPath = req.resolve("server-only");
  const cache = (req as unknown as { cache: Record<string, { exports: unknown }> }).cache;
  cache[serverOnlyPath] = { exports: {} };

  const { postBountyBoard, postBountyModLog } = await import("../src/lib/discord/webhooks");

  for (const { label, channel, payload } of payloads) {
    const targets =
      channel === "both"     ? ["board", "mod-log"] as const :
      channel === "board"    ? ["board"]            as const :
                               ["mod-log"]          as const;
    for (const t of targets) {
      try {
        if (t === "board") await postBountyBoard(payload);
        else               await postBountyModLog(payload);
        console.log(`✓ ${label.padEnd(15)} → ${t}`);
      } catch (err) {
        console.error(`✗ ${label} → ${t}`, err);
      }
      // Light delay so Discord renders the embeds in order (rate limit is
      // ~5/sec; we send well under that).
      await new Promise(r => setTimeout(r, 350));
    }
  }
  console.log("\nDone. Check your #bounty-board and #bounty-mod-log channels.");
})();
