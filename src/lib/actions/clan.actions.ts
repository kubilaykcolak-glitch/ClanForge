"use server";

import { FieldValue } from "firebase-admin/firestore";
import type { Clan, ClanRole } from "@/types";
import { getClanLevel, getClanBorderSlug } from "@/lib/clan-levels";
import { getSessionUid, getSessionWithRole } from "./server-auth";
import { meetsRole } from "@/lib/auth/roles";
import { friendlyActionError } from "./_errors";

// ── Response shape ────────────────────────────────────────────────────────────

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

// ── Clan-tag validation ───────────────────────────────────────────────────────

const TAG_RE = /^[A-Z]{1,4}$/;

function validateTag(raw: string): { tag: string } | { error: string } {
  const tag = raw.trim().toUpperCase();
  if (!tag)              return { error: "Clan tag cannot be empty" };
  if (tag.length > 4)    return { error: "Clan tag must be 4 characters or fewer" };
  if (!TAG_RE.test(tag)) return { error: "Clan tag may only contain letters A–Z" };
  return { tag };
}

// ── createClan ────────────────────────────────────────────────────────────────
// Atomic write: /clans/{id} + /clanSlugs/{slug} + /clans/{id}/members/{uid}
// + /profiles/{uid} clan-denorm fields, all in one batch.

// Identity for the leader's member doc is hydrated server-side from
// /profiles/{uid} — see body. Caller-supplied profile arg removed per
// audit fix H2.
export async function createClan(
  uid: string,
  data: Omit<Clan, "id" | "ownerId" | "memberCount" | "xp" | "createdAt" | "updatedAt">,
): Promise<ActionResult<{ clanId: string; slug: string }>> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");

    // Read the caller's profile so we use server-authoritative identity on
    // the member doc (clan members are rendered to anyone visiting the clan
    // page — a forged displayName would otherwise show up there).
    const profileSnap = await adminDb.collection("profiles").doc(uid).get();
    if (!profileSnap.exists) {
      return { success: false, error: "Profile not found — complete onboarding first" };
    }
    const prof = profileSnap.data() as { displayName?: string; username?: string; avatarUrl?: string };

    // Reserve a Firestore-generated ID before the batch so we can reference it.
    const clanRef = adminDb.collection("clans").doc();
    const clanId  = clanRef.id;
    const now     = new Date();

    const batch = adminDb.batch();

    // /clans/{clanId}
    batch.set(clanRef, {
      ...data,
      ownerId:     uid,
      memberCount: 1,
      xp:          0,
      createdAt:   now,
      updatedAt:   now,
    });

    // /clanSlugs/{slug} — used for slug → clanId resolution
    batch.set(adminDb.collection("clanSlugs").doc(data.slug), { clanId });

    // /clans/{clanId}/members/{uid}
    batch.set(
      adminDb.collection("clans").doc(clanId).collection("members").doc(uid),
      {
        userId:      uid,
        role:        "leader",
        joinedAt:    now,
        displayName: prof.displayName ?? prof.username ?? "Member",
        avatarUrl:   prof.avatarUrl ?? null,
      },
    );

    // /profiles/{uid} — stamp all four clan-denorm fields on the creator's profile
    batch.update(adminDb.collection("profiles").doc(uid), {
      clanId,
      clanTag:  data.clanTag  ?? null,
      clanSlug: data.slug,
      clanName: data.name,
    });

    await batch.commit();

    return { success: true, data: { clanId, slug: data.slug } };
  } catch (err) {
    const message = friendlyActionError(err, "Failed to create clan");
    console.error("[createClan]", err);
    return { success: false, error: message };
  }
}

// ── joinClan ──────────────────────────────────────────────────────────────────
// Guards: clan must exist, be public, and have room. Uses a transaction so
// the memberCount increment and the guard read are atomic.

// Identity hydrated from /profiles/{uid} inside the transaction so the
// member doc carries server-authoritative displayName / avatarUrl (H2).
//
// Two modes:
//   - "member": direct join. Used when the clan is public AND recruiting.
//     Enforces clan-is-public, clan-is-recruiting, member-limit-not-full,
//     duplicate-membership, and the 10h leave cooldown. Increments
//     memberCount and stamps clan-denorm fields on the profile.
//   - "pending": request-to-join. Used when the clan is private OR not
//     currently recruiting. Skips the recruiting / member-limit checks
//     (the leader will gate the actual join when they approve) but still
//     blocks duplicates and the leave cooldown. Does NOT bump memberCount
//     and does NOT stamp clan-denorm fields — those land when the leader
//     approves and a separate action upgrades the pending doc to "member".
export async function joinClan(
  uid: string,
  clanId: string,
  mode: "member" | "pending" = "member",
): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");

    await adminDb.runTransaction(async tx => {
      const clanRef    = adminDb.collection("clans").doc(clanId);
      const memberRef  = adminDb.collection("clans").doc(clanId).collection("members").doc(uid);
      const profileRef = adminDb.collection("profiles").doc(uid);

      const [clanSnap, memberSnap, profileSnap] = await Promise.all([
        tx.get(clanRef),
        tx.get(memberRef),
        tx.get(profileRef),
      ]);

      if (!clanSnap.exists) throw new Error("Clan not found");

      const clan = clanSnap.data()!;

      // Recruiting + member-limit are only enforced on direct joins —
      // pending requests are how users get into closed or full clans.
      if (mode === "member") {
        if (!clan.isPublic)     throw new Error("This clan is private");
        if (!clan.isRecruiting) throw new Error("This clan is not recruiting");
        if ((clan.memberCount as number) >= (clan.memberLimit as number)) {
          throw new Error("Clan is full");
        }
      }
      if (memberSnap.exists) {
        const existingRole = (memberSnap.data()!.role as string) ?? "";
        throw new Error(
          existingRole === "pending"
            ? "You already have a pending request for this clan"
            : "You are already a member of this clan",
        );
      }

      // ── 10-hour join cooldown (anti-grind) ─────────────────────────────────
      // Applies to BOTH paths so a user can't dodge it by raising pending
      // requests instead of direct joins.
      const { CLAN_JOIN_COOLDOWN_MS, CLAN_JOIN_COOLDOWN_HOURS } = await import("@/lib/xp");
      const lastLeaveAt = profileSnap.data()?.lastClanLeaveAt?.toDate?.() ?? null;
      if (lastLeaveAt && Date.now() - lastLeaveAt.getTime() < CLAN_JOIN_COOLDOWN_MS) {
        const hoursLeft = Math.ceil(
          (CLAN_JOIN_COOLDOWN_MS - (Date.now() - lastLeaveAt.getTime())) / (60 * 60 * 1000),
        );
        throw new Error(
          `You recently left a clan — you can join another in about ${hoursLeft}h. ` +
          `This ${CLAN_JOIN_COOLDOWN_HOURS}h cooldown helps keep clan membership meaningful.`,
        );
      }

      const now = new Date();

      const prof = profileSnap.data() as { displayName?: string; username?: string; avatarUrl?: string };
      tx.set(memberRef, {
        userId:      uid,
        role:        mode,
        joinedAt:    now,
        displayName: prof.displayName ?? prof.username ?? "Member",
        avatarUrl:   prof.avatarUrl ?? null,
      });

      if (mode === "member") {
        tx.update(clanRef, { memberCount: FieldValue.increment(1) });

        // Stamp clan-denorm fields + border perk based on current clan level.
        const clanXp     = (clan.xp as number) ?? 0;
        const clanLevel  = getClanLevel(clanXp).level;
        const clanBorder = getClanBorderSlug(clanLevel);

        tx.update(profileRef, {
          clanId,
          clanTag:    (clan.clanTag as string | null) ?? null,
          clanSlug:   clan.slug as string,
          clanName:   clan.name as string,
          clanBorder: clanBorder ?? null,
        });
      }
    });

    // Award clan XP only for confirmed joins (pending requests are
    // approval-gated and shouldn't pre-award XP).
    if (mode === "member") {
      import("@/lib/actions/clan-xp.actions")
        .then(m => m.awardClanXp(clanId, "member_join", uid, uid))
        .catch(() => {});
    }

    return { success: true };
  } catch (err) {
    const message = friendlyActionError(err, "Failed to join clan");
    console.error("[joinClan]", err);
    return { success: false, error: message };
  }
}

// ── leaveClan ─────────────────────────────────────────────────────────────────
// Leaders must transfer ownership or disband before they can leave.

export async function leaveClan(
  uid: string,
  clanId: string,
): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");

    await adminDb.runTransaction(async tx => {
      const memberRef  = adminDb.collection("clans").doc(clanId).collection("members").doc(uid);
      const clanRef    = adminDb.collection("clans").doc(clanId);
      const profileRef = adminDb.collection("profiles").doc(uid);

      const memberSnap = await tx.get(memberRef);
      if (!memberSnap.exists) throw new Error("You are not a member of this clan");

      const role = memberSnap.data()!.role as string;
      if (role === "leader") {
        throw new Error("Leaders cannot leave — transfer ownership or disband the clan first");
      }

      tx.delete(memberRef);
      tx.update(clanRef, { memberCount: FieldValue.increment(-1) });
      tx.update(profileRef, {
        clanId:           null,
        clanTag:          null,
        clanSlug:         null,
        clanName:         null,
        clanBorder:       null,
        lastClanLeaveAt:  new Date(),
      });
    });

    return { success: true };
  } catch (err) {
    const message = friendlyActionError(err, "Failed to leave clan");
    console.error("[leaveClan]", err);
    return { success: false, error: message };
  }
}

// ── updateMemberRole ──────────────────────────────────────────────────────────
// Only leaders and officers may change roles.
// Leaders can set any role; officers can only set "member" / "pending".

export async function updateMemberRole(
  uid: string,
  clanId: string,
  targetUserId: string,
  newRole: ClanRole,
): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    if (uid === targetUserId) {
      return { success: false, error: "You cannot change your own role" };
    }

    const { adminDb } = await import("@/lib/firebase/admin");

    const [requesterSnap, targetSnap] = await Promise.all([
      adminDb.collection("clans").doc(clanId).collection("members").doc(uid).get(),
      adminDb.collection("clans").doc(clanId).collection("members").doc(targetUserId).get(),
    ]);

    if (!requesterSnap.exists) {
      return { success: false, error: "You are not a member of this clan" };
    }
    if (!targetSnap.exists) {
      return { success: false, error: "Target user is not a member of this clan" };
    }

    const requesterRole = requesterSnap.data()!.role as ClanRole;

    if (requesterRole !== "leader" && requesterRole !== "officer") {
      return { success: false, error: "You do not have permission to change roles" };
    }

    // Officers cannot promote to officer/leader
    if (requesterRole === "officer" && (newRole === "officer" || newRole === "leader")) {
      return { success: false, error: "Officers can only assign member or pending roles" };
    }

    // Prevent demoting the leader
    const targetRole = targetSnap.data()!.role as ClanRole;
    if (targetRole === "leader") {
      return { success: false, error: "The clan leader's role cannot be changed this way" };
    }

    await adminDb
      .collection("clans")
      .doc(clanId)
      .collection("members")
      .doc(targetUserId)
      .update({ role: newRole });

    return { success: true };
  } catch (err) {
    const message = friendlyActionError(err, "Failed to update member role");
    console.error("[updateMemberRole]", err);
    return { success: false, error: message };
  }
}

// ── removeMember ──────────────────────────────────────────────────────────────
// Leaders and officers may remove members. Leaders cannot be removed.
// Decrements memberCount and clears all clan-denorm fields from the target's profile.

export async function removeMember(
  uid: string,
  clanId: string,
  targetUserId: string,
): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    if (uid === targetUserId) {
      return { success: false, error: "Use leaveClan to remove yourself" };
    }

    const { adminDb } = await import("@/lib/firebase/admin");

    await adminDb.runTransaction(async tx => {
      const requesterRef  = adminDb.collection("clans").doc(clanId).collection("members").doc(uid);
      const targetRef     = adminDb.collection("clans").doc(clanId).collection("members").doc(targetUserId);
      const clanRef       = adminDb.collection("clans").doc(clanId);
      const targetProfile = adminDb.collection("profiles").doc(targetUserId);

      const [requesterSnap, targetSnap] = await Promise.all([
        tx.get(requesterRef),
        tx.get(targetRef),
      ]);

      if (!requesterSnap.exists) throw new Error("You are not a member of this clan");
      if (!targetSnap.exists)    throw new Error("Target user is not a member of this clan");

      const requesterRole = requesterSnap.data()!.role as ClanRole;
      const targetRole    = targetSnap.data()!.role as ClanRole;

      if (requesterRole !== "leader" && requesterRole !== "officer") {
        throw new Error("You do not have permission to remove members");
      }
      if (targetRole === "leader") {
        throw new Error("The clan leader cannot be removed");
      }
      // Officers cannot remove other officers
      if (requesterRole === "officer" && targetRole === "officer") {
        throw new Error("Officers cannot remove other officers");
      }

      tx.delete(targetRef);
      tx.update(clanRef, { memberCount: FieldValue.increment(-1) });
      tx.update(targetProfile, {
        clanId:     null,
        clanTag:    null,
        clanSlug:   null,
        clanName:   null,
        clanBorder: null,
      });
    });

    return { success: true };
  } catch (err) {
    const message = friendlyActionError(err, "Failed to remove member");
    console.error("[removeMember]", err);
    return { success: false, error: message };
  }
}

// ── updateClanTag ─────────────────────────────────────────────────────────────
// Only the clan leader may set or change the tag. Propagates the new value to
// every member's /profiles/{uid} doc so profile reads stay join-free.
// The member limit is capped at 100, so a single 500-op batch is always enough.

export async function updateClanTag(
  uid: string,
  clanId: string,
  rawTag: string,
): Promise<ActionResult<{ tag: string }>> {
  // Validate format before touching Firestore
  const validation = validateTag(rawTag);
  if ("error" in validation) {
    return { success: false, error: validation.error };
  }
  const { tag } = validation;

  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");

    // Verify the caller is the leader
    const leaderSnap = await adminDb
      .collection("clans")
      .doc(clanId)
      .collection("members")
      .doc(uid)
      .get();

    if (!leaderSnap.exists) {
      return { success: false, error: "You are not a member of this clan" };
    }
    if ((leaderSnap.data()!.role as ClanRole) !== "leader") {
      return { success: false, error: "Only the clan leader can change the clan tag" };
    }

    // Fetch all current members so we can propagate the tag to their profiles
    const membersSnap = await adminDb
      .collection("clans")
      .doc(clanId)
      .collection("members")
      .get();

    const batch = adminDb.batch();

    // Update the clan doc itself
    batch.update(adminDb.collection("clans").doc(clanId), {
      clanTag:   tag,
      updatedAt: new Date(),
    });

    // Propagate to every member's profile — only clanTag changes; clanId,
    // clanSlug, and clanName are unaffected by a tag rename.
    for (const memberDoc of membersSnap.docs) {
      batch.update(adminDb.collection("profiles").doc(memberDoc.id), {
        clanTag: tag,
      });
    }

    await batch.commit();

    return { success: true, data: { tag } };
  } catch (err) {
    const message = friendlyActionError(err, "Failed to update clan tag");
    console.error("[updateClanTag]", err);
    return { success: false, error: message };
  }
}

// ── disbandClan ───────────────────────────────────────────────────────────────
// Leader-only. Deletes the clan doc, clanSlugs entry, all member sub-docs, and
// clears clan-denorm fields from every member's profile in a single batch.
// Max members is 100, so ops = (100 × 2) + 2 = 202 — within Firestore's 500-op limit.

// Firestore transactions are capped at 500 ops. Each member costs 2
// writes (delete member doc + clear profile's clan fields) and the
// trailing cleanup adds 3 (clan + slug + nameKey). Reserve headroom and
// refuse to disband clans above this size — large-clan unwind would
// need a paginated background job (not built today). Leader-side, this
// matches the documented memberLimit ceiling, so legitimate disbands
// always fit.
const DISBAND_MAX_MEMBERS = 200;

export async function disbandClan(
  uid: string,
  clanId: string,
): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");

    // Wrap the whole unwind in a transaction so a concurrent joinClan
    // can't slip in a new member between our member-list read and the
    // final delete — that race previously left a stranded
    // /profiles/{newUid}.clanId pointing at a deleted clan (audit fix L6).
    //
    // joinClan also reads /clans/{clanId} inside its own tx, so the two
    // transactions serialise: whichever finishes second sees the other's
    // write (or in disband's case, the deleted clan doc) and either
    // retries with up-to-date state or aborts cleanly.
    await adminDb.runTransaction(async tx => {
      const clanRef   = adminDb.collection("clans").doc(clanId);
      const leaderRef = adminDb.collection("clans").doc(clanId).collection("members").doc(uid);

      const [clanSnap, leaderSnap] = await Promise.all([
        tx.get(clanRef),
        tx.get(leaderRef),
      ]);

      if (!leaderSnap.exists) {
        throw new Error("You are not a member of this clan");
      }
      if ((leaderSnap.data()!.role as ClanRole) !== "leader") {
        throw new Error("Only the clan leader can disband the clan");
      }
      if (!clanSnap.exists) {
        throw new Error("Clan not found");
      }

      const clanData = clanSnap.data()!;
      const slug    = clanData.slug as string;
      const nameKey = (clanData.nameKey as string | undefined) ?? null;

      // Read all members inside the tx — locks them against concurrent
      // writes. A racing joinClan would conflict on either /clans/{id}
      // or this collection query and retry / abort.
      const membersSnap = await tx.get(
        adminDb.collection("clans").doc(clanId).collection("members"),
      );

      if (membersSnap.size > DISBAND_MAX_MEMBERS) {
        throw new Error(
          `This clan has ${membersSnap.size} members — too large to disband atomically. ` +
          `Contact support for assistance.`,
        );
      }

      for (const memberDoc of membersSnap.docs) {
        tx.delete(memberDoc.ref);
        tx.update(adminDb.collection("profiles").doc(memberDoc.id), {
          clanId:   null,
          clanTag:  null,
          clanSlug: null,
          clanName: null,
        });
      }

      tx.delete(adminDb.collection("clanSlugs").doc(slug));
      if (nameKey) {
        tx.delete(adminDb.collection("clanNameKeys").doc(nameKey));
      }
      tx.delete(clanRef);
    });

    return { success: true };
  } catch (err) {
    const message = friendlyActionError(err, "Failed to disband clan");
    console.error("[disbandClan]", err);
    return { success: false, error: message };
  }
}

// ── createPost ────────────────────────────────────────────────────────────────
// Verifies the author is an active member (not pending) before writing.

// Author identity hydrated from /profiles/{uid} below — a forged byline
// can't appear on a clan post (audit fix H2).
export async function createPost(
  uid: string,
  clanId: string,
  content: string,
  imageUrl: string | null,
): Promise<ActionResult<{ postId: string }>> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    if (!content.trim()) {
      return { success: false, error: "Post content cannot be empty" };
    }
    if (content.length > 2000) {
      return { success: false, error: "Post content exceeds 2000 characters" };
    }

    const { adminDb } = await import("@/lib/firebase/admin");

    // Verify membership AND fetch profile in parallel.
    const [memberSnap, profileSnap] = await Promise.all([
      adminDb.collection("clans").doc(clanId).collection("members").doc(uid).get(),
      adminDb.collection("profiles").doc(uid).get(),
    ]);

    if (!memberSnap.exists) {
      return { success: false, error: "You must be a clan member to post" };
    }
    const memberRole = memberSnap.data()!.role as ClanRole;
    if (memberRole === "pending") {
      return { success: false, error: "Your membership is pending approval" };
    }
    if (!profileSnap.exists) {
      return { success: false, error: "Profile not found" };
    }
    const prof = profileSnap.data() as { username?: string; avatarUrl?: string };

    const ref = await adminDb.collection("clans").doc(clanId).collection("posts").add({
      authorId:        uid,
      // Server-resolved — byline cannot be spoofed.
      authorUsername:  prof.username ?? "user",
      authorAvatarUrl: prof.avatarUrl ?? null,
      content:         content.trim(),
      imageUrl:        imageUrl ?? null,
      likesCount:      0,
      createdAt:       new Date(),
    });

    // Award clan XP for the post (daily capped, fire-and-forget)
    import("@/lib/actions/clan-xp.actions")
      .then(m => m.awardClanXp(clanId, "post_created", uid))
      .catch(() => {});

    return { success: true, data: { postId: ref.id } };
  } catch (err) {
    const message = friendlyActionError(err, "Failed to create post");
    console.error("[createPost]", err);
    return { success: false, error: message };
  }
}

// ── createClanAnnouncement ───────────────────────────────────────────────────
//
// Leader-only post that:
//   1. Writes the post with isAnnouncement: true (and optional pinnedUntil).
//   2. Fans out an in-app notification to every clan member.
//   3. Rate-limits: max 3 announcements per clan per rolling 24h window —
//      prevents a leader spamming the notification inbox of every member.
//
// We re-use the existing /clans/{clanId}/posts/{postId} collection rather
// than creating a parallel one. The post-feed renderer picks up
// isAnnouncement and styles distinctly.

const ANNOUNCEMENT_DAILY_LIMIT      = 3;
const ANNOUNCEMENT_WINDOW_MS        = 24 * 60 * 60 * 1000;

// Announcements are high-trust (they fan out to every clan member's
// inbox). Author identity is hydrated server-side from /profiles/{uid}
// — a forged "📣 Posted by CEO" byline would otherwise be a phishing
// primitive (audit fix H2).
export async function createClanAnnouncement(
  uid: string,
  clanId: string,
  content: string,
  options: { pinnedUntil?: Date | null; imageUrl?: string | null },
): Promise<ActionResult<{ postId: string; notifiedCount: number }>> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    if (!content.trim()) {
      return { success: false, error: "Announcement content cannot be empty" };
    }
    if (content.length > 2000) {
      return { success: false, error: "Announcement content exceeds 2000 characters" };
    }

    const { adminDb } = await import("@/lib/firebase/admin");

    // Verify leader + load profile in parallel.
    const [memberSnap, profileSnap] = await Promise.all([
      adminDb.collection("clans").doc(clanId).collection("members").doc(uid).get(),
      adminDb.collection("profiles").doc(uid).get(),
    ]);
    if (!memberSnap.exists) {
      return { success: false, error: "You are not a member of this clan" };
    }
    if ((memberSnap.data() as { role?: string }).role !== "leader") {
      return { success: false, error: "Only the clan leader can post announcements" };
    }
    if (!profileSnap.exists) {
      return { success: false, error: "Profile not found" };
    }
    const prof = profileSnap.data() as { username?: string; displayName?: string; avatarUrl?: string };

    // Rate-limit: count announcements in the last 24h.
    const windowStart = new Date(Date.now() - ANNOUNCEMENT_WINDOW_MS);
    const recentSnap = await adminDb
      .collection("clans").doc(clanId).collection("posts")
      .where("isAnnouncement", "==", true)
      .where("createdAt", ">=", windowStart)
      .get();
    if (recentSnap.size >= ANNOUNCEMENT_DAILY_LIMIT) {
      return {
        success: false,
        error: `Clan announcement limit reached (${ANNOUNCEMENT_DAILY_LIMIT} per 24 hours). Try again later.`,
      };
    }

    // Write the post — server-resolved byline only.
    const postRef = await adminDb.collection("clans").doc(clanId).collection("posts").add({
      authorId:        uid,
      authorUsername:  prof.username ?? "leader",
      authorAvatarUrl: prof.avatarUrl ?? null,
      content:         content.trim(),
      imageUrl:        options.imageUrl ?? null,
      likesCount:      0,
      createdAt:       new Date(),
      isAnnouncement:  true,
      ...(options.pinnedUntil && { pinnedUntil: options.pinnedUntil }),
    });

    // Fanout: notify every confirmed member of this clan (excluding the
    // author — they already saw it). We list members in chunks via
    // collectionGroup-free query so this scales linearly with member count
    // (acceptable for clan sizes up to a few hundred; if clans ever exceed
    // 500 members we'd want a queue).
    const membersSnap = await adminDb
      .collection("clans").doc(clanId)
      .collection("members")
      .get();

    const clanSnap = await adminDb.collection("clans").doc(clanId).get();
    const clanName = (clanSnap.data() as { name?: string })?.name ?? "your clan";
    const clanSlug = (clanSnap.data() as { slug?: string })?.slug ?? clanId;

    const { createNotification } = await import("@/lib/server/notifications");

    let notifiedCount = 0;
    await Promise.all(
      membersSnap.docs
        .filter(d => d.id !== uid)
        .filter(d => (d.data() as { role?: string }).role !== "pending")
        .map(async d => {
          try {
            await createNotification(d.id, {
              type:        "clan_announcement",
              title:       `📣 ${prof.displayName ?? prof.username ?? "Your clan leader"} posted an announcement`,
              body:        content.trim().slice(0, 140),
              href:        `/clans/${clanSlug}#post-${postRef.id}`,
              clanId,
              challengeId: null,
            });
            notifiedCount++;
          } catch (err) {
            console.error("[createClanAnnouncement→notif]", d.id, err);
          }
        }),
    );

    // Best-effort: award clan XP for the post the same way createPost does.
    import("@/lib/actions/clan-xp.actions")
      .then(m => m.awardClanXp(clanId, "post_created", uid))
      .catch(() => {});

    // ─ Note name shadowing: this function uses `clanName` for the clan's
    //   public name, distinct from anything else in scope. `notifiedCount`
    //   is returned so the UI can toast "Announcement posted — 12 members
    //   notified".
    void clanName; // silence linter if unused after notif body rewrite

    return { success: true, data: { postId: postRef.id, notifiedCount } };
  } catch (err) {
    const message = friendlyActionError(err, "Failed to post announcement");
    console.error("[createClanAnnouncement]", err);
    return { success: false, error: message };
  }
}

// ── likePost ──────────────────────────────────────────────────────────────────
// setDoc is idempotent — double-liking from different devices won't double-count.

export async function likePost(
  uid: string,
  clanId: string,
  postId: string,
): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");

    const likeRef = adminDb
      .collection("clans")
      .doc(clanId)
      .collection("posts")
      .doc(postId)
      .collection("likes")
      .doc(uid);

    const postRef = adminDb
      .collection("clans")
      .doc(clanId)
      .collection("posts")
      .doc(postId);

    // Use a transaction so a duplicate like won't increment twice
    await adminDb.runTransaction(async tx => {
      const likeSnap = await tx.get(likeRef);
      if (likeSnap.exists) throw new Error("Already liked");

      tx.set(likeRef, { uid, likedAt: new Date() });
      tx.update(postRef, { likesCount: FieldValue.increment(1) });
    });

    return { success: true };
  } catch (err) {
    if (err instanceof Error && err.message === "Already liked") {
      return { success: false, error: "Already liked" };
    }
    const message = friendlyActionError(err, "Failed to like post");
    console.error("[likePost]", err);
    return { success: false, error: message };
  }
}

// ── unlikePost ────────────────────────────────────────────────────────────────

export async function unlikePost(
  uid: string,
  clanId: string,
  postId: string,
): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");

    const likeRef = adminDb
      .collection("clans")
      .doc(clanId)
      .collection("posts")
      .doc(postId)
      .collection("likes")
      .doc(uid);

    const postRef = adminDb
      .collection("clans")
      .doc(clanId)
      .collection("posts")
      .doc(postId);

    await adminDb.runTransaction(async tx => {
      const likeSnap = await tx.get(likeRef);
      if (!likeSnap.exists) throw new Error("Not liked");

      tx.delete(likeRef);
      tx.update(postRef, { likesCount: FieldValue.increment(-1) });
    });

    return { success: true };
  } catch (err) {
    if (err instanceof Error && err.message === "Not liked") {
      return { success: false, error: "Not liked" };
    }
    const message = friendlyActionError(err, "Failed to unlike post");
    console.error("[unlikePost]", err);
    return { success: false, error: message };
  }
}

// ── deletePost ────────────────────────────────────────────────────────────────
// The post's author OR a clan admin may delete it.

export async function deletePost(
  uid: string,
  clanId: string,
  postId: string,
): Promise<ActionResult> {
  try {
    const sessionUid = await getSessionUid();
    if (sessionUid !== uid) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");

    const postRef = adminDb
      .collection("clans")
      .doc(clanId)
      .collection("posts")
      .doc(postId);

    const postSnap = await postRef.get();
    if (!postSnap.exists) {
      return { success: false, error: "Post not found" };
    }

    const isAuthor = (postSnap.data()!.authorId as string) === uid;
    // Moderator-tier role from the verified JWT claim — never the
    // spoofable profiles.isAdmin mirror.
    let isStaff = false;
    if (!isAuthor) {
      const session = await getSessionWithRole();
      isStaff = meetsRole(session.role, "moderator");
    }

    if (!isAuthor && !isStaff) {
      return { success: false, error: "You do not have permission to delete this post" };
    }

    await postRef.delete();

    return { success: true };
  } catch (err) {
    const message = friendlyActionError(err, "Failed to delete post");
    console.error("[deletePost]", err);
    return { success: false, error: message };
  }
}
