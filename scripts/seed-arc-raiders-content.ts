// ─── Seed Arc Raiders content sections ───────────────────────────────────────
//
// Populates /game_content with weapons, items, maps, guides, and recent
// patch-note entries for the Arc Raiders hub.
//
// Sources (consulted 2026-05-20):
//   - arcraiders.wiki (Weapons, Blueprints, Loot, Update:1.26.0)
//   - arc-raiders.fandom.com
//   - arcraidershub.com (maps)
//   - arctracker.io (items database)
//   - progameguides.com / insider-gaming.com (patch notes)
//
// Behaviour:
//   - Default: dry-run, prints a diff (new / updated / unchanged).
//   - --write: upserts each entry into /game_content keyed on
//     (gameSlug, type, slug). Existing docs are PATCHED (title, summary,
//     body, tags, gallery, links etc.) — they are NOT deleted. Manually-
//     authored entries via /admin/game-content that don't match any slug
//     in this script are LEFT UNTOUCHED.
//   - --wipe (additional flag, requires --write): also delete every
//     existing arc-raiders doc before writing. Use only when you want a
//     clean reset.
//
// Usage:
//   npx tsx scripts/seed-arc-raiders-content.ts              # dry-run
//   npx tsx scripts/seed-arc-raiders-content.ts --write      # upsert
//   npx tsx scripts/seed-arc-raiders-content.ts --write --wipe   # destructive reset

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey  = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("[seed] FIREBASE_ADMIN_* env vars missing in .env.local");
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

const db    = getFirestore();
const write = process.argv.includes("--write");
const wipe  = process.argv.includes("--wipe");

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GAME = "arc-raiders" as const;
const AUTHOR_UID  = "seed-script";
const AUTHOR_NAME = "ClanVault Seed";

interface SeedEntry {
  type:        "guides" | "items" | "locations" | "updates";
  slug:        string;
  title:       string;
  summary:     string;
  body:        string;
  tags?:       string[];
  links?:      Array<{ label: string; url: string }>;
  heroImageUrl?: string | null;
  gallery?:    string[];
}

const WIKI = "https://arcraiders.wiki/wiki";
const HUB  = "https://arcraidershub.com/maps";

// ─── Items: 24 weapons ───────────────────────────────────────────────────────

const WEAPONS: Array<{ name: string; cls: string; ammo: string; desc: string; spawn: string }> = [
  { name: "Kettle",      cls: "Assault Rifle", ammo: "Light",  desc: "Semi-automatic rifle with balanced stats — solid newcomer pick.", spawn: "Raider Containers, all maps" },
  { name: "Rattler",     cls: "Assault Rifle", ammo: "Medium", desc: "Fully-automatic assault rifle. Reliable workhorse for medium range.", spawn: "Raider Containers, all maps" },
  { name: "Arpeggio",    cls: "Assault Rifle", ammo: "Medium", desc: "Burst-fire rifle that rewards controlled trigger discipline with three-round bursts.", spawn: "Raider Containers, all maps" },
  { name: "Tempest",     cls: "Assault Rifle", ammo: "Medium", desc: "High fire-rate fully-automatic rifle. Strong in close-medium engagements.", spawn: "Residential / First Wave Cache (Night Raid, Hurricane)" },
  { name: "Bettina",     cls: "Assault Rifle", ammo: "Heavy",  desc: "Heavy-ammo assault rifle — slower fire rate, punishing per-hit damage.", spawn: "Raider Containers, all maps" },
  { name: "Ferro",       cls: "Battle Rifle",  ammo: "Heavy",  desc: "Break-action rifle dealing very high damage per shot.", spawn: "Late-game caches" },
  { name: "Renegade",    cls: "Battle Rifle",  ammo: "Medium", desc: "Lever-action rifle with extended range, rewards positioning.", spawn: "Late-game caches" },
  { name: "Aphelion",    cls: "Battle Rifle",  ammo: "Energy", desc: "Two-round burst energy weapon. Ignores some armour types.", spawn: "Stella Montis / endgame caches" },
  { name: "Stitcher",    cls: "SMG",           ammo: "Light",  desc: "Fully-automatic SMG. Spray-and-pray close-range option.", spawn: "Raider Containers, all maps" },
  { name: "Canto",       cls: "SMG",           ammo: "Medium", desc: "Medium-ammo SMG with high fire rate — strong CQB damage.", spawn: "First Wave Cache (Hurricane condition)" },
  { name: "Bobcat",      cls: "SMG",           ammo: "Light",  desc: "High fire-rate light SMG. Cheap to feed.", spawn: "First Wave Cache (Locked Gate, Blue Gate)" },
  { name: "Il Toro",     cls: "Shotgun",       ammo: "Shotgun", desc: "Pump-action shotgun — devastating close-range, no follow-up speed.", spawn: "Raider Containers, all maps" },
  { name: "Vulcano",     cls: "Shotgun",       ammo: "Shotgun", desc: "Semi-automatic shotgun. Higher uptime than pump options.", spawn: "First Wave Cache (Hidden Bunker, Hurricane)" },
  { name: "Dolabra",     cls: "Shotgun",       ammo: "Energy", desc: "Energy-based shotgun. Strong against shielded targets.", spawn: "ARC Assessor (Close Scrutiny condition)" },
  { name: "Hairpin",     cls: "Pistol",        ammo: "Light",  desc: "Slide-action sidearm. Cheap reliable backup.", spawn: "Common drops" },
  { name: "Burletta",    cls: "Pistol",        ammo: "Light",  desc: "Semi-automatic light pistol with consistent damage.", spawn: "Quest only (Industrial Espionage)" },
  { name: "Venator",     cls: "Pistol",        ammo: "Medium", desc: "Medium-ammo sidearm. Punches above its weight as a secondary.", spawn: "Raider Containers, all maps" },
  { name: "Anvil",       cls: "Hand Cannon",   ammo: "Heavy",  desc: "Single-action heavy pistol. One-shot potential at close range.", spawn: "Raider Containers, all maps" },
  { name: "Torrente",    cls: "LMG",           ammo: "Medium", desc: "Fully-automatic LMG. Suppression and area denial.", spawn: "Raider Containers, all maps" },
  { name: "Osprey",      cls: "Sniper Rifle",  ammo: "Medium", desc: "Bolt-action long-range rifle. Patient picks at safe distance.", spawn: "Raider Containers, all maps" },
  { name: "Jupiter",     cls: "Sniper Rifle",  ammo: "Energy", desc: "Energy sniper — ignores some armour, slower charge.", spawn: "Harvester condition" },
  { name: "Rascal",      cls: "Launcher",      ammo: "Launcher", desc: "Break-action launcher. Grenade and AOE flexibility.", spawn: "Raider Containers, all maps" },
  { name: "Hullcracker", cls: "Launcher",      ammo: "Launcher", desc: "Pump-action high-damage launcher. Anti-vehicle / anti-mech.", spawn: "Quest only (The Major's Footlocker)" },
  { name: "Equalizer",   cls: "Special",       ammo: "Energy", desc: "Fully-automatic energy special weapon. Endgame DPS option.", spawn: "Harvester condition" },
];

const weaponEntries: SeedEntry[] = WEAPONS.map(w => ({
  type:    "items",
  slug:    slugify(w.name),
  title:   w.name,
  summary: `${w.cls} · ${w.ammo} ammo`,
  body:    `${w.desc}\n\nSpawn: ${w.spawn}\n\nFor the full stats sheet, attachment slots, and current meta tier, see the wiki page linked below.`,
  tags:    [w.cls, `${w.ammo} ammo`, "Weapon"],
  links:   [{ label: "Wiki", url: `${WIKI}/${encodeURIComponent(w.name)}` }],
}));

// ─── Items: category guides for non-weapon loot ──────────────────────────────

const ITEM_CATEGORIES: SeedEntry[] = [
  {
    type:    "items",
    slug:    "gun-parts-attachments",
    title:   "Gun parts & attachments",
    summary: "Grips, stocks, magazines, barrels, silencers — where to farm each tier.",
    body: `Attachments come in tiers I–III (and Mk. 3 for high-end). The vast majority drop from Residential Containers across every map.

Common attachment blueprints and where to find them:
  • Angled Grip II/III          — Residential Containers
  • Vertical Grip II/III        — Residential Containers
  • Padded Stock                — Residential Containers
  • Stable Stock II/III         — Residential Containers
  • Lightweight Stock           — Residential Containers
  • Extended Light/Medium/Shotgun Magazines (II/III) — Residential Containers
  • Compensator II/III          — Residential Containers
  • Muzzle Brake II/III         — Residential Containers
  • Shotgun Choke II/III        — Residential Containers
  • Silencer I/II + Shotgun Silencer — Residential Containers
  • Extended Barrel II/III      — Residential Containers

Higher-tier gun parts (Complex / Heavy / Light / Medium):
  • Complex Gun Parts          — Security Containers
  • Light / Medium / Heavy Gun Parts — Raider Containers`,
    tags:  ["Attachments", "Crafting", "Residential"],
    links: [{ label: "Blueprints (wiki)", url: `${WIKI}/Blueprints` }],
  },
  {
    type:    "items",
    slug:    "explosives-traps",
    title:   "Explosives & traps",
    summary: "Grenades, mines and area-denial tools — sources and conditions.",
    body: `Most explosives spawn from Industrial Containers. Specialty grenades drop only under specific session conditions.

  • Blaze Grenade        — Industrial Containers
  • Explosive Mine       — Industrial Containers
  • Jolt Mine            — Industrial Containers
  • Smoke Grenade        — Residential Containers
  • Tagging Grenade      — Electrical Containers
  • Gas Mine             — Stella Montis only
  • Pulse Mine           — Stella Montis only
  • Seeker Grenade       — Stella Montis only
  • Fireworks Box        — Any location (Cold Snap condition)
  • Lure Grenade         — Quest only (Greasing Her Palms)
  • Trigger 'Nade        — Quest only (Sparks Fly)`,
    tags:  ["Explosives", "Industrial", "Stella Montis"],
    links: [{ label: "Blueprints (wiki)", url: `${WIKI}/Blueprints` }],
  },
  {
    type:    "items",
    slug:    "medical-utilities",
    title:   "Medical items & utilities",
    summary: "Bandages, defibrillators, vita shots and field utilities.",
    body: `Healing supplies drop from Medical Containers (PvP hotspots — every squad needs them). ARC Surveyors can drop higher tier consumables.

  • Defibrillator        — Medical Containers
  • Vita Shot            — Medical Containers / ARC Surveyor
  • Vita Spray           — Medical Containers / ARC Surveyor
  • Remote Raider Flare  — Electrical Containers
  • Barricade Kit        — Electrical Containers
  • Light Sticks (Red / Green / Yellow / Blue) — Any location

Bandages, antiseptics and food items are commonly found in Residential Sectors.`,
    tags:  ["Medical", "Consumables", "Utility"],
    links: [{ label: "Loot guide (wiki)", url: `${WIKI}/Loot` }],
  },
  {
    type:    "items",
    slug:    "augments",
    title:   "Augments (Mk. 3)",
    summary: "Combat, Looting and Tactical augment families — endgame loot.",
    body: `Mk. 3 augments are the endgame stat boosters. They're tied to either Stella Montis / Blue Gate runs or specific high-tier containers.

  • Combat — Aggressive / Flanking           — Stella Montis / Blue Gate
  • Looting — Safekeeper / Survivor          — Medical / Security Containers
  • Tactical — Defensive / Healing / Revival — Stella Montis / Blue Gate

Lower-tier augments drop more broadly; the Mk. 3 family is what late-game builds chase.`,
    tags:  ["Augments", "Endgame", "Stella Montis", "Blue Gate"],
    links: [{ label: "Blueprints (wiki)", url: `${WIKI}/Blueprints` }],
  },
  {
    type:    "items",
    slug:    "loot-categories",
    title:   "Loot categories overview",
    summary: "Equipment, Materials, Ammunition, Quick Use, Keys, Trinkets — what each is for.",
    body: `Arc Raiders organises every drop into one of seven functional groups:

  • Equipment    — weapons, augments, shields, healing, grenades, traps
  • Materials    — fabric, chemicals, electrical / mechanical components, batteries, ARC powercells
  • Ammunition   — light, medium, heavy, launcher rounds, energy clips
  • Quick Use    — consumables — bandages, throwables, utility devices
  • Recyclables  — broken equipment that breaks down into materials
  • Keys         — location-specific access items
  • Trinkets     — cosmetic valuables (e.g. the Acoustic Guitar — 7000 coins)

Rarity tiers: Common, Uncommon, Rare, Epic, Legendary. Higher rarities tend to yield better recycling returns and stat ceilings.

Zone-based distribution to plan loot runs:
  • Industrial   — batteries, gears, ammo crafting components
  • Medical      — antiseptics, bandages (and most PvP)
  • Residential  — dog collars, food, attachments
  • Security     — weapon parts, armour plates, often requires keys / hacking`,
    tags:  ["Loot", "Crafting", "Materials"],
    links: [{ label: "Loot (wiki)", url: `${WIKI}/Loot` }],
  },
];

// ─── Locations: 6 maps ───────────────────────────────────────────────────────

const MAPS: SeedEntry[] = [
  {
    type: "locations",
    slug: "dam-battlegrounds",
    title: "Dam Battlegrounds",
    summary: "Medium risk · the iconic starter map · balanced loot, busy extracts.",
    body: `Once a crucial Raider stronghold, the Dam is the most popular and most-fought-over map. Toxic, waterlogged terrain around the central dam structure, with tight industrial corridors inside the facility.

Recommended for: levels 1+, good for solo learning the loop.

Notable features:
  • Harvester events drop the Equalizer and Jupiter blueprints
  • Comet presence was significantly reduced after patch 1.26.0
  • Firefly presence was heavily reduced in the same patch

Tips: extract early on Dam — late-extraction PvP is brutal. Use the dam interior to break sightlines.`,
    tags:  ["Map", "Medium risk", "Beginner-friendly", "Dam"],
    links: [
      { label: "Interactive map (Hub)",    url: `${HUB}/dam-battlegrounds` },
      { label: "Map (arcmaps.com)",         url: "https://arcmaps.com/maps/dam-battlegrounds" },
    ],
  },
  {
    type: "locations",
    slug: "blue-gate",
    title: "Blue Gate",
    summary: "High risk · mountain-range facility · key-locked rooms, blueprint-rich.",
    body: `A strategic facility at the entrance to a mountain range. Notable for its locked areas requiring keys or hacking tools — a key-flush squad is rewarded with significantly higher-tier loot than the open ground.

Recommended for: mid-tier players (around level 10+).

Notable features:
  • First Wave Cache (Locked Gate condition) drops the Bobcat blueprint
  • Mk. 3 Combat and Tactical augments drop here
  • Long sightlines around the gate plus tight indoor combat

Tips: prioritise routes that pass key-spawn containers (Security). Listen for Sentinel patrols — they often guard key rooms.`,
    tags:  ["Map", "High risk", "Keys", "Blue Gate"],
    links: [
      { label: "Interactive map (Hub)", url: `${HUB}/blue-gate` },
      { label: "Map (arcmaps.com)",      url: "https://arcmaps.com/maps/blue-gate" },
    ],
  },
  {
    type: "locations",
    slug: "spaceport",
    title: "Acerra Spaceport",
    summary: "High risk · former Exodus shuttle launch facility · top-tier event rewards.",
    body: `A sprawling spaceport complex — former staging ground for the Exodus shuttles. Home to the Hidden Bunker event and the Launch Tower Loot condition, both of which gate some of the best gear drops in the game.

Recommended for: mid-to-late game (around level 15+).

Notable features:
  • First Wave Cache (Hidden Bunker, Hurricane conditions) — Vulcano blueprint
  • Wide-open tarmac sightlines plus tight hangar interiors
  • High Sentinel and Bombardier density around the towers

Tips: the launch tower is contested. If the Hidden Bunker condition is up, expect every squad to converge.`,
    tags:  ["Map", "High risk", "Events", "Spaceport"],
    links: [
      { label: "Interactive map (Hub)",          url: `${HUB}/spaceport` },
      { label: "Hub — Spaceport detail",          url: "https://arcraidershub.com/maps/spaceport" },
    ],
  },
  {
    type: "locations",
    slug: "buried-city",
    title: "Buried City",
    summary: "High risk · arid wasteland · narrow streets, deadly ambushes.",
    body: `An ancient remnant amidst sand dunes in an arid wasteland. Narrow streets, empty plazas and partially buried buildings create tight sightlines and constant ambush risk — every corner is a holdable angle.

Recommended for: mid-game (around level 15+).

Notable features:
  • Tempest blueprint drops from Residential / First Wave Cache (Night Raid, Hurricane)
  • Comet presence was reduced in patch 1.26.0
  • Strong loot density relative to its size

Tips: never run open plazas at speed. Pre-aim shopfronts and rooftop windows.`,
    tags:  ["Map", "High risk", "Urban", "Buried City"],
    links: [
      { label: "Interactive map (Hub)", url: `${HUB}/buried-city` },
      { label: "Map (arcmaps.com)",      url: "https://arcmaps.com/maps/buried-city" },
    ],
  },
  {
    type: "locations",
    slug: "stella-montis",
    title: "Stella Montis",
    summary: "Extreme risk · level 25+ endgame zone · highest-value loot in the game.",
    body: `The most dangerous endgame zone in Arc Raiders. Only ~721 markers across the whole map — sparse compared to the other maps — but the value per pull is unmatched. Deadline and Trailblazer blueprints drop here under any condition.

Recommended for: level 25+ only.

Notable features:
  • Deadline + Trailblazer blueprints (any condition)
  • Gas Mine, Pulse Mine and Seeker Grenade blueprints — Stella-exclusive
  • Mk. 3 Combat / Tactical augments
  • ARC density spikes hard — bring high-tier weapons and meds

Tips: don't push Stella under-equipped. Solo runs are possible but a coordinated squad is the realistic profile.`,
    tags:  ["Map", "Extreme risk", "Endgame", "Stella Montis"],
    links: [
      { label: "Interactive map (Hub)", url: `${HUB}/stella-montis` },
      { label: "Map (arcmaps.com)",      url: "https://arcmaps.com/maps/stella-montis" },
    ],
  },
  {
    type: "locations",
    slug: "riven-tides",
    title: "Riven Tides",
    summary: "High risk · newest map (April 2026) · western Rust Belt coastline.",
    body: `Launched with patch 1.26.0 on 28 April 2026. A coastal battleground on the western Rust Belt, introduced alongside the new ARC Turbine enemy — large, imposing, and airborne.

Recommended for: mid-game and up.

Notable features:
  • ARC Turbine — new flying enemy archetype
  • Wide naval / coastal sightlines plus dockside CQB
  • Loot tables still settling — meta is fluid

Tips: keep AA-friendly ammo classes (energy / heavy) handy for the Turbine. Watch the tide line for cover that disappears.`,
    tags:  ["Map", "High risk", "New", "ARC Turbine", "Riven Tides"],
    links: [
      { label: "Riven Tides patch notes (official)", url: "https://arcraiders.com/news/riven-tides-patch-notes-1-26-0" },
      { label: "Interactive map (Hub)",                url: `${HUB}/riven-tides` },
    ],
  },
];

// ─── Guides ──────────────────────────────────────────────────────────────────

const GUIDES: SeedEntry[] = [
  {
    type: "guides",
    slug: "raider-basics",
    title: "Raider basics — your first 10 raids",
    summary: "Loop, extraction, what loot matters, what to leave behind.",
    body: `Arc Raiders is an extraction shooter. Each raid: drop in, loot, fight (or avoid) ARC + other Raiders, extract before the timer or ARC pressure ends you. Everything you bring in and out is real — die mid-raid, lose it all.

What to do in your first 10 raids:
  1. Run Dam Battlegrounds. Get the loop. Extract early.
  2. Don't push fights unless you're geared. Stealth and routing pay more than kills.
  3. Loot priority: meds → ammo → attachments → weapons → trinkets. Meds and ammo keep you alive; weapons rotate.
  4. Always carry a sidearm. Primary jams or runs dry mid-fight more often than you think.
  5. Listen. ARC types signal themselves audibly — Wasps hum, Bombardiers thump.
  6. Use the Trader. Every extracted run feeds his economy and unlocks better blueprints.
  7. Track session conditions — Comets, Fireflies, Hurricane all change spawns + risk profile.`,
    tags:  ["Beginner", "Loop", "Extraction"],
    links: [{ label: "Loot (wiki)", url: `${WIKI}/Loot` }],
  },
  {
    type: "guides",
    slug: "extraction-tactics",
    title: "Extraction tactics",
    summary: "Picking your extract, timing, fakeouts, and the late-extract trap.",
    body: `Extracts are visible to everyone. The last 60 seconds of a raid is where most loot changes hands — usually violently.

Rules of thumb:
  • Always pre-pick TWO extracts when you drop in.
  • The closest extract is the most camped. The "wrong way" extract is often free.
  • Late-extract PvP isn't a fight you want. Either be very early or very confident.
  • Throw smokes 5-10m short of the extract pad, NOT on it — the smoke marks the pad.
  • Hatches are quieter than elevators. Elevators trap you in a known spot for several seconds.
  • If the Hurricane condition is up, expect every squad to push the inner extracts.`,
    tags:  ["Tactics", "Extraction", "Intermediate"],
  },
  {
    type: "guides",
    slug: "pvp-tips",
    title: "PvP tips that actually matter",
    summary: "Pre-aim, sound, third-partying, and disengaging.",
    body: `Most Arc Raiders fights are decided before the first shot. The Raider who pre-aimed the angle wins; the Raider who walked through a doorway loses.

Top patterns:
  • Pre-aim every doorway. Stutter-step in and out — give your opponent the worst possible target.
  • Sound is information. Footsteps, reloads, ammo pickups all leak position.
  • Third-partying is real. After a fight, RELOAD, MOVE, HEAL — in that order, in 3 seconds.
  • You don't have to win every engagement. Disengage to a held angle, force them to push.
  • Don't peek the same angle twice. They're holding it now.
  • Save grenades for confirmed groups — they're loud and announce your position.`,
    tags:  ["PvP", "Tactics", "Intermediate"],
  },
  {
    type: "guides",
    slug: "blueprint-farming",
    title: "Blueprint farming routes",
    summary: "Where to consistently grind each blueprint tier.",
    body: `Blueprint farming favours specific maps + container types. Per the wiki, spawns are commonly observed but not 100% guaranteed.

Top weapon-blueprint routes:
  • Bobcat               → Blue Gate, First Wave Cache (Locked Gate)
  • Tempest              → Buried City Residential / First Wave Cache (Night Raid, Hurricane)
  • Vulcano              → Acerra Spaceport (Hidden Bunker, Hurricane)
  • Deadline + Trailblazer → Stella Montis (any condition)
  • Canto                → First Wave Cache (Hurricane condition)
  • Dolabra              → ARC Assessor (Close Scrutiny condition)
  • Anvil / Bettina / Il Toro / Osprey / Rascal / Torrente / Venator → Raider Containers, all maps

Augments (Mk. 3) live in Stella Montis and Blue Gate. Looting augments leak to Medical / Security containers.

Quest-only blueprints (Burletta, Hullcracker, Lure Grenade, Trigger 'Nade) won't drop from the world — finish the quest chain.`,
    tags:  ["Blueprints", "Farming", "Routes"],
    links: [
      { label: "Blueprints (wiki)", url: `${WIKI}/Blueprints` },
      { label: "Farming guide",      url: "https://gamingarden.com/arc-raiders-all-blueprints-locations-and-farming-guide-2026/" },
    ],
  },
  {
    type: "guides",
    slug: "trader-progression",
    title: "Trader progression",
    summary: "Levelling traders for the blueprints and gear that actually matter.",
    body: `Traders gate the best gear behind reputation tiers. Levelling them is a session-level objective, not a raid-level one — every successful extraction nudges your tier forward.

Priorities:
  • Hand-in any "wanted" item the moment you have a stack — they spike rep fast.
  • Trinkets and Valuables have far higher rep value than raw materials.
  • Don't waste extracts running food / collars when a Trader is on a high-value buy window.
  • Hold rare blueprints back if you've already unlocked them — selling is rep-positive.
  • Update 1.29.0 added a new Trader — re-check the rotation if you've been away.`,
    tags:  ["Trader", "Progression"],
  },
  {
    type: "guides",
    slug: "stella-montis-runs",
    title: "Stella Montis — running the endgame",
    summary: "Loadout, route, ARC density, and bail conditions.",
    body: `Stella Montis is the high-tier endgame map (level 25+). Sparse markers but the loot value-per-pull is the best in the game. ARC density is higher than anywhere else.

Loadout checklist before queuing:
  • Primary: medium or heavy ammo class. Energy is strong here.
  • Secondary: pistol you trust — Anvil or Venator.
  • At least 2 Vita Shots and a Defibrillator.
  • Grenades sized to the ARC threats — pulse/seeker if you have the blueprints.
  • Backpack space for HIGH-value items only. Leave the trinket runs for other maps.

Bail conditions: if you're solo and you hear more than two ARC patrols converging, run. The map will be there tomorrow. Your blueprints won't be if you die.`,
    tags:  ["Endgame", "Stella Montis", "Routes"],
    links: [{ label: "Stella Montis (Hub)", url: `${HUB}/stella-montis` }],
  },
];

// ─── Updates ─────────────────────────────────────────────────────────────────

const UPDATES: SeedEntry[] = [
  {
    type: "updates",
    slug: "patch-1-29-0-denuvo-new-trader",
    title: "Patch 1.29.0 — Denuvo Anti-Cheat + new Trader",
    summary: "Anti-cheat update, new Trader added, balance tweaks.",
    body: `Update 1.29.0 added Denuvo Anti-Cheat and a new Trader to the roster — re-check the rotation if you haven't logged in for a while. Various balance adjustments shipped alongside.

Read the full notes via the official site or the patch-note round-ups below.`,
    tags:  ["Patch", "1.29.0", "Anti-cheat"],
    links: [
      { label: "Official notes",  url: "https://arcraiders.com/news/patch-notes-1-29-0" },
      { label: "Insider Gaming",   url: "https://insider-gaming.com/arc-raiders-update-1-29-0-full-patch-notes/" },
    ],
  },
  {
    type: "updates",
    slug: "patch-1-26-0-riven-tides",
    title: "Patch 1.26.0 — Riven Tides map + ARC Turbine",
    summary: "New coastal map, new airborne ARC enemy, Comet/Firefly tuning.",
    body: `Released 28 April 2026 (02:00 PDT / 10:00 BST). Headline changes:

  • New map: Riven Tides — a coastal battleground on the western Rust Belt.
  • New enemy: ARC Turbine — large, imposing, airborne. Bring AA-friendly ammo.
  • Comets removed from standard Dam Battlegrounds sessions.
  • Comet presence reduced in Buried City.
  • Firefly presence heavily reduced in Dam Battlegrounds.

The Embark team noted that Comets and Fireflies had raised difficulty too far in beginner sessions and tuned accordingly.`,
    tags:  ["Patch", "1.26.0", "Riven Tides", "ARC Turbine"],
    links: [
      { label: "Official notes",        url: "https://arcraiders.com/news/riven-tides-patch-notes-1-26-0" },
      { label: "ProGameGuides round-up", url: "https://progameguides.com/arc-raiders/arc-raiders-patch-notes/" },
      { label: "Wiki — 1.26.0",          url: `${WIKI}/Update:1.26.0` },
    ],
  },
  {
    type: "updates",
    slug: "durability-walkback",
    title: "Embark walks back weapon durability changes",
    summary: "Community pushback led to reverting unpopular durability tuning.",
    body: `In response to community feedback, Embark Studios reverted recent weapon durability adjustments. Players had reported that durability ticks felt punishing in mid-raid engagements, particularly with energy weapons.

This is a useful signal: Embark continues to tune Arc Raiders aggressively based on the playerbase. Patch cadence remains roughly fortnightly with major content drops between.`,
    tags:  ["Patch", "Balance"],
    links: [{ label: "Insider Gaming", url: "https://insider-gaming.com/embark-walks-back-durability-changes-in-arc-raiders/" }],
  },
];

const ALL_ENTRIES: SeedEntry[] = [
  ...weaponEntries,
  ...ITEM_CATEGORIES,
  ...MAPS,
  ...GUIDES,
  ...UPDATES,
];

// ─── Run ─────────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

interface ExistingDoc {
  ref:  FirebaseFirestore.DocumentReference;
  type: string;
  slug: string;
  data: FirebaseFirestore.DocumentData;
}

async function main() {
  console.log(`Mode:  ${write ? (wipe ? "WRITE + WIPE" : "WRITE (upsert)") : "DRY-RUN"}`);
  console.log(`Game:  ${GAME}`);
  console.log(`Total: ${ALL_ENTRIES.length} entries in script`);
  const byType = ALL_ENTRIES.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1;
    return acc;
  }, {});
  for (const [t, n] of Object.entries(byType)) {
    console.log(`  ${t.padEnd(10)} ${n}`);
  }

  // ── Read existing index for (type, slug) → doc ──
  const existingSnap = await db.collection("game_content").where("gameSlug", "==", GAME).get();
  const existingByKey = new Map<string, ExistingDoc>();
  for (const doc of existingSnap.docs) {
    const data = doc.data();
    existingByKey.set(`${data.type}:${data.slug}`, {
      ref:  doc.ref,
      type: data.type as string,
      slug: data.slug as string,
      data,
    });
  }
  console.log(`Found ${existingByKey.size} existing arc-raiders doc(s) in Firestore.`);

  // ── Classify each entry: new / updated / unchanged ──
  let nNew = 0, nUpdate = 0, nUnchanged = 0;
  const updates: Array<{ entry: SeedEntry; ref: FirebaseFirestore.DocumentReference; existing: FirebaseFirestore.DocumentData }> = [];
  const creates: Array<{ entry: SeedEntry }> = [];
  const seenKeys = new Set<string>();

  for (const entry of ALL_ENTRIES) {
    const key = `${entry.type}:${entry.slug}`;
    seenKeys.add(key);
    const ex = existingByKey.get(key);
    if (!ex) {
      creates.push({ entry });
      nNew++;
      continue;
    }
    if (entryMatchesExisting(entry, ex.data)) {
      nUnchanged++;
      continue;
    }
    updates.push({ entry, ref: ex.ref, existing: ex.data });
    nUpdate++;
  }

  // Entries in DB that the script does NOT cover — surviving manual edits.
  const surviving = Array.from(existingByKey.values()).filter(e => !seenKeys.has(`${e.type}:${e.slug}`));

  console.log("");
  console.log(`  new        ${nNew}`);
  console.log(`  updated    ${nUpdate}`);
  console.log(`  unchanged  ${nUnchanged}`);
  console.log(`  not in script (will be preserved unless --wipe): ${surviving.length}`);
  if (surviving.length > 0) {
    for (const s of surviving.slice(0, 10)) {
      console.log(`    · [${s.type}] ${s.slug}`);
    }
    if (surviving.length > 10) console.log(`    · ... +${surviving.length - 10} more`);
  }

  if (!write) {
    console.log("");
    console.log("Re-run with --write to apply (or --write --wipe to reset).");
    return;
  }

  const now = new Date();

  // ── Optional destructive wipe ──
  if (wipe) {
    console.log("");
    console.log("WIPE: deleting every existing arc-raiders doc...");
    for (let i = 0; i < existingSnap.docs.length; i += 400) {
      const batch = db.batch();
      existingSnap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    console.log(`  deleted ${existingSnap.size} doc(s).`);
    // Force everything into the create path now that the slate is empty.
    creates.push(...updates.map(u => ({ entry: u.entry })));
    updates.length = 0;
  }

  // ── Creates ──
  if (creates.length > 0) {
    console.log("");
    console.log(`Creating ${creates.length} new doc(s)...`);
    for (let i = 0; i < creates.length; i += 400) {
      const batch = db.batch();
      for (const { entry } of creates.slice(i, i + 400)) {
        const ref = db.collection("game_content").doc();
        batch.set(ref, {
          gameSlug:     GAME,
          type:         entry.type,
          slug:         entry.slug,
          title:        entry.title,
          summary:      entry.summary,
          body:         entry.body,
          heroImageUrl: entry.heroImageUrl ?? null,
          gallery:      entry.gallery ?? [],
          tags:         entry.tags ?? [],
          links:        entry.links ?? [],
          externalUrl:  null,
          status:       "published",
          authorUid:    AUTHOR_UID,
          authorName:   AUTHOR_NAME,
          createdAt:    now,
          updatedAt:    now,
          publishedAt:  now,
        });
      }
      await batch.commit();
    }
  }

  // ── Updates ──
  if (updates.length > 0) {
    console.log(`Updating ${updates.length} existing doc(s)...`);
    for (let i = 0; i < updates.length; i += 400) {
      const batch = db.batch();
      for (const u of updates.slice(i, i + 400)) {
        batch.update(u.ref, {
          title:        u.entry.title,
          summary:      u.entry.summary,
          body:         u.entry.body,
          heroImageUrl: u.entry.heroImageUrl ?? null,
          gallery:      u.entry.gallery ?? [],
          tags:         u.entry.tags ?? [],
          links:        u.entry.links ?? [],
          updatedAt:    now,
          // Preserve publishedAt if already published; otherwise stamp now.
          ...(u.existing.publishedAt ? {} : { publishedAt: now, status: "published" }),
        });
      }
      await batch.commit();
    }
  }

  console.log("");
  console.log(`✔ Done. ${nNew} created, ${nUpdate} updated, ${nUnchanged} unchanged${wipe ? `, ${existingSnap.size} wiped first` : ""}.`);
  console.log("  Visit /games/arc-raiders/guides etc. to verify.");
}

// ─── Diff helper ─────────────────────────────────────────────────────────────

function entryMatchesExisting(entry: SeedEntry, existing: FirebaseFirestore.DocumentData): boolean {
  if ((existing.title   ?? "") !== entry.title)   return false;
  if ((existing.summary ?? "") !== entry.summary) return false;
  if ((existing.body    ?? "") !== entry.body)    return false;
  if ((existing.heroImageUrl ?? null) !== (entry.heroImageUrl ?? null)) return false;
  if (!arrEq(existing.tags    as string[] | undefined, entry.tags    ?? [])) return false;
  if (!arrEq(existing.gallery as string[] | undefined, entry.gallery ?? [])) return false;
  if (!linksEq(existing.links as Array<{ label: string; url: string }> | undefined, entry.links ?? [])) return false;
  return true;
}

function arrEq(a: string[] | undefined, b: string[]): boolean {
  const aa = a ?? [];
  if (aa.length !== b.length) return false;
  for (let i = 0; i < aa.length; i++) if (aa[i] !== b[i]) return false;
  return true;
}

function linksEq(a: Array<{ label: string; url: string }> | undefined, b: Array<{ label: string; url: string }>): boolean {
  const aa = a ?? [];
  if (aa.length !== b.length) return false;
  for (let i = 0; i < aa.length; i++) {
    if (aa[i].label !== b[i].label || aa[i].url !== b[i].url) return false;
  }
  return true;
}

main().catch(err => {
  console.error("FAILED:", err);
  process.exit(1);
});
