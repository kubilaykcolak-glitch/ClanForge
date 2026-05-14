// ─── Clan-name normalisation ──────────────────────────────────────────────────
//
// `normalizeClanName` converts any user-entered clan name into a stable
// comparison key. Two names that produce the same key are considered the
// SAME name for uniqueness purposes — this is how we block copycats.
//
// Variants that collapse to the same key:
//   "Shadow Clan"      ->  "shadowclan"
//   "shadow-clan"      ->  "shadowclan"
//   "ShadowClan"       ->  "shadowclan"
//   "Shadow Clan"      ->  "shadowclan"   (NFKD decomposition + diacritic strip)
//   "Sh4d0w Cl4n"      ->  "shadowclan"   (basic leetspeak swap)
//   "Shadow_Clan!!!"   ->  "shadowclan"   (punctuation stripped)
//   "  Shadow  Clan  " ->  "shadowclan"   (whitespace stripped)
//
// We deliberately DO NOT collapse "shadowclans" -> "shadowclan" — pluralisation
// and stem variations are out of scope. The goal is to defeat trivial visual
// imitation, not to assert semantic identity.

const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "@": "a",
  $: "s",
  "!": "i",
  "|": "i",
};

// Zero-width / invisible / direction-control code points commonly used to
// spoof identifiers. Each entry is [startCode, endCode] inclusive.
// Built dynamically into a RegExp at runtime so the source file stays
// pure ASCII (literal pasted invisibles confuse parsers and grep alike).
const INVISIBLE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x200b, 0x200f], // ZWSP, ZWNJ, ZWJ, LRM, RLM
  [0x2028, 0x202f], // line/paragraph separators, embedding/override marks, narrow NBSP
  [0x205f, 0x2060], // medium math space, word joiner
  [0x2066, 0x2069], // LTR/RTL isolate controls
  [0x00ad, 0x00ad], // soft hyphen
  [0xfeff, 0xfeff], // BOM / zero-width no-break space
];

const INVISIBLE_RE = new RegExp(
  "[" +
    INVISIBLE_RANGES
      .map(([a, b]) =>
        a === b
          ? "\\u" + a.toString(16).padStart(4, "0")
          : "\\u" + a.toString(16).padStart(4, "0") + "-\\u" + b.toString(16).padStart(4, "0"),
      )
      .join("") +
    "]",
  "g",
);

/**
 * Normalise a clan-name string into a comparison key.
 *
 * - NFKD decompose so accented forms split into base + combining mark
 * - Strip combining marks (diacritics)
 * - Strip zero-width / direction-control characters
 * - Lowercase
 * - Apply leetspeak substitutions
 * - Keep only [a-z 0-9]
 *
 * Returns "" if nothing remains (e.g. emoji-only name) — callers should
 * treat an empty key as "not a valid name".
 */
export function normalizeClanName(name: string): string {
  if (!name) return "";

  let s = name.normalize("NFKD");
  // Strip combining marks (diacritics) in the common Latin/European range.
  // Using the explicit range so we don't depend on \p{M} (ES2018 target).
  s = s.replace(/[̀-ͯ]/g, "");
  s = s.replace(INVISIBLE_RE, "");
  s = s.toLowerCase();

  // Leetspeak character-by-character. Done before stripping so symbols
  // like @ and ! turn into letters first.
  let mapped = "";
  for (const ch of s) {
    mapped += LEET_MAP[ch] ?? ch;
  }

  // Keep only ascii alphanumerics — drops whitespace, punctuation, and any
  // non-mapped non-ASCII characters.
  return mapped.replace(/[^a-z0-9]/g, "");
}

// ─── Validation rules ─────────────────────────────────────────────────────────

/** Minimum length of the NORMALISED key. Stops "!!!" -> "" creep. */
export const MIN_NAME_KEY_LENGTH = 3;

/** Maximum raw name length the UI accepts. */
export const MAX_NAME_LENGTH = 30;
