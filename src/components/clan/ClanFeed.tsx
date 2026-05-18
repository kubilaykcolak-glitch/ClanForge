"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { useClanPosts } from "@/lib/firebase/hooks";
import { ClanPost } from "./ClanPost";
import { ComposePost } from "./ComposePost";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";

const POSTS_PAGE_SIZE = 15;

interface ClanFeedProps {
  clanId:            string;
  currentUserId:     string | null;
  isMember:          boolean;
  /** Pass true when the current user is the clan leader. Unlocks the
   * "Announce" toggle in the compose box. */
  isLeader?:         boolean;
  // Author info — only provided when isMember is true
  authorId?:         string;
  authorUsername?:   string;
  authorDisplayName?: string;
  authorAvatarUrl?:  string;
}

const SLOW_THRESHOLD_MS = 8_000;

export function ClanFeed({
  clanId,
  currentUserId,
  isMember,
  isLeader,
  authorId,
  authorUsername,
  authorDisplayName,
  authorAvatarUrl,
}: ClanFeedProps) {
  const [pageLimit, setPageLimit] = useState(POSTS_PAGE_SIZE);
  const { posts, loading, error, hasMore } = useClanPosts(clanId, pageLimit);
  const [isSlow, setIsSlow] = useState(false);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show slow warning if the feed is still loading after SLOW_THRESHOLD_MS
  useEffect(() => {
    if (loading) {
      slowTimerRef.current = setTimeout(() => setIsSlow(true), SLOW_THRESHOLD_MS);
    } else {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setIsSlow(false);
    }
    return () => { if (slowTimerRef.current) clearTimeout(slowTimerRef.current); };
  }, [loading]);

  return (
    <div>
      {/* Compose box — only for members */}
      {isMember && authorId && authorUsername && authorDisplayName && (
        <ComposePost
          clanId={clanId}
          authorId={authorId}
          authorUsername={authorUsername}
          authorDisplayName={authorDisplayName}
          authorAvatarUrl={authorAvatarUrl}
          isLeader={isLeader}
        />
      )}

      {/* ── Feed states ── */}

      {/* Error */}
      {error && (
        <div
          className="flex flex-col items-center justify-center rounded-xl py-10 text-center gap-3"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid rgba(239,68,68,0.25)",
          }}
        >
          <AlertCircle size={28} style={{ color: "var(--danger)", opacity: 0.7 }} />
          <div>
            <p className="text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
              Couldn&apos;t load the feed
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {error.message.includes("permission")
                ? "You don't have permission to view this feed."
                : "A network error occurred. Check your connection and try again."}
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
            }}
          >
            <RefreshCw size={12} />
            Reload page
          </button>
        </div>
      )}

      {/* Loading */}
      {!error && loading && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 size={22} className="animate-spin" style={{ color: "var(--text-muted)" }} />
          {isSlow && (
            <div className="flex items-center gap-1.5">
              <AlertCircle size={13} style={{ color: "var(--warning)", flexShrink: 0 }} />
              <p className="text-xs" style={{ color: "var(--warning)" }}>
                Feed is taking a while to load…
              </p>
            </div>
          )}
        </div>
      )}

      {/* Posts */}
      {!error && !loading && posts.length > 0 && (
        <>
          <div className="flex flex-col gap-3">
            {posts.map(post => (
              <ClanPost
                key={post.id}
                post={post}
                clanId={clanId}
                currentUserId={currentUserId}
              />
            ))}
          </div>

          <LoadMoreButton
            onClick={() => setPageLimit(l => l + POSTS_PAGE_SIZE)}
            loading={false /* re-renders inline as the listener expands */}
            exhausted={!hasMore}
            exhaustedLabel="You've seen everything in this clan's feed"
          />
        </>
      )}

      {/* Empty */}
      {!error && !loading && posts.length === 0 && (
        <div
          className="flex flex-col items-center justify-center rounded-xl py-14 text-center"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <span className="text-4xl mb-3 opacity-30">📣</span>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {isMember
              ? "No posts yet — be the first to post!"
              : "No posts yet. Join the clan to post."}
          </p>
        </div>
      )}
    </div>
  );
}
