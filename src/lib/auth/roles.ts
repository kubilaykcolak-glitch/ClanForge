// ─── Role hierarchy + permission helpers ─────────────────────────────────────
//
// ClanForge runs three tiers of elevated access, encoded as a Firebase Custom
// Claim on the auth user: `request.auth.token.role`. Custom claims live
// inside the signed JWT, can't be modified by clients regardless of Firestore
// rule misconfiguration, and propagate to Firestore rules natively.
//
//   super_admin  — site owner(s). Can grant/revoke any role. Only granted via
//                  the offline scripts/bootstrap-superadmin.ts script. There
//                  is no web path that can ever produce a super_admin.
//   admin        — trusted operators. Can manage tournaments, refund payments,
//                  ban users, edit content, force-unlink Riot accounts.
//                  Cannot grant/revoke roles.
//   moderator    — community helpers. Can hide posts, resolve disputed
//                  matches, kick clan members. Cannot ban users or touch
//                  money.
//   (none)       — regular user.
//
// Permissions are hierarchical: super_admin implies everything below it,
// admin implies moderator, moderator implies nothing extra.

export type Role = "super_admin" | "admin" | "moderator";

export const ROLE_RANK: Record<Role, number> = {
  super_admin: 30,
  admin:       20,
  moderator:   10,
};

export function isRole(value: unknown): value is Role {
  return value === "super_admin" || value === "admin" || value === "moderator";
}

/** True if `actual` is at or above the `required` tier. */
export function meetsRole(actual: Role | null | undefined, required: Role): boolean {
  if (!actual) return false;
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

/** Roles that `granter` is allowed to assign to other users.
 * Only super_admins can grant any role; admins can grant moderator only;
 * moderators can grant nothing. */
export function rolesGrantableBy(granter: Role | null | undefined): Role[] {
  if (granter === "super_admin") return ["super_admin", "admin", "moderator"];
  if (granter === "admin")       return ["moderator"];
  return [];
}
