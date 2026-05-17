// ─── Tournament code metaData signing ────────────────────────────────────────
//
// Riot echoes whatever string we put in CodeParameters.metadata back to our
// callback URL verbatim when the game ends. We use that to identify which
// ClanForge match the result belongs to.
//
// Problem: anyone who sees a `tournamentId:matchId` plaintext metadata could
// forge a callback POST claiming a match they didn't play. Fix: HMAC the
// matchId with a server-only secret. The webhook recomputes the HMAC and
// rejects callbacks with mismatched signatures.

import { createHmac, timingSafeEqual } from "crypto";

interface MetadataPayload {
  tournamentId: string;
  matchId:      string;
}

function secret(): string {
  const s = process.env.RIOT_METADATA_SECRET;
  if (!s) throw new Error("RIOT_METADATA_SECRET not configured");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/**
 * Produce the metadata string to pass to Riot when creating a tournament code.
 * Format: `<tournamentId>:<matchId>:<hmacHex>` — Riot allows up to 256 chars.
 */
export function signMetadata(p: MetadataPayload): string {
  const payload = `${p.tournamentId}:${p.matchId}`;
  return `${payload}:${sign(payload)}`;
}

/**
 * Verify the metadata string returned by Riot in the callback. Returns the
 * decoded payload or null on tamper/format error.
 */
export function verifyMetadata(metaData: string): MetadataPayload | null {
  if (typeof metaData !== "string") return null;
  const parts = metaData.split(":");
  if (parts.length !== 3) return null;
  const [tournamentId, matchId, providedSig] = parts;
  if (!tournamentId || !matchId || !providedSig) return null;

  const expected = sign(`${tournamentId}:${matchId}`);

  // Constant-time compare to avoid leaking the signature via timing.
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(providedSig, "hex");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return { tournamentId, matchId };
}
