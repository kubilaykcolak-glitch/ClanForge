"use client";

import { useState } from "react";
import { Heart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ClanPost as ClanPostType } from "@/types";
import { timeAgo, getInitials } from "@/lib/utils";
import { likePost, unlikePost, deletePost } from "@/lib/clan-actions";
import { awardXp } from "@/lib/actions/xp.actions";

interface ClanPostProps {
  post: ClanPostType;
  clanId: string;
  currentUserId: string | null;
}

export function ClanPost({ post, clanId, currentUserId }: ClanPostProps) {
  const [liked, setLiked]           = useState(false);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [deleting, setDeleting]     = useState(false);

  const handleLike = async () => {
    if (!currentUserId) {
      toast.error("Sign in to like posts");
      return;
    }
    if (!post.id) return;

    const wasLiked = liked;
    // Optimistic update
    setLiked(!wasLiked);
    setLikesCount(c => wasLiked ? c - 1 : c + 1);

    try {
      if (wasLiked) {
        await unlikePost(clanId, post.id, currentUserId);
      } else {
        await likePost(clanId, post.id, currentUserId);

        // Reward the AUTHOR (not the liker) for receiving a like, except
        // when the liker is the author (no self-rewards). Daily-capped to
        // 20 per author; further likes still register on the post — they
        // just don't earn the author more XP that day.
        if (post.authorId && post.authorId !== currentUserId) {
          await awardXp(post.authorId, "post_receive_like", post.id);
        }
      }
    } catch {
      // Revert on error
      setLiked(wasLiked);
      setLikesCount(c => wasLiked ? c + 1 : c - 1);
      toast.error("Failed to update like");
    }
  };

  const handleDelete = async () => {
    if (!post.id) return;
    if (!confirm("Delete this post?")) return;

    setDeleting(true);
    try {
      await deletePost(clanId, post.id);
      toast.success("Post deleted");
    } catch {
      toast.error("Failed to delete post");
      setDeleting(false);
    }
  };

  if (deleting) return null;

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {/* ── Author row ── */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 overflow-hidden"
          style={{ background: "var(--accent)" }}
        >
          {post.authorAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.authorAvatarUrl}
              alt={post.authorUsername}
              className="w-full h-full object-cover"
            />
          ) : (
            getInitials(post.authorUsername)
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {post.authorUsername}
          </span>
          <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>
            {timeAgo(post.createdAt)}
          </span>
        </div>

        {/* Delete — only for post author */}
        {currentUserId === post.authorId && (
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={e => {
              e.currentTarget.style.color = "var(--danger)";
              e.currentTarget.style.background = "rgba(239,68,68,0.08)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.background = "transparent";
            }}
            aria-label="Delete post"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* ── Content ── */}
      <p
        className="text-sm leading-relaxed whitespace-pre-wrap mb-3"
        style={{ color: "var(--text-secondary)" }}
      >
        {post.content}
      </p>

      {/* ── Image ── */}
      {post.imageUrl && (
        <div className="mb-3 rounded-lg overflow-hidden" style={{ maxHeight: 300 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.imageUrl}
            alt="Post image"
            className="w-full object-cover"
            style={{ maxHeight: 300 }}
          />
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center gap-1 pt-1">
        <button
          onClick={handleLike}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors"
          style={{
            color: liked ? "var(--danger)" : "var(--text-muted)",
            background: liked ? "rgba(239,68,68,0.08)" : "transparent",
          }}
          onMouseEnter={e => {
            if (!liked) {
              e.currentTarget.style.color = "var(--danger)";
              e.currentTarget.style.background = "rgba(239,68,68,0.06)";
            }
          }}
          onMouseLeave={e => {
            if (!liked) {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.background = "transparent";
            }
          }}
        >
          <Heart
            size={15}
            fill={liked ? "currentColor" : "none"}
            strokeWidth={2}
          />
          <span>{likesCount}</span>
        </button>
      </div>
    </div>
  );
}
