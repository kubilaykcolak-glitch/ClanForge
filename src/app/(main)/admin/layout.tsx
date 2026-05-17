import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Shield,
  LayoutDashboard,
  Trophy,
  Calendar,
  Users,
  ScrollText,
} from "lucide-react";
import { isRole, meetsRole, type Role } from "@/lib/auth/roles";

// ─── Auth guard ────────────────────────────────────────────────────────────────
//
// Admin routes require at least `moderator`. We read the role from the
// Firebase custom claim on the session JWT (authoritative); fall back to the
// legacy profiles.isAdmin field for users not yet migrated.

async function verifyAdminAccess(): Promise<Role> {
  const { adminAuth, adminDb } = await import("@/lib/firebase/admin");
  try {
    const sessionCookie = cookies().get("session")?.value;
    if (!sessionCookie) redirect("/login?from=/admin");

    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const claimRole = decoded.role;
    if (isRole(claimRole)) {
      if (!meetsRole(claimRole, "moderator")) redirect("/dashboard");
      return claimRole;
    }

    // Legacy fallback
    const snap = await adminDb.collection("profiles").doc(decoded.uid).get();
    if (snap.exists && snap.data()?.isAdmin) return "admin";
    redirect("/dashboard");
  } catch {
    redirect("/login?from=/admin");
  }
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
//
// Each nav item declares the minimum role required. Items above your tier
// are hidden, so a moderator sees only what they can act on.

interface NavItem {
  href:     string;
  icon:     React.ReactNode;
  label:    string;
  minRole:  Role;
}

const NAV: NavItem[] = [
  { href: "/admin",            icon: <LayoutDashboard size={16} />, label: "Overview",   minRole: "moderator" },
  { href: "/admin/users",      icon: <Users           size={16} />, label: "Users",      minRole: "admin"     },
  { href: "/admin/audit",      icon: <ScrollText      size={16} />, label: "Audit Log",  minRole: "admin"     },
  { href: "/admin/challenges", icon: <Trophy          size={16} />, label: "Challenges", minRole: "admin"     },
  { href: "/admin/seasons",    icon: <Calendar        size={16} />, label: "Seasons",    minRole: "admin"     },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const role = await verifyAdminAccess();

  return (
    <div className="flex gap-6 max-w-6xl mx-auto">
      {/* Sidebar */}
      <aside
        className="w-48 shrink-0 rounded-xl overflow-hidden self-start sticky top-24"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        <div
          className="flex items-center gap-2 px-4 py-4"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <Shield size={16} style={{ color: "var(--danger)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Admin
          </span>
          <span
            className="ml-auto text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              background: role === "super_admin" ? "rgba(239,68,68,0.15)" : role === "admin" ? "rgba(99,102,241,0.15)" : "rgba(34,197,94,0.15)",
              color:      role === "super_admin" ? "var(--danger)" : role === "admin" ? "var(--accent)" : "var(--success)",
              border:     "1px solid currentColor",
            }}
            title={`You are signed in as ${role}`}
          >
            {role.replace("_", " ")}
          </span>
        </div>
        <nav className="py-2">
          {NAV.filter(n => meetsRole(role, n.minRole)).map(({ href, icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              {icon}
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
