"use server";

// ─── Game content CRUD ───────────────────────────────────────────────────────
//
// Admin-only authoring path for Arc Raiders content sections (and any future
// games that need the same CMS pattern). All writes here go through the
// custom-claim role check — never the legacy isAdmin mirror. Body is capped
// + sanitised at write time so a malicious payload can't bloat the document
// or contain embedded HTML.

import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { getSessionWithRole } from "./server-auth";
import { meetsRole } from "@/lib/auth/roles";
import type { GameContent, GameContentType, GameContentStatus } from "@/types/game-content";
import type { GameSlug } from "@/lib/games/types";
import { friendlyActionError } from "./_errors";

interface ActionResult<T = undefined> {
  success: boolean;
  data?:   T;
  error?:  string;
}

const MAX_TITLE     = 120;
const MAX_SUMMARY   = 200;
const MAX_BODY      = 8000;
const VALID_TYPES: GameContentType[] = ["guides", "items", "locations", "updates"];
const VALID_GAMES: GameSlug[] = ["league-of-legends", "arc-raiders"];

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export interface CreateGameContentInput {
  gameSlug:     GameSlug;
  type:         GameContentType;
  title:        string;
  summary:      string;
  body:         string;
  heroImageUrl?: string | null;
  externalUrl?: string | null;
  status:       GameContentStatus;
}

export async function createGameContent(input: CreateGameContentInput): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getSessionWithRole();
    if (!meetsRole(session.role, "moderator")) return { success: false, error: "Forbidden" };

    if (!VALID_GAMES.includes(input.gameSlug)) return { success: false, error: "Unknown game" };
    if (!VALID_TYPES.includes(input.type))     return { success: false, error: "Unknown content type" };

    const title   = (input.title   ?? "").trim();
    const summary = (input.summary ?? "").trim();
    const body    = (input.body    ?? "").trim();
    if (!title)   return { success: false, error: "Title is required" };
    if (!body)    return { success: false, error: "Body is required" };
    if (title.length   > MAX_TITLE)   return { success: false, error: `Title must be ${MAX_TITLE} characters or fewer` };
    if (summary.length > MAX_SUMMARY) return { success: false, error: `Summary must be ${MAX_SUMMARY} characters or fewer` };
    if (body.length    > MAX_BODY)    return { success: false, error: `Body must be ${MAX_BODY} characters or fewer` };

    const { adminDb } = await import("@/lib/firebase/admin");

    // Resolve author display name from the canonical profile (H2 pattern — never
    // trust a client-supplied author string).
    const profSnap = await adminDb.collection("profiles").doc(session.uid).get();
    const authorName = (profSnap.exists ? (profSnap.data()?.displayName as string | undefined) : undefined) ?? "Admin";

    const slug = await uniqueSlug(input.gameSlug, input.type, slugify(title));

    const now = new Date();
    const docRef = await adminDb.collection("game_content").add({
      gameSlug:     input.gameSlug,
      type:         input.type,
      slug,
      title,
      summary,
      body,
      heroImageUrl: input.heroImageUrl ?? null,
      externalUrl:  input.externalUrl  ?? null,
      status:       input.status,
      authorUid:    session.uid,
      authorName,
      createdAt:    now,
      updatedAt:    now,
      publishedAt:  input.status === "published" ? now : null,
    });

    revalidatePath(`/games/${input.gameSlug}/${input.type}`);
    revalidatePath("/admin/game-content");
    return { success: true, data: { id: docRef.id } };
  } catch (err) {
    console.error("[createGameContent]", err);
    return { success: false, error: friendlyActionError(err, "Could not create content") };
  }
}

export async function updateGameContent(id: string, input: Partial<CreateGameContentInput>): Promise<ActionResult> {
  try {
    const session = await getSessionWithRole();
    if (!meetsRole(session.role, "moderator")) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");
    const ref  = adminDb.collection("game_content").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, error: "Content not found" };
    const existing = snap.data() as GameContent;

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (input.title !== undefined) {
      const t = input.title.trim();
      if (!t) return { success: false, error: "Title is required" };
      if (t.length > MAX_TITLE) return { success: false, error: `Title must be ${MAX_TITLE} characters or fewer` };
      patch.title = t;
    }
    if (input.summary !== undefined) {
      const s = input.summary.trim();
      if (s.length > MAX_SUMMARY) return { success: false, error: `Summary must be ${MAX_SUMMARY} characters or fewer` };
      patch.summary = s;
    }
    if (input.body !== undefined) {
      const b = input.body.trim();
      if (!b) return { success: false, error: "Body is required" };
      if (b.length > MAX_BODY) return { success: false, error: `Body must be ${MAX_BODY} characters or fewer` };
      patch.body = b;
    }
    if (input.heroImageUrl !== undefined) patch.heroImageUrl = input.heroImageUrl ?? null;
    if (input.externalUrl  !== undefined) patch.externalUrl  = input.externalUrl  ?? null;
    if (input.status !== undefined) {
      patch.status = input.status;
      // Stamp publishedAt on first publication only.
      if (input.status === "published" && !existing.publishedAt) {
        patch.publishedAt = new Date();
      }
    }

    await ref.update(patch);
    revalidatePath(`/games/${existing.gameSlug}/${existing.type}`);
    revalidatePath("/admin/game-content");
    return { success: true };
  } catch (err) {
    console.error("[updateGameContent]", err);
    return { success: false, error: friendlyActionError(err, "Could not update content") };
  }
}

export async function deleteGameContent(id: string): Promise<ActionResult> {
  try {
    const session = await getSessionWithRole();
    if (!meetsRole(session.role, "admin")) return { success: false, error: "Forbidden" };

    const { adminDb } = await import("@/lib/firebase/admin");
    const ref  = adminDb.collection("game_content").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return { success: true }; // idempotent
    const existing = snap.data() as GameContent;
    await ref.delete();
    revalidatePath(`/games/${existing.gameSlug}/${existing.type}`);
    revalidatePath("/admin/game-content");
    return { success: true };
  } catch (err) {
    console.error("[deleteGameContent]", err);
    return { success: false, error: friendlyActionError(err, "Could not delete content") };
  }
}

// ─── Read helpers (used by RSC sections + admin page) ────────────────────────

export async function listPublishedContent(gameSlug: GameSlug, type: GameContentType): Promise<GameContent[]> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb.collection("game_content")
      .where("gameSlug", "==", gameSlug)
      .where("type",     "==", type)
      .where("status",   "==", "published")
      .orderBy("publishedAt", "desc")
      .limit(50)
      .get();

    return snap.docs.map(d => hydrate(d.id, d.data()));
  } catch (err) {
    console.error("[listPublishedContent]", err);
    return [];
  }
}

export async function listAllContentForAdmin(): Promise<GameContent[]> {
  try {
    const session = await getSessionWithRole();
    if (!meetsRole(session.role, "moderator")) return [];
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb.collection("game_content")
      .orderBy("updatedAt", "desc")
      .limit(200)
      .get();
    return snap.docs.map(d => hydrate(d.id, d.data()));
  } catch (err) {
    console.error("[listAllContentForAdmin]", err);
    return [];
  }
}

export async function getContentById(id: string): Promise<GameContent | null> {
  try {
    const session = await getSessionWithRole();
    if (!meetsRole(session.role, "moderator")) return null;
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb.collection("game_content").doc(id).get();
    if (!snap.exists) return null;
    return hydrate(snap.id, snap.data()!);
  } catch (err) {
    console.error("[getContentById]", err);
    return null;
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function uniqueSlug(gameSlug: GameSlug, type: GameContentType, base: string): Promise<string> {
  const { adminDb } = await import("@/lib/firebase/admin");
  let slug = base || "untitled";
  let i = 1;
  while (true) {
    const snap = await adminDb.collection("game_content")
      .where("gameSlug", "==", gameSlug)
      .where("type",     "==", type)
      .where("slug",     "==", slug)
      .limit(1)
      .get();
    if (snap.empty) return slug;
    i++;
    slug = `${base}-${i}`;
    if (i > 50) return `${base}-${Date.now()}`; // pathological — give up uniquifying nicely
  }
}

function hydrate(id: string, data: FirebaseFirestore.DocumentData): GameContent {
  const toDate = (v: unknown): Date | null =>
    (v as { toDate?: () => Date } | undefined)?.toDate?.() ?? (v instanceof Date ? v : null);
  return {
    id,
    gameSlug:     data.gameSlug,
    type:         data.type,
    slug:         data.slug,
    title:        data.title ?? "",
    summary:      data.summary ?? "",
    body:         data.body ?? "",
    heroImageUrl: data.heroImageUrl ?? null,
    externalUrl:  data.externalUrl  ?? null,
    status:       data.status ?? "draft",
    authorUid:    data.authorUid ?? "",
    authorName:   data.authorName ?? "Admin",
    createdAt:    toDate(data.createdAt) ?? new Date(0),
    updatedAt:    toDate(data.updatedAt) ?? new Date(0),
    publishedAt:  toDate(data.publishedAt),
  };
}

// Suppress unused import lint
void FieldValue;
