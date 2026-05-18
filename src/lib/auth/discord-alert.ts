// ─── Discord admin webhook alerts ────────────────────────────────────────────
//
// Out-of-band visibility for high-impact admin actions. If your session is
// hijacked and someone uses it to grant themselves super_admin, you find out
// in Discord seconds later — not when a customer complains hours later.
//
// Set DISCORD_ADMIN_WEBHOOK_URL on Vercel to enable. If unset, alerts are
// silently dropped — the system still works, you just lose the signal.

export interface AdminAlert {
  /** Short title shown as the embed heading. */
  title:  string;
  /** Multi-line markdown description. */
  body:   string;
  /** Colour for the embed sidebar. */
  level:  "info" | "warn" | "critical";
  /** Who triggered the action — rendered as the embed author + footer uid. */
  actor?: { label: string; uid: string };
  /** Optional structured fields (key/value pairs displayed under the body). */
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

const LEVEL_COLOURS: Record<AdminAlert["level"], number> = {
  info:     0x22c55e, // green  — benign / reversible actions
  warn:     0xf59e0b, // amber  — sensitive but expected
  critical: 0xef4444, // red    — role grants, bans, refunds
};

// Discord-side render order (read top-to-bottom):
//   [colour bar] [author: "👤 Kubilay (@kubilay) · super_admin"]
//                 title (with action emoji)
//                 description (short, no actor repeated)
//                 inline field grid
//                 footer (actor UID + timestamp)
export async function sendAdminAlert(alert: AdminAlert): Promise<void> {
  const url = process.env.DISCORD_ADMIN_WEBHOOK_URL;
  if (!url) return;

  const embed: Record<string, unknown> = {
    title:       alert.title,
    description: alert.body,
    color:       LEVEL_COLOURS[alert.level],
    timestamp:   new Date().toISOString(),
  };

  if (alert.actor) {
    embed.author = { name: `👤 ${alert.actor.label}` };
    embed.footer = { text: `UID: ${alert.actor.uid}` };
  }

  if (alert.fields && alert.fields.length > 0) {
    embed.fields = alert.fields.map(f => ({
      name:   f.name,
      value:  f.value,
      inline: f.inline ?? true,
    }));
  }

  const payload = { embeds: [embed] };

  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[discord-alert] webhook returned ${res.status}`);
    }
  } catch (err) {
    // Best-effort. The audit log is the durable record; Discord is convenience.
    console.error("[discord-alert] failed:", err);
  }
}
