"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, writeBatch } from "firebase/firestore";
import { AlertCircle, Check, ChevronLeft, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { auth, db } from "@/lib/firebase/client";
import { slugify } from "@/lib/utils";
import Toggle from "@/components/ui/Toggle";
import { validateImageFile } from "@/lib/uploads";
import { awardXp } from "@/lib/actions/xp.actions";
import { checkClanNameAvailable } from "@/lib/actions/clan-name.actions";
import { normalizeClanName, MIN_NAME_KEY_LENGTH } from "@/lib/clan-name";

// ── Constants ─────────────────────────────────────────────────────────────────

const POPULAR_GAMES = [
  "Valorant", "League of Legends", "CS2", "Dota 2", "Apex Legends",
  "Fortnite", "Rocket League", "Overwatch 2", "Rainbow Six Siege", "Call of Duty",
  "Warzone", "PUBG", "Minecraft", "Rust", "Escape from Tarkov",
  "FIFA", "NBA 2K", "Street Fighter 6", "Tekken 8", "Mortal Kombat 1",
  "World of Warcraft", "Final Fantasy XIV", "Lost Ark", "Path of Exile", "Diablo IV",
];

const TAGS = [
  "Competitive", "Casual", "18+", "Beginner Friendly", "Ranked", "Social", "Chill",
];

interface FormState {
  name:         string;
  description:  string;
  gameFocus:    string;
  tags:         string[];
  isPublic:     boolean;
  isRecruiting: boolean;
  memberLimit:  number;
}

// ── Image upload helper ───────────────────────────────────────────────────────

function ImageUpload({
  label,
  hint,
  onChange,
  aspectClass,
}: {
  label:       string;
  hint:        string;
  value:       File | null;
  onChange:    (f: File | null) => void;
  aspectClass: string;
}) {
  const inputRef   = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file) {
      const v = validateImageFile(file);
      if (!v.ok) {
        toast.error(v.error ?? "Invalid file");
        e.target.value = "";
        return;
      }
    }
    onChange(file);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
    e.target.value = "";
  };

  const clear = () => {
    onChange(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      <div
        className={`relative rounded-xl overflow-hidden flex items-center justify-center cursor-pointer transition-colors ${aspectClass}`}
        style={{
          background: preview ? "transparent" : "var(--bg-elevated)",
          border: `1px dashed var(--border-default)`,
        }}
        onClick={() => !preview && inputRef.current?.click()}
      >
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={e => { e.stopPropagation(); clear(); }}
              className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-white"
              style={{ background: "var(--danger)" }}
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 p-4 text-center">
            <Upload size={20} style={{ color: "var(--text-muted)" }} />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{hint}</p>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-6 flex flex-col gap-5"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
    >
      <h2 className="font-display font-bold text-lg" style={{ color: "var(--text-primary)" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CreateClanPage() {
  const router = useRouter();

  // Auth
  const [uid, setUid]                   = useState<string | null>(null);
  const [displayName, setDisplayName]   = useState("");
  const [avatarUrl, setAvatarUrl]       = useState<string | undefined>();

  // Form state
  const [form, setForm] = useState<FormState>({
    name:         "",
    description:  "",
    gameFocus:    "",
    tags:         [],
    isPublic:     true,
    isRecruiting: true,
    memberLimit:  30,
  });

  // Inline field errors for the two required text inputs (audit fix M10).
  // Populated on a failed submit attempt; cleared as the user types so the
  // message disappears once they're fixing it. The form-wide toast is now
  // a fallback for unexpected errors only.
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; gameFocus?: string }>({});

  // Slug
  const [slug, setSlug]                   = useState("");
  const [slugStatus, setSlugStatus]       = useState<"idle" | "checking" | "available" | "taken">("idle");
  const slugDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Name uniqueness (more aggressive than slug — catches case/punctuation/leetspeak copycats)
  const [nameStatus, setNameStatus] = useState<"idle" | "checking" | "available" | "taken" | "too_short">("idle");
  const nameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Images
  const [avatarFile, setAvatarFile]   = useState<File | null>(null);
  const [bannerFile, setBannerFile]   = useState<File | null>(null);

  // Game search
  const [gameQuery, setGameQuery]     = useState("");

  // Submit
  const [submitting, setSubmitting]   = useState(false);
  const [submitStep, setSubmitStep]   = useState<string | null>(null);
  const [isSlow, setIsSlow]           = useState(false);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auth gate ──
  useEffect(() => {
    return onAuthStateChanged(auth, user => {
      if (!user) { window.location.href = "/login"; return; }
      setUid(user.uid);
    });
  }, []);

  // Fetch profile for displayName / avatarUrl
  useEffect(() => {
    if (!uid) return;
    import("firebase/firestore").then(({ doc: fiDoc, getDoc }) =>
      getDoc(fiDoc(db, "profiles", uid))
    ).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        setDisplayName(d.displayName ?? "");
        setAvatarUrl(d.avatarUrl);
      }
    });
  }, [uid]);

  // ── Slug derivation ──
  useEffect(() => {
    const derived = slugify(form.name);
    setSlug(derived);
    setSlugStatus("idle");
  }, [form.name]);

  // ── Slug availability check ──
  const checkSlug = useCallback(async (value: string) => {
    if (!value || value.length < 2) { setSlugStatus("idle"); return; }
    setSlugStatus("checking");
    try {
      const res  = await fetch(`/api/slug-check?slug=${encodeURIComponent(value)}`);
      const data = await res.json() as { available: boolean };
      setSlugStatus(data.available ? "available" : "taken");
    } catch {
      setSlugStatus("idle");
    }
  }, []);

  useEffect(() => {
    if (slugDebounce.current) clearTimeout(slugDebounce.current);
    if (!slug) return;
    slugDebounce.current = setTimeout(() => checkSlug(slug), 600);
    return () => { if (slugDebounce.current) clearTimeout(slugDebounce.current); };
  }, [slug, checkSlug]);

  // ── Name uniqueness check (anti-copycat) ──
  // Catches variants the slug check misses: case differences,
  // diacritics, leetspeak, punctuation, zero-width spoofs.
  useEffect(() => {
    if (nameDebounce.current) clearTimeout(nameDebounce.current);
    const trimmed = form.name.trim();
    if (!trimmed) {
      setNameStatus("idle");
      return;
    }
    const key = normalizeClanName(trimmed);
    if (key.length < MIN_NAME_KEY_LENGTH) {
      setNameStatus("too_short");
      return;
    }
    setNameStatus("checking");
    nameDebounce.current = setTimeout(async () => {
      const result = await checkClanNameAvailable(trimmed);
      if (!result.success || !result.data) {
        setNameStatus("idle");
        return;
      }
      if (result.data.available)              setNameStatus("available");
      else if (result.data.reason === "too_short") setNameStatus("too_short");
      else                                    setNameStatus("taken");
    }, 600);
    return () => { if (nameDebounce.current) clearTimeout(nameDebounce.current); };
  }, [form.name]);

  // ── Helpers ──
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    // Clear any inline error on the field being edited.
    if (key === "name" || key === "gameFocus") {
      setFieldErrors(prev => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key as "name" | "gameFocus"];
        return next;
      });
    }
  };

  const toggleTag = (tag: string) =>
    setField("tags", form.tags.includes(tag)
      ? form.tags.filter(t => t !== tag)
      : [...form.tags, tag]);

  const filteredGames = POPULAR_GAMES.filter(g =>
    g.toLowerCase().includes(gameQuery.toLowerCase())
  );

  // ── Upload helper — server-side proxy to avoid CORS ──
  async function uploadFile(file: File, path: string): Promise<string> {
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("path", path);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? "Image upload failed");
    }
    const { url } = await res.json() as { url: string };
    return url;
  }

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return;

    // Inline-error validation. Collect every problem first so the user
    // sees ALL of them at once instead of fixing one and getting nudged
    // about the next on the next submit (audit fix M10).
    const errs: typeof fieldErrors = {};
    if (!form.name.trim() || form.name.length < 3) {
      errs.name = "Clan name must be at least 3 characters";
    }
    if (!form.gameFocus) {
      errs.gameFocus = "Select a primary game";
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    if (!slug || slugStatus === "taken") {
      // This one isn't a "field validity" issue — slug is derived from
      // name and reflects external uniqueness, so it stays on the inline
      // slug-status row right next to the name input. Toast is the right
      // affordance to draw the eye back.
      toast.error("Choose a different clan name — that slug is taken"); return;
    }

    // Re-check the normalised name at submit time. The debounced status
    // could be stale (or skipped if the user mashed Submit before it ran).
    const nameKeyCheck = await checkClanNameAvailable(form.name);
    if (!nameKeyCheck.success || !nameKeyCheck.data) {
      toast.error("Couldn't verify clan name uniqueness. Please try again.");
      return;
    }
    if (!nameKeyCheck.data.available) {
      if (nameKeyCheck.data.reason === "too_short") {
        toast.error("Clan name needs more letters or numbers — it normalised too short.");
      } else {
        toast.error("A clan with a very similar name already exists. Pick something more distinctive.");
        setNameStatus("taken");
      }
      return;
    }
    const nameKey = nameKeyCheck.data.nameKey;

    setSubmitting(true);
    setSubmitStep("Preparing…");
    setIsSlow(false);
    slowTimerRef.current = setTimeout(() => setIsSlow(true), 8_000);

    try {
      // Pre-generate clanId
      const clanRef = doc(collection(db, "clans"));
      const clanId  = clanRef.id;

      // Upload images
      if (avatarFile || bannerFile) setSubmitStep("Uploading images…");
      const [uploadedAvatarUrl, uploadedBannerUrl] = await Promise.all([
        avatarFile ? uploadFile(avatarFile, `clan-assets/${clanId}/avatar`) : Promise.resolve(null),
        bannerFile ? uploadFile(bannerFile, `clan-assets/${clanId}/banner`) : Promise.resolve(null),
      ]);
      setSubmitStep("Creating clan…");

      // Atomic batch write
      const batch = writeBatch(db);

      batch.set(clanRef, {
        name:         form.name.trim(),
        nameKey,
        slug,
        description:  form.description.trim(),
        gameFocus:    form.gameFocus,
        tags:         form.tags,
        isPublic:     form.isPublic,
        isRecruiting: form.isRecruiting,
        memberLimit:  form.memberLimit,
        memberCount:  1,
        xp:           0,
        ownerId:      uid,
        avatarUrl:    uploadedAvatarUrl,
        bannerUrl:    uploadedBannerUrl,
        createdAt:    new Date(),
        updatedAt:    new Date(),
      });

      batch.set(doc(db, "clanSlugs", slug), { clanId });
      // Uniqueness index for the normalised clan name. Doc id = nameKey.
      // Collisions block create — checked above before this batch runs.
      batch.set(doc(db, "clanNameKeys", nameKey), { clanId });

      batch.set(doc(db, "clans", clanId, "members", uid), {
        userId:      uid,
        role:        "leader",
        joinedAt:    new Date(),
        displayName: displayName || "Unknown",
        avatarUrl:   avatarUrl ?? null,
      });

      // Stamp denormalized clan fields on the creator's profile so the
      // banner on /clans and profile hero link back to this clan.
      batch.update(doc(db, "profiles", uid), {
        clanId,
        clanTag:  null,
        clanSlug: slug,
        clanName: form.name.trim(),
      });

      await batch.commit();

      toast.success("Clan created! 🛡️");

      // Welcome bonus for the user's first clan creation. once_global —
      // creating a second clan doesn't re-award.
      const xp = await awardXp(uid, "clan_create");
      if (xp.success && xp.data && xp.data.awarded > 0) {
        toast.success(`+${xp.data.awarded} XP — ${xp.data.label}`);
      }

      router.push(`/clans/${slug}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create clan";
      toast.error(msg);
      setSubmitting(false);
      setSubmitStep(null);
      setIsSlow(false);
    } finally {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    }
  };

  if (!uid) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--text-muted)" }} />
      </div>
    );
  }

  const canSubmit =
    !submitting &&
    form.name.length >= 3 &&
    form.gameFocus !== "" &&
    slugStatus !== "taken" &&
    slugStatus !== "checking" &&
    nameStatus !== "taken" &&
    nameStatus !== "too_short" &&
    nameStatus !== "checking";

  return (
    <div className="max-w-2xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-8">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-2 rounded-lg transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-elevated)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="font-display font-bold text-3xl" style={{ color: "var(--text-primary)" }}>
            Create Clan
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Set up your clan and start recruiting.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">

        {/* ── Identity ── */}
        <Section title="Identity">

          {/* Clan Name */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Clan Name <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setField("name", e.target.value)}
              placeholder="Epic Gamers United"
              maxLength={30}
              aria-invalid={!!fieldErrors.name}
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors"
              style={{
                background: "var(--bg-elevated)",
                border: `1px solid ${fieldErrors.name ? "var(--danger)" : "var(--border-default)"}`,
                color: "var(--text-primary)",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = fieldErrors.name ? "var(--danger)" : "var(--border-default)"; }}
            />
            {fieldErrors.name && (
              <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
                {fieldErrors.name}
              </p>
            )}

            {/* Slug preview + availability */}
            {slug && (
              <div className="mt-2 flex items-center gap-2">
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  clanforge.gg/clans/
                  <span style={{ color: "var(--text-secondary)" }}>{slug}</span>
                </p>
                {slugStatus === "checking"  && <Loader2 size={12} className="animate-spin" style={{ color: "var(--text-muted)" }} />}
                {slugStatus === "available" && <Check size={13} style={{ color: "var(--success)" }} />}
                {slugStatus === "taken"     && <X     size={13} style={{ color: "var(--danger)"  }} />}
                {slugStatus === "taken"     && <span className="text-xs" style={{ color: "var(--danger)" }}>Name already taken</span>}
              </div>
            )}

            {/* Name uniqueness check (anti-copycat) */}
            {nameStatus === "taken" && (
              <p className="mt-1.5 text-xs flex items-start gap-1.5" style={{ color: "var(--danger)" }}>
                <X size={13} className="mt-0.5 shrink-0" />
                A clan with a very similar name already exists. Try something more distinctive.
              </p>
            )}
            {nameStatus === "too_short" && (
              <p className="mt-1.5 text-xs" style={{ color: "var(--warning)" }}>
                Use at least {MIN_NAME_KEY_LENGTH} letters or numbers.
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Description
            </label>
            <textarea
              value={form.description}
              onChange={e => setField("description", e.target.value)}
              placeholder="Tell players what your clan is about…"
              rows={3}
              maxLength={300}
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors resize-none"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "var(--border-default)"; }}
            />
            <p className="mt-1 text-xs text-right" style={{ color: "var(--text-muted)" }}>
              {form.description.length}/300
            </p>
          </div>

          {/* Primary Game */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Primary Game <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <input
              type="text"
              value={form.gameFocus || gameQuery}
              onChange={e => {
                setGameQuery(e.target.value);
                setField("gameFocus", "");
              }}
              placeholder="Search games…"
              aria-invalid={!!fieldErrors.gameFocus}
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors"
              style={{
                background: "var(--bg-elevated)",
                border: `1px solid ${
                  fieldErrors.gameFocus ? "var(--danger)"
                  : form.gameFocus     ? "var(--success)"
                                       : "var(--border-default)"
                }`,
                color: "var(--text-primary)",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; }}
              onBlur={e => {
                e.currentTarget.style.borderColor =
                  fieldErrors.gameFocus ? "var(--danger)"
                  : form.gameFocus      ? "var(--success)"
                                        : "var(--border-default)";
              }}
            />
            {fieldErrors.gameFocus && (
              <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
                {fieldErrors.gameFocus}
              </p>
            )}

            {/* Dropdown */}
            {gameQuery && !form.gameFocus && (
              <div
                className="mt-1 rounded-lg overflow-hidden max-h-48 overflow-y-auto"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                }}
              >
                {filteredGames.length > 0 ? filteredGames.map(game => (
                  <button
                    key={game}
                    type="button"
                    className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                    style={{ color: "var(--text-secondary)" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-overlay)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                    onClick={() => {
                      setField("gameFocus", game);
                      setGameQuery(game);
                    }}
                  >
                    {game}
                  </button>
                )) : (
                  <p className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
                    No games found
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Tags
            </label>
            <div className="flex flex-wrap gap-2">
              {TAGS.map(tag => {
                const selected = form.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                    style={{
                      background: selected ? "var(--accent)" : "var(--bg-elevated)",
                      border: `1px solid ${selected ? "var(--accent)" : "var(--border-default)"}`,
                      color: selected ? "#fff" : "var(--text-secondary)",
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        </Section>

        {/* ── Settings ── */}
        <Section title="Settings">

          <div>
            <p className="font-display font-semibold text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
              Visibility Settings
            </p>
            <div className="flex flex-col gap-4">
              <Toggle
                checked={form.isPublic}
                onChange={v => setField("isPublic", v)}
                label="Public Clan"
                description="Anyone can find and browse this clan. Turn off to make it invite-only."
              />
              <Toggle
                checked={form.isRecruiting}
                onChange={v => setField("isRecruiting", v)}
                label="Open Recruiting"
                description="Show a recruiting badge and allow players to request to join."
              />
            </div>
          </div>

          {/* Member limit slider */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Member Limit — <span style={{ color: "var(--text-primary)" }}>{form.memberLimit}</span>
            </label>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={form.memberLimit}
              onChange={e => setField("memberLimit", Number(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              <span>10</span>
              <span>100</span>
            </div>
          </div>
        </Section>

        {/* ── Media ── */}
        <Section title="Branding">
          <div className="grid grid-cols-2 gap-4">
            <ImageUpload
              label="Clan Avatar"
              hint="Square logo, JPG/PNG"
              value={avatarFile}
              onChange={setAvatarFile}
              aspectClass="h-32"
            />
            <ImageUpload
              label="Clan Banner"
              hint="Wide banner image, JPG/PNG"
              value={bannerFile}
              onChange={setBannerFile}
              aspectClass="h-32"
            />
          </div>
        </Section>

        {/* ── Submit ── */}
        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="arena-cta w-full"
            style={{ padding: "12px 16px", fontSize: 13, borderRadius: 12 }}
          >
            {submitting ? (
              <><Loader2 size={16} className="animate-spin" /> {submitStep ?? "Creating clan…"}</>
            ) : (
              "Create Clan 🛡️"
            )}
          </button>

          {/* Slow-operation warning */}
          {isSlow && (
            <div className="flex items-center justify-center gap-1.5">
              <AlertCircle size={13} style={{ color: "var(--warning)", flexShrink: 0 }} />
              <p className="text-xs text-center" style={{ color: "var(--warning)" }}>
                This is taking longer than expected — please don&apos;t close this tab.
              </p>
            </div>
          )}
        </div>

      </form>
    </div>
  );
}
