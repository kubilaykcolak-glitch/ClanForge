import { adminAuth } from "@/lib/firebase/admin";
import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "session";
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const FIVE_DAYS_S = 5 * 24 * 60 * 60;

// POST /api/auth/session
// Exchange a Firebase ID token for a server-side session cookie.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idToken } = body as { idToken: string };

    if (!idToken) {
      return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
    }

    // Verify the ID token is valid before creating a session
    const decoded = await adminAuth.verifyIdToken(idToken);

    // Block banned users at the session-mint step. We already disable the
    // auth user on ban (kills refresh + revokes tokens) but this is the
    // belt-and-braces gate: even a brief race in which the user has a fresh
    // ID token from before the ban gets caught here. Reads the auth record
    // server-side rather than trusting the JWT.
    //
    // Response is intentionally opaque ("Unauthorized") rather than
    // "Account suspended" so an attacker can't enumerate which accounts
    // are banned via this endpoint (audit finding M8).
    const userRecord = await adminAuth.getUser(decoded.uid).catch(() => null);
    if (!userRecord || userRecord.disabled) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Create a session cookie valid for 5 days
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: FIVE_DAYS_MS,
    });

    const isProduction = process.env.NODE_ENV === "production";

    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: isProduction,
      path: "/",
      maxAge: FIVE_DAYS_S,
      sameSite: "lax",
    });

    return response;
  } catch (error) {
    console.error("[POST /api/auth/session]", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// DELETE /api/auth/session
// Clear the session cookie to sign the user out server-side.
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
