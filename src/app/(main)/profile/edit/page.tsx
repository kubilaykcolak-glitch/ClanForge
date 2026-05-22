"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import {
  AlertCircle,
  CheckCircle,
  EyeOff,
  Loader2,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { validateImageFile } from "@/lib/uploads";
import { auth, db } from "@/lib/firebase/client";
import Toggle from "@/components/ui/Toggle";
import CustomiseProfilePanel from "@/components/profile/CustomiseProfilePanel";
import { LeagueLinkPanel } from "@/components/profile/LeagueLinkPanel";
import { setProfilePrivacy } from "@/lib/actions/profile.actions";

// ── Constants ─────────────────────────────────────────────────────────────────

const COUNTRIES = [
  "Argentina","Australia","Brazil","Canada","France","Germany",
  "India","Ireland","Japan","Mexico","Netherlands","New Zealand",
  "Norway","Poland","South Africa","South Korea","Spain","Sweden",
  "United Kingdom","United States",
];

// ── Schemas ───────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  displayName: z.string().min(1,"Required").max(40,"Max 40 chars"),
  username:    z.string()
    .min(3,"At least 3 chars")
    .max(20,"Max 20 chars")
    .regex(/^[a-z0-9_]+$/,"Lowercase letters, numbers, underscores only"),
  bio:         z.string().max(200,"Max 200 chars").optional().default(""),
  country:     z.string().optional().default(""),
  steamUrl:    z.string().url("Must be a valid URL").optional().or(z.literal("")).default(""),
  xboxGamertag:z.string().optional().default(""),
  psnId:       z.string().optional().default(""),
  discordTag:  z.string().optional().default(""),
  // Discord user-id snowflake: 17–20 digits, numeric only. Used by the
  // Wanted bounty webhook layer to @-ping the user on personal events.
  // Allow empty string (user hasn't filled it in yet); when non-empty
  // it must match the snowflake format Discord exposes via "Copy User ID".
  discordUserId: z.string()
    .regex(/^\d{17,20}$/, "Must be a 17–20 digit Discord user ID")
    .optional()
    .or(z.literal(""))
    .default(""),
  twitchUrl:   z.string().url("Must be a valid URL").optional().or(z.literal("")).default(""),
});
type ProfileForm = z.infer<typeof profileSchema>;

// ── Input style helper ────────────────────────────────────────────────────────

function inputCls(hasError?: boolean) {
  return {
    background: "var(--bg-elevated)",
    border: `1px solid ${hasError ? "var(--danger)" : "var(--border-default)"}`,
    color: "var(--text-primary)",
    borderRadius: 8,
    padding: "10px 14px",
    width: "100%",
    fontSize: 14,
    outline: "none",
  } as React.CSSProperties;
}

function labelCls(): React.CSSProperties {
  return { color: "var(--text-secondary)", fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProfileEditPage() {
  const router = useRouter();
  const [uid, setUid]                       = useState<string | null>(null);
  const [originalUsername, setOriginalUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle"|"checking"|"available"|"taken">("idle");
  const [avatarPreview, setAvatarPreview]   = useState<string | null>(null);
  const [avatarFile, setAvatarFile]         = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isSaveSlow, setIsSaveSlow]         = useState(false);
  const [profileBannerUrl,    setProfileBannerUrl]    = useState<string | null>(null);
  const [profileBgId,         setProfileBgId]         = useState<string | null>(null);
  const [profileBgImageUrl,   setProfileBgImageUrl]   = useState<string | null>(null);
  const [profileAccentColour, setProfileAccentColour] = useState<string | null>(null);
  // Pending appearance edits — refreshed by CustomiseProfilePanel via its
  // onValuesChange callback. Kept in a ref (not state) so we don't trigger
  // re-renders for every click in the panel; the value is read at save time.
  const pendingAppearanceRef = useRef<{
    bannerUrl:          string | null;
    backgroundId:       string;
    backgroundImageUrl: string | null;
    accentColour:       string;
  } | null>(null);
  const [isPrivate,           setIsPrivate]           = useState(false);
  const fileRef                             = useRef<HTMLInputElement>(null);
  const debounceRef                         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSlowTimerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) as Resolver<ProfileForm> });

  const bio      = watch("bio","");
  const username = watch("username","");

  // Show slow-save warning after 8 s
  useEffect(() => {
    if (isSubmitting) {
      saveSlowTimerRef.current = setTimeout(() => setIsSaveSlow(true), 8_000);
    } else {
      if (saveSlowTimerRef.current) clearTimeout(saveSlowTimerRef.current);
      setIsSaveSlow(false);
    }
    return () => { if (saveSlowTimerRef.current) clearTimeout(saveSlowTimerRef.current); };
  }, [isSubmitting]);

  // ── Load auth + profile ──────────────────────────────────────────────────

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) { window.location.href = "/login"; return; }
      setUid(user.uid);

      const snap = await getDoc(doc(db, "profiles", user.uid));
      if (!snap.exists()) return;
      const d = snap.data();

      reset({
        displayName:  d.displayName  ?? "",
        username:     d.username     ?? "",
        bio:          d.bio          ?? "",
        country:      d.country      ?? "",
        steamUrl:     d.steamUrl     ?? "",
        xboxGamertag: d.xboxGamertag ?? "",
        psnId:        d.psnId        ?? "",
        discordTag:    d.discordTag    ?? "",
        discordUserId: d.discordUserId ?? "",
        twitchUrl:    d.twitchUrl    ?? "",
      });
      setOriginalUsername(d.username ?? "");
      if (d.avatarUrl) setAvatarPreview(d.avatarUrl);
      setProfileBannerUrl(d.bannerUrl         ?? null);
      setProfileBgId(d.backgroundId           ?? null);
      setProfileBgImageUrl(d.backgroundImageUrl ?? null);
      setProfileAccentColour(d.accentColour   ?? null);
      setIsPrivate(d.isPrivate ?? false);
    });
    return () => unsub();
  }, [reset]);

  // Game records (manual entries) are no longer authored from this page —
  // the section now lists linked-account integrations only. The
  // /profiles/{uid}/gameRecords subcollection is preserved for backward
  // compatibility (existing entries still render on the public profile),
  // but no new ones are created from here.

  // ── Username check ───────────────────────────────────────────────────────

  const checkUsername = useCallback(async (value: string) => {
    if (value === originalUsername) { setUsernameStatus("idle"); return; }
    if (!value || value.length < 3 || !/^[a-z0-9_]+$/.test(value)) { setUsernameStatus("idle"); return; }
    setUsernameStatus("checking");
    try {
      const res  = await fetch(`/api/username-check?username=${encodeURIComponent(value)}`);
      const data = await res.json() as { available: boolean };
      setUsernameStatus(data.available ? "available" : "taken");
    } catch { setUsernameStatus("idle"); }
  }, [originalUsername]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => checkUsername(username), 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [username, checkUsername]);

  // ── Avatar ───────────────────────────────────────────────────────────────

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const v = validateImageFile(file);
    if (!v.ok) {
      toast.error(v.error ?? "Invalid file");
      e.target.value = "";
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  // Upload via server-side proxy to avoid CORS
  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile || !uid) return null;
    setUploadProgress(10);

    // Animate progress while waiting for the server
    const interval = setInterval(() => {
      setUploadProgress(prev => (prev !== null && prev < 85 ? prev + 5 : prev));
    }, 400);

    try {
      const formData = new FormData();
      formData.append("file", avatarFile, "avatar.jpg");
      formData.append("path", `avatars/${uid}/avatar.jpg`);
      const res = await fetch("/api/upload", { method: "POST", body: formData });

      clearInterval(interval);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Avatar upload failed");
      }
      setUploadProgress(100);
      const { url } = await res.json() as { url: string };
      setTimeout(() => setUploadProgress(null), 600);
      return url;
    } catch (err) {
      clearInterval(interval);
      setUploadProgress(null);
      throw err;
    }
  };

  // ── Save profile ─────────────────────────────────────────────────────────

  const onSave = async (values: ProfileForm) => {
    if (!uid) return;
    if (usernameStatus === "taken") { toast.error("Username is already taken"); return; }

    try {
      let avatarUrl: string | null = null;
      if (avatarFile) avatarUrl = await uploadAvatar();

      // Username changes have to go through the server action so the
      // /usernames/{name} reservation is updated atomically with the
      // profile field — the client SDK can no longer write that doc
      // directly (audit fix L2). Non-username fields still update via the
      // client SDK, gated by the Firestore profile-update field allowlist.
      if (values.username !== originalUsername) {
        const { claimUsername } = await import("@/lib/actions/username.actions");
        const claim = await claimUsername(values.username);
        if (!claim.success) {
          toast.error(claim.error ?? "Couldn't update username");
          return;
        }
      }

      const payload: Record<string, unknown> = {
        displayName:  values.displayName,
        bio:          values.bio    ?? "",
        country:      values.country ?? "",
        steamUrl:     values.steamUrl     ?? "",
        xboxGamertag: values.xboxGamertag ?? "",
        psnId:        values.psnId        ?? "",
        discordTag:    values.discordTag    ?? "",
        // Empty-string means "user cleared the field" — store null so the
        // bounty webhook layer treats absence consistently with never-set.
        discordUserId: values.discordUserId?.trim() ? values.discordUserId.trim() : null,
        twitchUrl:     values.twitchUrl     ?? "",
        updatedAt:    new Date(),
      };
      if (avatarUrl) payload.avatarUrl = avatarUrl;

      // Roll the latest appearance edits into the same write so the unified
      // "Save Changes" button persists everything atomically. The ref is set
      // by CustomiseProfilePanel via onValuesChange on every internal edit.
      const appearance = pendingAppearanceRef.current;
      if (appearance) {
        payload.bannerUrl          = appearance.bannerUrl;
        payload.backgroundId       = appearance.backgroundId;
        payload.backgroundImageUrl = appearance.backgroundImageUrl;
        payload.accentColour       = appearance.accentColour;
      }

      await updateDoc(doc(db, "profiles", uid), payload);

      toast.success("Profile saved!");
      setOriginalUsername(values.username);
      setValue("username", values.username);

      // Invalidate the server-rendered cache for any page that reads the
      // profile (the public /profile/[username] view, in particular).
      // Without this, the next navigation can serve a cached response and
      // the user sees stale data right after a successful save — which
      // looks like "my Steam URL didn't save".
      router.refresh();

      // Mirror saved appearance back into the page state so subsequent
      // re-renders / mini-previews reflect the persisted truth.
      if (appearance) {
        setProfileBannerUrl(appearance.bannerUrl);
        setProfileBgId(appearance.backgroundId);
        setProfileBgImageUrl(appearance.backgroundImageUrl);
        setProfileAccentColour(appearance.accentColour);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast.error(msg);
    }
  };

  // ── Appearance save ──────────────────────────────────────────────────────
  // Appearance is no longer a separate save flow — it's batched into the main
  // onSave above via pendingAppearanceRef. The panel emits its values up via
  // onValuesChange (see render), we stash them in the ref, and the unified
  // "Save Changes" button persists everything atomically.

  // ── Privacy toggle ───────────────────────────────────────────────────────

  const handlePrivacyToggle = async (value: boolean) => {
    if (!uid) return;
    setIsPrivate(value); // optimistic
    const result = await setProfilePrivacy(uid, value);
    if (!result.success) {
      setIsPrivate(!value); // revert
      toast.error(result.error ?? "Failed to update privacy setting");
    } else {
      toast.success(value ? "Profile set to private" : "Profile set to public");
    }
  };

  // (Delete game record handler removed — manual entries no longer
  // editable here; see comment near loadRecords removal.)

  // ── Initials fallback ─────────────────────────────────────────────────────

  const displayName = watch("displayName","");
  const initials    = displayName.trim().split(/\s+/).slice(0,2).map(w => w[0]?.toUpperCase() ?? "").join("");

  if (!uid) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--text-muted)" }} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-32">
      <h1
        className="font-display font-bold text-3xl mb-8"
        style={{ color: "var(--text-primary)" }}
      >
        Edit Profile
      </h1>

      <form onSubmit={handleSubmit(onSave)} className="flex flex-col gap-8">

        {/* ── SECTION 1: Avatar ─────────────────────────────────────────── */}
        <Section title="Avatar">
          <div className="flex items-center gap-6">
            <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden text-white font-bold font-display text-2xl"
                style={{ background: "var(--accent)", border: "3px solid var(--border-default)" }}
              >
                {avatarPreview
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                  : initials || "?"}
              </div>
              <div
                className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "rgba(0,0,0,0.5)" }}
              >
                <Camera size={20} className="text-white" />
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-secondary)",
                }}
              >
                Choose image
              </button>
              <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                JPG, PNG or WebP · max 5 MB
              </p>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          {/* Upload progress bar */}
          {uploadProgress !== null && (
            <div className="mt-3">
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: "var(--bg-overlay)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%`, background: "var(--accent)" }}
                />
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                Uploading… {uploadProgress}%
              </p>
            </div>
          )}
        </Section>

        {/* ── SECTION 2: Basic Info ──────────────────────────────────────── */}
        <Section title="Basic Info">
          <div className="flex flex-col gap-5">

            {/* Display name */}
            <div>
              <label style={labelCls()}>Display Name</label>
              <input
                {...register("displayName")}
                type="text"
                placeholder="Your name"
                style={inputCls(!!errors.displayName)}
              />
              {errors.displayName && <Err>{errors.displayName.message}</Err>}
            </div>

            {/* Username */}
            <div>
              <label style={labelCls()}>Username</label>
              <div className="relative">
                <input
                  {...register("username")}
                  type="text"
                  placeholder="coolplayer_99"
                  style={{
                    ...inputCls(errors.username || usernameStatus === "taken" ? true : false),
                    paddingRight: 36,
                    ...(usernameStatus === "available" && !errors.username
                      ? { borderColor: "var(--success)" } : {}),
                  }}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameStatus === "checking"  && <Loader2      size={15} className="animate-spin" style={{ color: "var(--text-muted)" }} />}
                  {usernameStatus === "available" && <CheckCircle  size={15} style={{ color: "var(--success)" }} />}
                </span>
              </div>
              {(errors.username || usernameStatus === "taken") && (
                <Err>{errors.username?.message ?? "Username is already taken"}</Err>
              )}
              {usernameStatus === "available" && !errors.username && (
                <p className="mt-1 text-xs" style={{ color: "var(--success)" }}>Username is available</p>
              )}
            </div>

            {/* Bio */}
            <div>
              <div className="flex justify-between mb-1.5">
                <label style={{ ...labelCls(), marginBottom: 0 }}>Bio</label>
                <span className="text-xs" style={{ color: (bio?.length ?? 0) > 180 ? "var(--warning)" : "var(--text-muted)" }}>
                  {bio?.length ?? 0}/200
                </span>
              </div>
              <textarea
                {...register("bio")}
                rows={3}
                maxLength={200}
                placeholder="Tell other players about yourself..."
                style={{ ...inputCls(!!errors.bio), resize: "vertical" }}
              />
              {errors.bio && <Err>{errors.bio.message}</Err>}
            </div>

            {/* Country */}
            <div>
              <label style={labelCls()}>Country</label>
              <select {...register("country")} style={inputCls()}>
                <option value="">— Select country —</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </Section>

        {/* ── SECTION 3: Platform Links ──────────────────────────────────── */}
        <Section title="Platform Links">
          <div className="flex flex-col gap-5">
            {[
              { key: "steamUrl",      label: "🎮 Steam Profile URL",  placeholder: "https://steamcommunity.com/id/..." },
              { key: "xboxGamertag",  label: "🎯 Xbox Gamertag",       placeholder: "YourGamertag" },
              { key: "psnId",         label: "🕹️ PSN ID",              placeholder: "YourPSNID" },
              { key: "discordTag",    label: "💬 Discord Tag",          placeholder: "username#1234" },
              // 17–20 digit Discord snowflake. Optional — without it the
              // user just won't get @-pinged on bounty events; everything
              // else still works. Hint copy walks them through Discord →
              // Settings → Advanced → Developer Mode → right-click profile.
              { key: "discordUserId", label: "🆔 Discord User ID",      placeholder: "e.g. 241834892101947392" },
              { key: "twitchUrl",     label: "📺 Twitch URL",           placeholder: "https://twitch.tv/..." },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label style={labelCls()}>{label}</label>
                <input
                  {...register(key as keyof ProfileForm)}
                  type="text"
                  placeholder={placeholder}
                  style={inputCls(!!(errors as Record<string, unknown>)[key])}
                />
                {(errors as Record<string, { message?: string }>)[key] && (
                  <Err>{(errors as Record<string, { message?: string }>)[key]?.message}</Err>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* ── SECTION 4: My Games ─────────────────────────────────────────
            Read-only shell driven entirely by linked-account integrations.
            The hand-entered "Add Game" list was removed — it was confusing
            (two ways to add a game, no live stats, no platform check). Real
            game data now flows from the panels below, and each linked
            account renders its own card on the public profile automatically.
            New game integrations slot in here as they ship. */}
        <Section title="My Games">
          <div className="flex flex-col gap-3">
            <LeagueLinkPanel uid={uid} />

            {/* Coming-soon shell — visual signal that more game integrations
                will land in this same place. Add a new card per integration
                as they ship (Valorant, TFT, Halo, etc.). */}
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{
                background: "var(--bg-elevated)",
                border:     "1px dashed var(--border-default)",
                color:      "var(--text-muted)",
              }}
            >
              <span className="text-xl opacity-60">🎮</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  More games coming soon
                </p>
                <p className="text-xs mt-0.5">
                  Link any supported game here and it shows up on your public profile automatically with live stats.
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* ── SECTION 5: Privacy ───────────────────────────────────────── */}
        <Section title="Privacy">
          <Toggle
            checked={isPrivate}
            onChange={handlePrivacyToggle}
            label="Private profile"
            description="Hide your stats, games, and clan info from other players"
          />

          {isPrivate && (
            <div
              className="flex items-start gap-3 mt-4 rounded-xl px-4 py-3"
              style={{
                background: "rgba(245,158,11,0.08)",
                border:     "1px solid rgba(245,158,11,0.25)",
              }}
            >
              <EyeOff
                size={16}
                style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }}
              />
              <p style={{ fontSize: 13, color: "#f59e0b", lineHeight: 1.5 }}>
                Your profile is private. You won&apos;t appear in player search and visitors
                can only see your username and clan tag.
              </p>
            </div>
          )}
        </Section>

        {/* ── SECTION 6: Appearance ─────────────────────────────────────── */}
        <Section title="Appearance">
          <CustomiseProfilePanel
            uid={uid}
            currentBannerUrl={profileBannerUrl}
            currentBackgroundId={profileBgId}
            currentBackgroundImageUrl={profileBgImageUrl}
            currentAccentColour={profileAccentColour}
            hideSaveButton
            onValuesChange={(v) => {
              pendingAppearanceRef.current = v;
            }}
          />
        </Section>

        {/* Hidden submit — triggered by sticky bar */}
        <button type="submit" id="profile-save-btn" className="hidden" />
      </form>

      {/* GameSheet (manual game-record add/edit) no longer mounted — the
          "My Games" section is integration-driven now. Component definition
          is still in this file but unused; kept as scaffolding for future
          features like adding an unsupported game manually. */}

      {/* ── Sticky save bar ──────────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 md:left-60 right-0 z-40 px-6 py-4 flex flex-col items-end gap-2"
        style={{
          background: "var(--bg-surface)",
          borderTop: "1px solid var(--border-subtle)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Upload progress */}
        {uploadProgress !== null && (
          <div className="w-full sm:w-64 flex flex-col gap-1">
            <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--bg-overlay)" }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%`, background: "var(--accent)" }}
              />
            </div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Uploading avatar… {uploadProgress}%
            </p>
          </div>
        )}

        {/* Slow warning */}
        {isSaveSlow && (
          <div className="flex items-center gap-1.5">
            <AlertCircle size={13} style={{ color: "var(--warning)", flexShrink: 0 }} />
            <p className="text-xs" style={{ color: "var(--warning)" }}>
              This is taking longer than expected — please keep this tab open.
            </p>
          </div>
        )}

        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => document.getElementById("profile-save-btn")?.click()}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: "var(--accent)" }}
        >
          {isSubmitting && <Loader2 size={16} className="animate-spin" />}
          {isSubmitting
            ? uploadProgress !== null
              ? `Uploading… ${uploadProgress}%`
              : "Saving…"
            : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

// ── Small layout helpers ──────────────────────────────────────────────────────

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-6"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
      }}
    >
      <div className="flex items-center justify-between mb-5">
        <h2
          className="font-display font-semibold text-xl"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Err({ children }: { children?: React.ReactNode }) {
  return (
    <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>
      {children}
    </p>
  );
}
