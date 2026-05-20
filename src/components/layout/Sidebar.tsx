"use client";

import Image from "next/image";
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
  ScrollText,
  Plug,
  Calendar,
  ArrowLeft,
  Gamepad2,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials, clamp } from "@/lib/utils";
import { getClanBorderStyle } from "@/lib/clan-levels";
import type { Profile } from "@/types";
import { meetsRole, type Role } from "@/lib/auth/roles";
import { listGameMeta } from "@/lib/games/meta";

interface SidebarProps {
  profile:         Profile | null;
  isAuthenticated: boolean;
  /** Role from the verified JWT claim (server-supplied). Null for regular
   * users; "moderator" | "admin" | "super_admin" for elevated. When non-null
   * the sidebar shows a discreet "Admin mode" toggle that swaps the nav
   * between user-mode and admin-mode views.
   *
   * SECURITY: this prop is server-supplied from the verified session cookie
   * — clients cannot inject or elevate it. Even if a non-admin somehow got
   * userRole !== null and clicked the toggle, every /admin/* route runs its
   * OWN role check in the admin layout (verifyAdminAccess), and every
   * privileged server action calls requireRole(). The sidebar toggle is
   * purely a UI affordance, not a security gate. */
  userRole?:       Role | null;
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

// ── Games dropdown (sidebar group) ────────────────────────────────────────────
// Renders "Games" as a collapsible group. Auto-expands while the user is on
// a /games/* route so the active game is visible without an extra click.
// Sub-items are static — sourced from the registry, so adding a game adds a
// row here for free.

function GamesNavGroup({
  pathname,
  onNavigate,
}: {
  pathname:   string;
  onNavigate?: () => void;
}) {
  const games   = listGameMeta();
  const onAnyGame = pathname === "/games" || pathname.startsWith("/games/");
  // Default open when in the games area; closed otherwise. Local state lets
  // the user manually collapse/expand independent of route.
  const [open, setOpen] = useState<boolean>(onAnyGame);

  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
        )}
        style={
          onAnyGame
            ? { background: "rgba(99,102,241,0.10)", color: "var(--accent)" }
            : { color: "var(--text-secondary)" }
        }
        onMouseEnter={e => {
          if (!onAnyGame) {
            e.currentTarget.style.background = "var(--bg-elevated)";
            e.currentTarget.style.color      = "var(--text-primary)";
          }
        }}
        onMouseLeave={e => {
          if (!onAnyGame) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color      = "var(--text-secondary)";
          }
        }}
        aria-expanded={open}
      >
        <Gamepad2 size={18} />
        <span className="flex-1 text-left">Games</span>
        <ChevronRight
          size={14}
          style={{
            transform:  open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 150ms",
          }}
        />
      </button>

      {open && (
        <div className="ml-3 mt-0.5 pl-3 flex flex-col gap-0.5" style={{ borderLeft: "1px solid var(--border-subtle)" }}>
          {games.map(g => {
            const href     = `/games/${g.slug}`;
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={g.slug}
                href={href}
                onClick={onNavigate}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all duration-150"
                style={
                  isActive
                    ? { background: "rgba(99,102,241,0.10)", color: "var(--accent)" }
                    : { color: "var(--text-muted)" }
                }
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = "var(--bg-elevated)";
                    e.currentTarget.style.color      = "var(--text-primary)";
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color      = "var(--text-muted)";
                  }
                }}
              >
                {/* Game mark — preference ladder:
                      1. logoIconSrc — square brand mark (e.g. LoL's
                         iconic "L"). Reads best at sidebar scale.
                      2. logoSrc — wide wordmark, fitted to a 28×20 tile.
                      3. Coloured shortName tile fallback for any future
                         game that hasn't shipped art yet. */}
                {g.logoIconSrc ? (
                  // Square slot for tall/square icon marks (e.g. LoL "L"),
                  // wider slot for wordmark-shaped marks (e.g. AR's stripes
                  // + "ARC Raiders" lockup). Both render via object-contain
                  // so the original aspect ratio is preserved.
                  <span
                    className={`relative h-5 shrink-0 flex items-center justify-center ${
                      g.slug === "arc-raiders" ? "w-9" : "w-5"
                    }`}
                    aria-hidden
                  >
                    <Image
                      src={g.logoIconSrc}
                      alt=""
                      width={120}
                      height={40}
                      unoptimized
                      style={{
                        height:    "100%",
                        width:     "auto",
                        maxWidth:  "100%",
                        objectFit: "contain",
                      }}
                    />
                  </span>
                ) : g.logoSrc ? (
                  <span
                    className="relative w-7 h-5 shrink-0 flex items-center justify-start"
                    aria-hidden
                  >
                    <Image
                      src={g.logoSrc}
                      alt=""
                      width={120}
                      height={32}
                      unoptimized
                      style={{
                        height:         "100%",
                        width:          "auto",
                        maxWidth:       "100%",
                        objectFit:      "contain",
                        objectPosition: "left center",
                      }}
                    />
                  </span>
                ) : (
                  <span
                    className="w-5 h-5 rounded flex items-center justify-center font-display font-bold text-[10px] text-white shrink-0"
                    style={{ background: g.accentColor }}
                    aria-hidden
                  >
                    {g.shortName[0]}
                  </span>
                )}
                <span className="truncate">{g.name}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Shared sidebar body ───────────────────────────────────────────────────────

function SidebarBody({
  profile,
  isAuthenticated,
  userRole,
  onNavigate,
}: {
  profile:         Profile | null;
  isAuthenticated: boolean;
  userRole?:       Role | null;
  onNavigate?:     () => void;
}) {
  const pathname = usePathname();

  // Are we currently inside the admin area? Determines whether the toggle
  // points "into" or "back out of" admin mode, and which nav we render.
  const inAdminMode = pathname.startsWith("/admin");

  // Defence-in-depth: even if a stale or forged prop somehow set userRole on
  // a non-admin client, this client-side check still gates the toggle's
  // visibility. The authoritative check is on the admin route itself.
  const canSeeAdminToggle = isAuthenticated && meetsRole(userRole ?? null, "moderator");

  // User-mode nav (the default).
  const userNavItems: NavItem[] = [
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

  // Admin-mode nav. Filtered server-side via the admin layout's role check
  // anyway, but we also tier-gate here so a moderator doesn't see admin-only
  // links they can't action.
  const adminNavItems: NavItem[] = [
    { href: "/admin",              label: "Overview",     icon: <LayoutDashboard size={18} /> },
    ...(meetsRole(userRole ?? null, "admin") ? [
      { href: "/admin/users",        label: "Users",        icon: <Users      size={18} /> },
      { href: "/admin/tournaments",  label: "Tournaments",  icon: <Trophy     size={18} /> },
      { href: "/admin/integrations", label: "Integrations", icon: <Plug       size={18} /> },
      { href: "/admin/audit",        label: "Audit Log",    icon: <ScrollText size={18} /> },
      { href: "/admin/challenges",   label: "Challenges",   icon: <Trophy     size={18} /> },
      { href: "/admin/seasons",      label: "Seasons",      icon: <Calendar   size={18} /> },
    ] : []),
  ];

  const navItems = inAdminMode ? adminNavItems : userNavItems;

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
        {!inAdminMode && (
          <GamesNavGroup pathname={pathname} onNavigate={onNavigate} />
        )}
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

      {/* ── Admin mode toggle (role-gated) ────────────────────────────────
          Only rendered when the SERVER-supplied userRole is at least
          moderator. The pathname-based variant just decides which label
          + destination to show — "Admin mode" → /admin, or "Back to user
          view" → /dashboard. */}
      {canSeeAdminToggle && (
        <div className="mt-2 pt-2" style={{ borderTop: "1px dashed var(--border-subtle)" }}>
          {inAdminMode ? (
            <Link
              href="/dashboard"
              onClick={onNavigate}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
              style={{ color: "var(--text-secondary)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-elevated)"; e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent";         e.currentTarget.style.color = "var(--text-secondary)"; }}
            >
              <ArrowLeft size={16} />
              <span className="flex-1">Back to user view</span>
            </Link>
          ) : (
            <Link
              href="/admin"
              onClick={onNavigate}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.08)"; e.currentTarget.style.color = "var(--danger)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent";          e.currentTarget.style.color = "var(--text-muted)"; }}
              title={`Switch to admin view (you are signed in as ${userRole})`}
            >
              <Shield size={16} />
              <span className="flex-1">Admin mode</span>
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  background: userRole === "super_admin" ? "rgba(239,68,68,0.15)"
                    : userRole === "admin" ? "rgba(99,102,241,0.15)"
                    : "rgba(34,197,94,0.15)",
                  color: userRole === "super_admin" ? "var(--danger)"
                    : userRole === "admin" ? "var(--accent)"
                    : "var(--success)",
                  border: "1px solid currentColor",
                }}
              >
                {(userRole ?? "").replace("_", " ")}
              </span>
            </Link>
          )}
        </div>
      )}

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

export function Sidebar({ profile, isAuthenticated, userRole }: SidebarProps) {
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
        <SidebarBody profile={profile} isAuthenticated={isAuthenticated} userRole={userRole} />
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
              userRole={userRole}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </>
      )}
    </>
  );
}
