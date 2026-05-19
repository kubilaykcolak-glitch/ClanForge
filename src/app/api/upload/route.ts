// src/app/api/upload/route.ts
// Server-side file upload proxy — avoids Firebase Storage CORS issues.
// Receives a multipart/form-data POST from the browser, uploads to GCS via
// Firebase Admin SDK, and returns a permanent Firebase Storage download URL.
//
// Path-ownership note (audit fix C7):
//   We MUST verify the caller has the right to write to the target path
//   before saving the bytes. The previous version enforced ownership only
//   on personal prefixes (avatars/, profile-banners/, profile-backgrounds/)
//   — leaving clan-assets/, clan-posts/, and tournament-banners/ wide open.
//   That meant any signed-in user could overwrite another clan's banner or
//   another tournament's banner just by spoofing the `path` field.
//
// MIME note (audit fix M7):
//   SVG is image/* but can carry inline <script>. Even though the file is
//   served from the firebasestorage.googleapis.com origin (not our app's
//   origin), opening the URL directly executes script in that origin's
//   context, which can be used to phish session tokens via redirect tricks.
//   Stick to raster formats.

import { NextRequest, NextResponse } from "next/server";
import { adminStorage, adminAuth, adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PREFIXES = [
  "tournament-banners/",
  "clan-assets/",
  "clan-posts/",
  "avatars/",
  "profile-banners/",
  "profile-backgrounds/",
];

const USER_OWNED_PREFIXES = ["avatars/", "profile-banners/", "profile-backgrounds/"];

// Raster only — see comment block above for why SVG is rejected.
const ALLOWED_MIME = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

// ─── Magic-byte sniff (defence-in-depth against forged file.type) ────────────
//
// File.type is client-controlled, so a `image/png` MIME header on a
// `.svg`-content file passes the allowlist. We re-validate using the first
// bytes of the actual payload. If the magic doesn't match a known raster
// format we reject regardless of the declared MIME.

function detectMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  // GIF: 'GIF87a' or 'GIF89a'
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  // WEBP: 'RIFF' .... 'WEBP'
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "image/webp";
  return null;
}

// ─── Per-prefix ownership gates ───────────────────────────────────────────────
//
// Each shared prefix has its own write-permission contract. Personal paths
// are handled separately via USER_OWNED_PREFIXES.
//
// tournament-banners/{tournamentId}/...  → only the tournament's creator.
// clan-assets/{clanId}/...               → clan leader or officer.
// clan-posts/{clanId}/...                → any non-pending clan member.

async function canWriteSharedPath(uid: string, path: string): Promise<boolean> {
  const segments = path.split("/");
  if (segments.length < 2) return false;

  if (path.startsWith("tournament-banners/")) {
    const tournamentId = segments[1];
    if (!tournamentId) return false;
    const snap = await adminDb.collection("tournaments").doc(tournamentId).get();
    if (!snap.exists) return false;
    return (snap.data()?.creatorId as string) === uid;
  }

  if (path.startsWith("clan-assets/")) {
    const clanId = segments[1];
    if (!clanId) return false;
    const member = await adminDb
      .collection("clans").doc(clanId)
      .collection("members").doc(uid).get();
    if (!member.exists) return false;
    const role = member.data()?.role as string | undefined;
    return role === "leader" || role === "officer";
  }

  if (path.startsWith("clan-posts/")) {
    const clanId = segments[1];
    if (!clanId) return false;
    const member = await adminDb
      .collection("clans").doc(clanId)
      .collection("members").doc(uid).get();
    if (!member.exists) return false;
    const role = member.data()?.role as string | undefined;
    return role === "leader" || role === "officer" || role === "member";
  }

  return false;
}

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

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: "Only PNG, JPEG, WebP, and GIF images are allowed" },
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

    // ── Ownership check ─────────────────────────────────────────────────────
    const isUserOwned = USER_OWNED_PREFIXES.some(p => path.startsWith(p));
    if (isUserOwned) {
      const pathUid = path.split("/")[1];
      if (pathUid !== uid) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
      // Shared prefix — verify caller's relationship to the target entity.
      const allowed = await canWriteSharedPath(uid, path);
      if (!allowed) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // ── Magic-byte verification ─────────────────────────────────────────────
    // Done AFTER ownership so an unauthorised caller can't probe the bucket
    // by sending crafted headers — they get 403 before we read bytes.
    const buffer = Buffer.from(await file.arrayBuffer());
    const sniffed = detectMime(new Uint8Array(buffer.subarray(0, 16)));
    if (!sniffed || !ALLOWED_MIME.has(sniffed)) {
      return NextResponse.json(
        { error: "Uploaded file isn't a valid PNG/JPEG/WebP/GIF" },
        { status: 400 }
      );
    }

    // ── Upload via Admin SDK ────────────────────────────────────────────────
    // Use the sniffed MIME for contentType so a forged file.type can't change
    // how the file is served to viewers.
    const token = crypto.randomUUID();

    const bucket  = adminStorage.bucket();
    const fileRef = bucket.file(path);

    await fileRef.save(buffer, {
      metadata: {
        contentType: sniffed,
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
    // Don't leak internal error text to clients — keep the response opaque.
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
