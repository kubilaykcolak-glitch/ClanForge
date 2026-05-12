import { adminDb } from "@/lib/firebase/admin";
import { NextRequest, NextResponse } from "next/server";

const MIN_LENGTH = 3;
const MAX_LENGTH = 20;
const VALID_USERNAME = /^[a-z0-9_]+$/;

// GET /api/username-check?username=<value>
// Returns { available: boolean } — safe to call without authentication.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const raw = searchParams.get("username");

  // Basic format validation
  if (!raw || raw.length < MIN_LENGTH) {
    return NextResponse.json({ available: false, reason: "too_short" });
  }
  if (raw.length > MAX_LENGTH) {
    return NextResponse.json({ available: false, reason: "too_long" });
  }

  const username = raw.toLowerCase();

  if (!VALID_USERNAME.test(username)) {
    return NextResponse.json({ available: false, reason: "invalid_characters" });
  }

  try {
    const doc = await adminDb.collection("usernames").doc(username).get();
    return NextResponse.json({ available: !doc.exists });
  } catch (error) {
    console.error("[GET /api/username-check]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
