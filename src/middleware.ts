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

// Routes that require an authenticated session
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/admin",
];
const PROTECTED_EXACT = [
  "/profile/edit",
  "/clans/create",
  "/tournaments/create",
  "/settings",
];

// Routes that should redirect to /dashboard when already authenticated
const AUTH_ROUTES = ["/login", "/register"];

function isProtected(pathname: string): boolean {
  return (
    PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    PROTECTED_EXACT.includes(pathname)
  );
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname.startsWith(route));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const hasSession = Boolean(sessionCookie);

  // ── Protected routes: redirect to /login if no session cookie ─────────────
  if (isProtected(pathname)) {
    if (!hasSession) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("from", pathname); // preserve intended destination
      return NextResponse.redirect(loginUrl);
    }

    // Pass the raw cookie value downstream via a header so Server Components
    // and API routes can run verifySessionCookie() without re-reading cookies.
    const response = NextResponse.next();
    response.headers.set("x-session-cookie", sessionCookie!);
    return response;
  }

  // ── Auth routes: redirect to /dashboard if a session already exists ────────
  if (isAuthRoute(pathname) && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/profile/edit",
    "/clans/create",
    "/tournaments/create",
    "/settings",
    "/login",
    "/register",
  ],
};
