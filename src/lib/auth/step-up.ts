// ─── Step-up authentication ──────────────────────────────────────────────────
//
// Admin sessions live for 5 days; that's fine for navigating the dashboard.
// For destructive operations (banning a user, issuing a refund, forcing a
// tournament outcome) we want a stronger proof of "you are actually here
// right now". That's step-up: re-enter your password, get a short-lived
// (15-minute) signed cookie that gates the action.
//
// Threat model: if your admin session cookie is stolen via XSS / a laptop
// left unlocked / a phishing site, step-up bounds the blast radius. The
// attacker can read the admin dashboard, but cannot ban or refund without
// also stealing your password fresh inside the 15-minute window.
//
// Implementation:
//   - Step-up state is a separate httpOnly cookie `step_up`.
//   - Cookie payload: `{uid}:{expiresAtMs}` HMAC-signed with STEP_UP_SECRET.
//   - Endpoint /api/auth/step-up accepts a fresh Firebase ID token (which
//     the client obtains via reauthenticateWithCredential). We verify the
//     token belongs to the calling session and mint the cookie.
//   - Server actions that need step-up call `requireStepUp(uid)` which
//     throws "step_up_required" if the cookie is missing/expired/wrong-user.
//   - Client catches the error and triggers the password prompt + retry.
//
// Why a separate cookie (not extend the session): Firebase session cookies
// are immutable signed JWTs — we can't add arbitrary fields. A sibling
// cookie is simpler, scoped to a different lifetime, and revocable
// independently (clearing it on logout, after sensitive action, etc).

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

export const STEP_UP_COOKIE_NAME = "step_up";
export const STEP_UP_TTL_MS      = 15 * 60 * 1000;   // 15 minutes
const STEP_UP_TTL_S              = 15 * 60;

function secret(): string {
  const s = process.env.STEP_UP_SECRET;
  if (!s) throw new Error("STEP_UP_SECRET not configured");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

interface StepUpPayload {
  uid:         string;
  expiresAt:   number;       // unix ms
}

/**
 * Mint the cookie value for a verified user. Caller (the /api/auth/step-up
 * endpoint) is responsible for verifying the user actually proved their
 * identity via a fresh ID token before invoking this.
 */
export function mintStepUpToken(uid: string): { value: string; maxAgeSeconds: number } {
  const expiresAt = Date.now() + STEP_UP_TTL_MS;
  const payload = `${uid}:${expiresAt}`;
  return {
    value:         `${payload}:${sign(payload)}`,
    maxAgeSeconds: STEP_UP_TTL_S,
  };
}

function decode(value: string): StepUpPayload | null {
  const parts = value.split(":");
  if (parts.length !== 3) return null;
  const [uid, expStr, providedSig] = parts;
  if (!uid || !expStr || !providedSig) return null;

  const expiresAt = Number(expStr);
  if (!Number.isFinite(expiresAt)) return null;

  const expected = sign(`${uid}:${expStr}`);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(providedSig, "hex");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return { uid, expiresAt };
}

/**
 * Throws "step_up_required" if the current request lacks a valid, unexpired
 * step-up cookie for the given uid. Otherwise returns silently.
 *
 * Use this in any admin server action where the consequence is destructive
 * (ban, refund, forced outcome). Cheap reads (listing users, viewing audit
 * log) should NOT require step-up.
 */
export function requireStepUp(uid: string): void {
  const raw = cookies().get(STEP_UP_COOKIE_NAME)?.value;
  if (!raw) throw new Error("step_up_required");

  const decoded = decode(raw);
  if (!decoded)                                         throw new Error("step_up_required");
  if (decoded.uid !== uid)                              throw new Error("step_up_required");
  if (Date.now() > decoded.expiresAt)                   throw new Error("step_up_required");
}

/** Optional: surface remaining TTL to the UI so we can show a countdown. */
export function getStepUpRemainingMs(uid: string): number {
  try {
    const raw = cookies().get(STEP_UP_COOKIE_NAME)?.value;
    if (!raw) return 0;
    const decoded = decode(raw);
    if (!decoded || decoded.uid !== uid) return 0;
    return Math.max(0, decoded.expiresAt - Date.now());
  } catch {
    return 0;
  }
}
