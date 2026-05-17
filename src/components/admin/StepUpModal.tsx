"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Loader2, X } from "lucide-react";
import { auth } from "@/lib/firebase/client";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";

// ─── StepUpModal ──────────────────────────────────────────────────────────────
//
// Reusable re-auth modal driven by the useStepUp() hook.
//
// Flow when an admin tries a destructive action:
//   1. Server action returns { needsStepUp: true }.
//   2. The hook's wrapper catches it and opens this modal.
//   3. User enters their password.
//   4. Firebase reauthenticateWithCredential — proves password possession AND
//      returns a fresh ID token whose auth_time is "now".
//   5. POST that token to /api/auth/step-up — server verifies + mints the
//      short-lived step_up cookie.
//   6. Modal closes; the hook re-runs the original action.
//
// We don't store the password anywhere; the credential is constructed and
// immediately consumed by Firebase.

interface StepUpModalProps {
  open: boolean;
  onSuccess: () => void;
  onCancel:  () => void;
}

export function StepUpModal({ open, onSuccess, onCancel }: StepUpModalProps) {
  const [password,   setPassword]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
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

      const res = await fetch("/api/auth/step-up", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        setError(body?.error ?? "Re-authentication failed");
        setSubmitting(false);
        return;
      }

      onSuccess();
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={submitting ? undefined : onCancel}
    >
      <form
        onSubmit={handleSubmit}
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
              Confirm your password
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              This action requires re-authentication. Your password is checked against Firebase and is never stored or transmitted to ClanForge.
            </p>
          </div>
        </div>

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
    </div>
  );
}
