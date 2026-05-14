import Link from "next/link";

const DISCORD_URL    = "https://discord.gg/NB9VftUUSJ";
const EFFECTIVE_DATE = "13 May 2026";

export const metadata = {
  title:       "Privacy Policy — ClanForge",
  description: "How ClanForge collects, uses, and protects your data.",
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

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto">

      {/* ── Header ── */}
      <header className="mb-8">
        <h1
          className="font-display font-bold text-4xl mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Privacy Policy
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Effective {EFFECTIVE_DATE}
        </p>
      </header>

      <P>
        ClanForge takes your privacy seriously. This policy explains what we collect, why,
        where it lives, and what control you have over it. It applies to all use of
        ClanForge — the website, your account, and the features inside it.
      </P>

      {/* ── 1. What we collect ── */}
      <H2 id="what-we-collect">1. What we collect</H2>
      <P>
        We collect only what we need to run the service:
      </P>
      <ul className="list-disc pl-6 mb-4">
        <Bullet>
          <strong style={{ color: "var(--text-primary)" }}>Account data:</strong> email,
          password hash (or third-party sign-in token, e.g. Google), username, and the
          times your account was created and last updated.
        </Bullet>
        <Bullet>
          <strong style={{ color: "var(--text-primary)" }}>Profile data:</strong> display
          name, bio, country, the platform handles you choose to link (Steam, Xbox, PSN,
          Discord, Twitch), your custom banner, background, and accent colour.
        </Bullet>
        <Bullet>
          <strong style={{ color: "var(--text-primary)" }}>Gameplay data:</strong> game
          records you create, your XP, tournament participation and outcomes, clan
          membership and role, and posts you make inside clan feeds.
        </Bullet>
        <Bullet>
          <strong style={{ color: "var(--text-primary)" }}>Technical data:</strong> the
          minimum needed to authenticate sessions (a signed session cookie) and to debug
          problems. We don&apos;t run third-party advertising or behavioural tracking.
        </Bullet>
      </ul>

      {/* ── 2. How we use it ── */}
      <H2 id="how-we-use-it">2. How we use it</H2>
      <P>
        Your data is used to:
      </P>
      <ul className="list-disc pl-6 mb-4">
        <Bullet>Show your profile, clan membership, and tournament participation to other users.</Bullet>
        <Bullet>Keep you signed in and let you securely manage your account.</Bullet>
        <Bullet>Run features you opted into — clan posts, tournament brackets, the player directory.</Bullet>
        <Bullet>Diagnose bugs and protect against abuse.</Bullet>
      </ul>
      <P>
        We do not sell your data. We do not share it with advertisers.
      </P>

      {/* ── 3. Where it lives ── */}
      <H2 id="where-it-lives">3. Where your data lives</H2>
      <P>
        ClanForge is built on Google Cloud / Firebase. Account credentials, profile and
        gameplay data are stored in Firebase Authentication and Cloud Firestore. Uploaded
        images (avatars, banners, backgrounds, clan assets, tournament banners, post
        images) are stored in Firebase Cloud Storage. These services run on Google&apos;s
        infrastructure and may transfer data across regions to provide reliability and
        backups.
      </P>

      {/* ── 4. Visibility ── */}
      <H2 id="visibility">4. What other users can see</H2>
      <P>
        By default, your profile (username, display name, avatar, country, bio, linked
        platform handles, XP, tournament stats, and clan affiliation) is visible to other
        signed-in users via the player directory. Email, sign-in method, and password are
        always private.
      </P>
      <P>
        You can toggle the visibility setting on your profile to hide yourself from the
        directory and the player search. Clan posts you write are visible to clan members;
        public clans show their member list and recent posts to anyone.
      </P>

      {/* ── 5. Your rights ── */}
      <H2 id="your-rights">5. Your rights</H2>
      <ul className="list-disc pl-6 mb-4">
        <Bullet>
          <strong style={{ color: "var(--text-primary)" }}>Access &amp; correction:</strong>{" "}
          most fields are directly editable on your profile. If you need help retrieving or
          fixing data, contact us via Discord.
        </Bullet>
        <Bullet>
          <strong style={{ color: "var(--text-primary)" }}>Deletion:</strong> you can delete
          your account at any time. We will remove your profile and clan membership and
          delete uploaded images; some references (e.g. tournament historical results) may
          be anonymised rather than removed if doing so would break shared records.
        </Bullet>
        <Bullet>
          <strong style={{ color: "var(--text-primary)" }}>Export:</strong> if you want a
          copy of your data before deleting, ask in Discord and we&apos;ll provide it.
        </Bullet>
      </ul>

      {/* ── 6. Children ── */}
      <H2 id="children">6. Children</H2>
      <P>
        ClanForge is not intended for children under 13. If you are under 13 (or under the
        minimum age of digital consent in your country if that&apos;s higher) please do not
        create an account. If we learn an account is held by a child below the relevant age,
        we&apos;ll remove it.
      </P>

      {/* ── 7. Security ── */}
      <H2 id="security">7. Security</H2>
      <P>
        Passwords are stored as hashes managed by Firebase Authentication; we don&apos;t see
        them in plain text. Sessions use signed cookies that expire on sign-out. Image
        uploads are limited to 5 MB and checked on both client and server. No system is
        perfectly secure — keep your password strong and unique, and let us know
        immediately if you suspect your account has been accessed by someone else.
      </P>

      {/* ── 8. Changes ── */}
      <H2 id="changes">8. Changes to this policy</H2>
      <P>
        We may update this policy when the service changes meaningfully. Significant
        changes will be announced in the platform or via Discord before they take effect.
      </P>

      {/* ── 9. Contact ── */}
      <H2 id="contact">9. Contact</H2>
      <P>
        Privacy questions or requests? Reach us in the{" "}
        <Link
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
          style={{ color: "var(--accent)" }}
        >
          ClanForge Discord
        </Link>
        .
      </P>
    </div>
  );
}
