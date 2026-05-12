/**
 * Migration 001 — add clanTag / clan-denorm fields
 *
 * Safe to re-run: only writes to documents that are missing the fields.
 *
 * Usage (from the project root):
 *   npx ts-node --project tsconfig.server.json src/lib/migrations/001-add-clan-tag-fields.ts
 *
 * Required env vars (same as your server-side Firebase Admin setup):
 *   FIREBASE_ADMIN_PROJECT_ID
 *   FIREBASE_ADMIN_CLIENT_EMAIL
 *   FIREBASE_ADMIN_PRIVATE_KEY
 */

import * as admin from "firebase-admin";

// ── Init ──────────────────────────────────────────────────────────────────────

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      // Vercel stores the key with literal \n — normalise here too.
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

// Firestore allows max 500 operations per batch.
const BATCH_LIMIT = 500;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function commitBatch(batch: admin.firestore.WriteBatch, count: number) {
  if (count === 0) return;
  await batch.commit();
  console.log(`  ✓ committed ${count} writes`);
}

// ── 1. Clan docs — add clanTag: null ─────────────────────────────────────────

async function migrateClanDocs() {
  console.log("\n[clans] scanning…");

  const snapshot = await db.collection("clans").get();
  const missing  = snapshot.docs.filter(d => !("clanTag" in d.data()));

  console.log(`  ${snapshot.size} total, ${missing.length} need clanTag`);

  let batch   = db.batch();
  let opCount = 0;

  for (const docSnap of missing) {
    batch.update(docSnap.ref, { clanTag: null });
    opCount++;

    if (opCount === BATCH_LIMIT) {
      await commitBatch(batch, opCount);
      batch   = db.batch();
      opCount = 0;
    }
  }

  await commitBatch(batch, opCount);
  console.log("[clans] done.");
}

// ── 2. Profile docs — add clanId / clanTag / clanSlug / clanName: null ───────

async function migrateProfileDocs() {
  console.log("\n[profiles] scanning…");

  const snapshot = await db.collection("profiles").get();

  const FIELDS = ["clanId", "clanTag", "clanSlug", "clanName"] as const;

  // Only touch docs that are missing at least one of the four fields.
  const toUpdate = snapshot.docs
    .map(d => ({ ref: d.ref, data: d.data() }))
    .filter(({ data }) => FIELDS.some(f => !(f in data)));

  console.log(`  ${snapshot.size} total, ${toUpdate.length} need patch`);

  let batch   = db.batch();
  let opCount = 0;

  for (const { ref, data } of toUpdate) {
    const patch: Record<string, null> = {};
    for (const field of FIELDS) {
      if (!(field in data)) patch[field] = null;
    }
    batch.update(ref, patch);
    opCount++;

    if (opCount === BATCH_LIMIT) {
      await commitBatch(batch, opCount);
      batch   = db.batch();
      opCount = 0;
    }
  }

  await commitBatch(batch, opCount);
  console.log("[profiles] done.");
}

// ── Run ───────────────────────────────────────────────────────────────────────

(async () => {
  try {
    await migrateClanDocs();
    await migrateProfileDocs();
    console.log("\nMigration 001 complete.");
    process.exit(0);
  } catch (err) {
    console.error("\nMigration failed:", err);
    process.exit(1);
  }
})();
