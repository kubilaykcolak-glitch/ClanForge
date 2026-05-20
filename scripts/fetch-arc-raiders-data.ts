// ─── Fetch Arc Raiders wiki images + structured data, patch Firestore ──────
//
// For each Arc Raiders weapon / map this script:
//   1. Hits the public page HTML to extract the hero image URL (og:image)
//      and any tactical / blank / underground map images for the gallery.
//   2. For weapons, hits the MediaWiki API to fetch raw wikitext, then
//      parses the {{Infobox weapon}}, {{Crafting}} and {{Weapon upgrades}}
//      templates into structured stats / crafting recipe / upgrade tiers.
//   3. PATCHES the matching /game_content doc with heroImageUrl, gallery,
//      stats, crafting, upgrades.
//
// Hotlinks the wiki URLs (no rehost) — fastest path to a populated grid with
// zero copyright exposure. The Arc Raiders sections render an Embark Studios
// attribution + CC-BY-SA notice for compliance.
//
// Usage:
//   npx tsx scripts/fetch-arc-raiders-data.ts           # dry-run (print)
//   npx tsx scripts/fetch-arc-raiders-data.ts --write   # patch Firestore

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

// Mirror of the schema's structured types, kept in-script so this file
// stands alone (no app-source imports).
interface ItemStat      { label: string; value: string }
interface ItemMaterial  { name: string; qty: number }
interface ItemCrafting  { result?: string; station?: string; blueprint?: boolean; materials: ItemMaterial[] }
interface UpgradeTier   { label: string; materials: ItemMaterial[]; perks?: string[] }

interface ExtractedItemData {
  stats:    ItemStat[];
  crafting: ItemCrafting | null;
  upgrades: UpgradeTier[];
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

// ─── MediaWiki API: fetch raw wikitext for parsing ───────────────────────────

async function fetchWikitext(pageName: string): Promise<string | null> {
  const apiUrl = `${WIKI}/w/api.php?action=parse&page=${encodeURIComponent(pageName)}&format=json&prop=wikitext`;
  try {
    const res = await fetch(apiUrl, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const json = await res.json() as { parse?: { wikitext?: { "*"?: string } } };
    return json?.parse?.wikitext?.["*"] ?? null;
  } catch {
    return null;
  }
}

// ─── Template parsing ────────────────────────────────────────────────────────
// MediaWiki templates look like {{Name | key1 = value | key2 = value | ... }}
// Templates can nest. We extract the outermost match of a named template,
// then parse the body into key/value pairs.

function extractTemplate(wikitext: string, name: string): string | null {
  const open = `{{${name}`;
  const startIdx = wikitext.toLowerCase().indexOf(open.toLowerCase());
  if (startIdx < 0) return null;
  // Walk forward counting braces so nested templates don't trip us up.
  let depth = 0;
  for (let i = startIdx; i < wikitext.length - 1; i++) {
    if (wikitext[i] === "{" && wikitext[i + 1] === "{") { depth++; i++; continue; }
    if (wikitext[i] === "}" && wikitext[i + 1] === "}") {
      depth--;
      if (depth === 0) return wikitext.slice(startIdx + 2, i); // strip "{{...}}"
    }
  }
  return null;
}

function parseTemplateBody(body: string): Map<string, string> {
  // First line is the template name; the rest are |key=value pairs.
  // But pipes can also appear inside nested templates and wikilinks, so we
  // split by top-level pipes only.
  const params = new Map<string, string>();
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  let nameConsumed = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i], n = body[i + 1];
    if (c === "{" && n === "{") { depth++; buf += c; continue; }
    if (c === "}" && n === "}") { depth--; buf += c; continue; }
    if (c === "[" && n === "[") { depth++; buf += c; continue; }
    if (c === "]" && n === "]") { depth--; buf += c; continue; }
    if (c === "|" && depth === 0) {
      if (!nameConsumed) {
        nameConsumed = true;     // discard the template name
        buf = "";
        continue;
      }
      parts.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  if (buf.trim().length > 0) parts.push(buf);

  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    const val = stripWikitext(part.slice(eq + 1).trim());
    if (key) params.set(key, val);
  }
  return params;
}

/** Strip [[wikilinks]] and basic wiki markup for plain display. */
function stripWikitext(s: string): string {
  return s
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'''([^']+)'''/g, "$1")
    .replace(/''([^']+)''/g, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .trim();
}

function parseIngredients(raw: string): ItemMaterial[] {
  // "1 Magnetic Accelerator + 3 Medium Gun Parts + 2 Exodus Modules"
  // → [{name: "Magnetic Accelerator", qty: 1}, ...]
  const out: ItemMaterial[] = [];
  for (const chunk of raw.split("+")) {
    const m = chunk.trim().match(/^(\d+)\s*[×x]?\s*(.+)$/);
    if (m) {
      out.push({ qty: Number(m[1]), name: m[2].trim() });
    } else if (chunk.trim()) {
      out.push({ qty: 1, name: chunk.trim() });
    }
  }
  return out;
}

const STAT_KEYS: Array<{ key: string; label: string }> = [
  { key: "damage",             label: "Damage" },
  { key: "firerate",           label: "Fire Rate" },
  { key: "magsize",            label: "Magazine" },
  { key: "range",              label: "Range" },
  { key: "stability",          label: "Stability" },
  { key: "agility",            label: "Agility" },
  { key: "stealth",            label: "Stealth" },
  { key: "headshotmultiplier", label: "Headshot ×" },
  { key: "weight",             label: "Weight" },
  { key: "ammo",               label: "Ammo" },
  { key: "firingmode",         label: "Firing Mode" },
  { key: "rarity",             label: "Rarity" },
  { key: "type",               label: "Class" },
  { key: "arcarmorpenetr",     label: "ARC Armour Pen" },
  { key: "compatiblemods",     label: "Mod Slots" },
  { key: "durability1",        label: "Durability (I)" },
];

function extractItemData(wikitext: string): ExtractedItemData {
  const result: ExtractedItemData = { stats: [], crafting: null, upgrades: [] };

  // ── Stats from Infobox weapon ──
  const infoboxBody = extractTemplate(wikitext, "Infobox weapon");
  if (infoboxBody) {
    const params = parseTemplateBody(infoboxBody);
    for (const { key, label } of STAT_KEYS) {
      const val = params.get(key);
      if (val && val.length > 0 && val !== "?") {
        result.stats.push({ label, value: val });
      }
    }
  }

  // ── Crafting recipe ──
  const craftingBody = extractTemplate(wikitext, "Crafting");
  if (craftingBody) {
    const params = parseTemplateBody(craftingBody);
    const ingredients = params.get("ingredients") ?? "";
    const materials = parseIngredients(ingredients);
    result.crafting = {
      result:    params.get("result") || undefined,
      station:   params.get("station") || undefined,
      blueprint: (params.get("blueprint") ?? "").toLowerCase() === "y",
      materials,
    };
  }

  // ── Upgrade tiers ──
  const upgradesBody = extractTemplate(wikitext, "Weapon upgrades");
  if (upgradesBody) {
    const params = parseTemplateBody(upgradesBody);
    for (let lvl = 2; lvl <= 6; lvl++) {
      const ingKey   = `level${lvl}-ingredients`;
      const perksKey = `level${lvl}-perks`;
      const ing = params.get(ingKey);
      if (!ing) continue;
      const materials = parseIngredients(ing);
      const perksRaw = params.get(perksKey) ?? "";
      const perks = perksRaw ? perksRaw.split("\n").map(s => s.trim()).filter(Boolean) : undefined;
      result.upgrades.push({
        label:     `${toRoman(lvl - 1)} → ${toRoman(lvl)}`,
        materials,
        perks,
      });
    }
  }

  return result;
}

function toRoman(n: number): string {
  return ["", "I", "II", "III", "IV", "V", "VI"][n] ?? String(n);
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

  interface ResultRow {
    target:   Target;
    hero:     string | null;
    gallery:  string[];
    item:     ExtractedItemData | null;
    foundDoc: boolean;
  }
  const results: ResultRow[] = [];

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

      // For items only: fetch wikitext and parse structured templates.
      let item: ExtractedItemData | null = null;
      if (target.type === "items") {
        const wikitext = await fetchWikitext(target.wikiPath);
        if (wikitext) item = extractItemData(wikitext);
      }

      const docKey = `${target.type}:${target.slug}`;
      const foundDoc = byKey.has(docKey);
      results.push({ target, hero: imgs.hero, gallery: imgs.gallery, item, foundDoc });

      // Atomic per-target log.
      const lines: string[] = [`  · ${target.type}/${target.slug.padEnd(20)} ← ${url}`];
      if (!html)       lines.push("    no html");
      if (imgs.hero)   lines.push(`    hero: ${imgs.hero}`);
      for (const g of imgs.gallery) lines.push(`    gallery: ${g}`);
      if (item) {
        lines.push(`    stats: ${item.stats.length} · crafting: ${item.crafting ? "yes" : "no"} · upgrades: ${item.upgrades.length}`);
      }
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
      // Structured item data — only for items, only if we extracted anything.
      if (r.item) {
        if (r.item.stats.length > 0)    update.stats    = r.item.stats;
        if (r.item.crafting)            update.crafting = r.item.crafting;
        if (r.item.upgrades.length > 0) update.upgrades = r.item.upgrades;
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
