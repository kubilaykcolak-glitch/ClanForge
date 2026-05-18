// ─── Discord-embed enrichment helpers ────────────────────────────────────────
//
// Admin actions fire Discord alerts via sendAdminAlert. Without enrichment
// every body line + field is just raw IDs: "lggVfQWRfSQoujyzcCzeb2aKtAD3
// banned 47lgkypP3qo6J7MCmIph". Hard to triage at-a-glance.
//
// This module looks up the names behind each id from Firestore so the embeds
// read as English:
//   "Kubilay (@kubilay) banned Alice (@alice)"
//   target: Spring Showdown (47lgky…)
//
// Each helper degrades gracefully — if the doc has been deleted or never
// existed, we fall back to a short prefix of the id so the trail still has
// something to grep on. Errors never propagate (alerting is best-effort).

import type { Role } from "./roles";

export interface ResolvedActor {
  /** Short bold-friendly label, e.g. "Kubilay (@kubilay) · super_admin". */
  label: string;
  /** Raw uid kept for the audit log + Discord fields. */
  uid:   string;
}

export interface ResolvedTarget {
  /** Human-readable label with the full id appended in parens, e.g.
   * `Spring Showdown (47lgky…)`. */
  label: string;
  /** Raw id, also surfaced as its own field by callers. */
  id:    string;
}

const shortId = (id: string): string => (id.length > 10 ? `${id.slice(0, 6)}…` : id);

// ─── Actor (admin who triggered the action) ─────────────────────────────────

export async function resolveActor(uid: string, role: Role | null): Promise<ResolvedActor> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb.collection("profiles").doc(uid).get();
    if (!snap.exists) return { label: `${shortId(uid)} · ${role ?? "?"}`, uid };
    const data = snap.data() as { displayName?: string; username?: string } | undefined;
    const name = data?.displayName ?? data?.username ?? shortId(uid);
    const handle = data?.username ? ` (@${data.username})` : "";
    return { label: `${name}${handle} · ${role ?? "?"}`, uid };
  } catch {
    return { label: `${shortId(uid)} · ${role ?? "?"}`, uid };
  }
}

// ─── User target (someone an admin acted on: ban, role change, etc.) ────────

export async function resolveUserTarget(uid: string): Promise<ResolvedTarget> {
  try {
    const { adminAuth, adminDb } = await import("@/lib/firebase/admin");
    const [authRec, profSnap] = await Promise.all([
      adminAuth.getUser(uid).catch(() => null),
      adminDb.collection("profiles").doc(uid).get(),
    ]);
    const data = profSnap.exists ? (profSnap.data() as { displayName?: string; username?: string }) : null;
    const name = data?.displayName ?? data?.username ?? authRec?.email ?? shortId(uid);
    const handle = data?.username ? ` (@${data.username})` : "";
    return { label: `${name}${handle}`, id: uid };
  } catch {
    return { label: shortId(uid), id: uid };
  }
}

// ─── Tournament target ──────────────────────────────────────────────────────

export async function resolveTournamentTarget(tournamentId: string): Promise<ResolvedTarget> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb.collection("tournaments").doc(tournamentId).get();
    if (!snap.exists) return { label: `(deleted tournament) ${shortId(tournamentId)}`, id: tournamentId };
    const name = (snap.data() as { name?: string }).name ?? shortId(tournamentId);
    return { label: `"${name}" (${shortId(tournamentId)})`, id: tournamentId };
  } catch {
    return { label: shortId(tournamentId), id: tournamentId };
  }
}

// ─── Clan target (used by content moderation actions) ───────────────────────

export async function resolveClanTarget(clanId: string): Promise<ResolvedTarget> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb.collection("clans").doc(clanId).get();
    if (!snap.exists) return { label: `(deleted clan) ${shortId(clanId)}`, id: clanId };
    const data = snap.data() as { name?: string; clanTag?: string };
    const tag = data.clanTag ? `[${data.clanTag}] ` : "";
    return { label: `${tag}${data.name ?? shortId(clanId)} (${shortId(clanId)})`, id: clanId };
  } catch {
    return { label: shortId(clanId), id: clanId };
  }
}

// ─── "tournament/{tournamentId}/participants/{uid}" target ──────────────────
// Used by force-refund. We want both the participant's name and the tournament
// name visible without spamming 3 fields.

export async function resolveParticipantTarget(
  tournamentId: string,
  participantUid: string,
): Promise<{ label: string; tournament: ResolvedTarget; user: ResolvedTarget }> {
  const [tournament, user] = await Promise.all([
    resolveTournamentTarget(tournamentId),
    resolveUserTarget(participantUid),
  ]);
  return {
    label: `${user.label} in ${tournament.label}`,
    tournament,
    user,
  };
}
