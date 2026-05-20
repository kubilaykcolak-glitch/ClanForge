// ─── Fetch Arc Raiders wiki images and patch Firestore ──────────────────────
//
// Hits each Arc Raiders weapon / map wiki page, extracts the main infobox
// image URL, and PATCHES the corresponding /game_content doc's heroImageUrl
// directly. For maps, also collects a tactical/overview image into gallery.
//
// Hotlinks the wiki URLs (no rehost) — fastest path to a populated grid with
// zero copyright exposure. If the wiki ever blocks hotlinks, the seed script
// can be re-run after migrating these to Firebase Storage.
//
// Usage:
//   npx tsx scripts/fetch-arc-raiders-images.ts           # dry-run (print)
//   npx tsx scripts/fetch-arc-raiders-images.ts --write   # patch Firestore

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey  = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("[fetch-images] FIREBASE_ADMIN_* env vars missing in .env.local");
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

const db    = getFirestore();
const write = process.argv.includes("--write");

const WIKI = "https://arcraiders.wiki";
const USER_AGENT = "ClanVault-Content-Fetcher/1.0 (https://clan-forge.vercel.app)";

// ─── Target list ─────────────────────────────────────────────────────────────
// Slug here is the public slug used in the seed script; wikiPath is the
// MediaWiki page name. Most entries are 1:1 but a few maps use underscores.

interface Target {
  slug:      string;          // matches /game_content.slug
  type:      "items" | "locations";
  wikiPath:  string;          // appended after /wiki/
  /** For maps: also extract a tactical/overview/heatmap image into gallery. */
  collectTactical?: boolean;
}

const WEAPONS: Target[] = [
  "Kettle", "Rattler", "Arpeggio", "Tempest", "Bettina",
  "Ferro", "Renegade", "Aphelion",
  "Stitcher", "Canto", "Bobcat",
  "Il_Toro", "Vulcano", "Dolabra",
  "Hairpin", "Burletta", "Venator", "Anvil",
  "Torrente", "Osprey", "Jupiter",
  "Rascal", "Hullcracker", "Equalizer",
].map(name => ({
  slug:     name.toLowerCase().replace(/_/g, "-"),
  type:     "items",
  wikiPath: name,
}));

const MAPS: Target[] = [
  { slug: "dam-battlegrounds", type: "locations", wikiPath: "Dam_Battlegrounds",  collectTactical: true },
  { slug: "blue-gate",         type: "locations", wikiPath: "Blue_Gate",          collectTactical: true },
  { slug: "spaceport",         type: "locations", wikiPath: "The_Spaceport",      collectTactical: true },
  { slug: "buried-city",       type: "locations", wikiPath: "Buried_City",        collectTactical: true },
  { slug: "stella-montis",     type: "locations", wikiPath: "Stella_Montis",      collectTactical: true },
  { slug: "riven-tides",       type: "locations", wikiPath: "Riven_Tides",        collectTactical: true },
];

const TARGETS: Target[] = [...WEAPONS, ...MAPS];

// ─── HTML parsing ────────────────────────────────────────────────────────────

interface ExtractedImages {
  hero:    string | null;
  gallery: string[];
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      console.warn(`  ! ${url} → HTTP ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.warn(`  ! ${url} → ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

function absolutise(url: string): string {
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/"))  return `${WIKI}${url}`;
  return url;
}

/** Strip /thumb/.../ and the trailing 'NNNpx-Filename.ext.webp' so we end up
 *  with the original full-resolution asset URL. The thumb URL still works as
 *  a hotlink but resolves to a tiny 348-px version; we'd rather link the full
 *  asset and let the browser resize. */
function fullResolution(thumbUrl: string): string {
  // Convert  /w/images/thumb/X/YY/Name.ext/348px-Name.ext.webp
  // into     /w/images/X/YY/Name.ext
  const m = thumbUrl.match(/^(.*?)\/thumb\/([^/]+)\/([^/]+)\/[^/]+\/[^/]+$/);
  if (!m) return thumbUrl;
  const [, base, x, yy] = m;
  // Recover original filename — it's the segment before the thumb size.
  const inner = thumbUrl.split("/thumb/")[1];          // "X/YY/Name.ext/348px-Name.ext.webp"
  const parts = inner.split("/");
  if (parts.length < 4) return thumbUrl;
  const originalName = parts[2];                       // "Name.ext"
  return `${base}/${x}/${yy}/${originalName}`;
}

function extractImages(html: string, collectTactical: boolean): ExtractedImages {
  const result: ExtractedImages = { hero: null, gallery: [] };

  // og:image (most reliable hero)
  const og = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (og) result.hero = absolutise(og[1]);

  // Fallback: first .image / .infobox-image with an /images/ URL
  if (!result.hero) {
    const img = html.match(/<img[^>]+src=["']([^"']*\/w\/images\/[^"']+)["']/i);
    if (img) result.hero = absolutise(img[1]);
  }

  if (result.hero) result.hero = fullResolution(result.hero);

  // Tactical / overview image — look for additional /images/ URLs containing
  // "Map" or "Overview" in the filename, excluding the hero.
  if (collectTactical) {
    const seen = new Set<string>();
    if (result.hero) seen.add(result.hero);

    const imgRegex = /<img[^>]+src=["']([^"']*\/w\/images\/[^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = imgRegex.exec(html)) !== null) {
      const abs  = fullResolution(absolutise(m[1]));
      if (seen.has(abs)) continue;
      // Only include things that look like map / overview / heatmap images
      if (!/(Map|Overview|Heatmap|Blank|V\d_)/i.test(abs)) continue;
      // Skip the tiny icons
      if (/Icon_/.test(abs)) continue;
      seen.add(abs);
      result.gallery.push(abs);
      if (result.gallery.length >= 4) break;
    }
  }

  return result;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode:    ${write ? "WRITE" : "DRY-RUN"}`);
  console.log(`Targets: ${TARGETS.length} (${WEAPONS.length} weapons + ${MAPS.length} maps)`);
  console.log("");

  // Existing docs keyed by (type, slug)
  const snap = await db.collection("game_content").where("gameSlug", "==", "arc-raiders").get();
  const byKey = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const d of snap.docs) {
    const data = d.data();
    byKey.set(`${data.type}:${data.slug}`, d);
  }

  const results: Array<{ target: Target; hero: string | null; gallery: string[]; foundDoc: boolean }> = [];

  // Bounded concurrency — be polite to the wiki.
  const CONCURRENCY = 4;
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= TARGETS.length) return;
      const target = TARGETS[idx];
      const url = `${WIKI}/wiki/${target.wikiPath}`;
      const html = await fetchHtml(url);
      const imgs = html ? extractImages(html, !!target.collectTactical) : { hero: null, gallery: [] };
      const docKey = `${target.type}:${target.slug}`;
      const foundDoc = byKey.has(docKey);
      results.push({ target, hero: imgs.hero, gallery: imgs.gallery, foundDoc });

      // Build the per-target log atomically so concurrent workers don't
      // interleave lines and mislead the reader about which hero belongs to
      // which target.
      const lines: string[] = [`  · ${target.type}/${target.slug.padEnd(20)} ← ${url}`];
      if (!html)       lines.push("    no html");
      if (imgs.hero)   lines.push(`    hero: ${imgs.hero}`);
      for (const g of imgs.gallery) lines.push(`    gallery: ${g}`);
      if (!foundDoc)   lines.push(`    ! no matching doc in Firestore`);
      console.log(lines.join("\n"));
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const ok      = results.filter(r => r.hero !== null);
  const missing = results.filter(r => r.hero === null);
  const orphan  = results.filter(r => !r.foundDoc);

  console.log("");
  console.log(`Summary:`);
  console.log(`  hero found        ${ok.length}/${TARGETS.length}`);
  console.log(`  hero missing      ${missing.length}`);
  console.log(`  no matching doc   ${orphan.length}`);

  if (!write) {
    console.log("");
    console.log("Re-run with --write to patch Firestore.");
    return;
  }

  console.log("");
  console.log(`Patching Firestore...`);
  const now = new Date();
  let patched = 0;
  for (let i = 0; i < ok.length; i += 400) {
    const batch = db.batch();
    for (const r of ok.slice(i, i + 400)) {
      const docKey = `${r.target.type}:${r.target.slug}`;
      const doc = byKey.get(docKey);
      if (!doc) continue;
      const update: Record<string, unknown> = {
        heroImageUrl: r.hero,
        updatedAt:    now,
      };
      // Only append gallery items that aren't already present.
      if (r.gallery.length > 0) {
        const existing = (doc.data().gallery as string[] | undefined) ?? [];
        const merged = Array.from(new Set([...existing, ...r.gallery])).slice(0, 8);
        update.gallery = merged;
      }
      batch.update(doc.ref, update);
      patched++;
    }
    await batch.commit();
  }

  console.log(`  patched ${patched} doc(s).`);
  console.log("");
  console.log("✔ Done.");
}

main().catch(err => {
  console.error("FAILED:", err);
  process.exit(1);
});
