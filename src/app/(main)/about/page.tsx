import Link from "next/link";
import { Shield, Trophy, Users, MessagesSquare } from "lucide-react";

const DISCORD_URL = "https://discord.gg/NB9VftUUSJ";

export const metadata = {
  title:       "About — ClanForge",
  description: "ClanForge is a gaming social platform for profiles, clans, and tournaments.",
};

// ── Small content primitives ──────────────────────────────────────────────────

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="font-display font-bold text-2xl mb-3"
      style={{ color: "var(--text-primary)" }}
    >
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-base leading-relaxed"
      style={{ color: "var(--text-secondary)" }}
    >
      {children}
    </p>
  );
}

function FeatureRow({
  Icon,
  title,
  children,
}: {
  Icon:     React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  title:    string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div
        className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
        style={{
          background: "var(--bg-elevated)",
          border:     "1px solid var(--border-default)",
          color:      "var(--accent)",
        }}
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <h3
          className="font-display font-semibold text-base mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {children}
        </p>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-10">

      {/* ── Hero ── */}
      <header>
        <h1
          className="font-display font-bold text-4xl mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          About ClanForge
        </h1>
        <p
          className="text-lg leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          ClanForge is a social platform for competitive gamers. Build a profile,
          form a clan, run tournaments — and find the people you want to play with.
        </p>
      </header>

      {/* ── What we are ── */}
      <section>
        <H2>What ClanForge is</H2>
        <P>
          We&apos;re a focused home for the parts of gaming that happen between matches:
          showcasing what you play, organising your squad, and turning casual scrims
          into structured competition. It works across every game you play, on PC and
          console alike — your profile follows you regardless of where you compete.
        </P>
      </section>

      {/* ── Features grid ── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <FeatureRow Icon={Trophy} title="Player Profiles">
          A single page that captures your games, your ranks, your wins, and your linked
          platform accounts. Personalise it with custom banners, backgrounds, and accents.
        </FeatureRow>

        <FeatureRow Icon={Shield} title="Clans">
          Build a community around the games you love. Recruit members, share posts,
          assign officer roles, and represent your colours with a four-letter clan tag.
        </FeatureRow>

        <FeatureRow Icon={Trophy} title="Tournaments">
          Create brackets, set entry requirements, lock rosters, and report results.
          From casual single-elimination weekenders to scheduled competitive events.
        </FeatureRow>

        <FeatureRow Icon={Users} title="Find Players">
          A directory of public profiles ranked by XP. Search by username or clan tag.
          Recruit teammates, scout opponents, scope the field before a tournament.
        </FeatureRow>
      </section>

      {/* ── Who it's for ── */}
      <section>
        <H2>Who it&apos;s for</H2>
        <P>
          ClanForge is built for anyone who plays seriously enough to care who they play
          with. Whether you&apos;re running a 30-person clan across multiple titles, putting
          together a five-stack for ranked nights, or looking for an event that fits your
          schedule and rank — it&apos;s for you.
        </P>
      </section>

      {/* ── Roadmap ── */}
      <section>
        <H2>On the roadmap</H2>
        <P>
          We&apos;re actively working on cross-clan challenges, an LFG (Looking-For-Group)
          board, deeper tournament formats including double elimination, and richer
          integrations with the platforms you already use.
        </P>
      </section>

      {/* ── Contact ── */}
      <section
        className="rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        style={{
          background: "var(--bg-surface)",
          border:     "1px solid var(--border-default)",
        }}
      >
        <div>
          <h2
            className="font-display font-semibold text-lg mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            Get in touch
          </h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Questions, ideas, or bug reports — find us in the ClanForge Discord.
          </p>
        </div>
        <Link
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white shrink-0 transition-colors"
          style={{ background: "var(--accent)" }}
        >
          <MessagesSquare size={15} />
          Join the Discord
        </Link>
      </section>
    </div>
  );
}
