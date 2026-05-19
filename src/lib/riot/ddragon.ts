// ─── Data Dragon version resolver ────────────────────────────────────────────
//
// Data Dragon is Riot's static-data CDN. Asset URLs include a version
// segment that's bumped roughly every patch (~once every 2 weeks). We
// previously hard-coded "14.24.1" inside integrations.actions.ts, which
// meant profile icons / champion data would slowly drift behind the live
// client until someone manually bumped the constant (audit finding L4).
//
// This module fetches the latest version from Riot's public
// /api/versions.json once per process cold-start and caches it for 24h.
// If the fetch fails (network, Riot down, parse error) we fall back to
// the known-good baseline below — broken asset URLs are worse than
// slightly-stale ones.

import "server-only";

const VERSIONS_URL = "https://ddragon.leagueoflegends.com/api/versions.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Last-resort fallback used when the network fetch fails. Bump occasionally
// when shipping a release so the fallback also stays current.
const FALLBACK_VERSION = "14.24.1";

let cachedVersion:   string | null = null;
let cacheExpiresAt:  number        = 0;

/**
 * Returns the latest Data Dragon version. Cached for 24h per process;
 * returns FALLBACK_VERSION on fetch / parse failure.
 */
export async function getDdragonVersion(): Promise<string> {
  if (cachedVersion && Date.now() < cacheExpiresAt) {
    return cachedVersion;
  }

  try {
    // Public endpoint — no auth, low rate-limit risk. 5s timeout so a hung
    // fetch never blocks the calling action.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(VERSIONS_URL, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`ddragon versions HTTP ${res.status}`);

    const versions = await res.json() as unknown;
    if (!Array.isArray(versions) || typeof versions[0] !== "string") {
      throw new Error("unexpected ddragon versions shape");
    }
    const latest = versions[0];

    cachedVersion  = latest;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return latest;
  } catch (err) {
    console.warn("[ddragon] version fetch failed, using fallback:", err);
    // Cache the fallback too so we don't hammer the failing endpoint —
    // but with a shorter TTL so we retry sooner than the success path.
    cachedVersion  = FALLBACK_VERSION;
    cacheExpiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
    return FALLBACK_VERSION;
  }
}
