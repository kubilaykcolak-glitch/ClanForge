// ─── Audit admin claims vs profiles.isAdmin ──────────────────────────────────
//
// Read-only by default. Prints every profile with isAdmin=true, the user's
// custom claim role, and flags any gap (isAdmin=true but no admin/super_admin
// claim).
//
// With --fix it sets `role: "admin"` on every gap. Existing claims (including
// super_admin) are preserved.
//
// Exit code 0 if every isAdmin row has a matching claim (or --fix succeeds),
// 1 otherwise. Run this BEFORE removing the legacy fallback in server-auth.ts.
//
// Usage:
//   npx tsx scripts/audit-admin-claims.ts
//   npx tsx scripts/audit-admin-claims.ts --fix

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey  = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("[audit-admin-claims] FIREBASE_ADMIN_* env vars missing in .env.local");
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

const auth = getAuth();
const db   = getFirestore();

const fix = process.argv.includes("--fix");

interface Row {
  uid:        string;
  email:      string | null;
  isAdmin:    boolean;
  claimRole:  string | null;
  gap:        boolean;
}

async function main() {
  console.log(`Audit mode: ${fix ? "FIX (will set role=admin on gaps)" : "READ-ONLY"}`);
  console.log("");

  const snap = await db.collection("profiles").where("isAdmin", "==", true).get();
  console.log(`Found ${snap.size} profile(s) with isAdmin=true.`);
  console.log("");

  const rows: Row[] = [];
  for (const doc of snap.docs) {
    const uid = doc.id;
    let email: string | null = null;
    let claimRole: string | null = null;
    try {
      const user = await auth.getUser(uid);
      email = user.email ?? null;
      claimRole = (user.customClaims?.role as string | undefined) ?? null;
    } catch (err) {
      console.warn(`  ! Could not load auth user ${uid}:`, err instanceof Error ? err.message : err);
    }
    const gap = claimRole !== "admin" && claimRole !== "super_admin";
    rows.push({ uid, email, isAdmin: true, claimRole, gap });
  }

  const longestEmail = rows.reduce((m, r) => Math.max(m, (r.email ?? "").length), 5);
  const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.length));

  console.log(pad("uid", 30) + "  " + pad("email", longestEmail) + "  " + pad("claim.role", 12) + "  gap?");
  console.log("-".repeat(30 + 2 + longestEmail + 2 + 12 + 2 + 4));
  for (const r of rows) {
    console.log(
      pad(r.uid.slice(0, 28), 30) + "  " +
      pad(r.email ?? "(no email)", longestEmail) + "  " +
      pad(r.claimRole ?? "(none)", 12) + "  " +
      (r.gap ? "YES" : "no"),
    );
  }

  const gaps = rows.filter(r => r.gap);
  console.log("");
  console.log(`Gaps: ${gaps.length} / ${rows.length}`);

  if (gaps.length === 0) {
    console.log("");
    console.log("✔ Every admin profile has a matching custom claim. Legacy fallback can be removed.");
    process.exit(0);
  }

  if (!fix) {
    console.log("");
    console.log("Re-run with --fix to grant role=admin on the gap rows above.");
    process.exit(1);
  }

  console.log("");
  console.log("Applying fix...");
  for (const r of gaps) {
    try {
      const user = await auth.getUser(r.uid);
      await auth.setCustomUserClaims(r.uid, {
        ...(user.customClaims ?? {}),
        role: "admin",
      });
      await db.collection("admin_audit").add({
        actor:      "audit-script",
        actorRole:  "super_admin",
        action:     "user.role.grant",
        targetType: "user",
        targetId:   r.uid,
        reason:     "Backfill admin claim during legacy isAdmin fallback removal",
        metadata:   { email: r.email, before: r.claimRole, after: "admin" },
        result:     "success",
        at:         new Date(),
      });
      console.log(`  ✔ granted admin to ${r.email ?? r.uid}`);
    } catch (err) {
      console.error(`  ✗ failed for ${r.email ?? r.uid}:`, err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }

  console.log("");
  console.log("✔ Backfill complete. Affected users must sign out and back in (or wait ~1h for token refresh).");
  process.exit(0);
}

main().catch(err => {
  console.error("FAILED:", err);
  process.exit(1);
});
