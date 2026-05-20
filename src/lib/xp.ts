// ─── XP rules & constants ─────────────────────────────────────────────────────
//
// Single source of truth for the XP system. Pure data — no I/O. The
// awardXp server action in src/lib/actions/xp.actions.ts reads from here.

export type XpReason =
  | "onboarding_complete"
  | "clan_create"
  | "clan_join"
  | "tournament_create"
  | "tournament_register"
  | "tournament_match_win"
  | "tournament_place_1"
  | "tournament_place_2"
  | "tournament_place_3"
  | "tournament_place_4_5"
  | "post_create"
  | "post_receive_like"
  | "challenge_complete"
  | "member_recruit"
  | "daily_mission_complete"
  | "weekly_mission_complete"
  | "clan_mission_contribute"
  | "bounty_claim_approved";

/** How the dedupe/limit check is applied for each rule. */
export type RuleType =
  | "once_global"      // user can earn this XP only once ever
  | "once_per_target"  // user can earn this XP once per distinct targetId
  | "daily_cap";       // user can earn this up to N times per rolling 24h window

export interface XpRule {
  reason:    XpReason;
  /** Amount awarded each time the rule fires. Always in whole XP. */
  amount:    number;
  type:      RuleType;
  /** Max events per 24h. Required when type === "daily_cap". */
  dailyCap?: number;
  /** Short human-readable label used in toasts and the audit log. */
  label:     string;
}

export const XP_RULES: Record<XpReason, XpRule> = {
  onboarding_complete:  { reason: "onboarding_complete",  amount: 100, type: "once_global",     label: "Welcome bonus" },
  clan_create:          { reason: "clan_create",          amount: 200, type: "once_global",     label: "Created your first clan" },
  clan_join:            { reason: "clan_join",            amount:  50, type: "once_per_target", label: "Joined a new clan" },
  tournament_create:    { reason: "tournament_create",    amount: 100, type: "daily_cap",       dailyCap: 2, label: "Created a tournament" },
  // Once per distinct tournament. Previously had a daily_cap of 4, which
  // let a user farm by repeatedly register → withdraw → register on the
  // same tournament. Once-per-target keyed by tournamentId closes the loop
  // (and still grants XP correctly when joining different tournaments).
  tournament_register:  { reason: "tournament_register",  amount:  25, type: "once_per_target", label: "Registered for a tournament" },
  tournament_match_win: { reason: "tournament_match_win", amount:  50, type: "once_per_target", label: "Won a match" },
  tournament_place_1:   { reason: "tournament_place_1",   amount: 500, type: "once_per_target", label: "1st place" },
  tournament_place_2:   { reason: "tournament_place_2",   amount: 300, type: "once_per_target", label: "2nd place" },
  tournament_place_3:   { reason: "tournament_place_3",   amount: 200, type: "once_per_target", label: "3rd place" },
  tournament_place_4_5: { reason: "tournament_place_4_5", amount: 100, type: "once_per_target", label: "Top 5 finish" },
  post_create:          { reason: "post_create",          amount:  10, type: "daily_cap",       dailyCap:  1, label: "Daily clan post" },
  post_receive_like:    { reason: "post_receive_like",    amount:   2, type: "daily_cap",       dailyCap: 20, label: "Someone liked your post" },
  challenge_complete:   { reason: "challenge_complete",   amount:  75, type: "once_per_target",               label: "Clan challenge completed" },
  member_recruit:       { reason: "member_recruit",       amount:  30, type: "once_per_target",               label: "Recruited a new member" },

  // Daily / weekly personal missions. Amount is overridden at award time by the
  // snapshotted reward on the per-user mission doc — see awardXp call sites.
  // targetId is `mission:<uid>:<dateKey>:<templateId>` for daily, `mission:<uid>:<weekKey>:<templateId>` for weekly,
  // so each completed mission can only award XP once.
  daily_mission_complete:  { reason: "daily_mission_complete",  amount: 10,  type: "once_per_target", label: "Daily mission complete"  },
  weekly_mission_complete: { reason: "weekly_mission_complete", amount: 100, type: "once_per_target", label: "Weekly mission complete" },

  // Clan-mission contributor bonus. Amount is overridden at award time by the
  // snapshotted memberXpReward on the per-clan mission doc — see awardXp
  // validation block. targetId format:
  //   `clan_mission:<clanId>:<dateKey|weekKey>:<templateId>:<uid>`
  // so each (mission × contributor) tuple can only award once.
  clan_mission_contribute: { reason: "clan_mission_contribute", amount:  20, type: "once_per_target", label: "Clan mission contribution" },

  // Wanted/Bounty system — hunter is awarded XP when a moderator approves
  // their claim. targetId is the bounty doc id so a single bounty can only
  // ever pay out once.
  bounty_claim_approved:   { reason: "bounty_claim_approved",   amount: 150, type: "once_per_target", label: "Bounty claim approved" },
};

// ─── Clan join cooldown (anti-grind) ──────────────────────────────────────────
//
// Time a user must wait after leaving a clan before they can join another one.
// Independent of the XP system, but kept here because it shares the same goal:
// stop join-leave farming.

export const CLAN_JOIN_COOLDOWN_HOURS = 10;
export const CLAN_JOIN_COOLDOWN_MS = CLAN_JOIN_COOLDOWN_HOURS * 60 * 60 * 1000;
