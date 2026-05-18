"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Loader2, X } from "lucide-react";
import { auth } from "@/lib/firebase/client";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
} from "firebase/auth";

// ─── StepUpModal ──────────────────────────────────────────────────────────────
//
// Reusable re-auth modal driven by the useStepUp() hook.
//
// Flow when an admin tries a destructive action:
//   1. Server action returns { needsStepUp: true }.
//   2. The hook's wrapper catches it and opens this modal.
//   3. User re-authenticates using the SAME provider they originally signed
//      up with — we detect this from auth.currentUser.providerData:
//        - "password"   → render a password input + reauthenticateWithCredential
//        - "google.com" → render a "Confirm with Google" button +
//                         reauthenticateWithPopup(new GoogleAuthProvider())
//      Both paths produce a fresh ID token with auth_time = now.
//   4. POST that token to /api/auth/step-up — server verifies (including a
//      5-minute auth_time freshness check) + mints the short-lived step_up
//      cookie.
//   5. Modal closes; the hook re-runs the original action.
//
// We never store credentials. Password is consumed by Firebase and dropped;
// the Google popup never exposes anything to ClanForge directly.

type ProviderId = "password" | "google.com" | "unknown";

interface StepUpModalProps {
  open: boolean;
  onSuccess: () => void;
  onCancel:  () => void;
}

function detectProvider(): ProviderId {
  const user = auth.currentUser;
  if (!user) return "unknown";
  // Prefer password if the user has both linked (rare but valid in Firebase).
  const ids = user.providerData.map(p => p.providerId);
  if (ids.includes("password"))   return "password";
  if (ids.includes("google.com")) return "google.com";
  return "unknown";
}

export function StepUpModal({ open, onSuccess, onCancel }: StepUpModalProps) {
  const [password,   setPassword]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [provider,   setProvider]   = useState<ProviderId>("unknown");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setError(null);
      const p = detectProvider();
      setProvider(p);
      if (p === "password") {
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }
  }, [open]);

  if (!open) return null;

  // Shared "post fresh ID token, succeed or surface error" tail.
  const completeFlow = async (idToken: string): Promise<void> => {
    const res = await fetch("/api/auth/step-up", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ idToken }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null;
      throw new Error(body?.error ?? "Re-authentication failed");
    }
    onSuccess();
  };

  // ─── Password path ────────────────────────────────────────────────────────
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      const user = auth.currentUser;
      if (!user || !user.email) {
        setError("Not signed in");
        setSubmitting(false);
        return;
      }
      const credential = EmailAuthProvider.credential(user.email, password);
      const fresh = await reauthenticateWithCredential(user, credential);
      const idToken = await fresh.user.getIdToken(true);
      await completeFlow(idToken);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError("Incorrect password");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Try again in a few minutes.");
      } else {
        setError(err instanceof Error ? err.message : "Re-authentication failed");
      }
      setSubmitting(false);
    }
  };

  // ─── Google path ──────────────────────────────────────────────────────────
  const handleGoogleConfirm = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        setError("Not signed in");
        setSubmitting(false);
        return;
      }
      const provider = new GoogleAuthProvider();
      const fresh = await reauthenticateWithPopup(user, provider);
      const idToken = await fresh.user.getIdToken(true);
      await completeFlow(idToken);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        setError("Re-authentication cancelled");
      } else if (code === "auth/popup-blocked") {
        setError("Popup blocked. Allow popups for this site and try again.");
      } else if (code === "auth/user-mismatch") {
        setError("Signed in with a different Google account than your ClanForge profile.");
      } else {
        setError(err instanceof Error ? err.message : "Re-authentication failed");
      }
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={submitting ? undefined : onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
        style={{
          background: "var(--bg-surface)",
          border:     "1px solid var(--danger)",
          boxShadow:  "0 0 40px rgba(239,68,68,0.25)",
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="absolute top-3 right-3 p-1.5 rounded-md transition-colors disabled:opacity-50"
          style={{ color: "var(--text-muted)" }}
          aria-label="Cancel"
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.40)" }}
          >
            <ShieldCheck size={20} style={{ color: "var(--danger)" }} />
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-bold text-base leading-tight" style={{ color: "var(--text-primary)" }}>
              {provider === "google.com" ? "Confirm with Google" : "Confirm your password"}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {provider === "google.com"
                ? "Re-authenticate via Google to authorise this destructive admin action. Your Google credentials never touch ClanForge."
                : "This action requires re-authentication. Your password is checked against Firebase and is never stored or transmitted to ClanForge."}
            </p>
          </div>
        </div>

        {provider === "password" && (
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
            <div>
              <input
                ref={inputRef}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                disabled={submitting}
                className="w-full rounded-lg text-sm outline-none"
                style={{
                  background:   "var(--bg-elevated)",
                  border:       `1px solid ${error ? "var(--danger)" : "var(--border-default)"}`,
                  color:        "var(--text-primary)",
                  borderRadius: 8,
                  padding:      "10px 14px",
                  fontSize:     14,
                }}
              />
              {error && (
                <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>
                  {error}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                style={{
                  background: "var(--bg-elevated)",
                  border:     "1px solid var(--border-default)",
                  color:      "var(--text-secondary)",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || password.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
                style={{ background: "var(--danger)" }}
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Confirm
              </button>
            </div>
          </form>
        )}

        {provider === "google.com" && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleGoogleConfirm}
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              style={{
                background: "#fff",
                color:      "#1f1f1f",
                border:     "1px solid var(--border-default)",
              }}
            >
              {submitting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              Confirm with Google
            </button>
            {error && (
              <p className="text-xs" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="self-end px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              style={{
                background: "var(--bg-elevated)",
                border:     "1px solid var(--border-default)",
                color:      "var(--text-secondary)",
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {provider === "unknown" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs" style={{ color: "var(--danger)" }}>
              Your account doesn&apos;t have a supported re-authentication method
              (password or Google). Contact support to set one up before
              performing admin actions.
            </p>
            <button
              type="button"
              onClick={onCancel}
              className="self-end px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: "var(--bg-elevated)",
                border:     "1px solid var(--border-default)",
                color:      "var(--text-secondary)",
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
