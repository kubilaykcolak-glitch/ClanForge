import { NextRequest, NextResponse } from "next/server";

/**
 * EDGE RUNTIME NOTE
 * -----------------
 * Next.js middleware always runs on the Edge runtime, which does not support
 * Node.js built-ins. `firebase-admin` uses Node.js APIs and cannot be imported
 * here. Therefore this middleware performs a fast cookie-presence check to
 * handle redirects. Full cryptographic session verification (verifySessionCookie)
 * happens inside API route handlers and Server Components, which run on Node.js.
 *
 * This is the standard pattern for Firebase Admin + Next.js middleware.
 */

const SESSION_COOKIE_NAME = "session";

// Paths always accessible without a session.
// /about is included so the landing-page footer link works for visitors
// who haven't signed up yet (audit finding H6 — previously bounced to
// /login?from=/about). /forgot-password is the password-reset entry the
// login page links to (audit finding H5).
const PUBLIC_EXACT = new Set(["/", "/terms", "/privacy", "/about"]);
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/api/",
  "/_next/",
  "/favicon.ico",
  "/fonts/",
];

// Auth pages: redirect authenticated users away to /dashboard.
// /forgot-password isn't here on purpose — signed-in users may still want
// to use it (e.g. to reset their password without first signing out).
const AUTH_PREFIXES = ["/login", "/register"];

function isPublic(pathname: string): boolean {
  return (
    PUBLIC_EXACT.has(pathname) ||
    PUBLIC_PREFIXES.some(p => pathname.startsWith(p))
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const hasSession = Boolean(sessionCookie);

  // Auth routes: redirect authenticated users to dashboard
  if (AUTH_PREFIXES.some(p => pathname.startsWith(p)) && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Public paths: always accessible
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Everything else requires a session
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated: pass session cookie downstream so Server Components
  // and API routes can run verifySessionCookie() without re-reading cookies.
  const response = NextResponse.next();
  response.headers.set("x-session-cookie", sessionCookie!);
  return response;
}

export const config = {
  // Match every path except Next.js internals and static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts).*)"],
};
