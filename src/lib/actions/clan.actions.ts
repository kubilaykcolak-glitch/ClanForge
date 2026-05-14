"use server";

import { FieldValue } from "firebase-admin/firestore";
import type { Clan, ClanRole, Profile } from "@/types";

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

export async function createClan(
  uid: string,
  data: Omit<Clan, "id" | "ownerId" | "memberCount" | "xp" | "createdAt" | "updatedAt">,
  profile: Pick<Profile, "displayName" | "avatarUrl">,
): Promise<ActionResult<{ clanId: string; slug: string }>> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");

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
        displayName: profile.displayName,
        avatarUrl:   profile.avatarUrl ?? null,
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
    const message = err instanceof Error ? err.message : "Failed to create clan";
    console.error("[createClan]", err);
    return { success: false, error: message };
  }
}

// ── joinClan ──────────────────────────────────────────────────────────────────
// Guards: clan must exist, be public, and have room. Uses a transaction so
// the memberCount increment and the guard read are atomic.

export async function joinClan(
  uid: string,
  clanId: string,
  profile: Pick<Profile, "displayName" | "avatarUrl">,
): Promise<ActionResult> {
  try {
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
      if (!clan.isPublic)                                throw new Error("This clan is private");
      if (!clan.isRecruiting)                            throw new Error("This clan is not recruiting");
      if ((clan.memberCount as number) >= (clan.memberLimit as number)) {
        throw new Error("Clan is full");
      }
      if (memberSnap.exists) throw new Error("You are already a member of this clan");

      // ── 10-hour join cooldown (anti-grind) ─────────────────────────────────
      // If the user left a clan recently they can't join another one yet.
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

      tx.set(memberRef, {
        userId:      uid,
        role:        "member",
        joinedAt:    now,
        displayName: profile.displayName,
        avatarUrl:   profile.avatarUrl ?? null,
      });
      tx.update(clanRef, { memberCount: FieldValue.increment(1) });

      // Stamp all four clan-denorm fields — clan doc is already in-flight so
      // clan.slug / clan.name / clan.clanTag are available with no extra read.
      tx.update(profileRef, {
        clanId,
        clanTag:  (clan.clanTag  as string | null) ?? null,
        clanSlug: clan.slug  as string,
        clanName: clan.name  as string,
      });
    });

    // Award clan XP for the new member joining (fire-and-forget)
    import("@/lib/actions/clan-xp.actions")
      .then(m => m.awardClanXp(clanId, "member_join", uid, uid))
      .catch(() => {});

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to join clan";
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
        // Stamp the leave time so joinClan can enforce the cooldown.
        lastClanLeaveAt:  new Date(),
      });
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to leave clan";
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
    const message = err instanceof Error ? err.message : "Failed to update member role";
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
        clanId:   null,
        clanTag:  null,
        clanSlug: null,
        clanName: null,
      });
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to remove member";
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
    const message = err instanceof Error ? err.message : "Failed to update clan tag";
    console.error("[updateClanTag]", err);
    return { success: false, error: message };
  }
}

// ── disbandClan ───────────────────────────────────────────────────────────────
// Leader-only. Deletes the clan doc, clanSlugs entry, all member sub-docs, and
// clears clan-denorm fields from every member's profile in a single batch.
// Max members is 100, so ops = (100 × 2) + 2 = 202 — within Firestore's 500-op limit.

export async function disbandClan(
  uid: string,
  clanId: string,
): Promise<ActionResult> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");

    // Verify caller is the leader
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
      return { success: false, error: "Only the clan leader can disband the clan" };
    }

    // Fetch clan doc for slug + nameKey
    const clanSnap = await adminDb.collection("clans").doc(clanId).get();
    if (!clanSnap.exists) {
      return { success: false, error: "Clan not found" };
    }
    const clanData = clanSnap.data()!;
    const slug    = clanData.slug as string;
    const nameKey = (clanData.nameKey as string | undefined) ?? null;

    // Fetch all members
    const membersSnap = await adminDb
      .collection("clans")
      .doc(clanId)
      .collection("members")
      .get();

    const batch = adminDb.batch();

    // Delete each member doc and clear their profile's clan fields
    for (const memberDoc of membersSnap.docs) {
      batch.delete(
        adminDb.collection("clans").doc(clanId).collection("members").doc(memberDoc.id),
      );
      batch.update(adminDb.collection("profiles").doc(memberDoc.id), {
        clanId:   null,
        clanTag:  null,
        clanSlug: null,
        clanName: null,
      });
    }

    // Delete clanSlugs entry, the name-uniqueness index entry, and the
    // clan doc itself.
    batch.delete(adminDb.collection("clanSlugs").doc(slug));
    if (nameKey) {
      batch.delete(adminDb.collection("clanNameKeys").doc(nameKey));
    }
    batch.delete(adminDb.collection("clans").doc(clanId));

    await batch.commit();

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to disband clan";
    console.error("[disbandClan]", err);
    return { success: false, error: message };
  }
}

// ── createPost ────────────────────────────────────────────────────────────────
// Verifies the author is an active member (not pending) before writing.

export async function createPost(
  uid: string,
  clanId: string,
  content: string,
  imageUrl: string | null,
  profile: Pick<Profile, "username" | "avatarUrl">,
): Promise<ActionResult<{ postId: string }>> {
  try {
    if (!content.trim()) {
      return { success: false, error: "Post content cannot be empty" };
    }
    if (content.length > 2000) {
      return { success: false, error: "Post content exceeds 2000 characters" };
    }

    const { adminDb } = await import("@/lib/firebase/admin");

    // Verify membership
    const memberSnap = await adminDb
      .collection("clans")
      .doc(clanId)
      .collection("members")
      .doc(uid)
      .get();

    if (!memberSnap.exists) {
      return { success: false, error: "You must be a clan member to post" };
    }
    const memberRole = memberSnap.data()!.role as ClanRole;
    if (memberRole === "pending") {
      return { success: false, error: "Your membership is pending approval" };
    }

    const ref = await adminDb.collection("clans").doc(clanId).collection("posts").add({
      authorId:        uid,
      authorUsername:  profile.username,
      authorAvatarUrl: profile.avatarUrl ?? null,
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
    const message = err instanceof Error ? err.message : "Failed to create post";
    console.error("[createPost]", err);
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
    const message = err instanceof Error ? err.message : "Failed to like post";
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
    const message = err instanceof Error ? err.message : "Failed to unlike post";
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
    const { adminDb } = await import("@/lib/firebase/admin");

    const postRef = adminDb
      .collection("clans")
      .doc(clanId)
      .collection("posts")
      .doc(postId);

    const [postSnap, profileSnap] = await Promise.all([
      postRef.get(),
      adminDb.collection("profiles").doc(uid).get(),
    ]);

    if (!postSnap.exists) {
      return { success: false, error: "Post not found" };
    }

    const isAuthor = (postSnap.data()!.authorId as string) === uid;
    const isAdmin  = (profileSnap.data()?.isAdmin as boolean) === true;

    if (!isAuthor && !isAdmin) {
      return { success: false, error: "You do not have permission to delete this post" };
    }

    await postRef.delete();

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete post";
    console.error("[deletePost]", err);
    return { success: false, error: message };
  }
}
