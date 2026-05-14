// src/app/api/upload/route.ts
// Server-side file upload proxy — avoids Firebase Storage CORS issues.
// Receives a multipart/form-data POST from the browser, uploads to GCS via
// Firebase Admin SDK, and returns a permanent Firebase Storage download URL.

import { NextRequest, NextResponse } from "next/server";
import { adminStorage, adminAuth } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Allowed upload destinations (prevent path traversal to arbitrary buckets)
const ALLOWED_PREFIXES = [
  "tournament-banners/",
  "clan-assets/",
  "clan-posts/",
  "avatars/",
  "profile-banners/",
  "profile-backgrounds/",
];

// Paths where the second segment must equal the authenticated user's UID
const USER_OWNED_PREFIXES = ["avatars/", "profile-banners/", "profile-backgrounds/"];

export async function POST(req: NextRequest) {
  // ── Authentication ──────────────────────────────────────────────────────────
  const cookieHeader = req.headers.get("cookie") ?? "";
  const sessionMatch = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  const sessionToken = sessionMatch?.[1];

  if (!sessionToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionToken, true);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const path = formData.get("path") as string | null;

    // ── Basic validation ────────────────────────────────────────────────────
    if (!file || !path) {
      return NextResponse.json(
        { error: "Missing required fields: file and path" },
        { status: 400 }
      );
    }

    if (!ALLOWED_PREFIXES.some(prefix => path.startsWith(prefix))) {
      return NextResponse.json(
        { error: "Invalid upload path" },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Only image files are allowed" },
        { status: 400 }
      );
    }

    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File exceeds the 5 MB limit" },
        { status: 400 }
      );
    }

    // ── Ownership check for user-scoped paths ───────────────────────────────
    // Paths like avatars/{uid}/filename must belong to the authenticated user.
    const isUserOwned = USER_OWNED_PREFIXES.some(p => path.startsWith(p));
    if (isUserOwned) {
      const pathUid = path.split("/")[1];
      if (pathUid !== uid) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // ── Upload via Admin SDK ────────────────────────────────────────────────
    const buffer = Buffer.from(await file.arrayBuffer());

    // Generate a Firebase Storage download token so the URL never expires
    // (same as the token the client SDK generates on direct upload)
    const token = crypto.randomUUID();

    const bucket  = adminStorage.bucket();
    const fileRef = bucket.file(path);

    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        metadata: {
          // Firebase checks this metadata field to validate download tokens
          firebaseStorageDownloadTokens: token,
        },
      },
    });

    // Construct the permanent Firebase Storage download URL
    const downloadUrl =
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
      `${encodeURIComponent(path)}?alt=media&token=${token}`;

    return NextResponse.json({ url: downloadUrl });
  } catch (err) {
    console.error("[api/upload] error:", err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
