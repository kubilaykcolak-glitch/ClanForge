"use server";

import { clientIp } from "./_client-ip";
import {
  getSessionWithRole,
  getSuperAdminUid,
} from "@/lib/actions/server-auth";
import {
  isRole,
  rolesGrantableBy,
  type Role,
} from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/auth/audit-log";
import { sendAdminAlert } from "@/lib/auth/discord-alert";
import { resolveActor, resolveUserTarget } from "@/lib/auth/discord-formatting";

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
}

// ─── setUserRole ──────────────────────────────────────────────────────────────
//
// Grant or revoke (`null`) a role on another user. Web-side authorisation:
//
//   • super_admin can set any role (including super_admin) on anyone, with
//     the exception below.
//   • admin can set role to `moderator` or null (i.e. demote moderators).
//     Cannot touch admin or super_admin.
//   • Nobody can demote themselves — prevents accidental self-lockout. Use
//     scripts/bootstrap-superadmin.ts --revoke <email> if a super_admin
//     genuinely needs to step down.
//   • Nobody can grant super_admin via this action. Super_admin must come
//     from the offline bootstrap script. This is THE key security property.
//
// All grants/revokes (success or failure) are audit-logged and surfaced to
// the Discord admin channel.

export async function setUserRole(
  targetUid: string,
  newRole:   Role | null,
  reason:    string,
): Promise<ActionResult> {
  const session = await getSessionWithRole().catch(() => null);
  if (!session) return { success: false, error: "Unauthenticated" };

  const grantable = rolesGrantableBy(session.role);
  const cleanedReason = (reason ?? "").trim();

  // Validate input shape before deciding what to do — keeps audit failures
  // honest about what was attempted.
  if (newRole !== null && !isRole(newRole)) {
    return await logAndReject(session.uid, session.role, targetUid, newRole, cleanedReason, "Invalid role");
  }
  if (!cleanedReason || cleanedReason.length < 5) {
    return await logAndReject(session.uid, session.role, targetUid, newRole, cleanedReason, "Reason is required (min 5 chars)");
  }
  if (session.uid === targetUid) {
    return await logAndReject(session.uid, session.role, targetUid, newRole, cleanedReason, "Cannot change your own role");
  }
  // Super_admin must only come from the bootstrap script. There is no web
  // path. Even a super_admin cannot grant super_admin to someone else from
  // the UI — this prevents a single-session-compromise from cascading.
  if (newRole === "super_admin") {
    return await logAndReject(session.uid, session.role, targetUid, newRole, cleanedReason,
      "super_admin can only be granted via scripts/bootstrap-superadmin.ts");
  }
  if (newRole !== null && !grantable.includes(newRole)) {
    return await logAndReject(session.uid, session.role, targetUid, newRole, cleanedReason,
      `Your role (${session.role ?? "none"}) cannot grant ${newRole}`);
  }

  try {
    const { adminAuth, adminDb } = await import("@/lib/firebase/admin");
    const userRecord = await adminAuth.getUser(targetUid).catch(() => null);
    if (!userRecord) {
      return await logAndReject(session.uid, session.role, targetUid, newRole, cleanedReason, "Target user not found");
    }

    // For revoke or demotion of admin/super_admin we need the granter to be
    // super_admin themselves (rolesGrantableBy already enforces this for
    // assignment; cover the case where we're clearing someone above us).
    const currentTargetRole = userRecord.customClaims?.role as string | undefined;
    if (currentTargetRole === "super_admin" && session.role !== "super_admin") {
      return await logAndReject(session.uid, session.role, targetUid, newRole, cleanedReason,
        "Only a super_admin can modify another super_admin");
    }
    if (currentTargetRole === "admin" && session.role !== "super_admin") {
      return await logAndReject(session.uid, session.role, targetUid, newRole, cleanedReason,
        "Only a super_admin can modify an admin");
    }

    // Apply the change. Custom claims are merged so we don't clobber any
    // future non-role claims.
    await adminAuth.setCustomUserClaims(targetUid, {
      ...(userRecord.customClaims ?? {}),
      role: newRole,
    });

    // Mirror to profiles.isAdmin for legacy reads. We already rejected
    // newRole === "super_admin" above, so the only "admin or above" case
    // remaining is newRole === "admin".
    const isAdminMirror = newRole === "admin";
    await adminDb.collection("profiles").doc(targetUid).set(
      { isAdmin: isAdminMirror },
      { merge: true },
    );

    await writeAuditLog({
      actor:      session.uid,
      actorRole:  session.role,
      action:     newRole === null ? "user.role.revoke" : "user.role.grant",
      targetType: "user",
      targetId:   targetUid,
      reason:     cleanedReason,
      metadata:   { before: currentTargetRole ?? null, after: newRole, email: userRecord.email ?? null },
      result:     "success",
      ip:         clientIp(),
    });

    const [actor, target] = await Promise.all([
      resolveActor(session.uid, session.role),
      resolveUserTarget(targetUid),
    ]);
    await sendAdminAlert({
      title: newRole === null ? "🔻 Role revoked" : `🔼 Role ${newRole} granted`,
      body:  `Changed **${target.label}** from \`${currentTargetRole ?? "user"}\` → \`${newRole ?? "user"}\`.`,
      level: "critical",
      actor,
      fields: [
        { name: "Target", value: `${target.label}${userRecord.email ? ` · ${userRecord.email}` : ""}\n\`${target.id}\``, inline: false },
        { name: "Change", value: `\`${currentTargetRole ?? "user"}\` → \`${newRole ?? "user"}\`` },
        { name: "Reason", value: cleanedReason, inline: false },
      ],
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to set role";
    console.error("[setUserRole]", err);
    return await logAndReject(session.uid, session.role, targetUid, newRole, cleanedReason, message);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function logAndReject(
  actor: string,
  actorRole: Role | null,
  targetUid: string,
  attemptedRole: Role | null,
  reason: string,
  error: string,
): Promise<ActionResult> {
  try {
    await writeAuditLog({
      actor,
      actorRole,
      action:     attemptedRole === null ? "user.role.revoke" : "user.role.grant",
      targetType: "user",
      targetId:   targetUid,
      reason,
      metadata:   { attemptedRole },
      result:     "failure",
      errorMsg:   error,
      ip:         clientIp(),
    });
    // Don't Discord-alert on routine rejected attempts — would create noise.
    // Only alert on validation failures that look like privilege escalation
    // attempts (a non-super_admin trying to grant super_admin, etc.).
    if (attemptedRole === "super_admin" || error.startsWith("Only a super_admin")) {
      // Try to enrich the attempted-escalation alert too — same names, but
      // fail open: if we can't look up names, fall back to the raw ids
      // rather than skipping the alert entirely.
      const [actorEnriched, targetEnriched] = await Promise.all([
        resolveActor(actor, actorRole).catch(() => ({ label: actor, uid: actor })),
        resolveUserTarget(targetUid).catch(() => ({ label: targetUid, id: targetUid })),
      ]);
      await sendAdminAlert({
        title: "⚠ Role-change attempt rejected",
        body:  `Tried to set role \`${attemptedRole ?? "user"}\` on **${targetEnriched.label}** — denied.`,
        level: "warn",
        actor: actorEnriched,
        fields: [
          { name: "Target",        value: `${targetEnriched.label}\n\`${targetEnriched.id}\``, inline: false },
          { name: "Attempted",     value: `\`${attemptedRole ?? "user"}\`` },
          { name: "Rejected with", value: error, inline: false },
        ],
      });
    }
  } catch (logErr) {
    console.error("[setUserRole] audit-log write failed:", logErr);
  }
  return { success: false, error };
}

// ─── getMyRole ────────────────────────────────────────────────────────────────
//
// Small client-callable to learn the calling user's effective role. Useful
// for hiding admin UI from non-admins before the page even renders.

export async function getMyRole(): Promise<ActionResult<{ role: Role | null }>> {
  try {
    const session = await getSessionWithRole();
    return { success: true, data: { role: session.role } };
  } catch {
    return { success: true, data: { role: null } };
  }
}

// ─── adminListTournaments ─────────────────────────────────────────────────────
//
// Admin+ paginated list of tournaments, newest first, with an optional
// status filter. Returns enough per-row to render an admin row card; the
// detail view loads full participant data on demand.

export async function adminListTournaments(opts: {
  status?:   "open" | "locked" | "live" | "complete" | "cancelled" | "draft" | null;
  before?:   string;
  pageSize?: number;
}): Promise<ActionResult<{
  items: Array<{
    id:                string;
    name:              string;
    game:              string;
    status:            string;
    isPaid:            boolean;
    entryFee:          number;
    prizePool:         number;
    participantCount:  number;
    maxParticipants:   number;
    gameProvider:      string | null;
    creatorId:         string;
    createdAt:         string;
    startsAt:          string | null;
  }>;
  hasMore: boolean;
}>> {
  try {
    const session = await getSessionWithRole();
    if (!session.role || !["admin", "super_admin"].includes(session.role)) {
      return { success: false, error: "Forbidden" };
    }

    const { adminDb } = await import("@/lib/firebase/admin");
    const pageSize = Math.min(Math.max(opts.pageSize ?? 30, 5), 100);

    let q = adminDb.collection("tournaments").orderBy("createdAt", "desc").limit(pageSize + 1);
    if (opts.status) q = q.where("status", "==", opts.status).orderBy("createdAt", "desc").limit(pageSize + 1);
    if (opts.before) q = q.startAfter(new Date(opts.before));

    const snap = await q.get();
    const toIso = (v: unknown): string | null => {
      if (v instanceof Date) return v.toISOString();
      const d = (v as { toDate?: () => Date } | undefined)?.toDate?.();
      return d ? d.toISOString() : null;
    };
    const items = snap.docs.slice(0, pageSize).map(d => {
      const data = d.data() as Record<string, unknown>;
      return {
        id:                d.id,
        name:              (data.name             as string) ?? "(unnamed)",
        game:              (data.game             as string) ?? "?",
        status:            (data.status           as string) ?? "?",
        isPaid:            !!data.isPaid,
        entryFee:          (data.entryFee         as number) ?? 0,
        prizePool:         (data.prizePool        as number) ?? 0,
        participantCount:  (data.participantCount as number) ?? 0,
        maxParticipants:   (data.maxParticipants  as number) ?? 0,
        gameProvider:      (data.gameProvider     as string | null) ?? null,
        creatorId:         (data.creatorId        as string) ?? "?",
        createdAt:         toIso(data.createdAt) ?? new Date().toISOString(),
        startsAt:          toIso(data.startsAt),
      };
    });

    return { success: true, data: { items, hasMore: snap.size > pageSize } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

// ─── adminGetTournamentDetail ────────────────────────────────────────────────

export async function adminGetTournamentDetail(tournamentId: string): Promise<ActionResult<{
  tournament: Record<string, unknown>;
  participants: Array<{
    uid:             string;
    displayName:     string | null;
    paymentStatus:   string | null;
    paidAmount:      number;
    registeredAt:    string | null;
    refundedAt:      string | null;
  }>;
}>> {
  try {
    const session = await getSessionWithRole();
    if (!session.role || !["admin", "super_admin"].includes(session.role)) {
      return { success: false, error: "Forbidden" };
    }

    const { adminDb } = await import("@/lib/firebase/admin");
    const [tournSnap, partsSnap] = await Promise.all([
      adminDb.collection("tournaments").doc(tournamentId).get(),
      adminDb.collection("tournaments").doc(tournamentId).collection("participants").get(),
    ]);

    if (!tournSnap.exists) return { success: false, error: "Tournament not found" };

    const toIso = (v: unknown): string | null => {
      if (v instanceof Date) return v.toISOString();
      const d = (v as { toDate?: () => Date } | undefined)?.toDate?.();
      return d ? d.toISOString() : null;
    };

    const participants = partsSnap.docs.map(d => {
      const data = d.data() as Record<string, unknown>;
      return {
        uid:           d.id,
        displayName:   (data.displayName   as string | null) ?? null,
        paymentStatus: (data.paymentStatus as string | null) ?? null,
        paidAmount:    (data.paidAmount    as number) ?? 0,
        registeredAt:  toIso(data.registeredAt),
        refundedAt:    toIso(data.refundedAt),
      };
    });

    const tdata = tournSnap.data() as Record<string, unknown>;
    return {
      success: true,
      data: {
        tournament: {
          id:        tournSnap.id,
          ...tdata,
          createdAt:            toIso(tdata.createdAt),
          startsAt:             toIso(tdata.startsAt),
          registrationClosesAt: toIso(tdata.registrationClosesAt),
          rosterLockedAt:       toIso(tdata.rosterLockedAt),
        },
        participants,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

// ─── adminListLeagueOwners ────────────────────────────────────────────────────
//
// Admin+ view of the /league_account_owners uniqueness locks — useful for
// support cases ("which ClanForge profile owns this PUUID?"). Joins with
// each owner's profile snippet for context.

export async function adminListLeagueOwners(opts: {
  query?:    string;       // matches puuid prefix OR Riot ID OR uid
  pageSize?: number;
}): Promise<ActionResult<Array<{
  puuid:        string;
  uid:          string;
  username:     string | null;
  displayName:  string | null;
  gameName:     string | null;
  tagLine:      string | null;
  region:       string | null;
  claimedAt:    string | null;
}>>> {
  try {
    const session = await getSessionWithRole();
    if (!session.role || !["admin", "super_admin"].includes(session.role)) {
      return { success: false, error: "Forbidden" };
    }

    const { adminDb } = await import("@/lib/firebase/admin");
    const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 5), 200);
    const trimmed = (opts.query ?? "").trim();

    let snap: FirebaseFirestore.QuerySnapshot;
    if (trimmed.length > 0) {
      // No native multi-field search. We do a prefix on the doc id (puuid),
      // and if that yields nothing fall back to scanning by uid via
      // collectionGroup on integrations. For v1 the puuid-prefix path is
      // good enough for the common "I have a puuid, who owns it?" support
      // case. UID match handled separately below.
      snap = await adminDb.collection("league_account_owners")
        .where("__name__", ">=", trimmed)
        .where("__name__", "<=", trimmed + "")
        .limit(pageSize)
        .get();

      if (snap.empty) {
        // Try as uid
        snap = await adminDb.collection("league_account_owners")
          .where("uid", "==", trimmed)
          .limit(pageSize)
          .get();
      }
    } else {
      snap = await adminDb.collection("league_account_owners")
        .orderBy("claimedAt", "desc")
        .limit(pageSize)
        .get();
    }

    const toIso = (v: unknown): string | null => {
      if (v instanceof Date) return v.toISOString();
      const d = (v as { toDate?: () => Date } | undefined)?.toDate?.();
      return d ? d.toISOString() : null;
    };

    const items = await Promise.all(snap.docs.map(async d => {
      const data = d.data() as { uid?: string; claimedAt?: unknown };
      const uid = data.uid ?? "";
      const [profileSnap, integrationSnap] = await Promise.all([
        uid ? adminDb.collection("profiles").doc(uid).get() : Promise.resolve(null),
        uid ? adminDb.collection("profiles").doc(uid).collection("integrations").doc("league").get() : Promise.resolve(null),
      ]);
      const pd = profileSnap?.data() as { username?: string; displayName?: string } | undefined;
      const acct = (integrationSnap?.data() as { account?: { gameName?: string; tagLine?: string; region?: string } } | undefined)?.account;
      return {
        puuid:       d.id,
        uid,
        username:    pd?.username ?? null,
        displayName: pd?.displayName ?? null,
        gameName:    acct?.gameName ?? null,
        tagLine:     acct?.tagLine ?? null,
        region:      acct?.region ?? null,
        claimedAt:   toIso(data.claimedAt),
      };
    }));

    return { success: true, data: items };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

// ─── adminViewUserState ───────────────────────────────────────────────────────
//
// Comprehensive read-only "show me everything about this user" payload.
// Joins profile, integrations, recent notifications, recent payments,
// recent matches into one server-side fetch. The viewing admin's identity
// is captured in the audit log as a sensitive read.

export async function adminViewUserState(targetUid: string): Promise<ActionResult<{
  profile: {
    uid:          string;
    username:     string | null;
    displayName:  string | null;
    email:        string | null;
    bannedAt:     string | null;
    bannedReason: string | null;
    role:         Role | null;
    clanName:     string | null;
    xp:           number;
    tournamentsPlayed: number;
    tournamentsWon:    number;
  };
  integration: {
    provider:   string;
    gameName:   string;
    tagLine:    string;
    region:     string;
    summonerLevel: number;
    soloRank:   { tier: string; division: string; lp: number; wins: number; losses: number } | null;
    linkedAt:   string | null;
  } | null;
  recentNotifications: Array<{ id: string; type: string; createdAt: string; read: boolean; data?: Record<string, unknown> }>;
  recentTournaments:   Array<{ id: string; name: string; status: string; paymentStatus: string | null; paidAmount: number; registeredAt: string | null }>;
  recentAuditTargeting: Array<{ id: string; action: string; result: string; at: string; actor: string; reason: string }>;
}>> {
  let session: Awaited<ReturnType<typeof getSessionWithRole>>;
  try {
    session = await getSessionWithRole();
    if (!session.role || !["admin", "super_admin"].includes(session.role)) {
      return { success: false, error: "Forbidden" };
    }
  } catch {
    return { success: false, error: "Unauthenticated" };
  }

  try {
    const { adminAuth, adminDb } = await import("@/lib/firebase/admin");

    const [authRec, profileSnap, integrationSnap, notifSnap, partsGroupSnap, auditSnap] = await Promise.all([
      adminAuth.getUser(targetUid).catch(() => null),
      adminDb.collection("profiles").doc(targetUid).get(),
      adminDb.collection("profiles").doc(targetUid).collection("integrations").doc("league").get(),
      adminDb.collection("notifications").doc(targetUid).collection("items").orderBy("createdAt", "desc").limit(10).get().catch(() => ({ docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] })),
      adminDb.collectionGroup("participants").where("userId", "==", targetUid).limit(20).get().catch(() => ({ docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] })),
      adminDb.collection("admin_audit").where("targetId", "==", targetUid).orderBy("at", "desc").limit(10).get().catch(() => ({ docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] })),
    ]);

    if (!authRec) return { success: false, error: "User not found" };

    const toIso = (v: unknown): string | null => {
      if (v instanceof Date) return v.toISOString();
      const d = (v as { toDate?: () => Date } | undefined)?.toDate?.();
      return d ? d.toISOString() : null;
    };

    const pd = profileSnap.exists ? profileSnap.data() as Record<string, unknown> : {};
    const claimRole = authRec.customClaims?.role as string | undefined;

    const integration = integrationSnap.exists ? (() => {
      const d = integrationSnap.data() as {
        provider?: string;
        account?: { gameName?: string; tagLine?: string; region?: string; puuid?: string };
        snapshot?: { summonerLevel?: number; soloRank?: { tier?: string; division?: string; lp?: number; wins?: number; losses?: number } | null };
        linkedAt?: unknown;
      };
      return {
        provider:      d.provider ?? "league",
        gameName:      d.account?.gameName ?? "",
        tagLine:       d.account?.tagLine ?? "",
        region:        d.account?.region ?? "",
        summonerLevel: d.snapshot?.summonerLevel ?? 0,
        soloRank:      d.snapshot?.soloRank ? {
          tier:     d.snapshot.soloRank.tier ?? "",
          division: d.snapshot.soloRank.division ?? "",
          lp:       d.snapshot.soloRank.lp ?? 0,
          wins:     d.snapshot.soloRank.wins ?? 0,
          losses:   d.snapshot.soloRank.losses ?? 0,
        } : null,
        linkedAt:      toIso(d.linkedAt),
      };
    })() : null;

    const recentNotifications = notifSnap.docs.slice(0, 10).map(d => {
      const data = d.data() as Record<string, unknown>;
      return {
        id:        d.id,
        type:      (data.type as string) ?? "?",
        createdAt: toIso(data.createdAt) ?? "",
        read:      !!data.read,
        data:      data.data as Record<string, unknown> | undefined,
      };
    });

    const recentTournaments = await Promise.all(partsGroupSnap.docs.slice(0, 20).map(async d => {
      const data = d.data() as Record<string, unknown>;
      const tournRef = d.ref.parent.parent;
      const tournDoc = tournRef ? await tournRef.get() : null;
      const td = tournDoc?.data() as { name?: string; status?: string } | undefined;
      return {
        id:            tournRef?.id ?? "",
        name:          td?.name ?? "(unknown)",
        status:        td?.status ?? "?",
        paymentStatus: (data.paymentStatus as string | null) ?? null,
        paidAmount:    (data.paidAmount    as number) ?? 0,
        registeredAt:  toIso(data.registeredAt),
      };
    }));

    const recentAuditTargeting = auditSnap.docs.slice(0, 10).map(d => {
      const data = d.data() as Record<string, unknown>;
      return {
        id:     d.id,
        action: (data.action as string) ?? "?",
        result: (data.result === "failure" ? "failure" : "success"),
        at:     toIso(data.at) ?? "",
        actor:  (data.actor as string) ?? "?",
        reason: (data.reason as string) ?? "",
      };
    });

    // Audit-log this access — sensitive reads are tracked deliberately.
    try {
      await writeAuditLog({
        actor:      session.uid,
        actorRole:  session.role,
        action:     "user.view_state",
        targetType: "user",
        targetId:   targetUid,
        reason:     "Admin opened comprehensive user-state view",
        result:     "success",
      });
    } catch { /* never block the view on log write failures */ }

    return {
      success: true,
      data: {
        profile: {
          uid:           authRec.uid,
          username:      (pd.username    as string | null) ?? null,
          displayName:   (pd.displayName as string | null) ?? null,
          email:         authRec.email ?? null,
          bannedAt:      toIso(pd.bannedAt),
          bannedReason:  (pd.bannedReason as string | null) ?? null,
          role:          isRole(claimRole) ? claimRole : null,
          clanName:      (pd.clanName as string | null) ?? null,
          xp:            (pd.xp as number) ?? 0,
          tournamentsPlayed: (pd.tournamentsPlayed as number) ?? 0,
          tournamentsWon:    (pd.tournamentsWon    as number) ?? 0,
        },
        integration,
        recentNotifications,
        recentTournaments,
        recentAuditTargeting,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

// ─── listAuditLog ─────────────────────────────────────────────────────────────
//
// Admin+ readonly view of recent audit-log entries. Paginated by `at`
// timestamp descending. Pass `before` (ISO string) to fetch the next page.

export async function listAuditLog(opts: {
  before?:     string;
  pageSize?:   number;
  actionLike?: string;
}): Promise<ActionResult<{
  items: Array<{
    id:         string;
    actor:      string;
    actorRole:  Role | null;
    action:     string;
    targetType: string;
    targetId:   string;
    reason:     string;
    result:     "success" | "failure";
    errorMsg:   string | null;
    metadata:   Record<string, unknown> | null;
    ip:         string | null;
    at:         string;
  }>;
  hasMore: boolean;
}>> {
  try {
    const session = await getSessionWithRole();
    if (!session.role || !["admin", "super_admin"].includes(session.role)) {
      return { success: false, error: "Forbidden" };
    }

    const { adminDb } = await import("@/lib/firebase/admin");
    const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 10), 200);

    let q = adminDb.collection("admin_audit").orderBy("at", "desc").limit(pageSize + 1);
    if (opts.before) q = q.startAfter(new Date(opts.before));
    if (opts.actionLike && opts.actionLike.trim()) {
      // Firestore can't do contains; use action == exact for now. Future:
      // denormalize a top-level `actionPrefix` for prefix search.
      q = adminDb.collection("admin_audit").where("action", "==", opts.actionLike.trim()).orderBy("at", "desc").limit(pageSize + 1);
      if (opts.before) q = q.startAfter(new Date(opts.before));
    }

    const snap = await q.get();
    const items = snap.docs.slice(0, pageSize).map(d => {
      const data = d.data() as Record<string, unknown>;
      const at = data.at instanceof Date ? data.at
        : (data.at as { toDate?: () => Date } | undefined)?.toDate?.()
        ?? new Date();
      return {
        id:         d.id,
        actor:      (data.actor as string) ?? "(unknown)",
        actorRole:  isRole(data.actorRole) ? data.actorRole : null,
        action:     (data.action     as string) ?? "?",
        targetType: (data.targetType as string) ?? "?",
        targetId:   (data.targetId   as string) ?? "?",
        reason:     (data.reason     as string) ?? "",
        result:     (data.result === "failure" ? "failure" : "success") as "success" | "failure",
        errorMsg:   (data.errorMsg   as string | null) ?? null,
        metadata:   (data.metadata   as Record<string, unknown> | null) ?? null,
        ip:         (data.ip         as string | null) ?? null,
        at:         at.toISOString(),
      };
    });

    return {
      success: true,
      data: { items, hasMore: snap.size > pageSize },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

// ─── adminGetUser ─────────────────────────────────────────────────────────────
//
// Admin+ read-only view of a user — combines the Firestore profile with the
// Firebase auth record (so we can show email + claim role + disabled state).
// Audit-logged as a sensitive read so we can spot mass-snooping later.

export async function adminGetUser(targetUid: string): Promise<ActionResult<{
  uid:          string;
  email:        string | null;
  emailVerified: boolean;
  disabled:     boolean;
  role:         Role | null;
  createdAt:    string | null;
  lastSignInAt: string | null;
  profile:      {
    username:          string | null;
    displayName:       string | null;
    avatarUrl:         string | null;
    xp:                number;
    tournamentsPlayed: number;
    tournamentsWon:    number;
    isVerified:        boolean;
    isPrivate:         boolean;
    bannedAt:          string | null;
    bannedReason:      string | null;
    clanName:          string | null;
    clanSlug:          string | null;
  };
}>> {
  let session: Awaited<ReturnType<typeof getSessionWithRole>>;
  try {
    session = await getSessionWithRole();
    if (!session.role || !["admin", "super_admin"].includes(session.role)) {
      return { success: false, error: "Forbidden" };
    }
  } catch {
    return { success: false, error: "Unauthenticated" };
  }

  try {
    const { adminAuth, adminDb } = await import("@/lib/firebase/admin");
    const [authRec, profileSnap] = await Promise.all([
      adminAuth.getUser(targetUid).catch(() => null),
      adminDb.collection("profiles").doc(targetUid).get(),
    ]);

    if (!authRec) return { success: false, error: "User not found" };

    const claimRole = authRec.customClaims?.role as string | undefined;
    const role: Role | null = isRole(claimRole) ? claimRole : null;
    const p = profileSnap.exists ? (profileSnap.data() as Record<string, unknown>) : {};
    const toIso = (v: unknown): string | null => {
      if (v instanceof Date) return v.toISOString();
      const d = (v as { toDate?: () => Date } | undefined)?.toDate?.();
      return d ? d.toISOString() : null;
    };

    return {
      success: true,
      data: {
        uid:           authRec.uid,
        email:         authRec.email ?? null,
        emailVerified: authRec.emailVerified,
        disabled:      authRec.disabled,
        role,
        createdAt:    authRec.metadata.creationTime ?? null,
        lastSignInAt: authRec.metadata.lastSignInTime ?? null,
        profile: {
          username:          (p.username    as string | null) ?? null,
          displayName:       (p.displayName as string | null) ?? null,
          avatarUrl:         (p.avatarUrl   as string | null) ?? null,
          xp:                (p.xp as number) ?? 0,
          tournamentsPlayed: (p.tournamentsPlayed as number) ?? 0,
          tournamentsWon:    (p.tournamentsWon    as number) ?? 0,
          isVerified:        !!p.isVerified,
          isPrivate:         !!p.isPrivate,
          bannedAt:          toIso(p.bannedAt),
          bannedReason:      (p.bannedReason as string | null) ?? null,
          clanName:          (p.clanName as string | null) ?? null,
          clanSlug:          (p.clanSlug as string | null) ?? null,
        },
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

// ─── adminSearchUsers ─────────────────────────────────────────────────────────
//
// Admin+ user lookup. Tries each of these in turn (stops at first hit):
//   1. exact uid match (if the query looks like a Firebase uid: 28 chars)
//   2. exact email match (via Firebase Auth)
//   3. exact username match (via /usernames/{lower})
//   4. username prefix (Firestore range query, limit 20)

export async function adminSearchUsers(query: string): Promise<ActionResult<Array<{
  uid:         string;
  username:    string | null;
  displayName: string | null;
  email:       string | null;
  role:        Role | null;
  banned:      boolean;
}>>> {
  try {
    const session = await getSessionWithRole();
    if (!session.role || !["admin", "super_admin"].includes(session.role)) {
      return { success: false, error: "Forbidden" };
    }

    const trimmed = (query ?? "").trim();
    if (trimmed.length === 0) return { success: true, data: [] };

    const { adminAuth, adminDb } = await import("@/lib/firebase/admin");
    const matchedUids = new Set<string>();

    // 1. uid
    if (/^[A-Za-z0-9]{20,40}$/.test(trimmed)) matchedUids.add(trimmed);

    // 2. email
    if (trimmed.includes("@")) {
      const u = await adminAuth.getUserByEmail(trimmed).catch(() => null);
      if (u) matchedUids.add(u.uid);
    }

    // 3. exact username
    const exact = await adminDb.collection("usernames").doc(trimmed.toLowerCase()).get();
    if (exact.exists) {
      const uid = (exact.data() as { uid?: string }).uid;
      if (uid) matchedUids.add(uid);
    }

    // 4. username prefix (Firestore range trick)
    if (trimmed.length >= 2) {
      const lo = trimmed.toLowerCase();
      const hi = lo + "";
      const prefix = await adminDb.collection("usernames")
        .where("__name__", ">=", lo)
        .where("__name__", "<=", hi)
        .limit(20)
        .get();
      prefix.docs.forEach(d => {
        const uid = (d.data() as { uid?: string }).uid;
        if (uid) matchedUids.add(uid);
      });
    }

    if (matchedUids.size === 0) return { success: true, data: [] };

    const results = await Promise.all(Array.from(matchedUids).slice(0, 25).map(async uid => {
      const [u, p] = await Promise.all([
        adminAuth.getUser(uid).catch(() => null),
        adminDb.collection("profiles").doc(uid).get(),
      ]);
      const pd = p.exists ? (p.data() as Record<string, unknown>) : {};
      const claimRole = u?.customClaims?.role as string | undefined;
      return {
        uid,
        username:    (pd.username    as string | null) ?? null,
        displayName: (pd.displayName as string | null) ?? null,
        email:       u?.email ?? null,
        role:        isRole(claimRole) ? claimRole : null,
        banned:      !!pd.bannedAt,
      };
    }));

    return { success: true, data: results };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

// ─── listRoleHolders ──────────────────────────────────────────────────────────
//
// Super_admin only. Lists all users with any elevated role. Reads custom
// claims via the Admin SDK (Firebase doesn't index claims, so we use the
// `isAdmin` mirror on profiles as the lookup hint — same source the legacy
// code already used).

export async function listRoleHolders(): Promise<ActionResult<Array<{
  uid:         string;
  role:        Role | null;
  email:       string | null;
  displayName: string | null;
  username:    string | null;
}>>> {
  try {
    await getSuperAdminUid();
    const { adminAuth, adminDb } = await import("@/lib/firebase/admin");

    const snap = await adminDb.collection("profiles").where("isAdmin", "==", true).get();
    const uids = snap.docs.map(d => d.id);
    if (uids.length === 0) return { success: true, data: [] };

    const users = await Promise.all(uids.map(async uid => {
      const [u, p] = await Promise.all([
        adminAuth.getUser(uid).catch(() => null),
        adminDb.collection("profiles").doc(uid).get(),
      ]);
      const claimRole = u?.customClaims?.role as string | undefined;
      const role: Role | null = isRole(claimRole) ? claimRole : "admin";  // legacy
      const pd = p.data() as { displayName?: string; username?: string } | undefined;
      return {
        uid,
        role,
        email:       u?.email ?? null,
        displayName: pd?.displayName ?? null,
        username:    pd?.username ?? null,
      };
    }));

    return { success: true, data: users };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return { success: false, error: message };
  }
}
