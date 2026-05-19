import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Clan, ClanPost, Tournament } from "@/types";
import { ClanCard } from "@/components/clan/ClanCard";
import { DashboardChallengesWidget } from "@/components/challenges/DashboardChallengesWidget";
import { DashboardMissionsWidget } from "@/components/missions/DashboardMissionsWidget";
import { RankChevron, type RankTier } from "@/components/ui/RankChevron";
import { StatBlock } from "@/components/ui/StatBlock";
import { MonoPill } from "@/components/ui/MonoPill";
import { Badge } from "@/components/ui/Badge";
import { formatDate, timeAgo, getInitials, clamp } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NewsItem {
  title:   string;
  link:    string;
  pubDate: string;
}

interface DashboardData {
  displayName:          string;
  username:             string;
  xp:                   number;
  tournamentsPlayed:    number;
  tournamentsWon:       number;
  gamesLogged:          number;
  clanId:               string | null;
  clanName:             string;
  clanSlug:             string;
  recentPosts:          ClanPost[];
  registeredTournaments: Tournament[];
  newsItems:            NewsItem[];
  recommendedClans:     Clan[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseRSS(xml: string, limit: number): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;

  while ((m = itemRe.exec(xml)) !== null && items.length < limit) {
    const block = m[1];

    // Title: CDATA or plain
    const titleM =
      block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ??
      block.match(/<title>([\s\S]*?)<\/title>/);

    // Link: plain <link> or atom:link href
    const linkM =
      block.match(/<link>(https?:\/\/[\s\S]*?)<\/link>/) ??
      block.match(/href="(https?:\/\/[^"]*)"/) ;

    const dateM = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

    if (titleM?.[1] && linkM?.[1]) {
      items.push({
        title:   titleM[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim(),
        link:    linkM[1].trim(),
        pubDate: dateM?.[1]?.trim() ?? "",
      });
    }
  }
  return items;
}

async function fetchNews(): Promise<NewsItem[]> {
  try {
    const res = await fetch("https://feeds.feedburner.com/ign/all", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSS(xml, 6);
  } catch {
    return [];
  }
}

function toTournament(d: FirebaseFirestore.QueryDocumentSnapshot): Tournament {
  const data = d.data();
  return {
    id:                   d.id,
    ...(data as Omit<Tournament, "id" | "createdAt" | "startsAt" | "registrationClosesAt" | "rosterLockedAt">),
    createdAt:             data.createdAt?.toDate?.()             ?? new Date(),
    startsAt:              data.startsAt?.toDate?.()              ?? new Date(),
    registrationClosesAt:  data.registrationClosesAt?.toDate?.()  ?? new Date(),
    rosterLockedAt:        data.rosterLockedAt?.toDate?.()        ?? new Date(),
  };
}

function toClan(d: FirebaseFirestore.QueryDocumentSnapshot): Clan {
  const data = d.data();
  return {
    id:        d.id,
    ...(data as Omit<Clan, "id" | "createdAt" | "updatedAt">),
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
    updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
  };
}

// ── Data fetch ────────────────────────────────────────────────────────────────

async function getDashboardData(uid: string): Promise<DashboardData | null> {
  const { adminDb } = await import("@/lib/firebase/admin");

  const profileSnap = await adminDb.collection("profiles").doc(uid).get();
  if (!profileSnap.exists) return null;

  const profile = profileSnap.data()!;
  const clanId  = (profile.clanId as string) || null;

  // ── Parallel fetches ──
  const [
    gameRecordsSnap,
    tournamentsSnap,
    recommendedClansSnap,
    newsItems,
    clanSnap,
    clanPostsSnap,
  ] = await Promise.all([
    // Game records count
    adminDb
      .collection("profiles").doc(uid)
      .collection("gameRecords")
      .select()
      .get(),

    // Open/live tournaments (check registration below)
    adminDb
      .collection("tournaments")
      .where("status", "in", ["open", "live"])
      .orderBy("startsAt", "asc")
      .limit(10)
      .get(),

    // Recruiting public clans (recommended)
    adminDb
      .collection("clans")
      .where("isRecruiting", "==", true)
      .where("isPublic",     "==", true)
      .limit(3)
      .get(),

    // Game news
    fetchNews(),

    // Clan info (if member)
    clanId
      ? adminDb.collection("clans").doc(clanId).get()
      : Promise.resolve(null),

    // Clan posts (if member)
    clanId
      ? adminDb
          .collection("clans").doc(clanId)
          .collection("posts")
          .orderBy("createdAt", "desc")
          .limit(5)
          .get()
      : Promise.resolve(null),
  ]);

  // ── Check registration for up to 10 tournaments ──
  const tournamentDocs = tournamentsSnap.docs;
  const regChecks = await Promise.all(
    tournamentDocs.map(t =>
      adminDb
        .collection("tournaments").doc(t.id)
        .collection("participants").doc(uid)
        .get(),
    ),
  );

  const registeredTournaments = tournamentDocs
    .filter((_, i) => regChecks[i].exists)
    .slice(0, 3)
    .map(toTournament);

  // ── Clan posts ──
  const recentPosts: ClanPost[] = (clanPostsSnap?.docs ?? []).map(d => {
    const data = d.data();
    return {
      id:             d.id,
      authorId:       data.authorId       as string,
      authorUsername: data.authorUsername as string,
      authorAvatarUrl: data.authorAvatarUrl as string | undefined,
      content:        data.content        as string,
      imageUrl:       data.imageUrl       as string | undefined,
      likesCount:     (data.likesCount    as number) ?? 0,
      createdAt:      data.createdAt?.toDate?.() ?? new Date(),
    } as ClanPost;
  });

  const clanData = clanSnap?.exists ? clanSnap.data()! : null;

  return {
    displayName:          (profile.displayName as string) || (profile.username as string),
    username:             profile.username as string,
    xp:                   (profile.xp as number)               ?? 0,
    tournamentsPlayed:    (profile.tournamentsPlayed as number) ?? 0,
    tournamentsWon:       (profile.tournamentsWon   as number)  ?? 0,
    gamesLogged:          gameRecordsSnap.size,
    clanId,
    clanName:  clanData?.name  as string ?? "",
    clanSlug:  clanData?.slug  as string ?? clanId ?? "",
    recentPosts,
    registeredTournaments,
    newsItems,
    recommendedClans: recommendedClansSnap.docs.map(toClan),
  };
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({
  title,
  href,
  linkLabel,
}: {
  title:      string;
  href?:      string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2
        className="font-display font-bold text-2xl"
        style={{ color: "var(--text-primary)" }}
      >
        {title}
      </h2>
      {href && linkLabel && (
        <Link
          href={href}
          className="text-sm font-medium transition-colors"
          style={{ color: "var(--accent)" }}
        >
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

// ── Welcome / Season banner (Arena visual treatment) ─────────────────────────
// Premium hero card. Adopts the Arena gradient-border + glow-card pattern with
// a RankChevron insignia and a shimmering XP bar. Stays fully responsive —
// the chevron+name row stacks above the season-countdown on narrow screens
// via Tailwind's flex-wrap, the XP bar fills the available width, and the
// inner padding scales with the responsive `p-5 sm:p-6` utility.

/**
 * Map level → clan-tier insignia. Mirrors the bands in src/lib/clan-levels.ts
 * but for the personal XP scale (1 level per 1000 XP), so:
 *   1-2 → bronze, 3-4 → silver, 5-6 → gold, 7-8 → platinum, 9 → diamond, 10+ → legendary.
 */
function tierForLevel(level: number): RankTier {
  if (level >= 10) return "legendary";
  if (level >= 9)  return "diamond";
  if (level >= 7)  return "platinum";
  if (level >= 5)  return "gold";
  if (level >= 3)  return "silver";
  return "bronze";
}

function WelcomeBanner({
  displayName,
  xp,
}: {
  displayName: string;
  xp:          number;
}) {
  const level     = Math.floor(xp / 1000) + 1;
  const progress  = clamp((xp % 1000) / 10, 0, 100);
  const xpInLevel = xp % 1000;
  const tier      = tierForLevel(level);

  return (
    <div
      className="arena-gradient-border arena-glow-card rounded-2xl p-5 sm:p-6 mb-6 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(232,121,249,0.10) 50%, rgba(34,211,238,0.08) 100%), var(--bg-surface)",
        border: "1px solid transparent",
      }}
    >
      {/* Soft magenta glow in the top-right corner. Pointer-events: none so it
          never blocks clicks on anything underneath. */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: 0,
          right: -30,
          width: 240,
          height: 240,
          background: "radial-gradient(circle, rgba(232,121,249,0.22) 0%, transparent 65%)",
        }}
      />

      <div className="relative flex items-center gap-4 sm:gap-5 flex-wrap">
        <RankChevron tier={tier} level={level} size={64} />

        <div className="flex-1 min-w-0">
          <MonoPill
            color="var(--magenta)"
            bg="rgba(232,121,249,0.12)"
          >
            Welcome back
          </MonoPill>
          <h1
            className="font-display font-bold mt-1.5 leading-tight"
            style={{ fontSize: "clamp(24px, 4vw, 32px)", color: "var(--text-primary)" }}
          >
            {displayName}
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            Level{" "}
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{level}</span>
            {" · "}
            <span className="capitalize" style={{ color: `var(--tier-${tier})` }}>
              {tier}
            </span>
            {" tier"}
          </p>
        </div>
      </div>

      {/* XP bar */}
      <div className="relative mt-4">
        <div
          className="font-mono-tech flex items-center justify-between mb-1.5"
          style={{ fontSize: 10, color: "var(--text-muted)" }}
        >
          <span>{xpInLevel.toLocaleString()} / 1,000 XP</span>
          <span>Next: Level {level + 1}</span>
        </div>
        <div
          className="h-2 rounded-full overflow-hidden relative"
          style={{ background: "var(--bg-overlay)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-700 relative overflow-hidden"
            style={{
              width:      `${progress}%`,
              background: "linear-gradient(90deg, var(--accent), var(--magenta))",
              boxShadow:  "0 0 12px var(--accent-glow)",
            }}
          >
            <div className="arena-shimmer" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Quick stats ───────────────────────────────────────────────────────────────
// Arena StatBlock typography (mono uppercase label over Rajdhani value).
// Keeps the existing responsive grid: 2 cols on mobile, 4 cols from sm up.

function QuickStats({
  played,
  won,
  gamesLogged,
}: {
  played:      number;
  won:         number;
  gamesLogged: number;
}) {
  const winRate =
    played > 0 ? Math.round((won / played) * 100) : null;

  const stats: Array<{
    label: string;
    value: string | number;
    color?: string;
  }> = [
    { label: "Tournaments",  value: played },
    { label: "Wins",         value: won,                                   color: "var(--success)" },
    { label: "Games Logged", value: gamesLogged },
    { label: "Win Rate",     value: winRate !== null ? `${winRate}%` : "N/A", color: winRate !== null && winRate >= 50 ? "var(--success)" : undefined },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
      {stats.map(s => (
        <div
          key={s.label}
          className="rounded-xl p-4"
          style={{
            background: "var(--bg-surface)",
            border:     "1px solid var(--border-subtle)",
          }}
        >
          <StatBlock label={s.label} value={s.value} color={s.color} />
        </div>
      ))}
    </div>
  );
}

// ── Clan feed section ─────────────────────────────────────────────────────────

function ClanFeedSection({
  clanId,
  clanName,
  clanSlug,
  posts,
}: {
  clanId:   string | null;
  clanName: string;
  clanSlug: string;
  posts:    ClanPost[];
}) {
  if (!clanId) {
    return (
      <div>
        <SectionHeading title="My Clan" />
        <div
          className="rounded-2xl p-8 flex flex-col items-center text-center"
          style={{
            background: "var(--bg-surface)",
            border:     "1px solid var(--border-subtle)",
          }}
        >
          <span className="text-5xl mb-4 opacity-30">🛡️</span>
          <p
            className="font-semibold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            You&apos;re not in a clan yet
          </p>
          <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
            Find your squad and compete together.
          </p>
          <Link href="/clans" className="arena-cta">
            Browse Clans
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeading
        title={clanName || "My Clan"}
        href={`/clans/${clanSlug}`}
        linkLabel="View all"
      />

      {posts.length > 0 ? (
        <div className="flex flex-col gap-3">
          {posts.map(post => (
            <div
              key={post.id}
              className="flex gap-3 rounded-xl p-3"
              style={{
                background: "var(--bg-surface)",
                border:     "1px solid var(--border-subtle)",
              }}
            >
              {/* Avatar */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 mt-0.5 overflow-hidden"
                style={{ background: "var(--accent)" }}
              >
                {post.authorAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.authorAvatarUrl}
                    alt={post.authorUsername}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  getInitials(post.authorUsername)
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {post.authorUsername}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {timeAgo(post.createdAt)}
                  </span>
                </div>
                <p
                  className="text-sm line-clamp-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {post.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="rounded-xl p-6 text-center"
          style={{
            background: "var(--bg-surface)",
            border:     "1px solid var(--border-subtle)",
          }}
        >
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            No posts yet. Be the first to post in your clan.
          </p>
          <Link
            href={`/clans/${clanSlug}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{
              background: "var(--bg-elevated)",
              border:     "1px solid var(--border-default)",
              color:      "var(--text-primary)",
            }}
          >
            Go to your clan
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Tournaments section ───────────────────────────────────────────────────────

function TournamentsSection({
  tournaments,
}: {
  tournaments: Tournament[];
}) {
  const FORMAT_SHORT: Record<string, string> = {
    single_elim: "Single Elim",
    double_elim: "Double Elim",
    round_robin:  "Round Robin",
  };
  const STATUS_V: Record<string, Parameters<typeof Badge>[0]["variant"]> = {
    open:  "success",
    live:  "live",
    locked: "warning",
  };

  return (
    <div>
      <SectionHeading
        title="Active Tournaments"
        href="/tournaments"
        linkLabel="Browse all"
      />

      {tournaments.length > 0 ? (
        <div className="flex flex-col gap-3">
          {tournaments.map(t => (
            <Link
              key={t.id}
              href={`/tournaments/${t.id}`}
              className="hover-accent-border flex items-center gap-4 rounded-xl p-4"
              style={{
                background: "var(--bg-surface)",
                border:     "1px solid var(--border-default)",
              }}
            >
              {/* Game colour strip */}
              <div
                className="w-1.5 h-12 rounded-full shrink-0"
                style={{ background: "var(--accent)" }}
              />

              <div className="flex-1 min-w-0">
                <p
                  className="font-display font-bold text-base truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {t.name}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="tournament">{t.game}</Badge>
                  <Badge variant="info">{FORMAT_SHORT[t.format] ?? t.format}</Badge>
                </div>
              </div>

              <div className="text-right shrink-0">
                <Badge variant={STATUS_V[t.status] ?? "default"}>
                  {t.status}
                </Badge>
                <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
                  {formatDate(t.startsAt)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div
          className="rounded-2xl p-8 flex flex-col items-center text-center"
          style={{
            background: "var(--bg-surface)",
            border:     "1px solid var(--border-subtle)",
          }}
        >
          <span className="text-5xl mb-4 opacity-30">🏆</span>
          <p className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
            No active tournaments
          </p>
          <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
            Register for an open tournament to compete.
          </p>
          <Link href="/tournaments" className="arena-cta">
            Browse Tournaments
          </Link>
        </div>
      )}
    </div>
  );
}

// ── News section ──────────────────────────────────────────────────────────────

function NewsSection({ items }: { items: NewsItem[] }) {
  return (
    <section className="mb-10">
      <SectionHeading title="Game News" />

      {items.length === 0 ? (
        <div
          className="rounded-xl p-6 text-center"
          style={{
            background: "var(--bg-surface)",
            border:     "1px solid var(--border-subtle)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            News unavailable right now
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item, i) => {
            const date = item.pubDate
              ? new Date(item.pubDate).toLocaleDateString("en-US", {
                  month: "short", day: "numeric", year: "numeric",
                })
              : "";
            return (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col rounded-xl p-4 transition-all hover:shadow-glow"
                style={{
                  background: "var(--bg-surface)",
                  border:     "1px solid var(--border-default)",
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="info">IGN</Badge>
                  {date && (
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {date}
                    </span>
                  )}
                </div>
                <p
                  className="text-sm font-medium leading-snug line-clamp-3 flex-1 group-hover:text-white transition-colors"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {item.title}
                </p>
                <span
                  className="mt-3 text-xs font-medium"
                  style={{ color: "var(--accent)" }}
                >
                  Read more →
                </span>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  // ── Auth ──
  let uid: string | null = null;
  try {
    const { adminAuth } = await import("@/lib/firebase/admin");
    const cookieStore   = cookies();
    const sessionCookie = cookieStore.get("session")?.value;
    if (sessionCookie) {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
      uid = decoded.uid;
    }
  } catch {
    // invalid session
  }

  if (!uid) redirect("/login");

  const data = await getDashboardData(uid);

  // Profile doesn't exist yet → send to onboarding
  if (!data) redirect("/dashboard/onboarding");

  const {
    displayName,
    xp,
    tournamentsPlayed,
    tournamentsWon,
    gamesLogged,
    clanId,
    clanName,
    clanSlug,
    recentPosts,
    registeredTournaments,
    newsItems,
    recommendedClans,
  } = data;

  return (
    <div className="max-w-5xl mx-auto">

      {/* ── Welcome banner ── */}
      <WelcomeBanner displayName={displayName} xp={xp} />

      {/* ── Quick stats ── */}
      <QuickStats
        played={tournamentsPlayed}
        won={tournamentsWon}
        gamesLogged={gamesLogged}
      />

      {/* ── Personal daily/weekly missions (always shown) ── */}
      <DashboardMissionsWidget uid={uid} />

      {/* ── Active challenges (shown only if user is in a clan) ── */}
      {clanId && <DashboardChallengesWidget clanId={clanId} />}

      {/* ── Two-column: Clan Feed | Active Tournaments ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <ClanFeedSection
          clanId={clanId}
          clanName={clanName}
          clanSlug={clanSlug}
          posts={recentPosts}
        />
        <TournamentsSection tournaments={registeredTournaments} />
      </div>

      {/* ── News ── */}
      <NewsSection items={newsItems} />

      {/* ── Recommended clans ── */}
      {recommendedClans.length > 0 && (
        <section className="mb-10">
          <SectionHeading
            title="Recommended Clans"
            href="/clans"
            linkLabel="View all"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {recommendedClans.map(clan => (
              <ClanCard key={clan.id} clan={clan} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
