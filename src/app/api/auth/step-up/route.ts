// ─── /api/auth/step-up ───────────────────────────────────────────────────────
//
// Mints the short-lived step-up cookie that proves the calling admin just
// re-entered their password.
//
// Client flow:
//   1. User attempts a destructive admin action.
//   2. Server action throws "step_up_required".
//   3. Client opens a password modal.
//   4. Client calls Firebase `reauthenticateWithCredential(currentUser,
//      EmailAuthProvider.credential(email, password))` — this returns a
//      fresh `idToken`. (Crucially, this verifies the password against
//      Firebase before returning, so the token is proof of recent control.)
//   5. Client POSTs the fresh idToken here.
//   6. We verify the token is valid AND fresh (auth_time within 5 minutes)
//      AND its uid matches the existing session.
//   7. We mint the step-up cookie and return success.
//   8. Client retries the original action.

import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { cookies } from "next/headers";
import { mintStepUpToken, STEP_UP_COOKIE_NAME, STEP_UP_TTL_MS } from "@/lib/auth/step-up";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FRESH_AUTH_WINDOW_S = 5 * 60;   // ID token's auth_time must be within last 5 minutes

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as { idToken?: string } | null;
    if (!body?.idToken) {
      return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
    }

    // Verify the new ID token. checkRevoked: true rejects if the user was
    // disabled or had their session forcibly invalidated.
    const fresh = await adminAuth.verifyIdToken(body.idToken, true);

    // Tie this step-up to the EXISTING admin session — i.e. the cookie that
    // already authenticates the request. This prevents a logged-out attacker
    // from minting a step-up cookie by stealing only a fresh ID token from
    // somewhere else.
    const sessionCookie = cookies().get("session")?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: "No active session" }, { status: 401 });
    }
    const sessionUser = await adminAuth.verifySessionCookie(sessionCookie, true);
    if (sessionUser.uid !== fresh.uid) {
      return NextResponse.json({ error: "Token uid mismatch" }, { status: 401 });
    }

    // Freshness check: the auth_time claim is set by Firebase to when the
    // user actually provided credentials. reauthenticateWithCredential bumps
    // it. We require it within the last 5 minutes — defends against an old
    // ID token being replayed.
    const authTimeS = fresh.auth_time;
    if (typeof authTimeS !== "number") {
      return NextResponse.json({ error: "Token missing auth_time" }, { status: 401 });
    }
    const ageS = Math.floor(Date.now() / 1000) - authTimeS;
    if (ageS > FRESH_AUTH_WINDOW_S) {
      return NextResponse.json({ error: "Re-authenticate to continue" }, { status: 401 });
    }

    const { value, maxAgeSeconds } = mintStepUpToken(fresh.uid);

    const res = NextResponse.json({ success: true, expiresInMs: STEP_UP_TTL_MS });
    res.cookies.set(STEP_UP_COOKIE_NAME, value, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      path:     "/",
      maxAge:   maxAgeSeconds,
      sameSite: "lax",
    });
    return res;
  } catch (err) {
    console.error("[/api/auth/step-up]", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// DELETE — clear step-up state. Called when the user logs out or after a
// successful destructive action (forcing them to re-authenticate for the
// next one is a defensible choice; for v1 we let it ride the 15-min TTL).
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(STEP_UP_COOKIE_NAME, "", {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    path:     "/",
    maxAge:   0,
  });
  return res;
}
