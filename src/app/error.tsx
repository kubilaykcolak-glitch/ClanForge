"use client";

import { useEffect } from "react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorPageProps) {
  // Log to an error-reporting service in production
  useEffect(() => {
    console.error("[ClanForge error boundary]", error);
  }, [error]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="w-full max-w-lg text-center">

        {/* Icon */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6"
          style={{
            background: "rgba(239,68,68,0.10)",
            border:     "1px solid rgba(239,68,68,0.20)",
          }}
        >
          ⚠️
        </div>

        {/* Heading */}
        <h1
          className="font-display font-bold text-3xl mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          Something went wrong
        </h1>

        <p
          className="text-sm mb-6 leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          An unexpected error occurred. You can try again — if it keeps
          happening, contact support.
        </p>

        {/* Error details */}
        {error.message && (
          <pre
            className="text-left text-xs rounded-xl p-4 mb-8 overflow-auto font-mono leading-relaxed"
            style={{
              background: "var(--bg-elevated)",
              border:     "1px solid var(--border-default)",
              color:      "var(--danger)",
              maxHeight:  140,
              whiteSpace: "pre-wrap",
              wordBreak:  "break-all",
            }}
          >
            {error.message}
            {error.digest && (
              <span style={{ color: "var(--text-muted)", display: "block", marginTop: 8 }}>
                digest: {error.digest}
              </span>
            )}
          </pre>
        )}

        {/* Actions */}
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            onClick={reset}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-88"
            style={{ background: "var(--accent)" }}
          >
            Try Again
          </button>
          <a
            href="/"
            className="px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{
              border: "1px solid var(--border-default)",
              color:  "var(--text-secondary)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "var(--border-default)";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            Go Home
          </a>
        </div>
      </div>
    </div>
  );
}
