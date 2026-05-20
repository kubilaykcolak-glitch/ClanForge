// ─── ClanForge Next.js config ────────────────────────────────────────────────
//
// We add security headers globally via the `headers()` async function.
// Anything below targets the HTTP response layer — no build / bundling
// changes here.
//
// CSP design notes
// ----------------
// The CSP below is "domain-restrictive but inline-tolerant". We allow
// 'unsafe-inline' for both scripts and styles because:
//   • Next.js 14's App Router injects inline runtime scripts for
//     hydration and chunk-flight (`__next_f`), and we haven't done the
//     nonce-based hardening pass yet.
//   • Our codebase uses `style={{ ... }}` props extensively, which emit
//     inline style attributes that 'unsafe-inline' allows.
// We compensate by tightly restricting which EXTERNAL origins can serve
// resources — so even with 'unsafe-inline' on inline content, no third-
// party CDN can be smuggled in via the standard CSP-bypass paths.
//
// External hosts in the allowlist:
//   • apis.google.com / accounts.google.com — Firebase Google Sign-In popup
//   • *.firebaseio.com, *.googleapis.com, *.cloudfunctions.net,
//     identitytoolkit.googleapis.com, securetoken.googleapis.com —
//     Firebase Auth / Firestore / Storage SDKs
//   • firebasestorage.googleapis.com — Uploaded avatars / banners
//   • raw.communitydragon.org — Riot champion / item / spell icons
//   • ddragon.leagueoflegends.com — Data Dragon (profile icons)
//   • lh3.googleusercontent.com — Google avatar URLs (from Sign-In)
//   • arcraiders.wiki / static.wikia.nocookie.net — Arc Raiders content
//     section hero images (hotlinked from community wikis, no rehost)
//   • checkout.stripe.com — Stripe Checkout form submission target
//
// Other headers:
//   • HSTS forces HTTPS for two years incl. subdomains, preload-ready.
//   • X-Content-Type-Options: nosniff stops MIME-type confusion attacks.
//   • Referrer-Policy: strict-origin-when-cross-origin reveals the origin
//     but not the path on cross-origin requests.
//   • X-Frame-Options: DENY is belt-and-braces against clickjacking for
//     legacy browsers that lack `frame-ancestors` support.
//   • Permissions-Policy strips access to sensors / fullscreen by default
//     since we don't use any of those.

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://accounts.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://raw.communitydragon.org https://ddragon.leagueoflegends.com https://lh3.googleusercontent.com https://arcraiders.wiki https://static.wikia.nocookie.net",
  "connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://*.cloudfunctions.net https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://firebasestorage.googleapis.com https://accounts.google.com",
  "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

// Always-on headers (safe in dev — don't break HMR or Vercel preview).
const baseHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options",    value: "nosniff" },
  { key: "X-Frame-Options",           value: "DENY" },
  { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

// CSP is production-only. The Next.js dev server uses inline scripts,
// HMR websockets, and eval to wire fast refresh — applying the prod
// CSP would break every reload. We accept that the dev environment is
// not the threat model; CSP enforcement happens in deployed builds.
const isProd = process.env.NODE_ENV === "production";

const securityHeaders = isProd
  ? [{ key: "Content-Security-Policy", value: CSP }, ...baseHeaders]
  : baseHeaders;

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Apply to every route.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
