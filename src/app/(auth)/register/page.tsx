"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, writeBatch } from "firebase/firestore";
import { Eye, EyeOff, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { auth, db } from "@/lib/firebase/client";

// ── Schema ────────────────────────────────────────────────────────────────────

function calcAge(dateString: string): number {
  const birth = new Date(dateString);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

const schema = z
  .object({
    dateOfBirth: z
      .string()
      .min(1, "Date of birth is required")
      .refine(v => {
        const d = new Date(v);
        return !isNaN(d.getTime()) && calcAge(v) >= 13;
      }, "You must be at least 13 years old to register"),
    username: z
      .string()
      .min(3, "At least 3 characters")
      .max(20, "Max 20 characters")
      .regex(/^[a-z0-9_]+$/, "Only lowercase letters, numbers, underscores"),
    email:    z.string().min(1, "Email is required").email("Enter a valid email"),
    password: z.string().min(8, "At least 8 characters"),
    confirm:  z.string(),
    terms:    z.literal(true, { message: "You must accept the terms" }),
  })
  .refine(d => d.password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

type FormValues = z.infer<typeof schema>;

// ── Password strength ─────────────────────────────────────────────────────────

function getStrength(pw: string): { level: 0 | 1 | 2 | 3; label: string; color: string } {
  if (!pw) return { level: 0, label: "", color: "transparent" };
  if (pw.length < 8) return { level: 1, label: "Weak", color: "var(--danger)" };
  if (/[0-9!@#$%^&*]/.test(pw)) return { level: 3, label: "Strong", color: "var(--success)" };
  return { level: 2, label: "Fair", color: "var(--warning)" };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createSession(idToken: string) {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error("Failed to create session");
}

function cleanFirebaseError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "Something went wrong";
  return msg.replace("Firebase: ", "").replace(/ \(auth\/.*\)\.?/, "");
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const [showPassword, setShowPassword]   = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const password = watch("password", "");
  const username = watch("username", "");
  const strength = getStrength(password);

  // Username availability check with 500ms debounce
  const checkUsername = useCallback(async (value: string) => {
    if (!value || value.length < 3 || !/^[a-z0-9_]+$/.test(value)) {
      setUsernameStatus("idle");
      return;
    }
    setUsernameStatus("checking");
    try {
      const res = await fetch(`/api/username-check?username=${encodeURIComponent(value)}`);
      const data = await res.json() as { available: boolean };
      setUsernameStatus(data.available ? "available" : "taken");
    } catch {
      setUsernameStatus("idle");
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => checkUsername(username), 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [username, checkUsername]);

  // Email/password register
  const onSubmit = async (values: FormValues) => {
    if (usernameStatus === "taken") {
      toast.error("That username is already taken");
      return;
    }
    try {
      const cred = await createUserWithEmailAndPassword(auth, values.email, values.password);
      const uid = cred.user.uid;

      const batch = writeBatch(db);
      batch.set(doc(db, "profiles", uid), {
        username:          values.username.toLowerCase(),
        displayName:       values.username,
        avatarUrl:         null,
        bio:               "",
        xp:                0,
        tournamentsPlayed: 0,
        tournamentsWon:    0,
        isVerified:        false,
        isAdmin:           false,
        dateOfBirth:       values.dateOfBirth,
        ageVerifiedAt:     new Date(),
        createdAt:         new Date(),
        updatedAt:         new Date(),
      });
      batch.set(doc(db, "usernames", values.username.toLowerCase()), { uid });
      await batch.commit();

      const token = await cred.user.getIdToken(true);
      await createSession(token);
      window.location.href = "/dashboard/onboarding";
    } catch (err) {
      toast.error(cleanFirebaseError(err));
    }
  };

  // Google register
  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      const token = await cred.user.getIdToken(true);
      await createSession(token);
      // Google users skip manual profile creation; redirect to onboarding to pick username
      window.location.href = "/dashboard/onboarding";
    } catch (err) {
      toast.error(cleanFirebaseError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="flex w-full min-h-screen">

      {/* ── Left atmospheric panel (Arena aurora) ─────────────────────────── */}
      <div
        className="hidden md:flex flex-col items-center justify-center w-1/2 relative overflow-hidden arena-bg-aurora"
      >
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(var(--accent) 1px, transparent 1px),
              linear-gradient(90deg, var(--accent) 1px, transparent 1px)
            `,
            backgroundSize: "48px 48px",
            opacity: 0.04,
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at center, transparent 25%, rgba(10,10,15,0.65) 80%)",
          }}
        />
        <div className="relative z-10 text-center px-12 select-none">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-white font-bold text-3xl mx-auto mb-8 font-display"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, var(--magenta) 100%)",
              boxShadow:  "0 0 60px var(--accent-glow), 0 0 80px var(--magenta-glow)",
            }}
          >
            CF
          </div>
          <h2 className="font-display font-bold text-4xl mb-4 tracking-wide" style={{ color: "var(--text-primary)" }}>
            ClanForge
          </h2>
          <p className="text-lg leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Your gaming legacy
            <br />
            starts here.
          </p>
        </div>
      </div>

      {/* ── Right form panel ──────────────────────────────────────────────── */}
      <div
        className="flex flex-col items-center justify-center w-full md:w-1/2 px-6 py-12"
        style={{ background: "var(--bg-surface)" }}
      >
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 md:hidden">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold"
              style={{ background: "var(--accent)" }}
            >
              CF
            </div>
            <span className="font-display font-semibold text-lg" style={{ color: "var(--text-primary)" }}>
              ClanForge
            </span>
          </div>

          <h1 className="font-display font-bold text-3xl mb-1" style={{ color: "var(--text-primary)" }}>
            Create your account
          </h1>
          <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
            Join thousands of gamers on ClanForge
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">

            {/* Date of birth */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Date of Birth
              </label>
              <input
                {...register("dateOfBirth")}
                type="date"
                max={new Date().toISOString().split("T")[0]}
                min="1900-01-01"
                className={`arena-input${errors.dateOfBirth ? " arena-input--error" : ""}`}
                style={{ colorScheme: "dark" }}
              />
              {errors.dateOfBirth ? (
                <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>
                  {errors.dateOfBirth.message}
                </p>
              ) : (
                <p className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  You must be at least 13 years old. This is stored for age verification purposes only.
                </p>
              )}
            </div>

            {/* Username */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Username
              </label>
              <div className="relative">
                <input
                  {...register("username")}
                  type="text"
                  autoComplete="username"
                  placeholder="coolplayer_99"
                  className={`arena-input${
                    errors.username || usernameStatus === "taken"
                      ? " arena-input--error"
                      : usernameStatus === "available"
                      ? " arena-input--success"
                      : ""
                  }`}
                  style={{ paddingRight: 40 }}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameStatus === "checking" && <Loader2 size={15} className="animate-spin" style={{ color: "var(--text-muted)" }} />}
                  {usernameStatus === "available" && <Check size={15} style={{ color: "var(--success)" }} />}
                  {usernameStatus === "taken"     && <X     size={15} style={{ color: "var(--danger)"  }} />}
                </span>
              </div>
              {(errors.username || usernameStatus === "taken") && (
                <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>
                  {errors.username?.message ?? "Username is already taken"}
                </p>
              )}
              {usernameStatus === "available" && !errors.username && (
                <p className="mt-1.5 text-xs" style={{ color: "var(--success)" }}>Username is available</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Email
              </label>
              <input
                {...register("email")}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className={`arena-input${errors.email ? " arena-input--error" : ""}`}
              />
              {errors.email && (
                <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>{errors.email.message}</p>
              )}
            </div>

            {/* Password + strength bar */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Password
              </label>
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className={`arena-input${errors.password ? " arena-input--error" : ""}`}
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--text-muted)" }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {/* Strength bar */}
              {password && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3].map(i => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full transition-all duration-300"
                        style={{
                          background: i <= strength.level ? strength.color : "var(--bg-overlay)",
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-xs" style={{ color: strength.color }}>
                    {strength.label}
                  </p>
                </div>
              )}
              {errors.password && (
                <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>{errors.password.message}</p>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Confirm Password
              </label>
              <div className="relative">
                <input
                  {...register("confirm")}
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className={`arena-input${errors.confirm ? " arena-input--error" : ""}`}
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--text-muted)" }}
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.confirm && (
                <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>{errors.confirm.message}</p>
              )}
            </div>

            {/* Terms */}
            <div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  {...register("terms")}
                  type="checkbox"
                  className="mt-0.5 rounded"
                  style={{ accentColor: "var(--accent)" }}
                />
                <span className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  I agree to the{" "}
                  <Link href="/terms" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--accent)" }}>
                    Terms of Service
                  </Link>
                </span>
              </label>
              {errors.terms && (
                <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>{errors.terms.message}</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="arena-cta w-full"
              style={{ padding: "12px 16px", fontSize: 13 }}
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {isSubmitting ? "Creating account…" : "Create Account"}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>or</span>
            <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="arena-cta-ghost w-full"
            style={{ padding: "11px 16px", fontSize: 13 }}
          >
            {googleLoading ? <Loader2 size={16} className="animate-spin" /> : <GoogleIcon />}
            Sign up with Google
          </button>

          <p className="mt-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Already have an account?{" "}
            <Link href="/login" className="font-medium" style={{ color: "var(--accent)" }}>
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
