import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Shield, LayoutDashboard, Trophy, Calendar } from "lucide-react";

// ── Auth guard ────────────────────────────────────────────────────────────────

async function verifyAdmin(): Promise<string> {
  const { adminAuth, adminDb } = await import("@/lib/firebase/admin");
  try {
    const sessionCookie = cookies().get("session")?.value;
    if (!sessionCookie) redirect("/login?from=/admin");
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const snap = await adminDb.collection("profiles").doc(decoded.uid).get();
    if (!snap.exists || !snap.data()?.isAdmin) redirect("/dashboard");
    return decoded.uid;
  } catch {
    redirect("/login?from=/admin");
  }
}

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV = [
  { href: "/admin",            icon: <LayoutDashboard size={16} />, label: "Overview"   },
  { href: "/admin/challenges", icon: <Trophy          size={16} />, label: "Challenges" },
  { href: "/admin/seasons",    icon: <Calendar        size={16} />, label: "Seasons"    },
];

// ── Layout ────────────────────────────────────────────────────────────────────

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await verifyAdmin();

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
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Admin</span>
        </div>
        <nav className="py-2">
          {NAV.map(({ href, icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
              style={{ color: "var(--text-secondary)" }}
              onMouseEnter={undefined} // handled via Tailwind in a real app
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
