import Link from "next/link";

const DISCORD_URL    = "https://discord.gg/NB9VftUUSJ";
const EFFECTIVE_DATE = "13 May 2026";

export const metadata = {
  title:       "Terms of Service — ClanForge",
  description: "The terms that govern your use of ClanForge.",
};

// ── Content primitives ───────────────────────────────────────────────────────

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="font-display font-bold text-xl mt-8 mb-3 scroll-mt-20"
      style={{ color: "var(--text-primary)" }}
    >
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-base leading-relaxed mb-3"
      style={{ color: "var(--text-secondary)" }}
    >
      {children}
    </p>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li
      className="text-base leading-relaxed mb-1.5"
      style={{ color: "var(--text-secondary)" }}
    >
      {children}
    </li>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto">

      {/* ── Header ── */}
      <header className="mb-8">
        <h1
          className="font-display font-bold text-4xl mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Terms of Service
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Effective {EFFECTIVE_DATE}
        </p>
      </header>

      <P>
        These terms govern your use of ClanForge — the website, the player profile system,
        the clan and tournament features, and any community spaces we operate. By creating
        an account, signing in, or using any part of ClanForge, you agree to these terms.
      </P>
      <P>
        They&apos;re written in plain English on purpose. Read them. If you don&apos;t agree, please
        don&apos;t use the service.
      </P>

      {/* ── 1. The service ── */}
      <H2 id="service">1. The service</H2>
      <P>
        ClanForge is a social platform for gamers. We provide tools for creating a player
        profile, organising clans, running tournaments, and finding people to play with.
        ClanForge is offered free of charge today; we reserve the right to change pricing
        or introduce paid features in the future, and we&apos;ll give reasonable notice if we do.
      </P>

      {/* ── 2. Accounts ── */}
      <H2 id="accounts">2. Your account</H2>
      <P>
        You need an account to use most of ClanForge. When you sign up, you agree to:
      </P>
      <ul className="list-disc pl-6 mb-4">
        <Bullet>Provide accurate sign-up details (a working email, a username you&apos;re entitled to use).</Bullet>
        <Bullet>Keep your password and any third-party sign-in (e.g. Google) secure. You&apos;re responsible for activity that happens under your account.</Bullet>
        <Bullet>Be at least 13 years old, or the minimum age of digital consent in your country if that&apos;s higher.</Bullet>
        <Bullet>Use only one account per person, unless we&apos;ve explicitly approved otherwise.</Bullet>
      </ul>

      {/* ── 3. Your content ── */}
      <H2 id="content">3. Content you post</H2>
      <P>
        You keep ownership of what you post on ClanForge — your profile bio, your avatar,
        your banner, your clan posts, your tournament rules. By posting it, you grant
        ClanForge a non-exclusive, worldwide licence to host, display, and back up that
        content so the service can function. You can revoke this licence by deleting the
        content or your account.
      </P>
      <P>
        Don&apos;t post anything you don&apos;t have the right to share. We may remove content that
        violates these terms or that we&apos;re legally required to remove.
      </P>

      {/* ── 4. Acceptable use ── */}
      <H2 id="acceptable-use">4. Acceptable use</H2>
      <P>
        You agree NOT to use ClanForge to:
      </P>
      <ul className="list-disc pl-6 mb-4">
        <Bullet>Harass, threaten, dox, or impersonate other users.</Bullet>
        <Bullet>Post hateful, sexually explicit, or violent content.</Bullet>
        <Bullet>Cheat in tournaments, manipulate results, or coordinate match-fixing.</Bullet>
        <Bullet>Scrape, mass-download, or commercially redistribute data from the service.</Bullet>
        <Bullet>Probe, attack, or otherwise attempt to bypass the platform&apos;s security.</Bullet>
        <Bullet>Spam other users, send unsolicited DMs, or promote unrelated services.</Bullet>
      </ul>
      <P>
        We may suspend or terminate accounts that breach these rules, with or without prior
        notice depending on severity.
      </P>

      {/* ── 5. Clans & tournaments ── */}
      <H2 id="clans-tournaments">5. Clans and tournaments</H2>
      <P>
        Clan leaders are responsible for what happens inside their clan — moderating posts,
        managing members, choosing a clan tag, and behaving fairly toward applicants.
        Tournament creators are responsible for their rules, schedule, prize logistics, and
        for resolving disputes between participants. ClanForge provides the infrastructure;
        we don&apos;t arbitrate community-level disputes unless a clear platform rule is broken.
      </P>

      {/* ── 6. Termination ── */}
      <H2 id="termination">6. Termination</H2>
      <P>
        You can delete your account at any time. We may suspend or terminate your account
        if you breach these terms, if your activity puts the service or other users at risk,
        or if we&apos;re legally required to do so. On termination, your profile is removed and
        your clan and tournament memberships end; some data may remain in backups for a
        limited period.
      </P>

      {/* ── 7. Disclaimer ── */}
      <H2 id="disclaimer">7. Disclaimer</H2>
      <P>
        ClanForge is provided &quot;as is&quot;. We make no warranties about availability, accuracy
        of content posted by users, or fitness for any particular purpose. We&apos;ll try hard to
        keep things online and working, but downtime, bugs, and data loss are possible. Use
        the service at your own risk.
      </P>

      {/* ── 8. Changes ── */}
      <H2 id="changes">8. Changes to these terms</H2>
      <P>
        We may update these terms when the service changes meaningfully. If the changes are
        significant, we&apos;ll announce them in the platform or via Discord before they take
        effect. Continuing to use ClanForge after the new terms take effect counts as
        acceptance.
      </P>

      {/* ── 9. Contact ── */}
      <H2 id="contact">9. Contact</H2>
      <P>
        Questions about these terms? Reach out in the{" "}
        <Link
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
          style={{ color: "var(--accent)" }}
        >
          ClanForge Discord
        </Link>{" "}
        and we&apos;ll get back to you.
      </P>
    </div>
  );
}
