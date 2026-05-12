"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { auth } from "@/lib/firebase/client";

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
  email:    z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

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

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, values.email, values.password);
      const token = await cred.user.getIdToken();
      await createSession(token);
      window.location.href = "/dashboard";
    } catch (err) {
      toast.error(cleanFirebaseError(err));
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      const token = await cred.user.getIdToken();
      await createSession(token);
      window.location.href = "/dashboard";
    } catch (err) {
      toast.error(cleanFirebaseError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="flex w-full min-h-screen">

      {/* ── Left atmospheric panel ────────────────────────────────────────── */}
      <div
        className="hidden md:flex flex-col items-center justify-center w-1/2 relative overflow-hidden"
        style={{ background: "var(--bg-elevated)" }}
      >
        {/* Subtle indigo grid */}
        <div
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
        {/* Vignette */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 20%, var(--bg-elevated) 75%)",
          }}
        />
        <div className="relative z-10 text-center px-12 select-none">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-white font-bold text-3xl mx-auto mb-8 font-display"
            style={{
              background: "var(--accent)",
              boxShadow: "0 0 60px var(--accent-glow)",
            }}
          >
            CF
          </div>
          <h2
            className="font-display font-bold text-4xl mb-4 tracking-wide"
            style={{ color: "var(--text-primary)" }}
          >
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
            Welcome back
          </h1>
          <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
            Sign in to continue to ClanForge
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">

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
                className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors"
                style={{
                  background: "var(--bg-elevated)",
                  border: `1px solid ${errors.email ? "var(--danger)" : "var(--border-default)"}`,
                  color: "var(--text-primary)",
                }}
              />
              {errors.email && (
                <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs transition-colors"
                  style={{ color: "var(--text-muted)" }}
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-lg px-4 py-2.5 pr-11 text-sm outline-none transition-colors"
                  style={{
                    background: "var(--bg-elevated)",
                    border: `1px solid ${errors.password ? "var(--danger)" : "var(--border-default)"}`,
                    color: "var(--text-primary)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "var(--text-muted)" }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold text-white transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: "var(--accent)" }}
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {isSubmitting ? "Signing in…" : "Sign In"}
            </button>
          </form>

          {/* Divider */}
          <Divider />

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-lg text-sm font-medium transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          >
            {googleLoading ? <Loader2 size={16} className="animate-spin" /> : <GoogleIcon />}
            Sign in with Google
          </button>

          <p className="mt-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-medium" style={{ color: "var(--accent)" }}>
              Sign Up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function Divider() {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>or</span>
      <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
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
