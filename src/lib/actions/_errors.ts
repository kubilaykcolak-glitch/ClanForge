// ─── Server-action error sanitiser ───────────────────────────────────────────
//
// Server actions historically returned `err instanceof Error ? err.message`
// straight through to the client. That works fine when WE threw a clean
// `new Error("You are already a member of this clan")` — but leaky when
// the error is from Firestore SDK ("5 NOT_FOUND: No document to update"),
// Firebase Auth ("Firebase: Error (auth/user-not-found)"), or a stack
// trace from a runtime exception. None of those are useful to the end
// user, and a few of them leak internal collection paths or version
// strings.
//
// friendlyActionError(err, fallback):
//   - Always logs the raw error server-side.
//   - Returns err.message if it looks like a human sentence we threw.
//   - Returns the fallback otherwise — Firestore status codes, Firebase
//     auth codes, stack-trace fragments, oversized payloads, and empty
//     messages all collapse to the same generic copy.
//
// Use at the catch site of any server action:
//   } catch (err) {
//     return { success: false, error: friendlyActionError(err, "Couldn't load tournament") };
//   }

import "server-only";

/**
 * Patterns that indicate the error is internal / SDK-emitted rather than
 * something we crafted for end-user display. Each is conservative — false
 * positives just substitute the (already context-appropriate) fallback.
 */
const INTERNAL_PATTERNS: RegExp[] = [
  /^\d+\s+[A-Z_]+:/,           // "5 NOT_FOUND: ..." (Firestore status codes)
  /^[A-Z_]{2,}:\s/,             // "PERMISSION_DENIED: ...", "INVALID_ARGUMENT: ..."
  /auth\/[a-z-]+/,              // "Firebase: Error (auth/user-not-found)"
  /firestore/i,                 // any reference to "Firestore" / "firestore"
  /\/node_modules\//,           // bundled stack frames
  /\.(?:ts|js|tsx):\d+/,        // file:line fragments
];

const MAX_LEN = 200;

/**
 * Return a string safe to surface to end users. Logs the raw error
 * server-side for diagnostics.
 */
export function friendlyActionError(err: unknown, fallback: string): string {
  // Log the raw error regardless of what we return.
  console.error("[action]", err);

  if (!(err instanceof Error)) return fallback;
  const msg = err.message?.trim();
  if (!msg)            return fallback;
  if (msg.length > MAX_LEN) return fallback;

  for (const pattern of INTERNAL_PATTERNS) {
    if (pattern.test(msg)) return fallback;
  }

  return msg;
}
