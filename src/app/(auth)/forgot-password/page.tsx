"use client";

// /forgot-password — Firebase password-reset entry point. The login page
// links here from the "Forgot password?" affordance; before this page
// existed that link was a dead 404 (audit finding H5).
//
// We deliberately do NOT confirm whether the email exists — both success
// and "no such account" paths show the same neutral success message. That
// stops account-enumeration on this endpoint (would otherwise be the
// fastest place to harvest valid emails).

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { sendPasswordResetEmail } from "firebase/auth";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { auth } from "@/lib/firebase/client";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
});
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    try {
      await sendPasswordResetEmail(auth, values.email);
    } catch {
      // Swallow — Firebase exposes `auth/user-not-found` here which would
      // leak account existence. Show the neutral success path either way.
    }
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: "var(--bg-base)" }}>
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{
          background: "var(--bg-surface)",
          border:     "1px solid var(--border-subtle)",
        }}
      >
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs mb-6 hover:underline underline-offset-2"
          style={{ color: "var(--text-muted)" }}
        >
          <ArrowLeft size={12} />
          Back to login
        </Link>

        {submitted ? (
          <div className="text-center">
            <MailCheck size={36} style={{ color: "var(--success)" }} className="mx-auto mb-4" />
            <h1 className="font-display font-bold text-xl mb-2" style={{ color: "var(--text-primary)" }}>
              Check your inbox
            </h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              If an account exists for that email, a password-reset link is on
              its way. The link expires in 1 hour.
            </p>
            <p className="text-xs mt-6" style={{ color: "var(--text-muted)" }}>
              Didn&rsquo;t get an email? Check your spam folder, or{" "}
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="underline-offset-2 hover:underline"
                style={{ color: "var(--accent)" }}
              >
                try a different address
              </button>.
            </p>
          </div>
        ) : (
          <>
            <h1 className="font-display font-bold text-xl mb-2" style={{ color: "var(--text-primary)" }}>
              Reset your password
            </h1>
            <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
              Enter your email and we&rsquo;ll send you a reset link.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
                  Email
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  autoFocus
                  className="arena-input w-full"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
                    {errors.email.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="arena-cta w-full disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : null}
                Send reset link
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
