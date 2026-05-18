// ─── /api/auth/refresh-claims ─────────────────────────────────────────────────
//
// Re-mints the server session cookie from a freshly-issued ID token. Used to
// pull in custom claims (e.g. a role grant or revoke) that landed on the
// Firebase Auth user AFTER the current session cookie was created.
//
// Without this, after `setUserRole` (or the bootstrap script) sets a new
// custom claim on a user, that user must sign out + back in to see the
// effect — and even then their cached client-side ID token can re-use stale
// claims for up to an hour. This endpoint short-circuits the wait: caller
// POSTs a forceRefresh'd ID token, we mint a fresh session cookie.
//
// Security:
//   - The fresh ID token's uid MUST match the existing session cookie's uid
//     (we don't let one user log themselves in as another via this).
//   - We use `checkRevoked: true` on both verifications so a banned user
//     can't refresh their way back into service.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";

const SESSION_COOKIE_NAME = "session";
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const FIVE_DAYS_S  = 5 * 24 * 60 * 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as { idToken?: string } | null;
    if (!body?.idToken) {
      return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
    }

    const fresh = await adminAuth.verifyIdToken(body.idToken, true);

    // Tie this refresh to the existing session — prevents an attacker who
    // has a fresh ID token from elsewhere from minting a session for the
    // calling browser.
    const existingCookie = cookies().get(SESSION_COOKIE_NAME)?.value;
    if (!existingCookie) {
      return NextResponse.json({ error: "No active session" }, { status: 401 });
    }
    const existing = await adminAuth.verifySessionCookie(existingCookie, true);
    if (existing.uid !== fresh.uid) {
      return NextResponse.json({ error: "Token uid mismatch" }, { status: 401 });
    }

    // Belt-and-braces ban gate — even if the session cookie is still alive,
    // refuse to refresh it for a disabled user.
    const userRecord = await adminAuth.getUser(fresh.uid).catch(() => null);
    if (!userRecord || userRecord.disabled) {
      return NextResponse.json({ error: "Account suspended" }, { status: 403 });
    }

    const sessionCookie = await adminAuth.createSessionCookie(body.idToken, {
      expiresIn: FIVE_DAYS_MS,
    });

    const res = NextResponse.json({
      success: true,
      role: (fresh.role as string | undefined) ?? null,
    });
    res.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      path:     "/",
      maxAge:   FIVE_DAYS_S,
      sameSite: "lax",
    });
    return res;
  } catch (err) {
    console.error("[/api/auth/refresh-claims]", err);
    return NextResponse.json({ error: "Refresh failed" }, { status: 401 });
  }
}
