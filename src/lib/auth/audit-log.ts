// ─── Admin audit log ──────────────────────────────────────────────────────────
//
// Every privileged action — role changes, bans, refunds, force-finalizes,
// impersonation starts — writes an immutable doc to /admin_audit/{id}. Reads
// are open to admins via the audit-log viewer; writes are server-only.
//
// We log:
//   - actor       — uid of the admin who performed the action
//   - actorRole   — their role at the time
//   - action      — short snake_case verb ("user.role.set", "tournament.force_finalize")
//   - targetType  — "user" | "tournament" | "match" | "clan" | "post" | "integration"
//   - targetId    — the affected document id
//   - reason      — human-supplied justification (required)
//   - metadata    — action-specific extra context (e.g. old/new role, amount)
//   - result      — "success" | "failure"
//   - errorMsg    — populated when result === "failure"
//   - at          — server timestamp
//   - ip          — captured from request headers when available
//
// IMPORTANT: this helper is fire-and-await — never silently swallow a write
// failure. If we can't log it, we shouldn't have done it; the caller decides
// how to handle (typically: log to stderr, continue).

import type { Role } from "./roles";

export type AuditTargetType =
  | "user"
  | "tournament"
  | "match"
  | "clan"
  | "post"
  | "integration"
  | "session";

export type AuditResult = "success" | "failure";

export interface AuditEntry {
  actor:      string;
  actorRole:  Role | null;
  action:     string;
  targetType: AuditTargetType;
  targetId:   string;
  reason:     string;
  metadata?:  Record<string, unknown>;
  result:     AuditResult;
  errorMsg?:  string;
  ip?:        string | null;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  const { adminDb } = await import("@/lib/firebase/admin");
  await adminDb.collection("admin_audit").add({
    ...entry,
    at: new Date(),
  });
}
