import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import type { Clan, ClanMember, ClanRole, Profile } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { MemberRow } from "@/components/clan/MemberRow";
import { ClanActions } from "@/components/clan/ClanActions";
import { ClanFeed } from "@/components/clan/ClanFeed";
import { formatDate } from "@/lib/utils";

// ── Role sort order ───────────────────────────────────────────────────────────

const ROLE_ORDER: Record<ClanRole, number> = {
  leader: 0,
  officer: 1,
  member: 2,
  pending: 3,
};

// ── Data types ────────────────────────────────────────────────────────────────

interface MemberData extends ClanMember {
  id: string;
}

interface PageData {
  clan:               Clan;
  clanId:             string;
  members:            MemberData[];
  currentUid:         string | null;
  currentRole:        ClanRole | null;
  currentDisplayName: string;
  currentAvatarUrl:   string | undefined;
  currentUsername:    string;
}

// ── Server data fetch ─────────────────────────────────────────────────────────

async function getPageData(slug: string): Promise<PageData | null> {
  const { adminDb, adminAuth } = await import("@/lib/firebase/admin");

  // 1. Resolve slug → clanId
  const slugDoc = await adminDb.collection("clanSlugs").doc(slug.toLowerCase()).get();
  if (!slugDoc.exists) return null;

  const clanId = (slugDoc.data() as { clanId: string }).clanId;

  // 2. Parallel: clan doc + members subcollection
  const [clanSnap, membersSnap] = await Promise.all([
    adminDb.collection("clans").doc(clanId).get(),
    adminDb.collection("clans").doc(clanId).collection("members").limit(50).get(),
  ]);

  if (!clanSnap.exists) return null;

  const clanData = clanSnap.data()!;
  const clan: Clan = {
    id:          clanSnap.id,
    ...(clanData as Omit<Clan, "id" | "createdAt" | "updatedAt">),
    createdAt:   clanData.createdAt?.toDate?.()  ?? new Date(),
    updatedAt:   clanData.updatedAt?.toDate?.()  ?? new Date(),
  };

  // Convert + sort members
  const members: MemberData[] = membersSnap.docs.map(d => {
    const data = d.data();
    return {
      id:          d.id,
      role:        data.role as ClanRole,
      displayName: (data.displayName as string) ?? "",
      avatarUrl:   data.avatarUrl as string | undefined,
      joinedAt:    data.joinedAt?.toDate?.() ?? new Date(),
    };
  }).sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);

  // 3. Session → current user
  let currentUid:         string | null    = null;
  let currentRole:        ClanRole | null  = null;
  let currentDisplayName: string           = "";
  let currentAvatarUrl:   string | undefined;
  let currentUsername:    string           = "";

  try {
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (sessionCookie) {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
      currentUid = decoded.uid;

      // Check membership in the fetched members list
      const myMember = membersSnap.docs.find(d => d.id === currentUid);
      if (myMember) {
        currentRole = myMember.data().role as ClanRole;
      }

      // Fetch profile for join action info
      const profileSnap = await adminDb.collection("profiles").doc(currentUid).get();
      if (profileSnap.exists) {
        const pData = profileSnap.data() as Partial<Profile>;
        currentDisplayName = pData.displayName ?? "";
        currentAvatarUrl   = pData.avatarUrl;
        currentUsername    = pData.username ?? "";
      }
    }
  } catch {
    // Invalid session — unauthenticated
  }

  return {
    clan,
    clanId,
    members,
    currentUid,
    currentRole,
    currentDisplayName,
    currentAvatarUrl,
    currentUsername,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ClanPage({
  params,
}: {
  params: { slug: string };
}) {
  const data = await getPageData(params.slug);
  if (!data) notFound();

  const {
    clan,
    clanId,
    members,
    currentUid,
    currentRole,
    currentDisplayName,
    currentAvatarUrl,
    currentUsername,
  } = data;

  const isMember =
    currentRole !== null && currentRole !== "pending";

  // Members shown in panel (exclude pending)
  const visibleMembers = members.filter(m => m.role !== "pending");

  return (
    <div className="max-w-5xl mx-auto">

      {/* ── Hero banner ── */}
      <div className="relative mb-14">
        <div
          className="w-full rounded-2xl overflow-hidden"
          style={{ height: 200 }}
        >
          {clan.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={clan.bannerUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full"
              style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #0a0a0f 100%)" }}
            />
          )}
        </div>

        {/* Clan avatar — overlapping banner */}
        <div
          className="absolute left-6 flex items-end"
          style={{ bottom: -36 }}
        >
          <div
            className="flex items-center justify-center rounded-2xl text-2xl font-bold text-white font-display overflow-hidden"
            style={{
              width: 72,
              height: 72,
              background: "var(--violet)",
              border: "3px solid var(--bg-base)",
              boxShadow: "0 0 0 2px var(--violet)",
            }}
          >
            {clan.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={clan.avatarUrl} alt={clan.name} className="w-full h-full object-cover" />
            ) : (
              clan.name[0]?.toUpperCase()
            )}
          </div>
        </div>
      </div>

      {/* ── Identity + action row ── */}
      <div className="px-2 mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1
            className="font-display font-bold mb-1"
            style={{ fontSize: 32, color: "var(--text-primary)" }}
          >
            {clan.name}
          </h1>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge variant="tournament">{clan.gameFocus}</Badge>
            {clan.isRecruiting && (
              <Badge variant="success">
                <span className="mr-1 inline-block w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                Recruiting
              </Badge>
            )}
            <span className="flex items-center gap-1 text-sm" style={{ color: "var(--text-muted)" }}>
              <Users size={14} />
              {clan.memberCount} / {clan.memberLimit} members
            </span>
          </div>

          {clan.description && (
            <p
              className="text-sm leading-relaxed max-w-xl"
              style={{ color: "var(--text-secondary)" }}
            >
              {clan.description}
            </p>
          )}

          <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
            Founded {formatDate(clan.createdAt)}
          </p>
        </div>

        {/* Join / Leave / Owner button */}
        <div className="shrink-0">
          <ClanActions
            clanId={clanId}
            slug={params.slug}
            currentUid={currentUid}
            currentRole={currentRole}
            isPublic={clan.isPublic}
            isRecruiting={clan.isRecruiting}
            displayName={currentDisplayName}
            avatarUrl={currentAvatarUrl}
          />
        </div>
      </div>

      {/* ── Tags ── */}
      {clan.tags && clan.tags.length > 0 && (
        <div className="px-2 flex flex-wrap gap-2 mb-8">
          {clan.tags.map(tag => (
            <Badge key={tag} variant="default">{tag}</Badge>
          ))}
        </div>
      )}

      {/* ── Two-column layout ── */}
      <div className="flex gap-6">

        {/* Main content — feed */}
        <div className="flex-1 min-w-0">
          <h2
            className="font-display font-bold text-xl mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            Clan Feed
          </h2>

          <ClanFeed
            clanId={clanId}
            currentUserId={currentUid}
            isMember={isMember}
            authorId={currentUid ?? undefined}
            authorUsername={currentUsername}
            authorDisplayName={currentDisplayName}
            authorAvatarUrl={currentAvatarUrl}
          />
        </div>

        {/* Members panel */}
        <aside
          className="shrink-0 rounded-xl p-4"
          style={{
            width: 240,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            alignSelf: "flex-start",
            position: "sticky",
            top: "5rem",
          }}
        >
          <h2
            className="font-display font-semibold text-base mb-3"
            style={{ color: "var(--text-primary)" }}
          >
            Members ({clan.memberCount})
          </h2>

          <div
            className="divide-y"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            {visibleMembers.map(member => (
              <MemberRow
                key={member.id}
                userId={member.id}
                displayName={member.displayName}
                avatarUrl={member.avatarUrl}
                role={member.role}
                joinedAt={member.joinedAt}
              />
            ))}

            {visibleMembers.length === 0 && (
              <p className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>
                No members yet
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
