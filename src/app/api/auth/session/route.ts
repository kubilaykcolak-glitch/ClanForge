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
    await adminAuth.verifyIdToken(idToken);

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
