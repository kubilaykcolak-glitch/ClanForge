import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { Pencil } from "lucide-react";
import type { Clan, ClanMember, GameRecord, Profile } from "@/types";
import ProfileHero from "@/components/profile/ProfileHero";
import PrivateProfileScreen from "@/components/profile/PrivateProfileScreen";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { Badge } from "@/components/ui/Badge";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClanInfo {
  id:          string;
  slug:        string;       // used for /clans/[slug] navigation
  name:        string;
  avatarUrl?:  string;
  memberCount: number;
  role:        string;
}

// ── Server-side data fetch ────────────────────────────────────────────────────

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

  const profileData = profileSnap.data() as Record<string, unknown>;

  const profile = {
    id: profileSnap.id,
    ...(profileData as Omit<Profile, "id" | "createdAt" | "updatedAt">),
    createdAt: (profileData.createdAt as { toDate?: () => Date } | undefined)?.toDate?.() ?? new Date(),
    updatedAt: (profileData.updatedAt as { toDate?: () => Date } | undefined)?.toDate?.() ?? new Date(),
  } as Profile;

  const gameRecords: GameRecord[] = recordsSnap.docs.map(d => ({
    id: d.id,
    ...(d.data() as Omit<GameRecord, "id" | "createdAt">),
    createdAt: (d.data()?.createdAt?.toDate?.() ?? new Date()) as Date,
  }));

  // ── Clan data ──────────────────────────────────────────────────────────────
  //
  // Hero display uses the denormalized fields written to the profile doc by
  // clan.actions.ts (clanTag, clanName, clanSlug) — zero extra reads.
  //
  // The clan section card (memberCount, role, avatarUrl) still needs a full
  // clan doc fetch, but only when clanId is available.
  //
  // Fallback path: if the `clanId` key is entirely absent from the profile doc,
  // this is pre-migration data. We run a collectionGroup("members") query to
  // discover clan membership. That query requires member docs to carry a
  // `userId` field — newer writes from clan.actions.ts include it; older ones
  // will simply return empty, showing no clan (graceful degradation).

  let clanTag:  string | null = (profileData.clanTag  as string | null) ?? null;
  let clanName: string | null = (profileData.clanName as string | null) ?? null;
  let clanSlug: string | null = (profileData.clanSlug as string | null) ?? null;
  let clanInfo: ClanInfo | null = null;

  if (profileData.clanId) {
    // ── Fast path: profile has a clanId (post-migration) ──────────────────
    const clanId = profileData.clanId as string;

    const [clanSnap, memberSnap] = await Promise.all([
      adminDb.collection("clans").doc(clanId).get(),
      adminDb.collection("clans").doc(clanId).collection("members").doc(uid).get(),
    ]);

    if (clanSnap.exists) {
      const clanData   = clanSnap.data() as Clan;
      const memberData = memberSnap.data() as ClanMember | undefined;

      clanInfo = {
        id:          clanSnap.id,
        slug:        clanData.slug,
        name:        clanData.name,
        avatarUrl:   clanData.avatarUrl,
        memberCount: clanData.memberCount,
        role:        memberData?.role ?? "member",
      };

      // Fill hero fields from clan doc if the profile denorm fields are stale
      // or haven't been written yet (e.g. clanTag set after migration).
      clanTag  ??= clanData.clanTag  ?? null;
      clanName ??= clanData.name;
      clanSlug ??= clanData.slug;
    }

  } else {
    // ── Fallback: clanId is absent OR null on the profile, but the user
    //    might still be a member if an earlier join didn't stamp the profile.
    //    Query the members collectionGroup by userId (requires the field
    //    to be set on the member doc — newer writes include it).
    //    If we find a match, backfill the profile denorm fields so the fast
    //    path works next time.
    try {
      const memberGroupSnap = await adminDb
        .collectionGroup("members")
        .where("userId", "==", uid)
        .limit(1)
        .get();

      if (!memberGroupSnap.empty) {
        const memberDoc = memberGroupSnap.docs[0];
        // Parent path is /clans/{clanId}/members, so parent.parent is /clans/{clanId}
        const clanId    = memberDoc.ref.parent.parent!.id;
        const clanSnap  = await adminDb.collection("clans").doc(clanId).get();

        if (clanSnap.exists) {
          const clanData   = clanSnap.data() as Clan;
          const memberData = memberDoc.data() as ClanMember;

          clanInfo = {
            id:          clanSnap.id,
            slug:        clanData.slug,
            name:        clanData.name,
            avatarUrl:   clanData.avatarUrl,
            memberCount: clanData.memberCount,
            role:        memberData.role ?? "member",
          };

          clanTag  = clanData.clanTag  ?? null;
          clanName = clanData.name;
          clanSlug = clanData.slug;

          // Backfill the profile so the fast path works next time. Fire-and-
          // forget — not awaited because the page render shouldn't block on it.
          adminDb.collection("profiles").doc(uid).update({
            clanId,
            clanTag:  clanData.clanTag  ?? null,
            clanSlug: clanData.slug,
            clanName: clanData.name,
          }).catch(() => { /* best-effort — ignore failures */ });
        }
      }
    } catch {
      // Silently degrade — no clan will be shown for this profile.
    }
  }

  return { profile, gameRecords, clanInfo, clanTag, clanName, clanSlug };
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  children,
}: {
  label:    string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl p-4 text-center"
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-subtle)",
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
  const { profile, gameRecords, clanInfo, clanTag, clanName, clanSlug } =
    await getPageData(params.username);

  // Resolve the logged-in user via the session cookie. Middleware does NOT
  // run on /profile/[username] (route not in matcher), so there's no
  // x-user-id header to read here — we must verify the session ourselves.
  let loggedInUid: string | null = null;
  try {
    const sessionCookie = cookies().get("session")?.value;
    if (sessionCookie) {
      const { adminAuth } = await import("@/lib/firebase/admin");
      const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
      loggedInUid = decoded.uid;
    }
  } catch {
    // Invalid/expired session — treat as logged out
  }

  const profileUid        = profile.id ?? "";
  const isOwner           = loggedInUid !== null && loggedInUid === profileUid;
  const showPrivateScreen = profile.isPrivate === true && !isOwner;

  const winRate =
    profile.tournamentsPlayed > 0
      ? Math.round((profile.tournamentsWon / profile.tournamentsPlayed) * 100)
      : 0;

  // Background: custom image takes precedence over the animated theme id.
  // A scrim overlay (defined in globals.css) is applied to all variants so
  // page text stays readable.
  const bgClass = profile.backgroundImageUrl
    ? "profile-bg-image"
    : profile.backgroundId && profile.backgroundId !== "none"
      ? `profile-bg-${profile.backgroundId}`
      : "";

  const bgStyle: React.CSSProperties | undefined = profile.backgroundImageUrl
    ? ({ ["--profile-bg-image"]: `url(${profile.backgroundImageUrl})` } as React.CSSProperties)
    : undefined;

  return (
    <div
      className={`max-w-4xl mx-auto${bgClass ? ` ${bgClass}` : ""}`}
      style={bgStyle}
    >

      {/* ── Hero — always visible ─────────────────────────────────────────── */}
      <ProfileHero
        profile={profile}
        clanTag={clanTag}
        clanName={clanName}
        clanSlug={clanSlug}
        bannerUrl={profile.bannerUrl ?? null}
        accentColour={profile.accentColour ?? null}
      />

      {/* ── Owner toolbar (Edit profile) ─────────────────────────────────── */}
      {isOwner && (
        <div className="px-2 mb-6 flex justify-end">
          <Link
            href="/profile/edit"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{
              background: "var(--bg-elevated)",
              border:     "1px solid var(--border-default)",
              color:      "var(--text-secondary)",
            }}
          >
            <Pencil size={14} />
            Edit Profile
          </Link>
        </div>
      )}

      {/* ── Private gate ─────────────────────────────────────────────────── */}
      {showPrivateScreen && <PrivateProfileScreen />}

      {/* ── Public content (hidden for private profiles viewed by non-owners) */}
      {!showPrivateScreen && <>

        {/* ── Stats row ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          <StatCard label="Tournaments Played">{profile.tournamentsPlayed}</StatCard>
          <StatCard label="Tournaments Won">{profile.tournamentsWon}</StatCard>
          <StatCard label="Win Rate">{winRate}%</StatCard>
          <StatCard label="Clan">
            {clanInfo ? (
              <Link
                href={`/clans/${clanInfo.slug}`}
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

        {/* ── Game Records + Achievements tabs ────────────────────────────── */}
        <ProfileTabs gameRecords={gameRecords} />

        {/* ── Clan section ────────────────────────────────────────────────── */}
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
                border:     "1px solid var(--border-default)",
              }}
            >
              {/* Clan avatar */}
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold font-display text-xl shrink-0"
                style={{ background: "var(--violet)" }}
              >
                {clanInfo.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={clanInfo.avatarUrl}
                    alt={clanInfo.name}
                    className="w-full h-full object-cover rounded-xl"
                  />
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
                href={`/clans/${clanInfo.slug}`}
                className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                View Clan
              </Link>
            </div>
          ) : (
            <div
              className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl p-6"
              style={{
                background: "var(--bg-surface)",
                border:     "1px solid var(--border-subtle)",
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
                  border:     "1px solid var(--border-default)",
                  color:      "var(--text-secondary)",
                }}
              >
                Browse Clans
              </Link>
            </div>
          )}
        </section>

      </>}
    </div>
  );
}
