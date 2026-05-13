// ─── Cron: purge empty tournaments ────────────────────────────────────────────
//
// Scheduled via vercel.json. Daily on the Hobby plan; bump to hourly on Pro
// if you want faster cleanup.
//
// Behavior: any tournament whose startsAt is in the past AND has 0
// participants gets its status flipped to "cancelled". The tournament itself
// is kept so its history remains queryable — only the "cancelled" banner
// reflects what happened.
//
// Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Required
// because this route is public. Set CRON_SECRET in Vercel project env.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cap how many we'll touch in a single run so a runaway state doesn't blow
// the Firestore write quota.
const MAX_PER_RUN = 200;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // refuse to run without a secret configured
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

async function purge(): Promise<{ scanned: number; cancelled: number; ids: string[] }> {
  const { adminDb } = await import("@/lib/firebase/admin");

  // Single-field query on `status` to avoid requiring the (status + startsAt)
  // composite index to be deployed. JS filters startsAt + participantCount.
  // At typical volumes this is well below cron timeout. If you ever exceed
  // ~10k OPEN tournaments at once, switch to the composite-index version.
  const snap = await adminDb
    .collection("tournaments")
    .where("status", "==", "open")
    .limit(MAX_PER_RUN * 5)
    .get();

  const nowMs = Date.now();
  const cancelledIds: string[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const startsAtMs = data.startsAt?.toDate?.()?.getTime?.() ?? 0;
    const participantCount = (data.participantCount as number) ?? 0;

    if (startsAtMs > nowMs)        continue; // not yet started
    if (participantCount !== 0)    continue; // has participants — keep it
    if (cancelledIds.length >= MAX_PER_RUN) break;

    await doc.ref.update({ status: "cancelled" });
    cancelledIds.push(doc.id);
  }

  return {
    scanned:   snap.size,
    cancelled: cancelledIds.length,
    ids:       cancelledIds,
  };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await purge();
    console.log(
      `[cron purge-empty-tournaments] scanned=${result.scanned} cancelled=${result.cancelled}`,
      result.ids,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron purge-empty-tournaments]", err);
    const message = err instanceof Error ? err.message : "Cron handler failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Vercel Cron sends GET. Allow POST too for manual triggers via curl.
export async function POST(req: NextRequest) {
  return GET(req);
}
