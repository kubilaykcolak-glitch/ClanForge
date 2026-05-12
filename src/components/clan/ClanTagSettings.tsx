"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/lib/firebase/hooks";
import { updateClanTag } from "@/lib/actions/clan.actions";

// ── Props ─────────────────────────────────────────────────────────────────────

interface ClanTagSettingsProps {
  clanId:     string;
  currentTag: string | null;
  isLeader:   boolean;
}

// ── Tag pill — exactly as it renders on member profiles ───────────────────────

function TagPill({ tag }: { tag: string }) {
  return (
    <span
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        fontSize:      12,
        fontWeight:    700,
        letterSpacing: "0.06em",
        padding:       "2px 8px",
        borderRadius:  999,
        background:    "rgba(139,92,246,0.15)",
        color:         "#8b5cf6",
        border:        "1px solid rgba(139,92,246,0.3)",
      }}
    >
      #{tag}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ClanTagSettings({
  clanId,
  currentTag,
  isLeader,
}: ClanTagSettingsProps) {
  const { user } = useCurrentUser();

  // `saved` = the last committed tag (what's actually in Firestore)
  const [saved,    setSaved]   = useState<string | null>(currentTag);
  // `tag`   = what's currently in the text input
  const [tag,      setTag]     = useState(currentTag ?? "");
  const [editing,  setEditing] = useState(!currentTag);   // open by default if no tag yet
  const [saving,   setSaving]  = useState(false);
  const [error,    setError]   = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Keep local state in sync if the parent re-renders with an updated prop
  useEffect(() => {
    setSaved(currentTag);
    setTag(currentTag ?? "");
    setEditing(!currentTag);
  }, [currentTag]);

  if (!isLeader) return null;

  // ── Input handlers ──────────────────────────────────────────────────────────

  const LETTER_RE = /^[A-Za-z]$/;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow: Backspace, Delete, Tab, Escape, ArrowLeft, ArrowRight, Home, End
    const control = ["Backspace","Delete","Tab","Escape","ArrowLeft","ArrowRight","Home","End"];
    if (control.includes(e.key)) return;

    // Block anything that isn't a plain letter (no numbers, no symbols, no space)
    if (!LETTER_RE.test(e.key)) {
      e.preventDefault();
      setError("Only letters A–Z are allowed");
      return;
    }

    // Enforce 4-char limit via keydown so the cursor doesn't jump
    if (tag.length >= 4) {
      e.preventDefault();
      return;
    }

    setError(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip any non-letter characters that could slip through (paste, autofill, etc.)
    const cleaned = e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4);
    setTag(cleaned);
    if (cleaned !== e.target.value.toUpperCase()) {
      setError("Only letters A–Z are allowed");
    } else {
      setError(null);
    }
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!user || !tag || tag === saved) return;

    setSaving(true);
    setError(null);

    const result = await updateClanTag(user.uid, clanId, tag);

    setSaving(false);

    if (!result.success) {
      setError(result.error ?? "Something went wrong");
      toast.error(result.error ?? "Failed to update clan tag");
      return;
    }

    const newTag = result.data!.tag;
    setSaved(newTag);
    setTag(newTag);
    setEditing(false);
    toast.success(`Clan tag updated to #${newTag}`);
  };

  const handleChange_ = () => {
    setEditing(true);
    setTag(saved ?? "");
    setError(null);
    // Defer focus so the input is visible in the DOM first
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // Preview string — shows the live input or placeholders
  const previewTag = tag || "????";
  const canSave    = !saving && tag.length > 0 && tag !== saved;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-default)",
        borderRadius: 16,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* ── Heading ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2
          style={{
            fontFamily:    "'Rajdhani', sans-serif",
            fontWeight:    700,
            fontSize:      20,
            letterSpacing: "0.02em",
            color:         "var(--text-primary)",
            margin:        0,
          }}
        >
          Clan Tag
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
          A 4-letter code displayed on all member profiles as{" "}
          <span style={{ color: "var(--text-secondary)" }}>#TAG</span> —{" "}
          e.g.{" "}
          <span style={{ color: "var(--text-secondary)" }}>ShadowHunter</span>
          <span
            style={{
              display:       "inline-flex",
              alignItems:    "center",
              fontSize:      11,
              fontWeight:    700,
              letterSpacing: "0.06em",
              padding:       "1px 6px",
              borderRadius:  999,
              background:    "rgba(139,92,246,0.15)",
              color:         "#8b5cf6",
              border:        "1px solid rgba(139,92,246,0.3)",
              marginLeft:    4,
              verticalAlign: "middle",
            }}
          >
            #WOLF
          </span>
        </p>
      </div>

      {/* ── Already-set display (collapsed state) ── */}
      {saved && !editing && (
        <div
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          10,
            padding:      "10px 14px",
            borderRadius: 8,
            background:   "var(--bg-elevated)",
            border:       "1px solid var(--border-default)",
          }}
        >
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Current tag</span>
          <TagPill tag={saved} />
          <button
            type="button"
            onClick={handleChange_}
            style={{
              marginLeft:  "auto",
              fontSize:    12,
              fontWeight:  600,
              color:       "var(--accent)",
              background:  "transparent",
              border:      "none",
              cursor:      "pointer",
              padding:     "2px 0",
              letterSpacing: "0.01em",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#818cf8"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
          >
            Change
          </button>
        </div>
      )}

      {/* ── Input row (shown when editing or no tag yet) ── */}
      {(editing || !saved) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {/* # prefix box */}
            <div
              style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                width:          40,
                borderRadius:   8,
                background:     "var(--bg-overlay)",
                border:         "1px solid var(--border-default)",
                color:          "#8b5cf6",
                fontSize:       16,
                fontWeight:     700,
                fontFamily:     "'Rajdhani', sans-serif",
                letterSpacing:  "0.02em",
                flexShrink:     0,
                userSelect:     "none",
              }}
              aria-hidden="true"
            >
              #
            </div>

            {/* Tag input */}
            <input
              ref={inputRef}
              type="text"
              value={tag}
              maxLength={4}
              placeholder="WOLF"
              onKeyDown={handleKeyDown}
              onChange={handleChange}
              onFocus={() => setError(null)}
              style={{
                flex:          1,
                background:    "var(--bg-elevated)",
                border:        `1px solid ${error ? "var(--danger)" : "var(--border-default)"}`,
                borderRadius:  8,
                padding:       "10px 14px",
                fontSize:      18,
                fontWeight:    700,
                fontFamily:    "'Rajdhani', sans-serif",
                letterSpacing: "0.1em",
                color:         "var(--text-primary)",
                outline:       "none",
                textTransform: "uppercase",
                transition:    "border-color 0.15s ease",
              }}
              onMouseEnter={e => {
                if (!error) (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
              }}
              onMouseLeave={e => {
                if (!error) (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)";
              }}
              aria-label="Clan tag"
              aria-describedby={error ? "clan-tag-error" : undefined}
            />

            {/* Save button */}
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              style={{
                display:        "flex",
                alignItems:     "center",
                gap:            6,
                padding:        "10px 18px",
                borderRadius:   8,
                background:     canSave ? "var(--accent)" : "var(--bg-overlay)",
                color:          canSave ? "#fff" : "var(--text-muted)",
                border:         "none",
                fontSize:       14,
                fontWeight:     600,
                cursor:         canSave ? "pointer" : "not-allowed",
                transition:     "background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease",
                boxShadow:      canSave ? "0 0 16px rgba(99,102,241,0.25)" : "none",
                flexShrink:     0,
                whiteSpace:     "nowrap",
              }}
              onMouseEnter={e => {
                if (canSave) (e.currentTarget as HTMLElement).style.background = "var(--accent-hover)";
              }}
              onMouseLeave={e => {
                if (canSave) (e.currentTarget as HTMLElement).style.background = "var(--accent)";
              }}
            >
              {saving && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
              Save
            </button>
          </div>

          {/* Validation error */}
          {error && (
            <p
              id="clan-tag-error"
              role="alert"
              style={{
                fontSize:   12,
                color:      "var(--danger)",
                margin:     0,
                lineHeight: 1.4,
              }}
            >
              {error}
            </p>
          )}
        </div>
      )}

      {/* ── Live preview ── */}
      <div
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          12,
          padding:      "12px 16px",
          borderRadius: 10,
          background:   "var(--bg-base)",
          border:       "1px solid var(--border-subtle)",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0, letterSpacing: "0.04em", fontWeight: 600, textTransform: "uppercase" }}>
          Preview
        </span>

        {/* Username + tag — exactly as it appears on the profile page */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize:   14,
              fontWeight: 500,
              color:      "var(--text-secondary)",
            }}
          >
            ShadowHunter
          </span>
          <TagPill tag={previewTag} />
        </div>
      </div>
    </div>
  );
}
