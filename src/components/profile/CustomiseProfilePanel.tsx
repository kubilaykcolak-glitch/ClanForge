"use client";

import { useRef, useState } from "react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { Check, X } from "lucide-react";
import { storage } from "@/lib/firebase/client";
import { ANIMATED_BACKGROUNDS } from "@/lib/profile-backgrounds";

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

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB

// ── Props ─────────────────────────────────────────────────────────────────────

interface CustomiseProfilePanelProps {
  uid:                   string;
  currentBannerUrl:      string | null;
  currentBackgroundId:   string | null;
  currentAccentColour:   string | null;
  onSave: (data: {
    bannerUrl:     string | null;
    backgroundId:  string;
    accentColour:  string;
  }) => void;
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
  currentAccentColour,
  onSave,
}: CustomiseProfilePanelProps) {
  // ── Local state ─────────────────────────────────────────────────────────────
  const [bannerUrl,     setBannerUrl]     = useState<string | null>(currentBannerUrl);
  const [backgroundId,  setBackgroundId]  = useState(currentBackgroundId ?? "none");
  const [accentColour,  setAccentColour]  = useState(currentAccentColour ?? "#6366f1");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError,   setUploadError]   = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Banner upload ────────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_BYTES) {
      setUploadError("File exceeds 3 MB limit");
      return;
    }

    setUploadError(null);
    setUploadProgress(0);

    const storageRef = ref(storage, `banners/${uid}/profile-banner.jpg`);
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type });

    task.on(
      "state_changed",
      snap => {
        setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      () => {
        setUploadError("Upload failed — please try again");
        setUploadProgress(null);
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setBannerUrl(url);
        setUploadProgress(null);
        // Reset input so the same file can be re-selected after removal
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
    );
  };

  const handleRemoveBanner = () => {
    setBannerUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const selectedBg = ANIMATED_BACKGROUNDS.find(b => b.id === backgroundId)
    ?? ANIMATED_BACKGROUNDS[0];

  const isUploading = uploadProgress !== null;

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
        {isUploading && (
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
                width:      `${uploadProgress}%`,
                background: "var(--accent)",
                transition: "width 0.2s ease",
                borderRadius: 2,
              }}
            />
          </div>
        )}

        {uploadError && (
          <p style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>
            {uploadError}
          </p>
        )}

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding:      "7px 14px",
              borderRadius: 7,
              border:       "1px solid var(--border-default)",
              background:   "var(--bg-elevated)",
              color:        isUploading ? "var(--text-muted)" : "var(--text-secondary)",
              fontSize:     13,
              fontWeight:   500,
              cursor:       isUploading ? "not-allowed" : "pointer",
              transition:   "border-color 0.15s ease, color 0.15s ease",
            }}
          >
            {isUploading ? `Uploading… ${uploadProgress}%` : "Upload Banner"}
          </button>

          {bannerUrl && !isUploading && (
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
        </div>
      </div>

      {/* ── Section 2: Background theme ───────────────────────────────────── */}
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
                onClick={() => setBackgroundId(bg.id)}
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
          {/* Mini banner area with background preview */}
          <div
            style={{
              height:   52,
              position: "relative",
              overflow: "hidden",
              ...(() => {
                // Apply the selected background's preview gradient to the mini banner
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
              })(),
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
      <button
        type="button"
        disabled={isUploading}
        onClick={() => onSave({ bannerUrl, backgroundId, accentColour })}
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
    </div>
  );
}
