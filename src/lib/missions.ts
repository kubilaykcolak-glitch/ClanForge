// ─── Daily / weekly mission templates ─────────────────────────────────────────
//
// Single source of truth for the personal-missions system. Pure data + helpers,
// no I/O. The `getOrGenerateDailyMissions` server action in
// `src/lib/actions/missions.actions.ts` reads from here.
//
// Design contract (see docs/security-guidelines.md §1.5):
//   • Reward values are SNAPSHOTTED into the per-user doc at generation time so
//     tuning this file does not retroactively change rewards already promised.
//   • The MissionAction enum is the allowlist used to validate caller input in
//     trackMissionProgress — keep it tight.

export type MissionAction =
  | "daily_login"             // Visit /dashboard while signed in (auto-fires once per day)
  | "post_create"              // Create a clan post
  | "tournament_register"     // Register for a tournament (free or paid)
  | "tournament_match_win";   // Win a tournament match

export type MissionCadence = "daily" | "weekly";

export interface MissionTemplate {
  id:           string;          // stable identifier — used as templateId in the per-user doc
  cadence:      MissionCadence;
  action:       MissionAction;
  target:       number;
  xpReward:     number;          // member XP awarded on completion
  clanXpReward: number;          // clan XP awarded only if the user is in a clan
  label:        string;          // short label shown in the widget
  description:  string;          // one-line description
  icon:         string;          // single emoji
}

// ─── Template pool ────────────────────────────────────────────────────────────

export const MISSION_TEMPLATES: readonly MissionTemplate[] = [
  // ── Daily ────────────────────────────────────────────────────────────────
  { id: "d_login_1",        cadence: "daily",  action: "daily_login",          target: 1, xpReward:  10, clanXpReward:  5,  label: "Daily check-in",       description: "Visit your dashboard today",                icon: "📅" },
  { id: "d_post_1",         cadence: "daily",  action: "post_create",          target: 1, xpReward:  15, clanXpReward: 10,  label: "Make a clan post",     description: "Share an update with your clan",            icon: "📣" },
  { id: "d_match_win_1",    cadence: "daily",  action: "tournament_match_win", target: 1, xpReward:  30, clanXpReward: 15,  label: "Win a match",          description: "Win one tournament match today",            icon: "⚔️" },
  { id: "d_match_win_2",    cadence: "daily",  action: "tournament_match_win", target: 2, xpReward:  60, clanXpReward: 30,  label: "Win 2 matches",        description: "Win two tournament matches today",          icon: "⚔️" },
  { id: "d_tourney_join_1", cadence: "daily",  action: "tournament_register",  target: 1, xpReward:  20, clanXpReward: 10,  label: "Enter a tournament",   description: "Register for any tournament today",         icon: "🎮" },

  // ── Weekly ───────────────────────────────────────────────────────────────
  { id: "w_login_5",        cadence: "weekly", action: "daily_login",          target: 5, xpReward: 120, clanXpReward:  60, label: "Weekly streak",        description: "Visit ClanForge on 5 days this week",       icon: "🔥" },
  { id: "w_post_3",         cadence: "weekly", action: "post_create",          target: 3, xpReward: 100, clanXpReward:  50, label: "Weekly poster",        description: "Make 3 clan posts this week",               icon: "📣" },
  { id: "w_match_win_5",    cadence: "weekly", action: "tournament_match_win", target: 5, xpReward: 250, clanXpReward: 120, label: "Match-winning week",   description: "Win 5 tournament matches this week",        icon: "🏆" },
  { id: "w_tourney_join_2", cadence: "weekly", action: "tournament_register",  target: 2, xpReward: 150, clanXpReward:  75, label: "Tournament regular",   description: "Register for 2 tournaments this week",      icon: "🎯" },
];

const DAILY_COUNT = 3;

// ─── Lookup ──────────────────────────────────────────────────────────────────

export function getTemplateById(id: string): MissionTemplate | undefined {
  return MISSION_TEMPLATES.find(t => t.id === id);
}

export function isMissionAction(value: unknown): value is MissionAction {
  return value === "daily_login"
      || value === "post_create"
      || value === "tournament_register"
      || value === "tournament_match_win";
}

// ─── Date / week-key helpers (UTC) ────────────────────────────────────────────
//
// We use UTC because the alternative (per-user local midnight) would require
// every Firestore query to know the user's timezone — and Firestore can't
// compare on a derived field. UTC keeps the doc IDs deterministic globally.

export function dailyKey(d: Date = new Date()): string {
  const y  = d.getUTCFullYear();
  const m  = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** ISO-8601 week key, e.g. `2026-W20`. UTC-based. Monday is day 1. */
export function weeklyKey(d: Date = new Date()): string {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;   // Mon=0 … Sun=6
  target.setUTCDate(target.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNum + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ─── Refresh countdowns (for UI) ──────────────────────────────────────────────

export function msUntilNextDailyRefresh(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
  return next - now.getTime();
}

export function msUntilNextWeeklyRefresh(now: Date = new Date()): number {
  // Next Monday 00:00 UTC.
  const dayNum = (now.getUTCDay() + 6) % 7;       // Mon=0
  const daysUntilNextMon = dayNum === 0 ? 7 : 7 - dayNum;
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilNextMon, 0, 0, 0, 0);
  return next - now.getTime();
}

// ─── Deterministic per-user selection ─────────────────────────────────────────
//
// We seed the shuffle with `uid:dateKey` so:
//   • Different users get different missions on the same day.
//   • The same user opening the dashboard twice in a day reads a stable set
//     (no flicker if the generation transaction races and retries).
// FNV-1a 32-bit hash → Mulberry-style integer steps.

function fnv1a(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let h = fnv1a(seed);
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 16777619) >>> 0;
    const j = h % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function selectDailyTemplates(uid: string, dateKey: string): MissionTemplate[] {
  const pool = MISSION_TEMPLATES.filter(t => t.cadence === "daily");
  return seededShuffle(pool, `${uid}:${dateKey}`).slice(0, DAILY_COUNT);
}

export function selectWeeklyTemplate(uid: string, weekKey: string): MissionTemplate {
  const pool = MISSION_TEMPLATES.filter(t => t.cadence === "weekly");
  // Pool is non-empty (asserted by the unit-test contract of this file).
  return seededShuffle(pool, `${uid}:${weekKey}`)[0];
}
