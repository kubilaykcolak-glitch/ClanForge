// ─── Bootstrap a super_admin ─────────────────────────────────────────────────
//
// One-time / one-off CLI script. Grants the super_admin role to a Firebase
// auth user via Custom Claims, using the service-account credentials in
// .env.local.
//
// IMPORTANT: this script is THE ONLY path that can produce a super_admin.
// There is no web endpoint, no admin action, no Firestore write that grants
// it. The security property is: anyone with the service-account JSON can
// grant super_admin; that JSON should be treated as the keys to the kingdom.
//
// Usage:
//   npx tsx scripts/bootstrap-superadmin.ts <email>
//
// or to revoke:
//   npx tsx scripts/bootstrap-superadmin.ts --revoke <email>
//
// Requires DEV dependencies tsx + dotenv. If they're not installed yet:
//   npm install --save-dev tsx dotenv

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// ─── Load .env.local explicitly — scripts don't inherit Next.js's loader ─────
loadEnv({ path: resolve(process.cwd(), ".env.local") });

const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey  = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("[bootstrap-superadmin] FIREBASE_ADMIN_* env vars missing in .env.local");
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

const auth = getAuth();
const db   = getFirestore();

// ─── Args ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const email  = args.filter(a => !a.startsWith("--"))[0];

if (!email) {
  console.error("Usage: npx tsx scripts/bootstrap-superadmin.ts [--revoke] <email>");
  process.exit(1);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Looking up user: ${email}`);
  const user = await auth.getUserByEmail(email).catch(() => null);
  if (!user) {
    console.error(`No auth user found with email ${email}`);
    process.exit(1);
  }
  console.log(`  uid: ${user.uid}`);
  console.log(`  current claims:`, user.customClaims ?? {});

  const before = (user.customClaims?.role as string | undefined) ?? null;
  const newRole = revoke ? null : "super_admin";

  await auth.setCustomUserClaims(user.uid, {
    ...(user.customClaims ?? {}),
    role: newRole,
  });
  console.log(`  set claim role: ${newRole ?? "(removed)"}`);

  // Mirror to the profile doc for legacy reads (will be migrated away later).
  // The custom claim is the authoritative source; this mirror is convenience.
  await db.collection("profiles").doc(user.uid).set(
    { isAdmin: !revoke },
    { merge: true },
  );

  // Audit log entry — even bootstrap is logged. Actor is "bootstrap-script"
  // since there's no signed-in operator.
  await db.collection("admin_audit").add({
    actor:      "bootstrap-script",
    actorRole:  "super_admin",
    action:     revoke ? "user.role.revoke" : "user.role.grant",
    targetType: "user",
    targetId:   user.uid,
    reason:     "Offline bootstrap via scripts/bootstrap-superadmin.ts",
    metadata:   { email, before, after: newRole },
    result:     "success",
    at:         new Date(),
  });

  console.log("");
  console.log(`✔ Done. ${user.email} is now ${revoke ? "no longer a super_admin" : "a super_admin"}.`);
  console.log("");
  console.log("Note: the user must SIGN OUT and back in (or wait up to 1h for the");
  console.log("token to auto-refresh) before the new role takes effect in the app.");
  console.log("To force-refresh in the browser console: firebase.auth().currentUser.getIdToken(true)");
}

main().catch(err => {
  console.error("FAILED:", err);
  process.exit(1);
});
