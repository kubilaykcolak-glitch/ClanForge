"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  User,
  Shield,
  Trophy,
  Users,
  Settings,
  MessageSquare,
  Menu,
  X,
  LogOut,
  LogIn,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials, clamp } from "@/lib/utils";
import { getClanBorderStyle } from "@/lib/clan-levels";
import type { Profile } from "@/types";

interface SidebarProps {
  profile:         Profile | null;
  isAuthenticated: boolean;
}

interface NavItem {
  href:              string;
  label:             string;
  icon:              React.ReactNode;
  /** Override the path prefix used for the active highlight. */
  activePrefix?:     string;
  comingSoon?:       boolean;
  comingSoonLabel?:  string;
}

function getLevel(xp: number) {
  const level    = Math.floor(xp / 1000) + 1;
  const progress = clamp((xp % 1000) / 10, 0, 100);
  return { level, progress };
}

async function handleSignOut() {
  await fetch("/api/auth/session", { method: "DELETE" });
  window.location.href = "/";
}

// ── Shared sidebar body ───────────────────────────────────────────────────────

function SidebarBody({
  profile,
  isAuthenticated,
  onNavigate,
}: {
  profile:         Profile | null;
  isAuthenticated: boolean;
  onNavigate?:     () => void;
}) {
  const pathname = usePathname();

  const navItems: NavItem[] = [
    { href: "/dashboard",   label: "Dashboard",    icon: <LayoutDashboard size={18} /> },
    { href: profile?.username ? `/profile/${profile.username}` : "/dashboard/onboarding", label: "My Profile", icon: <User size={18} /> },
    {
      href:         profile?.clanSlug ? `/clans/${profile.clanSlug}` : "/clans",
      label:        "My Clan",
      icon:         <Shield size={18} />,
      activePrefix: "/clans",
    },
    { href: "/tournaments", label: "Tournaments",   icon: <Trophy size={18} /> },
    { href: "/players",     label: "Find Players",  icon: <Users size={18} /> },
    { href: "/leaderboard", label: "Leaderboard",   icon: <Trophy size={18} /> },
    { href: "/lfg",         label: "LFG Board",     icon: <MessageSquare size={18} />, comingSoon: true },
  ];

  const { level, progress } = profile ? getLevel(profile.xp) : { level: 1, progress: 0 };

  return (
    <div className="flex flex-col flex-1 overflow-y-auto py-4 px-3">

      {/* ── Logo ── */}
      <Link
        href={isAuthenticated ? "/dashboard" : "/"}
        onClick={onNavigate}
        className="flex items-center gap-2.5 px-1 mb-5"
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
          style={{ background: "var(--accent)" }}
        >
          CF
        </div>
        <span
          className="font-display font-semibold tracking-wide"
          style={{ fontSize: 18, color: "var(--text-primary)" }}
        >
          ClanForge
        </span>
      </Link>

      {/* ── Mini profile card ── */}
      {profile && (
        <div
          className="mb-4 p-3 rounded-xl"
          style={{ background: "var(--bg-elevated)" }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold text-white overflow-hidden shrink-0"
              style={{ background: "var(--accent)", ...getClanBorderStyle(profile.clanBorder) }}
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
        {navItems.map(({ href, label, icon, activePrefix, comingSoon, comingSoonLabel }) => {
          const checkPrefix = activePrefix ?? href;
          const active = pathname === href || (checkPrefix !== "/" && pathname.startsWith(checkPrefix));

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
                  style={{ background: "var(--bg-overlay)", color: "var(--text-muted)" }}
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
              onClick={onNavigate}
              className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150")}
              style={
                active
                  ? { background: "rgba(99,102,241,0.10)", color: "var(--accent)" }
                  : { color: "var(--text-secondary)" }
              }
              onMouseEnter={e => {
                if (!active) {
                  e.currentTarget.style.background = "var(--bg-elevated)";
                  e.currentTarget.style.color      = "var(--text-primary)";
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color      = "var(--text-secondary)";
                }
              }}
            >
              {icon}
              <span className="flex-1">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* ── Bottom section ── */}
      <div
        className="mt-4 pt-4 flex flex-col gap-0.5"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        {isAuthenticated ? (
          <>
            <Link
              href="/settings"
              onClick={onNavigate}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-elevated)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent";         e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              <Settings size={18} />
              Settings
            </Link>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 w-full text-left"
              style={{ color: "var(--danger)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.08)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </>
        ) : (
          <>
            <Link
              href="/login"
              onClick={onNavigate}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
              style={{ color: "var(--text-secondary)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-elevated)"; e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent";         e.currentTarget.style.color = "var(--text-secondary)"; }}
            >
              <LogIn size={18} />
              Log In
            </Link>
            <Link
              href="/register"
              onClick={onNavigate}
              className="arena-cta mx-3"
            >
              <UserPlus size={16} />
              Sign Up
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Sidebar({ profile, isAuthenticated }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* ── Mobile: hamburger button (top-left, fixed) ── */}
      <button
        className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-lg transition-colors"
        style={{
          background: "var(--bg-surface)",
          border:     "1px solid var(--border-subtle)",
          color:      "var(--text-secondary)",
        }}
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* ── Desktop sidebar ── */}
      <aside
        className="hidden md:flex flex-col w-60 shrink-0 h-screen sticky top-0"
        style={{
          background:  "var(--bg-surface)",
          borderRight: "1px solid var(--border-subtle)",
        }}
      >
        <SidebarBody profile={profile} isAuthenticated={isAuthenticated} />
      </aside>

      {/* ── Mobile sidebar overlay ── */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 md:hidden"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
            onClick={() => setMobileOpen(false)}
          />

          {/* Drawer */}
          <aside
            className="fixed left-0 top-0 h-screen w-72 z-50 md:hidden flex flex-col"
            style={{
              background:  "var(--bg-surface)",
              borderRight: "1px solid var(--border-subtle)",
            }}
          >
            {/* Close button */}
            <button
              className="absolute top-3 right-3 p-2 rounded-lg transition-colors"
              style={{ color: "var(--text-muted)" }}
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-elevated)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              <X size={18} />
            </button>

            <SidebarBody
              profile={profile}
              isAuthenticated={isAuthenticated}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </>
      )}
    </>
  );
}
