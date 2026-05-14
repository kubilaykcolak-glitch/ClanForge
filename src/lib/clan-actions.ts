"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";

// ─── Post likes ───────────────────────────────────────────────────────────────

export async function likePost(
  clanId: string,
  postId: string,
  uid: string,
): Promise<void> {
  await setDoc(
    doc(db, "clans", clanId, "posts", postId, "likes", uid),
    { uid, likedAt: new Date() },
  );
  await updateDoc(doc(db, "clans", clanId, "posts", postId), {
    likesCount: increment(1),
  });
}

export async function unlikePost(
  clanId: string,
  postId: string,
  uid: string,
): Promise<void> {
  await deleteDoc(doc(db, "clans", clanId, "posts", postId, "likes", uid));
  await updateDoc(doc(db, "clans", clanId, "posts", postId), {
    likesCount: increment(-1),
  });
}

export async function deletePost(clanId: string, postId: string): Promise<void> {
  await deleteDoc(doc(db, "clans", clanId, "posts", postId));
}

// ─── Membership ───────────────────────────────────────────────────────────────

export async function joinClan(
  clanId: string,
  uid: string,
  displayName: string,
  avatarUrl: string | undefined,
  role: "member" | "pending" = "member",
): Promise<void> {
  // 1. Member doc. The `userId` field exists for collection-group queries
  //    (e.g. "find which clan does this uid belong to").
  await setDoc(doc(db, "clans", clanId, "members", uid), {
    userId:      uid,
    role,
    joinedAt:    new Date(),
    displayName,
    avatarUrl:   avatarUrl ?? null,
  });

  // 2. Bump the clan's memberCount (only for confirmed members, not pending).
  if (role === "member") {
    await updateDoc(doc(db, "clans", clanId), { memberCount: increment(1) });
  }

  // 3. Mirror the four clan-denorm fields on the user's profile so the
  //    profile page renders the clan without an extra read. Pending
  //    requests still get stamped — leaving a clan clears them anyway.
  const { getDoc } = await import("firebase/firestore");
  const clanSnap = await getDoc(doc(db, "clans", clanId));
  if (clanSnap.exists()) {
    const clanData = clanSnap.data() as {
      slug?:    string;
      name?:    string;
      clanTag?: string | null;
    };
    await updateDoc(doc(db, "profiles", uid), {
      clanId,
      clanTag:   clanData.clanTag  ?? null,
      clanSlug:  clanData.slug     ?? null,
      clanName:  clanData.name     ?? null,
      updatedAt: new Date(),
    });
  }
}

export async function leaveClan(clanId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db, "clans", clanId, "members", uid));
  await updateDoc(doc(db, "clans", clanId), { memberCount: increment(-1) });
  // Stamp the leave time on the user's profile so the join cooldown
  // (CLAN_JOIN_COOLDOWN_HOURS in src/lib/xp.ts) can be enforced server-side
  // the next time they try to join another clan. Also clear the denormalised
  // clan fields for parity with the server-side leaveClan action.
  await updateDoc(doc(db, "profiles", uid), {
    clanId:          null,
    clanTag:         null,
    clanSlug:        null,
    clanName:        null,
    lastClanLeaveAt: new Date(),
    updatedAt:       new Date(),
  });
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export async function createPost(
  clanId: string,
  authorId: string,
  authorUsername: string,
  authorAvatarUrl: string | undefined,
  content: string,
  imageUrl: string | null,
): Promise<void> {
  await addDoc(collection(db, "clans", clanId, "posts"), {
    authorId,
    authorUsername,
    authorAvatarUrl: authorAvatarUrl ?? null,
    content,
    imageUrl,
    likesCount: 0,
    createdAt: new Date(),
  });
}
