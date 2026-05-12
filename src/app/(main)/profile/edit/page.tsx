"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  updateDoc as firestoreUpdate,
  deleteDoc,
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import {
  AlertCircle,
  CheckCircle,
  EyeOff,
  Loader2,
  Pencil,
  Trash2,
  Plus,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { auth, db } from "@/lib/firebase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import type { GameRecord } from "@/types";
import ComingSoon from "@/components/ui/ComingSoon";
import Toggle from "@/components/ui/Toggle";
import CustomiseProfilePanel from "@/components/profile/CustomiseProfilePanel";

// ── Constants ─────────────────────────────────────────────────────────────────

const COUNTRIES = [
  "Argentina","Australia","Brazil","Canada","France","Germany",
  "India","Ireland","Japan","Mexico","Netherlands","New Zealand",
  "Norway","Poland","South Africa","South Korea","Spain","Sweden",
  "United Kingdom","United States",
];

const POPULAR_GAMES = [
  "Apex Legends","Call of Duty: Warzone","Counter-Strike 2","Dota 2",
  "EA Sports FC 25","Fortnite","Hearthstone","League of Legends",
  "Minecraft","Overwatch 2","PUBG","Rainbow Six Siege",
  "Rocket League","Rust","Teamfight Tactics","Valorant",
  "Warframe","World of Warcraft","FIFA Online","Chess.com",
];

const PLATFORMS = ["PC","PS5","Xbox","Nintendo Switch","Mobile"] as const;

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
  twitchUrl:   z.string().url("Must be a valid URL").optional().or(z.literal("")).default(""),
});
type ProfileForm = z.infer<typeof profileSchema>;

const gameSchema = z.object({
  gameName:    z.string().min(1,"Required"),
  platform:    z.enum(PLATFORMS),
  wins:        z.coerce.number().min(0).default(0),
  losses:      z.coerce.number().min(0).default(0),
  draws:       z.coerce.number().min(0).default(0),
  peakRank:    z.string().optional().default(""),
  hoursPlayed: z.coerce.number().min(0).default(0),
  notes:       z.string().max(300).optional().default(""),
  isFeatured:  z.boolean().default(false),
});
type GameForm = z.infer<typeof gameSchema>;

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

// ── Game Sheet ────────────────────────────────────────────────────────────────

function GameSheet({
  open,
  onClose,
  uid,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  uid: string;
  editing: (GameRecord & { id: string }) | null;
  onSaved: () => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<GameForm>({ resolver: zodResolver(gameSchema) as Resolver<GameForm> });

  const isFeatured = watch("isFeatured");

  useEffect(() => {
    if (open) {
      reset(editing
        ? {
            gameName:    editing.gameName,
            platform:    editing.platform as typeof PLATFORMS[number],
            wins:        editing.wins,
            losses:      editing.losses,
            draws:       editing.draws,
            peakRank:    editing.peakRank ?? "",
            hoursPlayed: editing.hoursPlayed,
            notes:       editing.notes ?? "",
            isFeatured:  editing.isFeatured,
          }
        : { platform: "PC", wins: 0, losses: 0, draws: 0, hoursPlayed: 0, isFeatured: false });
    }
  }, [open, editing, reset]);

  const onSubmit = async (values: GameForm) => {
    try {
      const colRef = collection(db, "profiles", uid, "gameRecords");
      if (editing) {
        await firestoreUpdate(doc(colRef, editing.id), { ...values });
        toast.success("Game record updated");
      } else {
        await addDoc(colRef, { ...values, userId: uid, createdAt: new Date() });
        toast.success("Game record added");
      }
      onSaved();
      onClose();
    } catch {
      toast.error("Failed to save game record");
    }
  };

  const field = "w-full rounded-lg text-sm outline-none";

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto"
        style={{ background: "var(--bg-surface)", borderLeft: "1px solid var(--border-default)" }}
      >
        <SheetHeader className="mb-6">
          <SheetTitle
            className="font-display font-bold text-xl"
            style={{ color: "var(--text-primary)" }}
          >
            {editing ? "Edit Game Record" : "Add Game Record"}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">

          {/* Game name with datalist */}
          <div>
            <label style={labelCls()}>Game Name</label>
            <input
              {...register("gameName")}
              list="game-suggestions"
              placeholder="e.g. Valorant"
              className={field}
              style={inputCls(!!errors.gameName)}
            />
            <datalist id="game-suggestions">
              {POPULAR_GAMES.map(g => <option key={g} value={g} />)}
            </datalist>
            {errors.gameName && <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>{errors.gameName.message}</p>}
          </div>

          {/* Platform */}
          <div>
            <label style={labelCls()}>Platform</label>
            <select {...register("platform")} className={field} style={inputCls()}>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* W/L/D */}
          <div className="grid grid-cols-3 gap-3">
            {(["wins","losses","draws"] as const).map(k => (
              <div key={k}>
                <label style={labelCls()}>{k.charAt(0).toUpperCase() + k.slice(1)}</label>
                <input
                  {...register(k)}
                  type="number" min={0}
                  className={field}
                  style={inputCls()}
                />
              </div>
            ))}
          </div>

          {/* Peak rank + hours */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelCls()}>Peak Rank</label>
              <input {...register("peakRank")} placeholder="e.g. Diamond" className={field} style={inputCls()} />
            </div>
            <div>
              <label style={labelCls()}>Hours Played</label>
              <input {...register("hoursPlayed")} type="number" min={0} className={field} style={inputCls()} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={labelCls()}>Notes</label>
            <textarea
              {...register("notes")}
              rows={3}
              placeholder="Any extra notes..."
              className={field}
              style={{ ...inputCls(), resize: "vertical" }}
            />
          </div>

          {/* Feature toggle */}
          <Toggle
            checked={isFeatured}
            onChange={v => setValue("isFeatured", v)}
            label="Featured game"
            description="Show this prominently on your profile"
          />

          <SheetFooter className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                color: "var(--text-secondary)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              Save
            </button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProfileEditPage() {
  const [uid, setUid]                       = useState<string | null>(null);
  const [originalUsername, setOriginalUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle"|"checking"|"available"|"taken">("idle");
  const [avatarPreview, setAvatarPreview]   = useState<string | null>(null);
  const [avatarFile, setAvatarFile]         = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [gameRecords, setGameRecords]       = useState<(GameRecord & { id: string })[]>([]);
  const [sheetOpen, setSheetOpen]           = useState(false);
  const [editingRecord, setEditingRecord]   = useState<(GameRecord & { id: string }) | null>(null);
  const [isSaveSlow, setIsSaveSlow]         = useState(false);
  const [profileBannerUrl,    setProfileBannerUrl]    = useState<string | null>(null);
  const [profileBgId,         setProfileBgId]         = useState<string | null>(null);
  const [profileAccentColour, setProfileAccentColour] = useState<string | null>(null);
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
        discordTag:   d.discordTag   ?? "",
        twitchUrl:    d.twitchUrl    ?? "",
      });
      setOriginalUsername(d.username ?? "");
      if (d.avatarUrl) setAvatarPreview(d.avatarUrl);
      setProfileBannerUrl(d.bannerUrl    ?? null);
      setProfileBgId(d.backgroundId      ?? null);
      setProfileAccentColour(d.accentColour ?? null);
      setIsPrivate(d.isPrivate ?? false);
    });
    return () => unsub();
  }, [reset]);

  // ── Load game records ────────────────────────────────────────────────────

  const loadRecords = useCallback(async () => {
    if (!uid) return;
    const snap = await getDocs(
      query(collection(db, "profiles", uid, "gameRecords"), orderBy("isFeatured","desc"))
    );
    setGameRecords(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<GameRecord,"id">) })));
  }, [uid]);

  useEffect(() => { if (uid) loadRecords(); }, [uid, loadRecords]);

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

      const payload: Record<string, unknown> = {
        displayName:  values.displayName,
        username:     values.username,
        bio:          values.bio    ?? "",
        country:      values.country ?? "",
        steamUrl:     values.steamUrl     ?? "",
        xboxGamertag: values.xboxGamertag ?? "",
        psnId:        values.psnId        ?? "",
        discordTag:   values.discordTag   ?? "",
        twitchUrl:    values.twitchUrl    ?? "",
        updatedAt:    new Date(),
      };
      if (avatarUrl) payload.avatarUrl = avatarUrl;

      await updateDoc(doc(db, "profiles", uid), payload);

      toast.success("Profile saved!");
      setOriginalUsername(values.username);
      setValue("username", values.username);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast.error(msg);
    }
  };

  // ── Appearance save ──────────────────────────────────────────────────────

  const handleAppearanceSave = async (data: {
    bannerUrl:    string | null;
    backgroundId: string;
    accentColour: string;
  }) => {
    if (!uid) return;
    try {
      await updateDoc(doc(db, "profiles", uid), {
        bannerUrl:    data.bannerUrl,
        backgroundId: data.backgroundId,
        accentColour: data.accentColour,
        updatedAt:    new Date(),
      });
      setProfileBannerUrl(data.bannerUrl);
      setProfileBgId(data.backgroundId);
      setProfileAccentColour(data.accentColour);
      toast.success("Appearance saved!");
    } catch {
      toast.error("Failed to save appearance");
    }
  };

  // ── Privacy toggle ───────────────────────────────────────────────────────

  const handlePrivacyToggle = async (value: boolean) => {
    if (!uid) return;
    setIsPrivate(value);
    try {
      await updateDoc(doc(db, "profiles", uid), { isPrivate: value, updatedAt: new Date() });
      toast.success(value ? "Profile set to private" : "Profile set to public");
    } catch {
      setIsPrivate(!value); // revert on failure
      toast.error("Failed to update privacy setting");
    }
  };

  // ── Delete game record ───────────────────────────────────────────────────

  const handleDeleteRecord = async (id: string) => {
    if (!uid) return;
    if (!window.confirm("Delete this game record?")) return;
    try {
      await deleteDoc(doc(db, "profiles", uid, "gameRecords", id));
      toast.success("Deleted");
      loadRecords();
    } catch { toast.error("Failed to delete"); }
  };

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

        {/* ── SECTION 4: Game Records ────────────────────────────────────── */}
        <Section
          title="My Games"
          action={
            <button
              type="button"
              onClick={() => { setEditingRecord(null); setSheetOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: "var(--accent)",
                color: "#fff",
              }}
            >
              <Plus size={15} />
              Add Game
            </button>
          }
        >
          {gameRecords.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center rounded-xl py-10 text-center"
              style={{
                background: "var(--bg-elevated)",
                border: "1px dashed var(--border-default)",
              }}
            >
              <span className="text-4xl mb-3 opacity-30">🎮</span>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No games logged yet
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {gameRecords.map(record => (
                <div
                  key={record.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p
                        className="font-display font-semibold truncate"
                        style={{ color: "var(--text-primary)", fontSize: 16 }}
                      >
                        {record.isFeatured && "⭐ "}{record.gameName}
                      </p>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full shrink-0"
                        style={{
                          background: "var(--accent)22",
                          color: "var(--accent)",
                          border: "1px solid var(--accent)44",
                        }}
                      >
                        {record.platform}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {record.wins}W · {record.losses}L · {record.draws}D
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => { setEditingRecord(record); setSheetOpen(true); }}
                      className="p-2 rounded-lg transition-colors"
                      style={{ color: "var(--text-muted)" }}
                      title="Edit"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRecord(record.id)}
                      className="p-2 rounded-lg transition-colors"
                      style={{ color: "var(--danger)" }}
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Phase 2 — stat sync */}
          {/* SNIPPET A: ComingSoon wraps a full-width disabled button */}
          <ComingSoon label="Phase 2" className="block mt-5">
            <button
              type="button"
              disabled
              className="w-full px-4 py-2.5 rounded-lg text-sm font-medium cursor-not-allowed text-left"
              style={{
                background: "var(--bg-elevated)",
                border:     "1px solid var(--border-subtle)",
                color:      "var(--text-muted)",
              }}
            >
              🔗 Sync Stats from Steam / Riot
            </button>
          </ComingSoon>
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
            currentAccentColour={profileAccentColour}
            onSave={handleAppearanceSave}
          />
        </Section>

        {/* Hidden submit — triggered by sticky bar */}
        <button type="submit" id="profile-save-btn" className="hidden" />
      </form>

      {/* ── Game Sheet ───────────────────────────────────────────────────── */}
      <GameSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        uid={uid}
        editing={editingRecord}
        onSaved={loadRecords}
      />

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
