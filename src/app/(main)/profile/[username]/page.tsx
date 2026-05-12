import { notFound } from "next/navigation";
import Link from "next/link";
import type { Clan, ClanMember, GameRecord, Profile } from "@/types";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";

// ── Server-side data fetch ────────────────────────────────────────────────────

interface ClanInfo {
  id: string;
  name: string;
  avatarUrl?: string;
  memberCount: number;
  role: string;
}

async function getPageData(username: string) {
  const { adminDb } = await import("@/lib/firebase/admin");

  // 1. Resolve username → uid
  const usernameDoc = await adminDb
    .collection("usernames")
    .doc(username.toLowerCase())
    .get();

  if (!usernameDoc.exists) notFound();

  const uid = (usernameDoc.data() as { uid: string }).uid;

  // 2. Parallel fetch: profile + game records
  const [profileSnap, recordsSnap] = await Promise.all([
    adminDb.collection("profiles").doc(uid).get(),
    adminDb
      .collection("profiles")
      .doc(uid)
      .collection("gameRecords")
      .orderBy("isFeatured", "desc")
      .limit(6)
      .get(),
  ]);

  if (!profileSnap.exists) notFound();

  const profile = {
    id: profileSnap.id,
    ...(profileSnap.data() as Omit<Profile, "id" | "createdAt" | "updatedAt">),
    createdAt: (profileSnap.data()?.createdAt?.toDate?.() ?? new Date()) as Date,
    updatedAt: (profileSnap.data()?.updatedAt?.toDate?.() ?? new Date()) as Date,
  } as Profile;

  const gameRecords: GameRecord[] = recordsSnap.docs.map(d => ({
    id: d.id,
    ...(d.data() as Omit<GameRecord, "id" | "createdAt">),
    createdAt: (d.data()?.createdAt?.toDate?.() ?? new Date()) as Date,
  }));

  // 3. Clan info (if clanId stored on profile)
  let clanInfo: ClanInfo | null = null;
  const profileData = profileSnap.data() as Record<string, unknown>;

  if (profileData?.clanId) {
    const [clanSnap, memberSnap] = await Promise.all([
      adminDb.collection("clans").doc(profileData.clanId as string).get(),
      adminDb
        .collection("clans")
        .doc(profileData.clanId as string)
        .collection("members")
        .doc(uid)
        .get(),
    ]);

    if (clanSnap.exists) {
      const clanData = clanSnap.data() as Clan;
      const memberData = memberSnap.data() as ClanMember | undefined;
      clanInfo = {
        id:          clanSnap.id,
        name:        clanData.name,
        avatarUrl:   clanData.avatarUrl,
        memberCount: clanData.memberCount,
        role:        memberData?.role ?? "member",
      };
    }
  }

  return { profile, gameRecords, clanInfo };
}

// ── Platform links ────────────────────────────────────────────────────────────

function PlatformLinks({ profile }: { profile: Profile }) {
  const links = [
    { key: "steamUrl",       label: "Steam",   href: profile.steamUrl,        icon: "🎮" },
    { key: "twitchUrl",      label: "Twitch",  href: profile.twitchUrl,       icon: "📺" },
    { key: "discordTag",     label: "Discord", href: null,                    icon: "💬", display: profile.discordTag },
    { key: "xboxGamertag",   label: "Xbox",    href: null,                    icon: "🎯", display: profile.xboxGamertag },
    { key: "psnId",          label: "PSN",     href: null,                    icon: "🕹️", display: profile.psnId },
  ].filter(l => l.href || l.display);

  if (links.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {links.map(l => (
        l.href ? (
          <a
            key={l.key}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
            }}
          >
            <span>{l.icon}</span> {l.label}
          </a>
        ) : (
          <span
            key={l.key}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
            }}
            title={l.display ?? ""}
          >
            <span>{l.icon}</span> {l.display}
          </span>
        )
      ))}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl p-4 text-center"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <p
        className="font-display font-bold text-2xl"
        style={{ color: "var(--text-primary)" }}
      >
        {children}
      </p>
      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ProfilePage({
  params,
}: {
  params: { username: string };
}) {
  const { profile, gameRecords, clanInfo } = await getPageData(params.username);

  const winRate =
    profile.tournamentsPlayed > 0
      ? Math.round((profile.tournamentsWon / profile.tournamentsPlayed) * 100)
      : 0;

  return (
    <div className="max-w-4xl mx-auto">

      {/* ── Hero banner ───────────────────────────────────────────────────── */}
      <div className="relative mb-14">
        <div
          className="w-full rounded-xl overflow-hidden"
          style={{ height: 160 }}
        >
          {/* Banner image or gradient fallback */}
          <div
            className="w-full h-full"
            style={{
              background: "linear-gradient(135deg, #1e1b4b 0%, #0a0a0f 100%)",
            }}
          />
        </div>

        {/* Avatar — overlapping banner bottom */}
        <div
          className="absolute left-6 flex items-end"
          style={{ bottom: -44 }}
        >
          <div
            className="flex items-center justify-center rounded-full text-2xl font-bold text-white font-display overflow-hidden"
            style={{
              width: 88,
              height: 88,
              background: "var(--accent)",
              border: "3px solid var(--bg-base)",
              boxShadow: "0 0 0 2px var(--accent)",
            }}
          >
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt={profile.username}
                className="w-full h-full object-cover"
              />
            ) : (
              profile.displayName?.[0]?.toUpperCase() ?? "?"
            )}
          </div>
        </div>

        {/* Verified / admin badges top-right */}
        <div className="absolute top-3 right-3 flex gap-2">
          {profile.isVerified && <Badge variant="info">✓ Verified</Badge>}
          {profile.isAdmin    && <Badge variant="danger">Admin</Badge>}
        </div>
      </div>

      {/* ── Identity ──────────────────────────────────────────────────────── */}
      <div className="px-2 mb-6">
        <h1
          className="font-display font-bold"
          style={{ fontSize: 28, color: "var(--text-primary)" }}
        >
          {profile.username}
        </h1>
        <p className="text-base mt-0.5" style={{ color: "var(--text-secondary)" }}>
          {profile.displayName}
        </p>

        {profile.country && (
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            {profile.country}
          </p>
        )}

        {profile.bio && (
          <p
            className="mt-3 text-sm leading-relaxed max-w-xl"
            style={{ color: "var(--text-secondary)" }}
          >
            {profile.bio.slice(0, 200)}
          </p>
        )}

        <PlatformLinks profile={profile} />

        <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Joined {formatDate(profile.createdAt)}
        </p>
      </div>

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
        <StatCard label="Tournaments Played">{profile.tournamentsPlayed}</StatCard>
        <StatCard label="Tournaments Won">{profile.tournamentsWon}</StatCard>
        <StatCard label="Win Rate">{winRate}%</StatCard>
        <StatCard label="Clan">
          {clanInfo ? (
            <Link
              href={`/clans/${clanInfo.id}`}
              className="text-base leading-tight line-clamp-1"
              style={{ color: "var(--accent)" }}
            >
              {clanInfo.name}
            </Link>
          ) : (
            <span className="text-base" style={{ color: "var(--text-muted)" }}>None</span>
          )}
        </StatCard>
      </div>

      {/* ── Game Records + Achievements tabs ─────────────────────────────── */}
      {/* ProfileTabs is a client component — receives serialisable game records */}
      <ProfileTabs gameRecords={gameRecords} />

      {/* ── Clan Section ──────────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2
          className="font-display font-bold text-2xl mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          Clan
        </h2>

        {clanInfo ? (
          <div
            className="flex items-center gap-4 rounded-xl p-5"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
            }}
          >
            {/* Clan avatar */}
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold font-display text-xl shrink-0"
              style={{ background: "var(--violet)" }}
            >
              {clanInfo.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={clanInfo.avatarUrl} alt={clanInfo.name} className="w-full h-full object-cover rounded-xl" />
              ) : (
                clanInfo.name[0]
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p
                className="font-display font-semibold text-lg truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {clanInfo.name}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="clan">{clanInfo.role}</Badge>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {clanInfo.memberCount} members
                </span>
              </div>
            </div>

            <Link
              href={`/clans/${clanInfo.id}`}
              className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: "var(--accent)",
                color: "#fff",
              }}
            >
              View Clan
            </Link>
          </div>
        ) : (
          <div
            className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl p-6"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Not in a clan yet
            </p>
            <Link
              href="/clans"
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                color: "var(--text-secondary)",
              }}
            >
              Browse Clans
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
