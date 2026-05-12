"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  User,
  Shield,
  Trophy,
  Users,
  Settings,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials, clamp } from "@/lib/utils";
import type { Profile } from "@/types";

interface SidebarProps {
  profile: Profile | null;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
  /** Override the "Soon" badge text for comingSoon items. */
  comingSoonLabel?: string;
}

function getLevel(xp: number) {
  const level = Math.floor(xp / 1000) + 1;
  const progress = clamp((xp % 1000) / 10, 0, 100);
  return { level, progress };
}

export function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname();

  const navItems: NavItem[] = [
    { href: "/dashboard",   label: "Dashboard",    icon: <LayoutDashboard size={18} /> },
    { href: profile?.username ? `/profile/${profile.username}` : "/dashboard/onboarding", label: "My Profile", icon: <User size={18} /> },
    { href: "/clans",       label: "My Clan",       icon: <Shield size={18} /> },
    { href: "/tournaments", label: "Tournaments",   icon: <Trophy size={18} /> },
    { href: "/players",          label: "Find Players",    icon: <Users size={18} /> },
    // SNIPPET D: Clan Challenges — Phase 2 placeholder, non-clickable
    { href: "/clan-challenges",  label: "Clan Challenges", icon: <Shield size={18} />, comingSoon: true, comingSoonLabel: "Phase 2" },
    { href: "/lfg",              label: "LFG Board",       icon: <MessageSquare size={18} />, comingSoon: true },
  ];

  const { level, progress } = profile ? getLevel(profile.xp) : { level: 1, progress: 0 };

  return (
    <aside
      className="hidden md:flex flex-col w-60 shrink-0 h-screen sticky top-0 pt-16"
      style={{
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex flex-col flex-1 overflow-y-auto py-4 px-3">

        {/* ── Mini profile card ── */}
        {profile && (
          <div
            className="mb-4 p-3 rounded-xl"
            style={{ background: "var(--bg-elevated)" }}
          >
            <div className="flex items-center gap-3 mb-3">
              {/* Avatar */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold text-white overflow-hidden shrink-0"
                style={{ background: "var(--accent)" }}
              >
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatarUrl} alt={profile.username} className="w-full h-full object-cover" />
                ) : (
                  getInitials(profile.displayName)
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                  {profile.displayName}
                </p>
                <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                  @{profile.username}
                </p>
              </div>
            </div>

            {/* XP bar */}
            <div>
              <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
                <span>Level {level}</span>
                <span>{profile.xp % 1000} / 1000 XP</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-overlay)" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progress}%`, background: "var(--accent)" }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Nav links ── */}
        <nav className="flex flex-col gap-0.5 flex-1">
          {navItems.map(({ href, label, icon, comingSoon, comingSoonLabel }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));

            if (comingSoon) {
              return (
                <div
                  key={href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-not-allowed"
                  style={{ color: "var(--text-muted)" }}
                >
                  {icon}
                  <span className="text-sm font-medium flex-1">{label}</span>
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{
                      background: "var(--bg-overlay)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {comingSoonLabel ?? "Soon"}
                  </span>
                </div>
              );
            }

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
                )}
                style={
                  active
                    ? {
                        background: "rgba(99,102,241,0.10)",
                        color: "var(--accent)",
                      }
                    : { color: "var(--text-secondary)" }
                }
                onMouseEnter={e => {
                  if (!active) {
                    e.currentTarget.style.background = "var(--bg-elevated)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }
                }}
              >
                {icon}
                <span className="flex-1">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* ── Bottom: Settings ── */}
        <div
          className="mt-4 pt-4"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <Link
            href="/profile/edit"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "var(--bg-elevated)";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <Settings size={18} />
            Settings
          </Link>
        </div>
      </div>
    </aside>
  );
}
