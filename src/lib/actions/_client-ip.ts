// ─── clientIp(): extract caller IP for audit logging ────────────────────────
//
// Audit-log entries stamp the caller's IP so we can chase abuse / fraud
// across actions. The header we read matters because not all of them are
// trustworthy on every platform:
//
//   x-vercel-forwarded-for  ← Vercel-signed; set by the platform after
//                             it strips any client-supplied copy. PREFERRED
//                             on Vercel deployments. Empty in dev.
//   x-real-ip               ← Set by some reverse proxies (Nginx, etc.).
//                             Stripped from the inbound request and replaced
//                             upstream — generally trustworthy when present.
//   x-forwarded-for         ← Standard, BUT clients can supply their own copy
//                             unless the proxy explicitly replaces it. We
//                             read only the FIRST value in the chain since
//                             every proxy hop is appended to the end — the
//                             head is the closest hop, which is what we
//                             want. Still spoofable when the deployment
//                             doesn't sit behind a known proxy.
//
// We try in that order and accept that the value is a best-effort audit
// hint, NOT an authorisation input. Nothing in the codebase should ever
// branch on this IP (audit fix L5 — documenting the limitation).

import { headers } from "next/headers";

export function clientIp(): string | null {
  const h = headers();
  return h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
      ?? h.get("x-real-ip")?.trim()
      ?? h.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? null;
}
