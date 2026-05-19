"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  collection,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { AlertCircle, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { auth, db } from "@/lib/firebase/client";
import { validateImageFile } from "@/lib/uploads";
import { awardXp } from "@/lib/actions/xp.actions";

// ── Constants ─────────────────────────────────────────────────────────────────

const GAMES = [
  "Valorant", "Rocket League", "Fortnite", "EA FC 25", "Call of Duty: Warzone",
  "Apex Legends", "League of Legends", "CS2", "Overwatch 2", "Halo Infinite",
  "Minecraft", "GTA Online", "FIFA", "Dota 2", "Rainbow Six Siege",
  "Destiny 2", "World of Warcraft", "Final Fantasy XIV", "Elden Ring", "Cyberpunk 2077",
  "Street Fighter 6", "Tekken 8", "Pokémon", "Diablo IV", "Starfield",
  "Hogwarts Legacy", "NBA 2K25", "Madden NFL", "MLB The Show", "NHL 25",
];

const MAX_GAMES = 5;

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex gap-1.5 mb-10">
      {[1, 2, 3].map(n => (
        <div
          key={n}
          className="h-1 flex-1 rounded-full transition-all duration-500"
          style={{
            background: n <= step ? "var(--accent)" : "var(--bg-overlay)",
          }}
        />
      ))}
    </div>
  );
}

// ── Step label ────────────────────────────────────────────────────────────────

function StepLabel({
  step,
  label,
  subtitle,
}: {
  step:     number;
  label:    string;
  subtitle: string;
}) {
  return (
    <div className="mb-8">
      <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--accent)" }}>
        Step {step} of 3
      </p>
      <h1
        className="font-display font-bold text-4xl mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        {label}
      </h1>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {subtitle}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Pick your games
// ─────────────────────────────────────────────────────────────────────────────

function Step1({
  uid,
  onNext,
}: {
  uid:    string;
  onNext: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving,   setSaving]   = useState(false);

  const toggle = (game: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(game)) {
        next.delete(game);
      } else if (next.size < MAX_GAMES) {
        next.add(game);
      } else {
        toast.info(`Select up to ${MAX_GAMES} games`);
      }
      return next;
    });
  };

  const handleNext = async () => {
    setSaving(true);
    try {
      if (selected.size > 0) {
        const batch = writeBatch(db);
        selected.forEach(gameName => {
          const ref = doc(collection(db, "profiles", uid, "gameRecords"));
          batch.set(ref, {
            userId:      uid,
            gameName,
            platform:    "PC",
            wins:        0,
            losses:      0,
            draws:       0,
            hoursPlayed: 0,
            isFeatured:  true,
            createdAt:   new Date(),
          });
        });
        await batch.commit();
      }
      onNext();
    } catch {
      toast.error("Failed to save games — you can add them from your profile later.");
      onNext(); // allow skipping past error
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <StepLabel
        step={1}
        label="What games do you play?"
        subtitle={`Pick up to ${MAX_GAMES} and we'll set up your profile.`}
      />

      {/* Selection count */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {selected.size} / {MAX_GAMES} selected
        </span>
        {selected.size > 0 && (
          <button
            type="button"
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
            onClick={() => setSelected(new Set())}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Game grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-8">
        {GAMES.map(game => {
          const isSelected = selected.has(game);
          const isDisabled = !isSelected && selected.size >= MAX_GAMES;
          return (
            <button
              key={game}
              type="button"
              onClick={() => toggle(game)}
              disabled={isDisabled}
              className="px-3 py-2.5 rounded-xl text-sm font-medium text-left leading-tight transition-all"
              style={{
                background: isSelected
                  ? "rgba(99,102,241,0.15)"
                  : "var(--bg-elevated)",
                border: `1px solid ${isSelected ? "var(--accent)" : "var(--border-default)"}`,
                color: isSelected
                  ? "var(--accent)"
                  : isDisabled
                  ? "var(--text-muted)"
                  : "var(--text-secondary)",
                opacity: isDisabled ? 0.5 : 1,
                boxShadow: isSelected ? "0 0 10px var(--accent-glow)" : "none",
              }}
            >
              {game}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          You can add more games from your profile later
        </span>
        <button
          type="button"
          onClick={handleNext}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
          style={{
            background:  "var(--accent)",
            boxShadow:   "0 0 20px var(--accent-glow)",
          }}
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {selected.size > 0 ? `Add ${selected.size} game${selected.size > 1 ? "s" : ""} →` : "Skip →"}
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Complete your profile
// ─────────────────────────────────────────────────────────────────────────────

function Step2({
  uid,
  initialDisplayName,
  onNext,
  onBack,
}: {
  uid:                string;
  initialDisplayName: string;
  onNext:             () => void;
  onBack:             () => void;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [avatarFile,  setAvatarFile]  = useState<File | null>(null);
  const [preview,     setPreview]     = useState<string | null>(null);
  const [isDragging,  setIsDragging]  = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [isSlow,      setIsSlow]      = useState(false);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const v = validateImageFile(file);
    if (!v.ok) {
      toast.error(v.error ?? "Invalid file");
      return;
    }
    setAvatarFile(file);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleFile(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Upload via server-side proxy to avoid CORS
  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile) return null;
    setUploading(true);
    setProgress(10);
    setIsSlow(false);
    slowTimerRef.current = setTimeout(() => setIsSlow(true), 8_000);

    // Animate progress while waiting
    const interval = setInterval(() => {
      setProgress(prev => prev < 85 ? prev + 5 : prev);
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
      setProgress(100);
      const { url } = await res.json() as { url: string };
      return url;
    } finally {
      clearInterval(interval);
      clearTimeout(slowTimerRef.current!);
      setUploading(false);
      setProgress(0);
      setIsSlow(false);
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      toast.error("Display name is required");
      return;
    }
    try {
      const avatarUrl = await uploadAvatar();
      const updates: Record<string, unknown> = {
        displayName: displayName.trim(),
        updatedAt:   new Date(),
      };
      if (avatarUrl) updates.avatarUrl = avatarUrl;
      await updateDoc(doc(db, "profiles", uid), updates);
      onNext();
    } catch {
      toast.error("Failed to save profile — try again.");
    }
  };

  return (
    <>
      <StepLabel
        step={2}
        label="Complete Your Profile"
        subtitle="Add a display name and avatar so your team can find you."
      />

      {/* Avatar dropzone */}
      <div className="flex flex-col items-center mb-8">
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileRef.current?.click()}
          className="w-28 h-28 rounded-full flex items-center justify-center cursor-pointer transition-all overflow-hidden mb-3"
          style={{
            background: preview ? "transparent" : "var(--bg-elevated)",
            border: `2px dashed ${isDragging ? "var(--accent)" : "var(--border-default)"}`,
            boxShadow: isDragging ? "0 0 20px var(--accent-glow)" : "none",
          }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Avatar preview" className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-1 p-3 text-center">
              <Upload size={22} style={{ color: "var(--text-muted)" }} />
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                Drop or click
              </span>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          JPG or PNG. Max 5MB.
        </p>

        {/* Upload progress */}
        {uploading && (
          <div className="mt-3 w-48 flex flex-col items-center gap-1">
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "var(--bg-overlay)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progress}%`, background: "var(--accent)" }}
              />
            </div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Uploading… {progress}%
            </p>
            {isSlow && (
              <div className="flex items-center gap-1">
                <AlertCircle size={11} style={{ color: "var(--warning)" }} />
                <p className="text-xs" style={{ color: "var(--warning)" }}>
                  Taking longer than expected…
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Display name */}
      <div className="mb-8">
        <label
          className="block text-sm font-medium mb-1.5"
          style={{ color: "var(--text-secondary)" }}
        >
          Display Name
        </label>
        <input
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          maxLength={40}
          placeholder="Your gamer tag"
          className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors"
          style={{
            background: "var(--bg-elevated)",
            border:     "1px solid var(--border-default)",
            color:      "var(--text-primary)",
          }}
          onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "var(--border-default)"; }}
        />
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          ← Back
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onNext}
            className="text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={uploading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{
              background: "var(--accent)",
              boxShadow:  "0 0 20px var(--accent-glow)",
            }}
          >
            {uploading && <Loader2 size={14} className="animate-spin" />}
            Save & Continue →
          </button>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Find your clan
// ─────────────────────────────────────────────────────────────────────────────

function Step3({ onBack }: { onBack: () => void }) {
  const router = useRouter();

  const cards = [
    {
      emoji:  "🛡️",
      title:  "Join a Clan",
      desc:   "Browse recruiting clans and find your squad. Jump into a community and start competing.",
      action: "Browse Clans",
      href:   "/clans",
      style:  { background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.3)" },
      btnStyle: { background: "var(--accent)" },
    },
    {
      emoji:  "⚡",
      title:  "Start Your Own",
      desc:   "Create a clan from scratch. Set your own rules, recruit players, and build your legacy.",
      action: "Create Clan",
      href:   "/clans/create",
      style:  { background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.3)" },
      btnStyle: { background: "var(--violet)" },
    },
  ];

  return (
    <>
      <StepLabel
        step={3}
        label="Find Your Clan"
        subtitle="Every great player has a squad. Find yours or build it from scratch."
      />

      {/* Two clan CTA cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-10">
        {cards.map(card => (
          <div
            key={card.title}
            className="flex flex-col rounded-2xl p-6"
            style={card.style}
          >
            <span className="text-4xl mb-4">{card.emoji}</span>
            <h3
              className="font-display font-bold text-xl mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              {card.title}
            </h3>
            <p
              className="text-sm leading-relaxed mb-6 flex-1"
              style={{ color: "var(--text-muted)" }}
            >
              {card.desc}
            </p>
            <button
              type="button"
              onClick={() => router.push(card.href)}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={card.btnStyle}
            >
              {card.action}
            </button>
          </div>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          Skip for now →
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// USERNAME SETUP (shown before step 1 for Google SSO users with no profile)
// ─────────────────────────────────────────────────────────────────────────────

function calcAge(dateString: string): number {
  const birth = new Date(dateString);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function UsernameSetup({
  uid,
  onDone,
}: {
  uid:    string;
  onDone: (displayName: string) => void;
}) {
  const [username,    setUsername]    = useState("");
  const [displayName, setDisplayName] = useState("");
  const [dob,         setDob]         = useState("");
  const [dobError,    setDobError]    = useState<string | null>(null);
  const [status,      setStatus]      = useState<"idle" | "checking" | "ok" | "taken">("idle");
  const [saving,      setSaving]      = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced username check
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!username || username.length < 3 || !/^[a-z0-9_]+$/.test(username)) {
      setStatus("idle");
      return;
    }
    setStatus("checking");
    debounce.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/username-check?username=${encodeURIComponent(username)}`);
        const data = await res.json() as { available: boolean };
        setStatus(data.available ? "ok" : "taken");
      } catch { setStatus("idle"); }
    }, 500);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [username]);

  const handleCreate = async () => {
    if (!username || status === "taken" || status === "checking") return;

    // Validate date of birth
    if (!dob) {
      setDobError("Date of birth is required");
      return;
    }
    if (isNaN(new Date(dob).getTime()) || calcAge(dob) < 13) {
      setDobError("You must be at least 13 years old to register");
      return;
    }
    setDobError(null);

    setSaving(true);
    try {
      // Two-step onboarding write (audit fix L2):
      //   1. Client SDK creates /profiles/{uid} WITHOUT the username field.
      //      The Firestore profile-create rule allows this so long as the
      //      privileged-default fields (isAdmin, xp, etc.) are pinned.
      //   2. Server action claimUsername reserves /usernames/{name} and
      //      stamps profiles.username inside a transaction so a user can't
      //      squat multiple username docs from the client.
      // The previous flow did both writes in a client-side batch, which let
      // anyone create unlimited /usernames/{...} docs (their uid as owner)
      // bypassing the one-per-user uniqueness contract.
      await setDoc(doc(db, "profiles", uid), {
        displayName:   displayName.trim() || username,
        avatarUrl:     null,
        bio:           "",
        xp:            0,
        tournamentsPlayed: 0,
        tournamentsWon:    0,
        isVerified:    false,
        isAdmin:       false,
        dateOfBirth:   dob,
        ageVerifiedAt: new Date(),
        createdAt:     new Date(),
        updatedAt:     new Date(),
      });

      const { claimUsername } = await import("@/lib/actions/username.actions");
      const claim = await claimUsername(username);
      if (!claim.success) {
        toast.error(claim.error ?? "Couldn't reserve that username");
        setSaving(false);
        return;
      }

      // Welcome XP. once_global — runs only the first time this fires.
      const xp = await awardXp(uid, "onboarding_complete");
      if (xp.success && xp.data && xp.data.awarded > 0) {
        toast.success(`+${xp.data.awarded} XP — ${xp.data.label}`);
      }

      onDone(displayName.trim() || username);
    } catch {
      toast.error("Failed to create profile");
      setSaving(false);
    }
  };

  const borderColor =
    status === "ok"    ? "var(--success)" :
    status === "taken" ? "var(--danger)"  :
    "var(--border-default)";

  return (
    <div className="max-w-md mx-auto">
      <div className="text-center mb-10">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-5 font-display"
          style={{ background: "var(--accent)", boxShadow: "0 0 40px var(--accent-glow)" }}
        >
          CF
        </div>
        <h1
          className="font-display font-bold text-3xl mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Set up your profile
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Choose a username to get started on ClanForge
        </p>
      </div>

      <div
        className="rounded-2xl p-8 flex flex-col gap-5"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        {/* Username */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
            Username <span style={{ color: "var(--text-muted)" }}>(permanent)</span>
          </label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            placeholder="coolplayer_99"
            maxLength={20}
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
            style={{ background: "var(--bg-elevated)", border: `1px solid ${borderColor}`, color: "var(--text-primary)" }}
          />
          {status === "taken" && (
            <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>Username taken</p>
          )}
          {status === "ok" && (
            <p className="mt-1 text-xs" style={{ color: "var(--success)" }}>Username available ✓</p>
          )}
        </div>

        {/* Display name */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Your name or gamer tag"
            maxLength={40}
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
          />
        </div>

        {/* Date of birth */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
            Date of Birth
          </label>
          <input
            type="date"
            value={dob}
            onChange={e => { setDob(e.target.value); setDobError(null); }}
            max={new Date().toISOString().split("T")[0]}
            min="1900-01-01"
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
            style={{
              background:  "var(--bg-elevated)",
              border:      `1px solid ${dobError ? "var(--danger)" : "var(--border-default)"}`,
              color:       "var(--text-primary)",
              colorScheme: "dark",
            }}
          />
          {dobError ? (
            <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>{dobError}</p>
          ) : (
            <p className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
              You must be at least 13 years old. Stored for age verification only.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleCreate}
          disabled={saving || status === "taken" || status === "checking" || !username}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "var(--accent)" }}
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {saving ? "Creating profile…" : "Continue →"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

type FlowState = "loading" | "setup" | "step1" | "step2" | "step3";

export default function OnboardingPage() {
  const router = useRouter();

  const [uid,         setUid]         = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [flow,        setFlow]        = useState<FlowState>("loading");

  // Detect auth + check if profile exists
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) { window.location.href = "/login"; return; }
      setUid(user.uid);

      try {
        const snap = await getDoc(doc(db, "profiles", user.uid));
        if (!snap.exists()) {
          // No profile yet (Google SSO) → show username setup first
          setFlow("setup");
        } else {
          const data = snap.data();
          setDisplayName((data.displayName as string) || (data.username as string) || "");
          setFlow("step1");
        }
      } catch {
        setFlow("step1");
      }
    });
    return () => unsub();
  }, []);

  if (!uid || flow === "loading") {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--text-muted)" }} />
      </div>
    );
  }

  const step = flow === "step1" ? 1 : flow === "step2" ? 2 : flow === "step3" ? 3 : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">

      {/* ── Skip all link (hidden on username setup) ── */}
      {flow !== "setup" && (
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="text-sm transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--text-secondary)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            Skip all steps →
          </button>
        </div>
      )}

      {/* ── Progress bar (shown on steps 1–3) ── */}
      {flow !== "setup" && <ProgressBar step={step} />}

      {/* ── Username setup (Google SSO users only) ── */}
      {flow === "setup" && (
        <UsernameSetup
          uid={uid}
          onDone={name => {
            setDisplayName(name);
            setFlow("step1");
          }}
        />
      )}

      {/* ── Step 1: Pick games ── */}
      {flow === "step1" && (
        <Step1
          uid={uid}
          onNext={() => setFlow("step2")}
        />
      )}

      {/* ── Step 2: Profile ── */}
      {flow === "step2" && (
        <Step2
          uid={uid}
          initialDisplayName={displayName}
          onNext={() => setFlow("step3")}
          onBack={() => setFlow("step1")}
        />
      )}

      {/* ── Step 3: Clan ── */}
      {flow === "step3" && (
        <Step3 onBack={() => setFlow("step2")} />
      )}
    </div>
  );
}
