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
          className="px-3 pb-3 pt-1 border-t flex flex-col gap-3"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((t, i) => (
                <span
                  key={`${t}-${i}`}
                  className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{
                    background: "rgba(99,102,241,0.10)",
                    color:      "var(--accent)",
                    border:     "1px solid rgba(99,102,241,0.20)",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          <div
            className="text-sm leading-relaxed whitespace-pre-wrap break-words"
            style={{ color: "var(--text-secondary)" }}
          >
            {item.body}
          </div>

          {item.gallery && item.gallery.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {item.gallery.map((src, i) => (
                <a
                  key={`${src}-${i}`}
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded overflow-hidden aspect-video"
                  style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-subtle)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}

          {((item.links && item.links.length > 0) || item.externalUrl) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {item.links?.map((link, i) => (
                <a
                  key={`${link.url}-${i}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md"
                  style={{
                    background: "var(--bg-elevated)",
                    color:      "var(--accent)",
                    border:     "1px solid var(--border-default)",
                  }}
                >
                  <ExternalLink size={11} /> {link.label}
                </a>
              ))}
              {item.externalUrl && !item.links?.some(l => l.url === item.externalUrl) && (
                <a
                  href={item.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md"
                  style={{
                    background: "var(--bg-elevated)",
                    color:      "var(--accent)",
                    border:     "1px solid var(--border-default)",
                  }}
                >
                  <ExternalLink size={11} /> Source
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
