"use client";

import { useEffect, useRef, useState } from "react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { Check, X } from "lucide-react";
import { storage } from "@/lib/firebase/client";
import { ANIMATED_BACKGROUNDS } from "@/lib/profile-backgrounds";
import { validateImageFile, MAX_UPLOAD_LABEL } from "@/lib/uploads";

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCENT_COLOURS = [
  { hex: "#6366f1", label: "Indigo" },
  { hex: "#8b5cf6", label: "Violet" },
  { hex: "#ec4899", label: "Pink"   },
  { hex: "#14b8a6", label: "Teal"   },
  { hex: "#22c55e", label: "Green"  },
  { hex: "#f59e0b", label: "Amber"  },
  { hex: "#ef4444", label: "Red"    },
  { hex: "#3b82f6", label: "Blue"   },
] as const;

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AppearanceValues {
  bannerUrl:          string | null;
  backgroundId:       string;
  backgroundImageUrl: string | null;
  accentColour:       string;
}

interface CustomiseProfilePanelProps {
  uid:                       string;
  currentBannerUrl:          string | null;
  currentBackgroundId:       string | null;
  currentBackgroundImageUrl: string | null;
  currentAccentColour:       string | null;
  /** Legacy: invoked by the local "Save Appearance" button. Optional now —
   *  when the panel is embedded inside a parent form (e.g. /profile/edit)
   *  the parent's main "Save Changes" button is the canonical save flow and
   *  this can be omitted. */
  onSave?: (data: AppearanceValues) => void;
  /** Fires on every internal change so a parent form can keep its own copy
   *  of the appearance state in sync without polling. Use together with
   *  `hideSaveButton` to fully integrate into a parent save flow. */
  onValuesChange?: (data: AppearanceValues) => void;
  /** When true, the panel's own "Save Appearance" button is not rendered —
   *  saving is the parent's responsibility. */
  hideSaveButton?: boolean;
}

// ── Section heading ────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily:    "'Rajdhani', sans-serif",
        fontWeight:    700,
        fontSize:      13,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color:         "var(--text-muted)",
        marginBottom:  10,
      }}
    >
      {children}
    </p>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CustomiseProfilePanel({
  uid,
  currentBannerUrl,
  currentBackgroundId,
  currentBackgroundImageUrl,
  currentAccentColour,
  onSave,
  onValuesChange,
  hideSaveButton = false,
}: CustomiseProfilePanelProps) {
  // ── Local state ─────────────────────────────────────────────────────────────
  // Internal state mirrors the controlled values from props. We re-sync via a
  // useEffect below whenever the parent supplies new values (e.g. when the
  // Firestore profile finishes loading async — without this, useState's
  // first-run-only init left the form showing defaults forever).
  const [bannerUrl,          setBannerUrl]          = useState<string | null>(currentBannerUrl);
  const [backgroundId,       setBackgroundId]       = useState(currentBackgroundId ?? "none");
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(currentBackgroundImageUrl);
  const [accentColour,       setAccentColour]       = useState(currentAccentColour ?? "#6366f1");

  // Re-sync from props if they change after mount. Guarded equality checks so
  // we don't trample in-progress local edits — only adopt the prop value when
  // it differs from our last-known seed.
  const seededRef = useRef({
    bannerUrl:          currentBannerUrl,
    backgroundId:       currentBackgroundId,
    backgroundImageUrl: currentBackgroundImageUrl,
    accentColour:       currentAccentColour,
  });
  useEffect(() => {
    if (seededRef.current.bannerUrl !== currentBannerUrl) {
      setBannerUrl(currentBannerUrl);
      seededRef.current.bannerUrl = currentBannerUrl;
    }
    if (seededRef.current.backgroundId !== currentBackgroundId) {
      setBackgroundId(currentBackgroundId ?? "none");
      seededRef.current.backgroundId = currentBackgroundId;
    }
    if (seededRef.current.backgroundImageUrl !== currentBackgroundImageUrl) {
      setBackgroundImageUrl(currentBackgroundImageUrl);
      seededRef.current.backgroundImageUrl = currentBackgroundImageUrl;
    }
    if (seededRef.current.accentColour !== currentAccentColour) {
      setAccentColour(currentAccentColour ?? "#6366f1");
      seededRef.current.accentColour = currentAccentColour;
    }
  }, [currentBannerUrl, currentBackgroundId, currentBackgroundImageUrl, currentAccentColour]);

  // Fire onValuesChange whenever any of the four controlled values shift so
  // a parent form can capture the latest snapshot without an imperative poke.
  useEffect(() => {
    onValuesChange?.({ bannerUrl, backgroundId, backgroundImageUrl, accentColour });
    // We intentionally exclude onValuesChange from deps — callers commonly
    // pass an inline arrow function, which would otherwise re-fire on every
    // render and create an infinite loop. The four primitive values are the
    // canonical change signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bannerUrl, backgroundId, backgroundImageUrl, accentColour]);

  // Independent upload state per slot so banner and bg image don't share UI
  const [bannerProgress,  setBannerProgress]  = useState<number | null>(null);
  const [bannerError,     setBannerError]     = useState<string | null>(null);
  const [bgImageProgress, setBgImageProgress] = useState<number | null>(null);
  const [bgImageError,    setBgImageError]    = useState<string | null>(null);

  const bannerInputRef  = useRef<HTMLInputElement>(null);
  const bgImageInputRef = useRef<HTMLInputElement>(null);

  // ── Banner upload ────────────────────────────────────────────────────────────

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const v = validateImageFile(file);
    if (!v.ok) {
      setBannerError(v.error ?? "Invalid file");
      if (bannerInputRef.current) bannerInputRef.current.value = "";
      return;
    }

    setBannerError(null);
    setBannerProgress(0);

    const storageRef = ref(storage, `banners/${uid}/profile-banner.jpg`);
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type });

    task.on(
      "state_changed",
      snap => {
        setBannerProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      () => {
        setBannerError("Upload failed — please try again");
        setBannerProgress(null);
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setBannerUrl(url);
        setBannerProgress(null);
        if (bannerInputRef.current) bannerInputRef.current.value = "";
      },
    );
  };

  const handleRemoveBanner = () => {
    setBannerUrl(null);
    if (bannerInputRef.current) bannerInputRef.current.value = "";
  };

  // ── Background image upload ─────────────────────────────────────────────────

  const handleBgImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const v = validateImageFile(file);
    if (!v.ok) {
      setBgImageError(v.error ?? "Invalid file");
      if (bgImageInputRef.current) bgImageInputRef.current.value = "";
      return;
    }

    setBgImageError(null);
    setBgImageProgress(0);

    const storageRef = ref(storage, `profile-backgrounds/${uid}/profile-background.jpg`);
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type });

    task.on(
      "state_changed",
      snap => {
        setBgImageProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      () => {
        setBgImageError("Upload failed — please try again");
        setBgImageProgress(null);
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setBackgroundImageUrl(url);
        // A custom image takes precedence over the animated theme — clear the
        // theme selection so the UI accurately reflects what will render.
        setBackgroundId("none");
        setBgImageProgress(null);
        if (bgImageInputRef.current) bgImageInputRef.current.value = "";
      },
    );
  };

  const handleRemoveBgImage = () => {
    setBackgroundImageUrl(null);
    if (bgImageInputRef.current) bgImageInputRef.current.value = "";
  };

  // Picking an animated theme drops any custom image so render priority stays
  // intuitive: whatever the user clicked last is what they get.
  const handlePickBackground = (id: string) => {
    setBackgroundId(id);
    if (id !== "none") setBackgroundImageUrl(null);
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const selectedBg = ANIMATED_BACKGROUNDS.find(b => b.id === backgroundId)
    ?? ANIMATED_BACKGROUNDS[0];

  const isBannerUploading  = bannerProgress  !== null;
  const isBgImageUploading = bgImageProgress !== null;
  const isUploading        = isBannerUploading || isBgImageUploading;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        gap:           28,
      }}
    >

      {/* ── Section 1: Banner ─────────────────────────────────────────────── */}
      <div>
        <SectionHeading>Banner image</SectionHeading>

        {/* Preview */}
        <div
          style={{
            width:        "100%",
            height:       80,
            borderRadius: 10,
            overflow:     "hidden",
            marginBottom: 10,
            background:   bannerUrl
              ? `url(${bannerUrl}) center/cover no-repeat`
              : "linear-gradient(135deg, #1e1b4b 0%, #0a0a0f 100%)",
            border:       "1px solid var(--border-default)",
            position:     "relative",
          }}
        >
          {!bannerUrl && (
            <span
              style={{
                position:  "absolute",
                inset:     0,
                display:   "flex",
                alignItems:"center",
                justifyContent: "center",
                fontSize:  12,
                color:     "var(--text-muted)",
                letterSpacing: "0.04em",
              }}
            >
              No banner set
            </span>
          )}
        </div>

        {/* Progress bar */}
        {isBannerUploading && (
          <div
            style={{
              height:       4,
              borderRadius: 2,
              background:   "var(--bg-elevated)",
              marginBottom: 8,
              overflow:     "hidden",
            }}
          >
            <div
              style={{
                height:     "100%",
                width:      `${bannerProgress}%`,
                background: "var(--accent)",
                transition: "width 0.2s ease",
                borderRadius: 2,
              }}
            />
          </div>
        )}

        {bannerError && (
          <p style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>
            {bannerError}
          </p>
        )}

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleBannerChange}
          />
          <button
            type="button"
            disabled={isBannerUploading}
            onClick={() => bannerInputRef.current?.click()}
            style={{
              padding:      "7px 14px",
              borderRadius: 7,
              border:       "1px solid var(--border-default)",
              background:   "var(--bg-elevated)",
              color:        isBannerUploading ? "var(--text-muted)" : "var(--text-secondary)",
              fontSize:     13,
              fontWeight:   500,
              cursor:       isBannerUploading ? "not-allowed" : "pointer",
              transition:   "border-color 0.15s ease, color 0.15s ease",
            }}
          >
            {isBannerUploading ? `Uploading… ${bannerProgress}%` : "Upload Banner"}
          </button>

          {bannerUrl && !isBannerUploading && (
            <button
              type="button"
              onClick={handleRemoveBanner}
              style={{
                display:    "inline-flex",
                alignItems: "center",
                gap:        4,
                background: "transparent",
                border:     "none",
                cursor:     "pointer",
                fontSize:   13,
                color:      "var(--text-muted)",
                padding:    0,
              }}
            >
              <X size={13} />
              Remove
            </button>
          )}

          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>
            {MAX_UPLOAD_LABEL}
          </span>
        </div>
      </div>

      {/* ── Section 2: Custom background image ───────────────────────────── */}
      <div>
        <SectionHeading>Background image</SectionHeading>

        {/* Preview */}
        <div
          style={{
            width:        "100%",
            height:       110,
            borderRadius: 10,
            overflow:     "hidden",
            marginBottom: 10,
            background:   backgroundImageUrl
              ? `url(${backgroundImageUrl}) center/cover no-repeat`
              : "linear-gradient(135deg, #1e1b4b 0%, #0a0a0f 100%)",
            border:       "1px solid var(--border-default)",
            position:     "relative",
          }}
        >
          {!backgroundImageUrl && (
            <span
              style={{
                position:       "absolute",
                inset:          0,
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                fontSize:       12,
                color:          "var(--text-muted)",
                letterSpacing:  "0.04em",
              }}
            >
              No custom background — uses theme below
            </span>
          )}
        </div>

        {/* Progress bar */}
        {isBgImageUploading && (
          <div
            style={{
              height:       4,
              borderRadius: 2,
              background:   "var(--bg-elevated)",
              marginBottom: 8,
              overflow:     "hidden",
            }}
          >
            <div
              style={{
                height:       "100%",
                width:        `${bgImageProgress}%`,
                background:   "var(--accent)",
                transition:   "width 0.2s ease",
                borderRadius: 2,
              }}
            />
          </div>
        )}

        {bgImageError && (
          <p style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>
            {bgImageError}
          </p>
        )}

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            ref={bgImageInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleBgImageChange}
          />
          <button
            type="button"
            disabled={isBgImageUploading}
            onClick={() => bgImageInputRef.current?.click()}
            style={{
              padding:      "7px 14px",
              borderRadius: 7,
              border:       "1px solid var(--border-default)",
              background:   "var(--bg-elevated)",
              color:        isBgImageUploading ? "var(--text-muted)" : "var(--text-secondary)",
              fontSize:     13,
              fontWeight:   500,
              cursor:       isBgImageUploading ? "not-allowed" : "pointer",
              transition:   "border-color 0.15s ease, color 0.15s ease",
            }}
          >
            {isBgImageUploading ? `Uploading… ${bgImageProgress}%` : "Upload Background"}
          </button>

          {backgroundImageUrl && !isBgImageUploading && (
            <button
              type="button"
              onClick={handleRemoveBgImage}
              style={{
                display:    "inline-flex",
                alignItems: "center",
                gap:        4,
                background: "transparent",
                border:     "none",
                cursor:     "pointer",
                fontSize:   13,
                color:      "var(--text-muted)",
                padding:    0,
              }}
            >
              <X size={13} />
              Remove
            </button>
          )}

          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>
            {MAX_UPLOAD_LABEL}
          </span>
        </div>

        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
          A custom image overrides the animated theme. A subtle dark overlay is applied
          automatically so usernames and stats stay readable.
        </p>
      </div>

      {/* ── Section 3: Background theme ───────────────────────────────────── */}
      <div>
        <SectionHeading>Background theme</SectionHeading>

        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap:                 8,
          }}
        >
          {ANIMATED_BACKGROUNDS.map(bg => {
            const selected = bg.id === backgroundId;
            // Parse the multi-statement previewStyle into individual CSS props
            const styleString = bg.previewStyle;
            const inlineStyle: React.CSSProperties = {};
            styleString.split(";").forEach(decl => {
              const colon = decl.indexOf(":");
              if (colon === -1) return;
              const prop  = decl.slice(0, colon).trim();
              const value = decl.slice(colon + 1).trim();
              if (!prop || !value) return;
              // Convert kebab-case to camelCase for React inline styles
              const camel = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()) as keyof React.CSSProperties;
              (inlineStyle as Record<string, string>)[camel] = value;
            });

            return (
              <button
                key={bg.id}
                type="button"
                onClick={() => handlePickBackground(bg.id)}
                style={{
                  display:       "flex",
                  flexDirection: "column",
                  alignItems:    "center",
                  gap:           5,
                  background:    "transparent",
                  border:        "none",
                  cursor:        "pointer",
                  padding:       0,
                }}
                title={bg.description}
              >
                {/* Thumbnail */}
                <div
                  style={{
                    width:        "100%",
                    aspectRatio:  "10 / 7",
                    borderRadius: 7,
                    border:       selected
                      ? "2px solid #6366f1"
                      : "2px solid transparent",
                    outline:      selected ? "none" : "1px solid var(--border-default)",
                    outlineOffset: -1,
                    position:     "relative",
                    overflow:     "hidden",
                    ...inlineStyle,
                  }}
                >
                  {selected && (
                    <span
                      style={{
                        position:   "absolute",
                        top:        4,
                        right:      4,
                        width:      16,
                        height:     16,
                        borderRadius: "50%",
                        background: "#6366f1",
                        display:    "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Check size={10} color="#fff" strokeWidth={3} />
                    </span>
                  )}
                </div>

                {/* Name */}
                <span
                  style={{
                    fontSize:   11,
                    fontWeight: selected ? 600 : 400,
                    color:      selected ? "var(--text-primary)" : "var(--text-muted)",
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {bg.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Section 3: Accent colour ──────────────────────────────────────── */}
      <div>
        <SectionHeading>Accent colour</SectionHeading>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {ACCENT_COLOURS.map(({ hex, label }) => {
            const selected = hex === accentColour;
            return (
              <button
                key={hex}
                type="button"
                onClick={() => setAccentColour(hex)}
                title={label}
                style={{
                  width:        32,
                  height:       32,
                  borderRadius: "50%",
                  background:   hex,
                  border:       selected ? `2px solid #fff` : "2px solid transparent",
                  boxShadow:    selected ? `0 0 0 1px ${hex}` : "none",
                  cursor:       "pointer",
                  display:      "flex",
                  alignItems:   "center",
                  justifyContent: "center",
                  flexShrink:   0,
                  transition:   "box-shadow 0.15s ease, border-color 0.15s ease",
                  padding:      0,
                }}
              >
                {selected && <Check size={14} color="#fff" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Section 4: Live mini preview ──────────────────────────────────── */}
      <div>
        <SectionHeading>Preview</SectionHeading>

        <div
          style={{
            width:    240,
            borderRadius: 12,
            overflow: "hidden",
            border:   "1px solid var(--border-default)",
            background: "#0a0a0f",
          }}
        >
          {/* Mini banner area with background preview.
              Custom image takes precedence over the animated theme preview. */}
          <div
            style={{
              height:   52,
              position: "relative",
              overflow: "hidden",
              ...(backgroundImageUrl
                ? {
                    backgroundImage:    `url(${backgroundImageUrl})`,
                    backgroundSize:     "cover",
                    backgroundPosition: "center",
                  }
                : (() => {
                    const s = selectedBg.previewStyle;
                    const result: React.CSSProperties = {};
                    s.split(";").forEach(decl => {
                      const colon = decl.indexOf(":");
                      if (colon === -1) return;
                      const prop  = decl.slice(0, colon).trim();
                      const value = decl.slice(colon + 1).trim();
                      if (!prop || !value) return;
                      const camel = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()) as keyof React.CSSProperties;
                      (result as Record<string, string>)[camel] = value;
                    });
                    return result;
                  })()),
            }}
          >
            {/* If there's a real banner, overlay it */}
            {bannerUrl && (
              <div
                style={{
                  position:   "absolute",
                  inset:      0,
                  background: `url(${bannerUrl}) center/cover no-repeat`,
                  opacity:    0.7,
                }}
              />
            )}
          </div>

          {/* Avatar + info */}
          <div style={{ padding: "0 12px 12px", position: "relative" }}>
            {/* Avatar overlapping banner */}
            <div
              style={{
                width:        40,
                height:       40,
                borderRadius: "50%",
                background:   accentColour,
                border:       `2px solid #0a0a0f`,
                boxShadow:    `0 0 0 2px ${accentColour}`,
                marginTop:    -20,
                marginBottom: 6,
                display:      "flex",
                alignItems:   "center",
                justifyContent: "center",
                fontFamily:   "'Rajdhani', sans-serif",
                fontWeight:   700,
                fontSize:     16,
                color:        "#fff",
              }}
            >
              S
            </div>

            {/* Username + tag */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              <span
                style={{
                  fontFamily:  "'Rajdhani', sans-serif",
                  fontWeight:  700,
                  fontSize:    14,
                  color:       "var(--text-primary)",
                  lineHeight:  1.1,
                }}
              >
                ShadowHunter
              </span>
              <span
                style={{
                  fontSize:      10,
                  fontWeight:    700,
                  letterSpacing: "0.06em",
                  fontFamily:    "'Rajdhani', sans-serif",
                  padding:       "1px 6px",
                  borderRadius:  999,
                  background:    `${accentColour}26`,
                  color:         accentColour,
                  border:        `1px solid ${accentColour}4d`,
                  lineHeight:    1.6,
                  whiteSpace:    "nowrap",
                }}
              >
                #TAG
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Save button ───────────────────────────────────────────────────── */}
      {/* Hidden when embedded in a parent form (see hideSaveButton prop) so
          the parent's unified "Save Changes" is the only save affordance. */}
      {!hideSaveButton && onSave && (
      <button
        type="button"
        disabled={isUploading}
        onClick={() => onSave({ bannerUrl, backgroundId, backgroundImageUrl, accentColour })}
        style={{
          width:        "100%",
          padding:      "11px 0",
          borderRadius: 9,
          border:       "none",
          background:   isUploading ? "var(--bg-overlay)" : "var(--accent)",
          color:        isUploading ? "var(--text-muted)" : "#fff",
          fontSize:     14,
          fontWeight:   600,
          fontFamily:   "'Rajdhani', sans-serif",
          letterSpacing:"0.04em",
          cursor:       isUploading ? "not-allowed" : "pointer",
          transition:   "background 0.15s ease",
          boxShadow:    isUploading ? "none" : "0 0 20px rgba(99,102,241,0.25)",
        }}
        onMouseEnter={e => {
          if (!isUploading) (e.currentTarget as HTMLElement).style.background = "var(--accent-hover)";
        }}
        onMouseLeave={e => {
          if (!isUploading) (e.currentTarget as HTMLElement).style.background = "var(--accent)";
        }}
      >
        Save Appearance
      </button>
      )}
    </div>
  );
}
