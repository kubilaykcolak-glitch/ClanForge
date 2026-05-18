// Tab nav for game hubs. Takes a plain-serializable tab list (no function
// references) so the server-side layout can pass props across the
// server→client boundary without RSC-serialization surprises in prod
// builds. Active-tab highlight reacts to pathname changes via usePathname.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface TabItem {
  slug:  string;
  label: string;
  href:  string;
}

interface Props {
  gameSlug:    string;
  accentColor: string;
  tabs:        TabItem[];
}

export function GameHubTabs({ gameSlug, accentColor, tabs }: Props) {
  const pathname = usePathname();
  if (tabs.length === 0) return null;

  const hubRoot   = `/games/${gameSlug}`;
  const firstTab  = tabs[0];
  const onHubRoot = pathname === hubRoot;

  return (
    <nav
      className="mb-6 -mx-1 px-1 overflow-x-auto"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
      aria-label="Game sections"
    >
      <div className="flex gap-1 min-w-max">
        {tabs.map((t, idx) => {
          // First-tab special case: also matches the hub root URL.
          const isActive = idx === 0
            ? onHubRoot || pathname === t.href || pathname === `${hubRoot}/${firstTab.slug}`
            : pathname === t.href;

          return (
            <Link
              key={t.slug}
              href={t.href}
              className={cn(
                "inline-flex items-center px-3 py-2.5 text-sm font-medium transition-colors",
                "border-b-2 -mb-px",
              )}
              style={{
                borderBottomColor: isActive ? accentColor : "transparent",
                color:             isActive ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
