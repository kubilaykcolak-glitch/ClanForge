import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { isRole, meetsRole, type Role } from "@/lib/auth/roles";

// ─── Auth guard ───────────────────────────────────────────────────────────────
//
// Authoritative role check for every /admin/* route. Runs server-side at
// render time so a non-admin can never reach these pages even if they craft
// the URL manually or bypass the sidebar toggle. We read the role straight
// from the verified session-cookie JWT claim (tamper-proof, signed); fall
// back to the legacy profiles.isAdmin field during the migration window.
//
// This redirects rather than 403'ing so a user who hit the route while their
// session is stale lands somewhere useful instead of an error page.

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

    // Legacy fallback for users not yet migrated to custom claims.
    const snap = await adminDb.collection("profiles").doc(decoded.uid).get();
    if (snap.exists && snap.data()?.isAdmin) return "admin";
    redirect("/dashboard");
  } catch {
    redirect("/login?from=/admin");
  }
}

// ─── Layout ───────────────────────────────────────────────────────────────────
//
// The admin nav has been absorbed into the main app sidebar — when you click
// "Admin mode" there, the sidebar swaps to the admin nav and a "Back to user
// view" link replaces it. The admin pages now just need a thin context
// indicator at the top of the content area so the admin user knows they're
// in an elevated context.

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const role = await verifyAdminAccess();

  return (
    <div className="max-w-6xl mx-auto">
      {/* Context banner — visible only on /admin/*. Reminder of what tier
          they're operating at, with a colour matching the tier. */}
      <div
        className="flex items-center gap-2 px-4 py-2 mb-6 rounded-lg"
        style={{
          background: role === "super_admin"
            ? "rgba(239,68,68,0.06)"
            : role === "admin"
              ? "rgba(99,102,241,0.06)"
              : "rgba(34,197,94,0.06)",
          border: `1px solid ${
            role === "super_admin" ? "rgba(239,68,68,0.30)"
              : role === "admin"   ? "rgba(99,102,241,0.30)"
              : "rgba(34,197,94,0.30)"
          }`,
        }}
      >
        <Shield
          size={14}
          style={{
            color: role === "super_admin"
              ? "var(--danger)"
              : role === "admin"
                ? "var(--accent)"
                : "var(--success)",
          }}
        />
        <span className="text-xs font-semibold uppercase tracking-wider"
          style={{
            color: role === "super_admin"
              ? "var(--danger)"
              : role === "admin"
                ? "var(--accent)"
                : "var(--success)",
          }}
        >
          Admin mode — {role.replace("_", " ")}
        </span>
        <span className="ml-auto text-[11px]" style={{ color: "var(--text-muted)" }}>
          Every action you take here is logged.
        </span>
      </div>

      {children}
    </div>
  );
}
