"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, ChevronDown, LogOut, User, Shield, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/utils";
import type { Profile } from "@/types";
import { NotificationBell } from "@/components/layout/NotificationBell";

interface NavbarProps {
  profile: Profile | null;
  isAuthenticated?: boolean;
  uid?: string | null;
}

const NAV_LINKS_GUEST = [
  { href: "/",             label: "Home"        },
  { href: "/clans",        label: "Clans"       },
  { href: "/tournaments",  label: "Tournaments" },
  { href: "/leaderboard",  label: "Leaderboard" },
];

const NAV_LINKS_AUTH = [
  { href: "/dashboard",    label: "Home"        },
  { href: "/clans",        label: "Clans"       },
  { href: "/tournaments",  label: "Tournaments" },
  { href: "/leaderboard",  label: "Leaderboard" },
];

async function handleSignOut() {
  await fetch("/api/auth/session", { method: "DELETE" });
  window.location.href = "/";
}

export function Navbar({ profile, isAuthenticated = false, uid }: NavbarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center px-4 md:px-6"
        style={{
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border-subtle)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* ── Logo ── */}
        <Link href={isAuthenticated ? "/dashboard" : "/"} className="flex items-center gap-2.5 mr-8 shrink-0">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ background: "var(--accent)" }}
          >
            CF
          </div>
          <span
            className="font-display font-semibold tracking-wide hidden sm:block"
            style={{ fontSize: 20, color: "var(--text-primary)" }}
          >
            ClanForge
          </span>
        </Link>

        {/* ── Centre nav (desktop) ── */}
        <div className="hidden md:flex items-center gap-1 flex-1">
          {(isAuthenticated ? NAV_LINKS_AUTH : NAV_LINKS_GUEST).map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150",
                  active
                    ? "text-accent"
                    : "text-secondary hover:text-primary"
                )}
                style={active ? { color: "var(--accent)" } : undefined}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* ── Right section ── */}
        <div className="ml-auto flex items-center gap-3">
          {isAuthenticated && uid && <NotificationBell uid={uid} />}
          {/* Authenticated but no profile yet (e.g. Google sign-in pending onboarding) */}
          {isAuthenticated && !profile && (
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
            >
              <LogOut size={15} />
              Sign Out
            </button>
          )}
          {!isAuthenticated && profile === null ? (
            <>
              <Link
                href="/login"
                className="hidden sm:inline-flex px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ color: "var(--text-secondary)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--text-primary)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-secondary)")}
              >
                Log In
              </Link>
              <Link
                href="/register"
                className="inline-flex px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-150"
                style={{ background: "var(--accent)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "var(--accent)")}
              >
                Sign Up
              </Link>
            </>
          ) : (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(o => !o)}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors"
                style={{ color: "var(--text-primary)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-elevated)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white overflow-hidden shrink-0"
                  style={{ background: "var(--accent)" }}
                >
                  {profile?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatarUrl} alt={profile.username} className="w-full h-full object-cover" />
                  ) : (
                    profile ? getInitials(profile.displayName) : "?"
                  )}
                </div>
                <span className="hidden sm:block text-sm font-medium">{profile?.username ?? "Account"}</span>
                <ChevronDown size={14} className="hidden sm:block opacity-50" />
              </button>

              {/* Dropdown */}
              {dropdownOpen && (
                <>
                  {/* Backdrop */}
                  <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                  <div
                    className="absolute right-0 top-full mt-2 w-52 rounded-xl overflow-hidden shadow-xl z-20"
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-default)",
                    }}
                  >
                    <DropdownLink
                      // Pre-onboarding users have no username yet — sending
                      // them to /profile/me would 404. Mirror the Sidebar
                      // and route them to the onboarding flow until they
                      // pick a handle (audit finding L3).
                      href={profile?.username ? `/profile/${profile.username}` : "/dashboard/onboarding"}
                      icon={<User size={15} />}
                      label="My Profile"
                      onClick={() => setDropdownOpen(false)}
                    />
                    <DropdownLink
                      href="/clans"
                      icon={<Shield size={15} />}
                      label="My Clan"
                      onClick={() => setDropdownOpen(false)}
                    />
                    <DropdownLink
                      href="/profile/edit"
                      icon={<Settings size={15} />}
                      label="Settings"
                      onClick={() => setDropdownOpen(false)}
                    />
                    <div style={{ borderTop: "1px solid var(--border-subtle)" }} className="my-1" />
                    <button
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                      style={{ color: "var(--danger)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <LogOut size={15} />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {/* End isAuthenticated block (renders nothing if already handled above) */}

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onClick={() => setMobileOpen(o => !o)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* ── Mobile nav drawer ── */}
      {mobileOpen && (
        <div
          className="fixed top-16 left-0 right-0 z-40 md:hidden py-3 px-4 flex flex-col gap-1"
          style={{
            background: "var(--bg-surface)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          {(isAuthenticated ? NAV_LINKS_AUTH : NAV_LINKS_GUEST).map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active ? "text-accent" : "text-secondary"
                )}
                style={active ? { color: "var(--accent)", background: "rgba(99,102,241,0.08)" } : undefined}
              >
                {label}
              </Link>
            );
          })}
          {!profile && (
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="px-4 py-2.5 rounded-lg text-sm font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Log In
            </Link>
          )}
        </div>
      )}
    </>
  );
}

// ── Small internal helper ────────────────────────────────────────────────────

function DropdownLink({
  href, icon, label, onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
      style={{ color: "var(--text-secondary)" }}
      onMouseEnter={e => {
        e.currentTarget.style.background = "var(--bg-overlay)";
        e.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--text-secondary)";
      }}
    >
      {icon}
      {label}
    </Link>
  );
}
