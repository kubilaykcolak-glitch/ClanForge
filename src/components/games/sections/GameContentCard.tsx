"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { timeAgoCompact } from "@/lib/riot/assets";
import type { GameContent } from "@/types/game-content";

export function GameContentCard({ item }: { item: GameContent }) {
  const [open, setOpen] = useState(false);
  const publishedMs = (item.publishedAt ?? item.updatedAt).getTime();

  return (
    <article
      id={`content-${item.slug}`}
      className="rounded-xl overflow-hidden scroll-mt-24"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-stretch text-left transition-colors"
      >
        {item.heroImageUrl ? (
          <div className="w-20 sm:w-28 shrink-0 overflow-hidden" style={{ background: "var(--bg-overlay)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.heroImageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        ) : null}
        <div className="flex-1 p-3 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display font-bold text-base truncate" style={{ color: "var(--text-primary)" }}>
              {item.title}
            </h3>
            <ChevronDown
              size={16}
              style={{
                color: "var(--text-muted)",
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 150ms ease",
                flexShrink: 0,
              }}
              aria-hidden
            />
          </div>
          {item.summary && (
            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-secondary)" }}>
              {item.summary}
            </p>
          )}
          <p className="text-[10px] mt-1.5" style={{ color: "var(--text-muted)" }}>
            By {item.authorName} · {timeAgoCompact(publishedMs)} ago
          </p>
        </div>
      </button>

      {open && (
        <div
          className="px-3 pb-3 pt-1 border-t"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div
            className="text-sm leading-relaxed whitespace-pre-wrap break-words"
            style={{ color: "var(--text-secondary)" }}
          >
            {item.body}
          </div>
          {item.externalUrl && (
            <a
              href={item.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-3 text-xs"
              style={{ color: "var(--accent)" }}
            >
              <ExternalLink size={12} /> View source
            </a>
          )}
        </div>
      )}
    </article>
  );
}
