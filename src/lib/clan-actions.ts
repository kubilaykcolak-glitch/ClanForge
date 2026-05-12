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
  await setDoc(doc(db, "clans", clanId, "members", uid), {
    role,
    joinedAt: new Date(),
    displayName,
    avatarUrl: avatarUrl ?? null,
  });
  if (role === "member") {
    await updateDoc(doc(db, "clans", clanId), { memberCount: increment(1) });
  }
}

export async function leaveClan(clanId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db, "clans", clanId, "members", uid));
  await updateDoc(doc(db, "clans", clanId), { memberCount: increment(-1) });
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
