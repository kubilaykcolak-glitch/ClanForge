// Tab nav for game hubs. Renders only `live` sections (hidden sections are
// pre-registered but invisible until their feature ships). Client component
// purely so the active-tab highlight reacts to pathname changes without a
// full reload.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { GameDefinition } from "@/lib/games/types";

interface Props {
  game: GameDefinition;
}

export function GameHubTabs({ game }: Props) {
  const pathname = usePathname();
  const liveSections = game.sections.filter(s => s.status === "live");

  return (
    <nav
      className="mb-6 -mx-1 px-1 overflow-x-auto"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
      aria-label={`${game.name} sections`}
    >
      <div className="flex gap-1 min-w-max">
        {liveSections.map((s, idx) => {
          // First section is the default — also matches the hub root URL.
          const sectionHref = idx === 0
            ? `/games/${game.slug}`
            : `/games/${game.slug}/${s.slug}`;

          const isActive = idx === 0
            ? pathname === `/games/${game.slug}` || pathname === `/games/${game.slug}/${s.slug}`
            : pathname === sectionHref;

          return (
            <Link
              key={s.slug}
              href={sectionHref}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors",
                "border-b-2 -mb-px",
              )}
              style={{
                borderBottomColor: isActive ? game.accentColor : "transparent",
                color:             isActive ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              <s.icon size={14} />
              {s.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
