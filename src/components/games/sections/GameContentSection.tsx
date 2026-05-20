// ─── Generic game-content section ────────────────────────────────────────────
//
// Renders the published entries for a given (gameSlug, contentType) pair as
// expandable cards. List-only experience — no separate detail route — so the
// hub stays single-page and the data has one canonical surface.

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { listPublishedContent } from "@/lib/actions/game-content.actions";
import {
  CONTENT_TYPE_LABELS,
  type GameContentType,
} from "@/types/game-content";
import { GameContentCard } from "./GameContentCard";
import type { GameSlug } from "@/lib/games/types";

export async function GameContentSection({
  gameSlug,
  type,
}: {
  gameSlug: GameSlug;
  type:     GameContentType;
}) {
  const items = await listPublishedContent(gameSlug, type);
  const label = CONTENT_TYPE_LABELS[type];

  if (items.length === 0) {
    return (
      <div
        className="rounded-2xl p-10 text-center"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
      >
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          No {label.plural.toLowerCase()} have been published yet.
        </p>
        <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
          Admins can author content at{" "}
          <Link href="/admin/game-content" className="underline" style={{ color: "var(--accent)" }}>
            /admin/game-content
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      {items.map(item => (
        <GameContentCard key={item.id} item={item} />
      ))}
      {gameSlug === "arc-raiders" && <ArcRaidersAttribution />}
    </section>
  );
}

// ─── Arc Raiders attribution / CC notice ─────────────────────────────────────
//
// Displayed once at the bottom of every Arc Raiders content tab. Required
// because the Items and Locations sections hotlink images + structured data
// from the community wiki (CC BY-SA) and reference Embark's trademarks. We
// don't claim ownership and we direct readers back to the source.

function ArcRaidersAttribution() {
  return (
    <footer
      className="rounded-xl p-3 text-[10px] leading-relaxed mt-4"
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-subtle)",
        color:      "var(--text-muted)",
      }}
    >
      <p>
        All game content and materials are copyright of Embark Studios AB.
        ARC RAIDERS and EMBARK trademarks and logos are trademarks or
        registered trademarks of Embark Studios AB. Other content sourced
        from the{" "}
        <a
          href="https://arcraiders.wiki"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--accent)" }}
        >
          ARC Raiders community wiki
        </a>{" "}
        and made available under{" "}
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--accent)" }}
        >
          Creative Commons Attribution-ShareAlike
        </a>{" "}
        unless otherwise noted.
      </p>
    </footer>
  );
}

void ExternalLink; // unused — actual icon lives in GameContentCard
