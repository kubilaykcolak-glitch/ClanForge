// ─── Client-side claims refresh helper ───────────────────────────────────────
//
// Convenience for the "I just got a role grant but the UI doesn't reflect it"
// case. Forces a fresh ID token from Firebase, posts it to the server, and
// reloads the page so server components re-render with the new claims.
//
// Usage from any client component:
//   import { refreshSessionClaims } from "@/lib/auth/refresh-claims-client";
//   await refreshSessionClaims();
//
// Or invoke once from the browser console after a role change:
//   (await import("/_next/static/.../refresh-claims-client.js")).refreshSessionClaims()
// (path varies; easier to add a UI button or just call from a dev page).

"use client";

import { auth } from "@/lib/firebase/client";

export async function refreshSessionClaims(): Promise<{ success: boolean; role: string | null; error?: string }> {
  const user = auth.currentUser;
  if (!user) return { success: false, role: null, error: "Not signed in" };

  // Force-refresh the ID token. Without `true`, Firebase returns the cached
  // token (up to 1h old) which still has the stale claims.
  const idToken = await user.getIdToken(true);

  const res = await fetch("/api/auth/refresh-claims", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ idToken }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    return { success: false, role: null, error: body?.error ?? "Refresh failed" };
  }

  const body = await res.json() as { role: string | null };
  return { success: true, role: body.role };
}
