// Renders when a section's loader or render throws. Keeps the rest of the
// hub (banner + tab nav) alive so users can navigate away.

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export function SectionErrorFallback({
  sectionLabel,
  gameSlug,
}: {
  sectionLabel?: string;
  gameSlug:      string;
}) {
  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-subtle)",
      }}
    >
      <AlertTriangle size={28} style={{ color: "var(--warning)" }} className="mx-auto mb-3 opacity-70" />
      <h3 className="font-display font-semibold text-base mb-2" style={{ color: "var(--text-primary)" }}>
        {sectionLabel ? `Couldn't load ${sectionLabel}` : "Couldn't load this section"}
      </h3>
      <p className="text-xs mb-5 max-w-sm mx-auto" style={{ color: "var(--text-muted)" }}>
        Something went wrong rendering this view. The rest of the hub still works —
        try a different section, or come back in a moment.
      </p>
      <Link
        href={`/games/${gameSlug}`}
        className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold"
        style={{
          background: "var(--bg-elevated)",
          border:     "1px solid var(--border-default)",
          color:      "var(--text-primary)",
        }}
      >
        Back to overview
      </Link>
    </div>
  );
}
