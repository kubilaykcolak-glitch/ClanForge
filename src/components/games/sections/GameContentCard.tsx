// ─── Public-facing game-content card ─────────────────────────────────────────
//
// Layout varies by content type:
//   - items / locations: image-left, info-right (square ~96px image, body
//     always rendered next to it — no collapse / no dropdown).
//   - guides / updates : top hero image (if present) + full body below,
//     always rendered.
//
// Pure server component — no interactivity, smaller bundle. The previous
// expand-on-click pattern was traded for an always-rendered layout based on
// user feedback (image + info should be visible at a glance for items).

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { timeAgoCompact } from "@/lib/riot/assets";
import type { GameContent } from "@/types/game-content";

void Link; // reserved — future deep-link to per-entry permalink

export function GameContentCard({ item }: { item: GameContent }) {
  const publishedMs = (item.publishedAt ?? item.updatedAt).getTime();
  const isSideBySide = item.type === "items" || item.type === "locations";

  if (isSideBySide) {
    return (
      <article
        id={`content-${item.slug}`}
        className="rounded-xl overflow-hidden scroll-mt-24 flex"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
      >
        {/* Image rail — square on items, slightly wider on locations */}
        <div
          className={`shrink-0 overflow-hidden ${item.type === "items" ? "w-24 sm:w-28" : "w-32 sm:w-40"}`}
          style={{ background: "var(--bg-overlay)" }}
        >
          {item.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.heroImageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImagePlaceholder type={item.type} />
          )}
        </div>

        {/* Info rail */}
        <div className="flex-1 p-3 min-w-0 flex flex-col gap-2">
          <Header item={item} publishedMs={publishedMs} />

          {item.tags && item.tags.length > 0 && (
            <TagRow tags={item.tags} />
          )}

          <div
            className="text-sm leading-relaxed whitespace-pre-wrap break-words"
            style={{ color: "var(--text-secondary)" }}
          >
            {item.body}
          </div>

          {item.gallery && item.gallery.length > 0 && (
            <Gallery gallery={item.gallery} />
          )}

          {((item.links && item.links.length > 0) || item.externalUrl) && (
            <LinkRow item={item} />
          )}
        </div>
      </article>
    );
  }

  // ── Top-image layout for guides + updates ──
  return (
    <article
      id={`content-${item.slug}`}
      className="rounded-xl overflow-hidden scroll-mt-24"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
    >
      {item.heroImageUrl && (
        <div className="w-full overflow-hidden" style={{ background: "var(--bg-overlay)", maxHeight: 240 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.heroImageUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-4 flex flex-col gap-3">
        <Header item={item} publishedMs={publishedMs} />

        {item.tags && item.tags.length > 0 && (
          <TagRow tags={item.tags} />
        )}

        <div
          className="text-sm leading-relaxed whitespace-pre-wrap break-words"
          style={{ color: "var(--text-secondary)" }}
        >
          {item.body}
        </div>

        {item.gallery && item.gallery.length > 0 && (
          <Gallery gallery={item.gallery} />
        )}

        {((item.links && item.links.length > 0) || item.externalUrl) && (
          <LinkRow item={item} />
        )}
      </div>
    </article>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Header({ item, publishedMs }: { item: GameContent; publishedMs: number }) {
  return (
    <div>
      <h3 className="font-display font-bold text-base leading-tight" style={{ color: "var(--text-primary)" }}>
        {item.title}
      </h3>
      {item.summary && (
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          {item.summary}
        </p>
      )}
      <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
        By {item.authorName} · {timeAgoCompact(publishedMs)} ago
      </p>
    </div>
  );
}

function TagRow({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t, i) => (
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
  );
}

function Gallery({ gallery }: { gallery: string[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {gallery.map((src, i) => (
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
  );
}

function LinkRow({ item }: { item: GameContent }) {
  const externalHasLink = item.externalUrl && item.links?.some(l => l.url === item.externalUrl);
  return (
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
      {item.externalUrl && !externalHasLink && (
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
  );
}

function ImagePlaceholder({ type }: { type: GameContent["type"] }) {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <span
        className="font-display font-bold text-[10px] uppercase tracking-widest"
        style={{ color: "var(--text-muted)", opacity: 0.5 }}
      >
        {type}
      </span>
    </div>
  );
}
