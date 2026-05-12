import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug")?.toLowerCase() ?? "";

  // Basic format validation
  if (!slug || slug.length < 2 || slug.length > 40) {
    return NextResponse.json({ available: false, error: "Invalid slug" }, { status: 400 });
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ available: false, error: "Invalid characters" }, { status: 400 });
  }

  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const doc = await adminDb.collection("clanSlugs").doc(slug).get();
    return NextResponse.json({ available: !doc.exists });
  } catch {
    return NextResponse.json({ available: false, error: "Server error" }, { status: 500 });
  }
}
