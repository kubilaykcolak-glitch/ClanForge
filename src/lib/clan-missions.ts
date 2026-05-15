// ─── Clan-mission templates ───────────────────────────────────────────────────
//
// Single source of truth for the lightweight clan-collaborative mission system.
// Pure data + helpers, no I/O. Mirrors src/lib/missions.ts for personal
// missions but operates at the clan level.
//
// Design contract:
//   • All actions in this pool are HIGH-EFFORT and EXTERNALLY VALIDATED at
//     their fire points (tournament results, day-deduped activity, etc.).
//   • Spammable engagement actions (likes, comments, posts) are deliberately
//     excluded — see docs/security-guidelines.md §1.5.
//   • Reward values are SNAPSHOTTED into the per-clan doc at generation time
//     so tuning this file does not retroactively change rewards already
//     promised. awardXp / awardClanXp re-read the snapshot from the doc.

export type ClanMissionAction =
  | "member_active_day"        // One unique member active today (deduped per-uid-per-day)
  | "tournament_match_win"     // Member wins one tournament match
  | "tournament_solo_streak"   // Member wins their 3rd match in a single tournament
  | "tournament_clan_squad"    // 3+ clan members participate in the same tournament
  | "tournament_top_place"     // Member finishes top 3 in a tournament
  | "tournament_run_complete"; // Tournament created by a member finalises

export type ClanMissionCadence = "daily" | "weekly";

export interface ClanMissionTemplate {
  id:             string;
  cadence:        ClanMissionCadence;
  action:         ClanMissionAction;
  target:         number;
  clanXpReward:   number;        // clan XP added once on mission completion
  memberXpReward: number;        // member XP added to EACH contributor on completion
  label:          string;
  description:    string;
  icon:           string;
}

// ─── Template pool ────────────────────────────────────────────────────────────

export const CLAN_MISSION_TEMPLATES: readonly ClanMissionTemplate[] = [
  // ── Daily ────────────────────────────────────────────────────────────────
  { id: "d_active_3",       cadence: "daily",  action: "member_active_day",      target:  3, clanXpReward:  60, memberXpReward:  5, label: "3 members active",       description: "Have 3 clan members active today",                 icon: "👥" },
  { id: "d_active_5",       cadence: "daily",  action: "member_active_day",      target:  5, clanXpReward: 100, memberXpReward:  8, label: "5 members active",       description: "Have 5 clan members active today",                 icon: "👥" },
  { id: "d_match_win_3",    cadence: "daily",  action: "tournament_match_win",   target:  3, clanXpReward: 120, memberXpReward: 10, label: "Win 3 matches",          description: "Win 3 tournament matches collectively today",      icon: "⚔️" },
  { id: "d_match_win_5",    cadence: "daily",  action: "tournament_match_win",   target:  5, clanXpReward: 200, memberXpReward: 15, label: "Win 5 matches",          description: "Win 5 tournament matches collectively today",      icon: "⚔️" },
  { id: "d_top_place_1",    cadence: "daily",  action: "tournament_top_place",   target:  1, clanXpReward: 200, memberXpReward: 30, label: "Top-3 placement",        description: "Land a top-3 tournament placement today",          icon: "🥉" },

  // ── Weekly ───────────────────────────────────────────────────────────────
  { id: "w_active_15",      cadence: "weekly", action: "member_active_day",      target: 15, clanXpReward: 400, memberXpReward: 30, label: "Active week",            description: "Accumulate 15 member-active days this week",       icon: "🔥" },
  { id: "w_match_win_15",   cadence: "weekly", action: "tournament_match_win",   target: 15, clanXpReward: 600, memberXpReward: 50, label: "Match-winning week",     description: "Win 15 tournament matches collectively this week", icon: "⚔️" },
  { id: "w_solo_streak_1",  cadence: "weekly", action: "tournament_solo_streak", target:  1, clanXpReward: 350, memberXpReward: 60, label: "Solo tournament run",    description: "A member wins 3 matches in a single tournament",   icon: "🎯" },
  { id: "w_top_place_2",    cadence: "weekly", action: "tournament_top_place",   target:  2, clanXpReward: 700, memberXpReward: 75, label: "Podium week",            description: "Two top-3 placements this week",                   icon: "🏆" },
  { id: "w_squad_1",        cadence: "weekly", action: "tournament_clan_squad",  target:  1, clanXpReward: 400, memberXpReward: 40, label: "Squad up",               description: "Get 3+ clan members into one tournament",          icon: "🛡️" },
  { id: "w_run_complete_1", cadence: "weekly", action: "tournament_run_complete",target:  1, clanXpReward: 500, memberXpReward: 60, label: "Tournament host",        description: "A member runs a tournament to completion",         icon: "🎮" },
];

const DAILY_COUNT = 3;

// ─── Lookup ──────────────────────────────────────────────────────────────────

export function isClanMissionAction(value: unknown): value is ClanMissionAction {
  return value === "member_active_day"
      || value === "tournament_match_win"
      || value === "tournament_solo_streak"
      || value === "tournament_clan_squad"
      || value === "tournament_top_place"
      || value === "tournament_run_complete";
}

// ─── Date / week-key helpers (UTC) ────────────────────────────────────────────
//
// Identical semantics to src/lib/missions.ts so personal & clan missions both
// roll over at the same UTC midnight / Monday boundary.

export function dailyKey(d: Date = new Date()): string {
  const y  = d.getUTCFullYear();
  const m  = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function weeklyKey(d: Date = new Date()): string {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNum + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function msUntilNextDailyRefresh(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
  return next - now.getTime();
}

export function msUntilNextWeeklyRefresh(now: Date = new Date()): number {
  const dayNum = (now.getUTCDay() + 6) % 7;
  const daysUntilNextMon = dayNum === 0 ? 7 : 7 - dayNum;
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilNextMon, 0, 0, 0, 0);
  return next - now.getTime();
}

// ─── Deterministic per-clan selection ─────────────────────────────────────────
//
// Seed with `clanId:dateKey` so:
//   • Different clans get different missions on the same day.
//   • The same clan opening the page twice in a day reads a stable set.
// Members of the same clan see the SAME missions (collaborative).

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

export function selectDailyTemplates(clanId: string, dateKey: string): ClanMissionTemplate[] {
  const pool = CLAN_MISSION_TEMPLATES.filter(t => t.cadence === "daily");
  return seededShuffle(pool, `${clanId}:${dateKey}`).slice(0, DAILY_COUNT);
}

export function selectWeeklyTemplate(clanId: string, weekKey: string): ClanMissionTemplate {
  const pool = CLAN_MISSION_TEMPLATES.filter(t => t.cadence === "weekly");
  return seededShuffle(pool, `${clanId}:${weekKey}`)[0];
}
