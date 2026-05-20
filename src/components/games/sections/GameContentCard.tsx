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
import { ExternalLink, Hammer, ArrowUpRight } from "lucide-react";
import { timeAgoCompact } from "@/lib/riot/assets";
import type { GameContent, ItemMaterial } from "@/types/game-content";

void Link; // reserved — future deep-link to per-entry permalink

export function GameContentCard({ item }: { item: GameContent }) {
  const publishedMs = (item.publishedAt ?? item.updatedAt).getTime();
  const isSideBySide = item.type === "items" || item.type === "locations";

  if (isSideBySide) {
    return (
      <article
        id={`content-${item.slug}`}
        className="rounded-xl overflow-hidden scroll-mt-24 flex items-start"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
      >
        {/*
          Image rail.
          - Items are transparent PNG weapons/gear from the wiki with varied
            aspect ratios — use object-contain on a fixed square so the whole
            item is visible (no zoom/crop) and rail height doesn't follow the
            tall info column.
          - Locations are landscape screenshots — object-cover on a wider box
            looks correct.
        */}
        <div
          className={`shrink-0 overflow-hidden flex items-center justify-center ${
            item.type === "items"
              ? "w-24 sm:w-28 aspect-square p-2"
              : "w-40 sm:w-56 aspect-square p-2"
          }`}
          style={{ background: "var(--bg-overlay)" }}
        >
          {item.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.heroImageUrl}
              alt=""
              className="max-w-full max-h-full object-contain"
            />
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

          {item.stats && item.stats.length > 0 && (
            <StatsGrid stats={item.stats} />
          )}

          {item.crafting && (
            <CraftingBlock crafting={item.crafting} />
          )}

          {item.upgrades && item.upgrades.length > 0 && (
            <UpgradesTable upgrades={item.upgrades} />
          )}

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

function StatsGrid({ stats }: { stats: { label: string; value: string }[] }) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
    >
      <div
        className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
        style={{
          background: "rgba(99,102,241,0.10)",
          color:      "var(--accent)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        Stats
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 px-2.5 py-2 text-xs">
        {stats.map((s, i) => (
          <div key={`${s.label}-${i}`} className="flex items-baseline justify-between">
            <dt style={{ color: "var(--text-muted)" }}>{s.label}</dt>
            <dd className="font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function MaterialList({ materials }: { materials: ItemMaterial[] }) {
  if (materials.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
      {materials.map((m, i) => (
        <li key={`${m.name}-${i}`} className="tabular-nums">
          <span style={{ color: "var(--text-primary)" }}>{m.qty}×</span>{" "}
          <span>{m.name}</span>
        </li>
      ))}
    </ul>
  );
}

function CraftingBlock({
  crafting,
}: {
  crafting: NonNullable<GameContent["crafting"]>;
}) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
    >
      <div
        className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5"
        style={{
          background: "rgba(99,102,241,0.10)",
          color:      "var(--accent)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <Hammer size={10} />
        Crafting
        {crafting.station && (
          <span className="ml-auto normal-case font-normal" style={{ color: "var(--text-muted)" }}>
            {crafting.station}
          </span>
        )}
      </div>
      <div className="px-2.5 py-2 flex flex-col gap-1">
        <MaterialList materials={crafting.materials} />
        {(crafting.result || crafting.blueprint) && (
          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {crafting.result && <>Produces <strong style={{ color: "var(--text-secondary)" }}>{crafting.result}</strong></>}
            {crafting.result && crafting.blueprint && " · "}
            {crafting.blueprint && <>Blueprint required</>}
          </p>
        )}
      </div>
    </div>
  );
}

function UpgradesTable({
  upgrades,
}: {
  upgrades: NonNullable<GameContent["upgrades"]>;
}) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
    >
      <div
        className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5"
        style={{
          background: "rgba(99,102,241,0.10)",
          color:      "var(--accent)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <ArrowUpRight size={10} />
        Upgrades
      </div>
      <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
        {upgrades.map((tier, i) => (
          <div
            key={`${tier.label}-${i}`}
            className="px-2.5 py-2 flex flex-col gap-1"
            style={{ borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-[10px] font-bold uppercase tracking-wider tabular-nums"
                style={{ color: "var(--text-secondary)" }}
              >
                {tier.label}
              </span>
            </div>
            <MaterialList materials={tier.materials} />
            {tier.perks && tier.perks.length > 0 && (
              <ul className="text-[10px] mt-0.5 list-disc list-inside" style={{ color: "var(--text-muted)" }}>
                {tier.perks.map((p, j) => (
                  <li key={j}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
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

/**
 * Link row. For locations, the first link whose label matches an interactive-
 * map pattern is promoted to a primary CTA button — community sites maintain
 * up-to-date interactive maps better than we could clone, so we surface them
 * prominently rather than embedding our own.
 */
function LinkRow({ item }: { item: GameContent }) {
  const externalHasLink = item.externalUrl && item.links?.some(l => l.url === item.externalUrl);
  const isLocation = item.type === "locations";

  // Detect a "primary" map link by label keywords.
  const primaryIdx = isLocation
    ? (item.links ?? []).findIndex(l => /interactive map|hub|arcmap/i.test(l.label))
    : -1;
  const primary = primaryIdx >= 0 ? item.links![primaryIdx] : null;
  const secondary = (item.links ?? []).filter((_, i) => i !== primaryIdx);

  return (
    <div className="flex flex-wrap gap-2 pt-1 items-center">
      {primary && (
        <a
          href={primary.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-md"
          style={{
            background: "var(--accent)",
            color:      "white",
            border:     "1px solid var(--accent)",
          }}
        >
          <ExternalLink size={13} />
          Open interactive map
        </a>
      )}
      {secondary.map((link, i) => (
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
