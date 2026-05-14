"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Paperclip, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { createPost } from "@/lib/clan-actions";
import { getInitials } from "@/lib/utils";
import { validateImageFile } from "@/lib/uploads";
import { awardXp } from "@/lib/actions/xp.actions";

interface ComposePostProps {
  clanId:            string;
  authorId:          string;
  authorUsername:    string;
  authorDisplayName: string;
  authorAvatarUrl?:  string;
}

const MAX_CHARS = 500;
// Show "taking longer than expected" after this many ms
const SLOW_THRESHOLD_MS = 8_000;

export function ComposePost({
  clanId,
  authorId,
  authorUsername,
  authorDisplayName,
  authorAvatarUrl,
}: ComposePostProps) {
  const [content, setContent]           = useState("");
  const [imageFile, setImageFile]       = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [posting, setPosting]           = useState(false);
  const [isSlow, setIsSlow]             = useState(false);
  const [postError, setPostError]       = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const remaining = MAX_CHARS - content.length;
  const isBusy    = posting || uploadProgress !== null;
  const canPost   = content.trim().length > 0 && !isBusy && remaining >= 0;

  // Start / clear the slow-operation timer whenever isBusy changes
  useEffect(() => {
    if (isBusy) {
      slowTimerRef.current = setTimeout(() => setIsSlow(true), SLOW_THRESHOLD_MS);
    } else {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setIsSlow(false);
    }
    return () => { if (slowTimerRef.current) clearTimeout(slowTimerRef.current); };
  }, [isBusy]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const v = validateImageFile(file);
    if (!v.ok) {
      toast.error(v.error ?? "Invalid file");
      e.target.value = "";
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    e.target.value = "";
  };

  const clearImage = () => {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setUploadProgress(null);
  };

  // Upload via server-side API route (avoids CORS)
  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return null;

    const filePath = `clan-posts/${clanId}/${Date.now()}.${imageFile.name.split(".").pop() ?? "jpg"}`;
    const formData = new FormData();
    formData.append("file", imageFile);
    formData.append("path", filePath);

    // Simulate progress while waiting for the server
    setUploadProgress(10);
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => (prev !== null && prev < 85 ? prev + 5 : prev));
    }, 400);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      clearInterval(progressInterval);

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Image upload failed");
      }

      setUploadProgress(100);
      const { url } = await res.json() as { url: string };
      setTimeout(() => setUploadProgress(null), 400);
      return url;
    } catch (err) {
      clearInterval(progressInterval);
      setUploadProgress(null);
      throw err;
    }
  };

  const handlePost = async () => {
    if (!canPost) return;
    setPosting(true);
    setPostError(null);

    try {
      const imageUrl = imageFile ? await uploadImage() : null;
      await createPost(clanId, authorId, authorUsername, authorAvatarUrl, content.trim(), imageUrl);
      setContent("");
      clearImage();
      toast.success("Post published!");

      // Daily-capped XP (1/day) for posting — only the first post each
      // 24h actually awards XP; later ones still post but skip XP.
      const xp = await awardXp(authorId, "post_create");
      if (xp.success && xp.data && xp.data.awarded > 0) {
        toast.success(`+${xp.data.awarded} XP — ${xp.data.label}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to post";
      setPostError(msg);
      toast.error(msg);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div
      className="rounded-xl p-4 mb-4"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
      }}
    >
      {/* Author avatar + textarea */}
      <div className="flex gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 overflow-hidden mt-0.5"
          style={{ background: "var(--accent)" }}
        >
          {authorAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={authorAvatarUrl} alt={authorDisplayName} className="w-full h-full object-cover" />
          ) : (
            getInitials(authorDisplayName)
          )}
        </div>

        <textarea
          value={content}
          onChange={e => { setContent(e.target.value); setPostError(null); }}
          placeholder="What's happening with the clan?"
          rows={3}
          maxLength={MAX_CHARS}
          className="flex-1 resize-none rounded-lg px-3 py-2 text-sm outline-none transition-colors"
          style={{
            background: "var(--bg-elevated)",
            border: `1px solid ${postError ? "var(--danger)" : "var(--border-default)"}`,
            color: "var(--text-primary)",
          }}
          onFocus={e => { e.currentTarget.style.borderColor = postError ? "var(--danger)" : "var(--accent)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = postError ? "var(--danger)" : "var(--border-default)"; }}
        />
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div className="mt-3 ml-11 relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagePreview}
            alt="Preview"
            className="rounded-lg object-cover"
            style={{ maxHeight: 160, maxWidth: "100%" }}
          />
          <button
            onClick={clearImage}
            disabled={isBusy}
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-white disabled:opacity-50"
            style={{ background: "var(--danger)" }}
            aria-label="Remove image"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Upload progress bar */}
      {uploadProgress !== null && (
        <div className="mt-2 ml-11">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-overlay)" }}>
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{ width: `${uploadProgress}%`, background: "var(--accent)" }}
            />
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Uploading image… {uploadProgress}%
          </p>
        </div>
      )}

      {/* Slow-operation warning */}
      {isSlow && (
        <div className="mt-2 ml-11 flex items-center gap-1.5">
          <AlertCircle size={12} style={{ color: "var(--warning)", flexShrink: 0 }} />
          <p className="text-xs" style={{ color: "var(--warning)" }}>
            This is taking longer than expected — please keep this tab open.
          </p>
        </div>
      )}

      {/* Inline error */}
      {postError && (
        <div
          className="mt-2 ml-11 flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs"
          style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", color: "var(--danger)" }}
        >
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{postError}</span>
        </div>
      )}

      {/* Footer row */}
      <div className="flex items-center justify-between mt-3 ml-11">
        <div className="flex items-center gap-2">
          {/* Image attach */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={isBusy}
            className="p-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={e => { if (!isBusy) { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.background = "var(--bg-elevated)"; } }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
            title="Attach image"
          >
            <Paperclip size={15} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />

          {/* Char counter */}
          <span
            className="text-xs"
            style={{ color: remaining < 50 ? "var(--warning)" : "var(--text-muted)" }}
          >
            {remaining}
          </span>
        </div>

        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handlePost}
            disabled={!canPost}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--accent)" }}
          >
            {isBusy && <Loader2 size={13} className="animate-spin" />}
            {posting && !uploadProgress ? "Posting…" : uploadProgress !== null ? "Uploading…" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
