"use server";

import { headers } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import {
  getSessionWithRole,
  requireRole,
} from "@/lib/actions/server-auth";
import { meetsRole, type Role } from "@/lib/auth/roles";
import { writeAuditLog, type AuditTargetType } from "@/lib/auth/audit-log";
import { sendAdminAlert } from "@/lib/auth/discord-alert";
import {
  resolveActor,
  resolveUserTarget,
  resolveClanTarget,
  resolveTournamentTarget,
} from "@/lib/auth/discord-formatting";
import { requireStepUp } from "@/lib/auth/step-up";

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
  /** Sent when the action needs the user to re-authenticate before
   * proceeding. Clients catch this and open the password modal. */
  needsStepUp?: boolean;
}

function clientIp(): string | null {
  const h = headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? h.get("x-real-ip")
    ?? null;
}

function isStepUpRequired(err: unknown): boolean {
  return err instanceof Error && err.message === "step_up_required";
}

// ─── banUser ──────────────────────────────────────────────────────────────────
//
// Admin+ destructive action. Marks the profile banned, disables the Firebase
// auth user (cuts off all sessions), records audit + Discord critical alert.
// Refusing to ban another admin/super_admin without super_admin authority.

export async function banUser(targetUid: string, reason: string): Promise<ActionResult> {
  let session: Awaited<ReturnType<typeof getSessionWithRole>>;
  try {
    session = await requireRole("admin");
    requireStepUp(session.uid);
  } catch (err) {
    if (isStepUpRequired(err)) return { success: false, needsStepUp: true, error: "Re-authenticate to continue" };
    return { success: false, error: err instanceof Error ? err.message : "Forbidden" };
  }

  const cleanedReason = (reason ?? "").trim();
  if (cleanedReason.length < 5) {
    return await logFailure(session, "user.ban", "user", targetUid, cleanedReason, "Reason is required (min 5 chars)");
  }
  if (session.uid === targetUid) {
    return await logFailure(session, "user.ban", "user", targetUid, cleanedReason, "Cannot ban yourself");
  }

  try {
    const { adminAuth, adminDb } = await import("@/lib/firebase/admin");

    // Target's existing role gates who can ban whom. Same idea as setUserRole:
    // only super_admin can touch admins; nobody can ban a super_admin from the UI.
    const userRecord = await adminAuth.getUser(targetUid).catch(() => null);
    if (!userRecord) {
      return await logFailure(session, "user.ban", "user", targetUid, cleanedReason, "Target user not found");
    }
    const targetRole = userRecord.customClaims?.role as Role | undefined;
    if (targetRole === "super_admin") {
      return await logFailure(session, "user.ban", "user", targetUid, cleanedReason, "super_admin cannot be banned from the UI");
    }
    if (targetRole === "admin" && session.role !== "super_admin") {
      return await logFailure(session, "user.ban", "user", targetUid, cleanedReason, "Only a super_admin can ban an admin");
    }

    const now = new Date();

    // Disable the Firebase auth user — kills all existing sessions immediately
    // (verifySessionCookie with checkRevoked=true will reject on the next
    // request) and prevents future sign-ins.
    await adminAuth.updateUser(targetUid, { disabled: true });
    await adminAuth.revokeRefreshTokens(targetUid);

    // Stamp the profile so the UI can render the right state.
    await adminDb.collection("profiles").doc(targetUid).set({
      bannedAt:     now,
      bannedBy:     session.uid,
      bannedReason: cleanedReason,
    }, { merge: true });

    await writeAuditLog({
      actor:      session.uid,
      actorRole:  session.role,
      action:     "user.ban",
      targetType: "user",
      targetId:   targetUid,
      reason:     cleanedReason,
      metadata:   { email: userRecord.email ?? null },
      result:     "success",
      ip:         clientIp(),
    });

    const [actor, target] = await Promise.all([
      resolveActor(session.uid, session.role),
      resolveUserTarget(targetUid),
    ]);
    await sendAdminAlert({
      title: "🚫 User banned",
      body:  `**${actor.label}** banned **${target.label}**${userRecord.email ? ` · ${userRecord.email}` : ""}.`,
      level: "critical",
      fields: [
        { name: "Actor",  value: `${actor.label}\n\`${actor.uid}\`` },
        { name: "Target", value: `${target.label}\n\`${target.id}\`` },
        { name: "Reason", value: cleanedReason },
      ],
    });

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ban failed";
    return await logFailure(session, "user.ban", "user", targetUid, cleanedReason, msg);
  }
}

// ─── unbanUser ────────────────────────────────────────────────────────────────

export async function unbanUser(targetUid: string, reason: string): Promise<ActionResult> {
  let session: Awaited<ReturnType<typeof getSessionWithRole>>;
  try {
    session = await requireRole("admin");
    requireStepUp(session.uid);
  } catch (err) {
    if (isStepUpRequired(err)) return { success: false, needsStepUp: true, error: "Re-authenticate to continue" };
    return { success: false, error: err instanceof Error ? err.message : "Forbidden" };
  }

  const cleanedReason = (reason ?? "").trim();
  if (cleanedReason.length < 5) {
    return await logFailure(session, "user.unban", "user", targetUid, cleanedReason, "Reason is required (min 5 chars)");
  }

  try {
    const { adminAuth, adminDb } = await import("@/lib/firebase/admin");
    const userRecord = await adminAuth.getUser(targetUid).catch(() => null);
    if (!userRecord) {
      return await logFailure(session, "user.unban", "user", targetUid, cleanedReason, "Target user not found");
    }

    await adminAuth.updateUser(targetUid, { disabled: false });
    await adminDb.collection("profiles").doc(targetUid).set({
      bannedAt:     null,
      bannedBy:     null,
      bannedReason: null,
    }, { merge: true });

    await writeAuditLog({
      actor:      session.uid,
      actorRole:  session.role,
      action:     "user.unban",
      targetType: "user",
      targetId:   targetUid,
      reason:     cleanedReason,
      result:     "success",
      ip:         clientIp(),
    });

    const [actor, target] = await Promise.all([
      resolveActor(session.uid, session.role),
      resolveUserTarget(targetUid),
    ]);
    await sendAdminAlert({
      title: "✅ User unbanned",
      body:  `**${actor.label}** unbanned **${target.label}**${userRecord.email ? ` · ${userRecord.email}` : ""}.`,
      level: "info",
      fields: [
        { name: "Actor",  value: `${actor.label}\n\`${actor.uid}\`` },
        { name: "Target", value: `${target.label}\n\`${target.id}\`` },
        { name: "Reason", value: cleanedReason },
      ],
    });

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unban failed";
    return await logFailure(session, "user.unban", "user", targetUid, cleanedReason, msg);
  }
}

// ─── forceUnlinkRiotAccount ───────────────────────────────────────────────────
//
// Support-mode tool: lets an admin remove a user's linked Riot account so the
// user can link a different one (e.g. they lost access to the original Riot
// account, or two ClanForge profiles inadvertently shared one PUUID before
// uniqueness was enforced).
//
// Releases the /league_account_owners/{puuid} lock atomically with the
// integration deletion.

export async function forceUnlinkRiotAccount(
  targetUid: string,
  reason: string,
): Promise<ActionResult> {
  let session: Awaited<ReturnType<typeof getSessionWithRole>>;
  try {
    session = await requireRole("admin");
    requireStepUp(session.uid);
  } catch (err) {
    if (isStepUpRequired(err)) return { success: false, needsStepUp: true, error: "Re-authenticate to continue" };
    return { success: false, error: err instanceof Error ? err.message : "Forbidden" };
  }

  const cleanedReason = (reason ?? "").trim();
  if (cleanedReason.length < 5) {
    return await logFailure(session, "integration.force_unlink", "integration", targetUid, cleanedReason, "Reason is required");
  }

  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const intRef     = adminDb.collection("profiles").doc(targetUid).collection("integrations").doc("league");
    const intSnap    = await intRef.get();
    if (!intSnap.exists) {
      return await logFailure(session, "integration.force_unlink", "integration", targetUid, cleanedReason, "No League integration found");
    }
    const intData = intSnap.data() as { account?: { puuid?: string } };
    const puuid = intData.account?.puuid;

    await adminDb.runTransaction(async tx => {
      tx.delete(intRef);
      if (puuid) {
        const ownersRef = adminDb.collection("league_account_owners").doc(puuid);
        const ownerSnap = await tx.get(ownersRef);
        if (ownerSnap.exists && (ownerSnap.data() as { uid?: string }).uid === targetUid) {
          tx.delete(ownersRef);
        }
      }
    });

    // Also clean up any pending verification doc.
    await adminDb.collection("profiles").doc(targetUid)
      .collection("integrations_pending").doc("league").delete().catch(() => {});

    await writeAuditLog({
      actor:      session.uid,
      actorRole:  session.role,
      action:     "integration.force_unlink",
      targetType: "integration",
      targetId:   `${targetUid}/league`,
      reason:     cleanedReason,
      metadata:   { provider: "league", puuid: puuid ?? null },
      result:     "success",
      ip:         clientIp(),
    });

    const [actor, target] = await Promise.all([
      resolveActor(session.uid, session.role),
      resolveUserTarget(targetUid),
    ]);
    await sendAdminAlert({
      title: "🔌 Riot integration force-unlinked",
      body:  `**${actor.label}** force-unlinked the League integration of **${target.label}**.`,
      level: "warn",
      fields: [
        { name: "Actor",  value: `${actor.label}\n\`${actor.uid}\`` },
        { name: "Target", value: `${target.label}\n\`${target.id}\`` },
        { name: "PUUID",  value: puuid ? `\`${puuid}\`` : "(unknown)" },
        { name: "Reason", value: cleanedReason },
      ],
    });

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Force-unlink failed";
    return await logFailure(session, "integration.force_unlink", "integration", targetUid, cleanedReason, msg);
  }
}

// ─── hideContent ──────────────────────────────────────────────────────────────
//
// Moderator+ action — no step-up. Moderation should be fast. Sets
// `hiddenAt` / `hiddenBy` / `hiddenReason` on the target document; the
// public renderers already check `hiddenAt` to decide whether to display.
//
// Supported targets: clan posts (/clans/{clanId}/posts/{postId}),
// tournaments (/tournaments/{id}), clans (/clans/{id}).
//
// Audit + Discord (info) on every action.

export async function hideContent(
  targetType: "post" | "tournament" | "clan",
  targetPath: string,   // for posts: "{clanId}/{postId}"; for others: "{id}"
  reason:     string,
): Promise<ActionResult> {
  let session: Awaited<ReturnType<typeof getSessionWithRole>>;
  try {
    session = await requireRole("moderator");
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Forbidden" };
  }

  const cleanedReason = (reason ?? "").trim();
  if (cleanedReason.length < 5) {
    return await logFailure(session, "content.hide", targetType, targetPath, cleanedReason, "Reason is required");
  }

  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const ref = resolveContentRef(adminDb, targetType, targetPath);
    if (!ref) {
      return await logFailure(session, "content.hide", targetType, targetPath, cleanedReason, "Invalid target");
    }

    const snap = await ref.get();
    if (!snap.exists) {
      return await logFailure(session, "content.hide", targetType, targetPath, cleanedReason, "Target not found");
    }

    await ref.set({
      hiddenAt:     new Date(),
      hiddenBy:     session.uid,
      hiddenReason: cleanedReason,
    }, { merge: true });

    await writeAuditLog({
      actor:      session.uid,
      actorRole:  session.role,
      action:     "content.hide",
      targetType,
      targetId:   targetPath,
      reason:     cleanedReason,
      result:     "success",
      ip:         clientIp(),
    });

    // Resolve a friendly label for the target so the embed reads "Spring
    // Showdown" rather than the raw doc id. Clan posts encode the clan id +
    // post id so we surface the clan; other types are direct doc refs.
    const actor = await resolveActor(session.uid, session.role);
    let targetLabel = targetPath;
    if (targetType === "tournament") {
      targetLabel = (await resolveTournamentTarget(targetPath)).label;
    } else if (targetType === "clan") {
      targetLabel = (await resolveClanTarget(targetPath)).label;
    } else if (targetType === "post") {
      const [clanId] = targetPath.split("/");
      const clan = await resolveClanTarget(clanId);
      targetLabel = `Post in ${clan.label}`;
    }

    await sendAdminAlert({
      title: `🙈 ${targetType[0].toUpperCase() + targetType.slice(1)} hidden`,
      body:  `**${actor.label}** hid ${targetType} **${targetLabel}**.`,
      level: "info",
      fields: [
        { name: "Actor",  value: `${actor.label}\n\`${actor.uid}\`` },
        { name: "Target", value: `${targetLabel}\n\`${targetPath}\`` },
        { name: "Reason", value: cleanedReason },
      ],
    });

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Hide failed";
    return await logFailure(session, "content.hide", targetType, targetPath, cleanedReason, msg);
  }
}

// ─── unhideContent ────────────────────────────────────────────────────────────

export async function unhideContent(
  targetType: "post" | "tournament" | "clan",
  targetPath: string,
  reason:     string,
): Promise<ActionResult> {
  let session: Awaited<ReturnType<typeof getSessionWithRole>>;
  try {
    session = await requireRole("moderator");
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Forbidden" };
  }

  const cleanedReason = (reason ?? "").trim();
  if (cleanedReason.length < 5) {
    return await logFailure(session, "content.unhide", targetType, targetPath, cleanedReason, "Reason is required");
  }

  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const ref = resolveContentRef(adminDb, targetType, targetPath);
    if (!ref) {
      return await logFailure(session, "content.unhide", targetType, targetPath, cleanedReason, "Invalid target");
    }
    await ref.set({
      hiddenAt:     FieldValue.delete(),
      hiddenBy:     FieldValue.delete(),
      hiddenReason: FieldValue.delete(),
    }, { merge: true });

    await writeAuditLog({
      actor:      session.uid,
      actorRole:  session.role,
      action:     "content.unhide",
      targetType,
      targetId:   targetPath,
      reason:     cleanedReason,
      result:     "success",
      ip:         clientIp(),
    });

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unhide failed";
    return await logFailure(session, "content.unhide", targetType, targetPath, cleanedReason, msg);
  }
}

// ─── shared helpers ──────────────────────────────────────────────────────────

function resolveContentRef(
  db: FirebaseFirestore.Firestore,
  type: "post" | "tournament" | "clan",
  path: string,
): FirebaseFirestore.DocumentReference | null {
  if (type === "tournament") return db.collection("tournaments").doc(path);
  if (type === "clan")       return db.collection("clans").doc(path);
  if (type === "post") {
    const [clanId, postId] = path.split("/");
    if (!clanId || !postId) return null;
    return db.collection("clans").doc(clanId).collection("posts").doc(postId);
  }
  return null;
}

// Return type is the structural failure shape so callers with any
// ActionResult<T> can return us directly without a cast.
async function logFailure(
  session: { uid: string; role: Role | null },
  action:     string,
  targetType: AuditTargetType,
  targetId:   string,
  reason:     string,
  error:      string,
): Promise<{ success: false; error: string }> {
  try {
    await writeAuditLog({
      actor:     session.uid,
      actorRole: session.role,
      action,
      targetType,
      targetId,
      reason:    reason || "(no reason supplied)",
      result:    "failure",
      errorMsg:  error,
      ip:        clientIp(),
    });
  } catch (logErr) {
    console.error("[admin-moderation] audit-log write failed:", logErr);
  }
  // Don't alert Discord on routine validation rejections — would create noise.
  // Higher-tier alerting (e.g. "attempted to ban admin") could be added here
  // if we see specific patterns we want flagged.
  if (!meetsRole(session.role, "admin")) {
    // Should be unreachable; defensive.
    console.warn("[admin-moderation] non-admin reached failure path:", { action, targetId, error });
  }
  return { success: false, error };
}
