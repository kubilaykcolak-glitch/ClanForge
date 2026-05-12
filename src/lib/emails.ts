import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM    = "ClanForge <onboarding@resend.dev>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

// Shared email shell — table-based so Outlook / Gmail render it correctly.
function shell(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ClanForge</title>
</head>
<body style="margin:0;padding:0;background:#111111;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#111111;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0"
               style="max-width:600px;width:100%;background:#1a1a1a;border-radius:12px;overflow:hidden;border:1px solid #2a2a2a;">

          <!-- Logo bar -->
          <tr>
            <td style="background:#6366f1;padding:20px 32px;">
              <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">ClanForge</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 28px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #2a2a2a;">
              <p style="margin:0;font-size:12px;color:#555555;line-height:1.6;">
                You received this email because you have an account on ClanForge.<br />
                If you did not expect this email, you can safely ignore it.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `
  <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 8px;">
    <tr>
      <td style="border-radius:8px;background:#6366f1;">
        <a href="${href}"
           style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;
                  color:#ffffff;text-decoration:none;border-radius:8px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

// ── Function 1: Tournament registration ───────────────────────────────────────

export async function sendTournamentRegistrationEmail(
  to: string,
  username: string,
  tournamentName: string,
  tournamentId: string,
  startsAt: Date,
): Promise<void> {
  const tournamentUrl = `${APP_URL}/tournaments/${tournamentId}`;

  const html = shell(`
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#ffffff;">
      You&rsquo;re in, ${username}!
    </h1>
    <p style="margin:0 0 8px;font-size:15px;color:#aaaaaa;line-height:1.7;">
      You&rsquo;ve successfully registered for
      <strong style="color:#ffffff;">${tournamentName}</strong>.
    </p>
    <p style="margin:0;font-size:15px;color:#aaaaaa;line-height:1.7;">
      The tournament starts on
      <strong style="color:#ffffff;">${formatDate(startsAt)}</strong>.
    </p>
    ${button(tournamentUrl, "View Tournament")}
    <p style="margin:24px 0 0;font-size:14px;color:#666666;">
      Good luck! &mdash; The ClanForge Team
    </p>
  `);

  try {
    await resend.emails.send({
      from:    FROM,
      to,
      subject: `You're registered for ${tournamentName} 🎮`,
      html,
    });
  } catch (err) {
    console.error("[email] sendTournamentRegistrationEmail failed:", err);
  }
}

// ── Function 2: Clan invite ───────────────────────────────────────────────────

export async function sendClanInviteEmail(
  to: string,
  username: string,
  clanName: string,
  clanSlug: string,
  inviterName: string,
): Promise<void> {
  const clanUrl = `${APP_URL}/clans/${clanSlug}`;

  const html = shell(`
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#ffffff;">
      You&rsquo;ve been invited!
    </h1>
    <p style="margin:0 0 8px;font-size:15px;color:#aaaaaa;line-height:1.7;">
      Hey ${username}, <strong style="color:#ffffff;">${inviterName}</strong> has invited you
      to join the clan <strong style="color:#ffffff;">${clanName}</strong> on ClanForge.
    </p>
    <p style="margin:0;font-size:15px;color:#aaaaaa;line-height:1.7;">
      Click below to view the clan and accept the invitation.
    </p>
    ${button(clanUrl, `Join ${clanName}`)}
    <p style="margin:24px 0 0;font-size:14px;color:#666666;">
      See you on the battlefield! &mdash; The ClanForge Team
    </p>
  `);

  try {
    await resend.emails.send({
      from:    FROM,
      to,
      subject: `${inviterName} invited you to join ${clanName}`,
      html,
    });
  } catch (err) {
    console.error("[email] sendClanInviteEmail failed:", err);
  }
}

// ── Function 3: Match result ──────────────────────────────────────────────────

export async function sendMatchResultEmail(
  to: string,
  username: string,
  result: "win" | "loss",
  tournamentName: string,
  tournamentId: string,
  nextMatchDate?: Date,
): Promise<void> {
  const tournamentUrl = `${APP_URL}/tournaments/${tournamentId}`;
  const isWin         = result === "win";

  const resultBadge = isWin
    ? `<span style="display:inline-block;padding:4px 14px;border-radius:20px;
                    background:rgba(99,102,241,0.2);color:#818cf8;
                    font-size:13px;font-weight:600;letter-spacing:0.5px;">VICTORY</span>`
    : `<span style="display:inline-block;padding:4px 14px;border-radius:20px;
                    background:rgba(255,255,255,0.07);color:#888888;
                    font-size:13px;font-weight:600;letter-spacing:0.5px;">DEFEAT</span>`;

  const nextMatchBlock = nextMatchDate
    ? `<p style="margin:16px 0 0;font-size:15px;color:#aaaaaa;line-height:1.7;">
         Your next match: <strong style="color:#ffffff;">${formatDate(nextMatchDate)}</strong>
       </p>`
    : "";

  const html = shell(`
    <div style="margin-bottom:20px;">${resultBadge}</div>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#ffffff;">
      ${isWin ? "You won — next round awaits!" : "Match result recorded"}
    </h1>
    <p style="margin:0 0 8px;font-size:15px;color:#aaaaaa;line-height:1.7;">
      Hey ${username}, your match result for
      <strong style="color:#ffffff;">${tournamentName}</strong> has been recorded.
    </p>
    <p style="margin:0;font-size:15px;color:#aaaaaa;line-height:1.7;">
      ${isWin
        ? "Great performance — keep it up and take the title!"
        : "Better luck next time. Every match is a learning experience."}
    </p>
    ${nextMatchBlock}
    ${button(tournamentUrl, "View Tournament")}
    <p style="margin:24px 0 0;font-size:14px;color:#666666;">
      ${isWin ? "Keep pushing! " : ""}&mdash; The ClanForge Team
    </p>
  `);

  try {
    await resend.emails.send({
      from:    FROM,
      to,
      subject: isWin ? "You won! Next round awaits 🏆" : "Match result recorded",
      html,
    });
  } catch (err) {
    console.error("[email] sendMatchResultEmail failed:", err);
  }
}
