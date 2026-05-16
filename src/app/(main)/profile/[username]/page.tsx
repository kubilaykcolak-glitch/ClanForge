import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { Pencil } from "lucide-react";
import type { Clan, ClanMember, GameRecord, Profile } from "@/types";
import type { LeagueIntegration } from "@/types/integrations";
import ProfileHero from "@/components/profile/ProfileHero";
import PrivateProfileScreen from "@/components/profile/PrivateProfileScreen";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { Badge } from "@/components/ui/Badge";
import { ClanLevelBadge } from "@/components/clan/ClanLevelBadge";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClanInfo {
  id:          string;
  slug:        string;
  name:        string;
  avatarUrl?:  string;
  memberCount: number;
  role:        string;
  xp:          number;
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

  // 2. Parallel fetch: profile + game records + linked integrations
  const [profileSnap, recordsSnap, integrationsSnap] = await Promise.all([
    adminDb.collection("profiles").doc(uid).get(),
    adminDb
      .collection("profiles")
      .doc(uid)
      .collection("gameRecords")
      .orderBy("isFeatured", "desc")
      .limit(6)
      .get(),
    adminDb
      .collection("profiles")
      .doc(uid)
      .collection("integrations")
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

  // Linked-game integrations. Firestore Timestamps are serialised so the
  // client component receives plain Date objects (matches existing pattern
  // used for gameRecords above).
  const integrations: LeagueIntegration[] = integrationsSnap.docs
    .filter(d => d.id === "league" && d.exists)
    .map(d => {
      const data = d.data() as Record<string, unknown>;
      const toDate = (v: unknown): Date =>
        v instanceof Date ? v
          : (v as { toDate?: () => Date } | undefined)?.toDate?.()
          ?? new Date();
      return {
        ...(data as Omit<LeagueIntegration, "linkedAt" | "lastSyncAt" | "lastManualRefreshAt">),
        linkedAt:            toDate(data.linkedAt),
        lastSyncAt:          toDate(data.lastSyncAt),
        lastManualRefreshAt: data.lastManualRefreshAt ? toDate(data.lastManualRefreshAt) : undefined,
      } as LeagueIntegration;
    });

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
        xp:          clanData.xp ?? 0,
      };

      // Fill hero fields from clan doc if the profile denorm fields are stale
      // or haven't been written yet (e.g. clanTag set after migration).
      clanTag  ??= clanData.clanTag  ?? null;
      clanName ??= clanData.name;
      clanSlug ??= clanData.slug;
    }

  } else {
    // ── Layered fallbacks: clanId is absent/null on the profile doc ──────────
    //
    // Fallback 1 — collectionGroup query by userId field.
    //   Covers users who joined/created after the userId field was added but
    //   whose profile clanId was never stamped.
    //
    // Fallback 2 — ownerId query on the clans collection.
    //   Catches users who created a clan before the member doc userId field
    //   and profile clanId stamp were introduced. The clan doc always has
    //   ownerId, so this is the last-resort guarantee for creators.
    //
    // On any successful match: backfill BOTH the profile doc (clanId + denorm
    // fields) AND the member doc (userId field) so the fast path works next
    // time and the collectionGroup fallback works as a secondary safety net.

    let foundClanId:   string | null = null;
    let foundClanSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    let foundRole:     string = "member";

    try {
      // Fallback 1: collectionGroup by userId field
      const memberGroupSnap = await adminDb
        .collectionGroup("members")
        .where("userId", "==", uid)
        .limit(1)
        .get();

      if (!memberGroupSnap.empty) {
        const memberDoc  = memberGroupSnap.docs[0];
        foundClanId      = memberDoc.ref.parent.parent!.id;
        foundRole        = (memberDoc.data() as ClanMember).role ?? "member";
        foundClanSnap    = await adminDb.collection("clans").doc(foundClanId).get();
      }
    } catch { /* continue to next fallback */ }

    // Fallback 2: owned clan (no userId field on member doc — pre-migration creators)
    if (!foundClanId) {
      try {
        const ownedSnap = await adminDb
          .collection("clans")
          .where("ownerId", "==", uid)
          .limit(1)
          .get();

        if (!ownedSnap.empty) {
          foundClanSnap = ownedSnap.docs[0];
          foundClanId   = foundClanSnap.id;
          foundRole     = "leader";
        }
      } catch { /* degrade gracefully */ }
    }

    if (foundClanId && foundClanSnap?.exists) {
      const clanData = foundClanSnap.data() as Clan;

      clanInfo = {
        id:          foundClanId,
        slug:        clanData.slug,
        name:        clanData.name,
        avatarUrl:   clanData.avatarUrl,
        memberCount: clanData.memberCount,
        role:        foundRole,
        xp:          clanData.xp ?? 0,
      };

      clanTag  = clanData.clanTag  ?? null;
      clanName = clanData.name;
      clanSlug = clanData.slug;

      // Backfill both the profile doc AND the member doc so future loads use
      // the fast path and the collectionGroup fallback works as a safety net.
      const profileRef = adminDb.collection("profiles").doc(uid);
      const memberRef  = adminDb.collection("clans").doc(foundClanId).collection("members").doc(uid);

      Promise.all([
        profileRef.update({
          clanId:   foundClanId,
          clanTag:  clanData.clanTag  ?? null,
          clanSlug: clanData.slug,
          clanName: clanData.name,
        }),
        memberRef.set({ userId: uid }, { merge: true }),
      ]).catch(() => { /* best-effort — never blocks the render */ });
    }
  }

  return { profile, gameRecords, integrations, clanInfo, clanTag, clanName, clanSlug };
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
  const { profile, gameRecords, integrations, clanInfo, clanTag, clanName, clanSlug } =
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
        <ProfileTabs
          gameRecords={gameRecords}
          integrations={integrations}
          profileUid={profileUid}
          isOwner={isOwner}
        />

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
                <div className="flex items-center gap-2 flex-wrap">
                  <p
                    className="font-display font-semibold text-lg truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {clanInfo.name}
                  </p>
                  <ClanLevelBadge xp={clanInfo.xp} size="sm" showName />
                </div>
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
