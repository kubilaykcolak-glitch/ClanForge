"use server";

import { FieldValue } from "firebase-admin/firestore";
import type { Clan, ClanRole, Profile } from "@/types";

// ── Response shape ────────────────────────────────────────────────────────────

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

// ── createClan ────────────────────────────────────────────────────────────────
// Atomic write: /clans/{id} + /clanSlugs/{slug} + /clans/{id}/members/{uid}.
// Also stamps clanId onto the creator's profile.

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
        role:       "leader",
        joinedAt:   now,
        displayName: profile.displayName,
        avatarUrl:  profile.avatarUrl ?? null,
      },
    );

    // Stamp clanId on the creator's profile
    batch.update(adminDb.collection("profiles").doc(uid), { clanId });

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

      const [clanSnap, memberSnap] = await Promise.all([
        tx.get(clanRef),
        tx.get(memberRef),
      ]);

      if (!clanSnap.exists) throw new Error("Clan not found");

      const clan = clanSnap.data()!;
      if (!clan.isPublic)                                throw new Error("This clan is private");
      if (!clan.isRecruiting)                            throw new Error("This clan is not recruiting");
      if ((clan.memberCount as number) >= (clan.memberLimit as number)) {
        throw new Error("Clan is full");
      }
      if (memberSnap.exists) throw new Error("You are already a member of this clan");

      const now = new Date();

      tx.set(memberRef, {
        role:        "member",
        joinedAt:    now,
        displayName: profile.displayName,
        avatarUrl:   profile.avatarUrl ?? null,
      });
      tx.update(clanRef,    { memberCount: FieldValue.increment(1) });
      tx.update(profileRef, { clanId });
    });

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

      const role = (memberSnap.data()!.role as string);
      if (role === "leader") {
        throw new Error("Leaders cannot leave — transfer ownership or disband the clan first");
      }

      tx.delete(memberRef);
      tx.update(clanRef,    { memberCount: FieldValue.increment(-1) });
      tx.update(profileRef, { clanId: FieldValue.delete() });
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
// Decrements memberCount and clears clanId from the target's profile.

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
      tx.update(clanRef,       { memberCount: FieldValue.increment(-1) });
      tx.update(targetProfile, { clanId: FieldValue.delete() });
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to remove member";
    console.error("[removeMember]", err);
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

    const isAuthor  = (postSnap.data()!.authorId as string) === uid;
    const isAdmin   = (profileSnap.data()?.isAdmin as boolean) === true;

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
