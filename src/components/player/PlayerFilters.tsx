"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useTransition, useRef } from "react";
import { Search, CheckCircle2, X } from "lucide-react";

// ── Component ─────────────────────────────────────────────────────────────────

export function PlayerFilters() {
  const router      = useRouter();
  const pathname    = usePathname();
  const params      = useSearchParams();
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentQ        = params.get("q")        ?? "";
  const currentVerified = params.get("verified")  === "true";

  // ── Helpers ──
  const buildUrl = useCallback(
    (overrides: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(overrides)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      return `${pathname}?${next.toString()}`;
    },
    [params, pathname]
  );

  const handleSearch = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(() => {
        router.push(buildUrl({ q: value || null, verified: null }));
      });
    }, 400);
  };

  const toggleVerified = () => {
    startTransition(() => {
      router.push(buildUrl({ verified: currentVerified ? null : "true", q: null }));
    });
  };

  const clearAll = () => {
    startTransition(() => {
      router.push(pathname);
    });
  };

  const hasFilters = currentQ !== "" || currentVerified;

  return (
    <div className="flex flex-wrap items-center gap-3 mb-8">

      {/* ── Search input ── */}
      <div
        className="relative flex-1"
        style={{ minWidth: 220, maxWidth: 360 }}
      >
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--text-muted)" }}
        />
        <input
          type="text"
          placeholder="Search by username…"
          defaultValue={currentQ}
          onChange={e => handleSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg text-sm outline-none transition-all"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = "var(--accent)";
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = "var(--border-default)";
          }}
        />
      </div>

      {/* ── Verified toggle ── */}
      <button
        onClick={toggleVerified}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
        style={
          currentVerified
            ? {
                background: "rgba(14,165,233,0.12)",
                border: "1px solid rgba(14,165,233,0.3)",
                color: "var(--info)",
              }
            : {
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                color: "var(--text-secondary)",
              }
        }
      >
        <CheckCircle2 size={14} />
        Verified Only
      </button>

      {/* ── Clear filters ── */}
      {hasFilters && (
        <button
          onClick={clearAll}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <X size={12} />
          Clear
        </button>
      )}
    </div>
  );
}
