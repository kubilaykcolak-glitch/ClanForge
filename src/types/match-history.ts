// ─── Cached match summary doc shape ──────────────────────────────────────────
//
// We persist a trimmed shape under /profiles/{uid}/match_history/{matchId}
// per linked LoL account, keyed by Riot's matchId. The shape is owner-only
// in Firestore rules — and we deliberately omit fields the UI doesn't need
// (perk pages, ward placements, full timeline) so the doc stays small.

export interface MatchParticipantLite {
  puuid:           string;
  riotIdGameName?: string;
  riotIdTagline?:  string;
  summonerName?:   string;
  championId:      number;
  championName:    string;
  champLevel:      number;
  teamId:          number;
  teamPosition?:   string;
  kills:           number;
  deaths:          number;
  assists:         number;
  cs:              number;   // totalMinionsKilled + neutralMinionsKilled
  win:             boolean;
  summoner1Id:     number;
  summoner2Id:     number;
  items:           number[]; // [item0..item5, trinket=item6]
  doubleKills:     number;
  tripleKills:     number;
  quadraKills:     number;
  pentaKills:      number;
  visionScore:     number;
  goldEarned:      number;
  damageToChamps:  number;
}

export interface MatchSummaryDoc {
  matchId:       string;
  queueId:       number;
  gameMode:      string;
  gameVersion:   string;
  mapId:         number;
  platformId:    string;
  /** ms epoch — when the actual game started (Riot's `gameStartTimestamp` or
   * `gameCreation`, normalised). Used for "x days ago" + ordering. */
  gameStartAt:   number;
  /** Game duration in seconds (Riot's `gameDuration` is sometimes in seconds,
   * sometimes ms depending on patch — we always store seconds). */
  durationSec:   number;
  /** Participants list, viewer-first ordered isn't enforced — UI looks the
   * viewer up by puuid. */
  participants:  MatchParticipantLite[];
  /** ms epoch when this row was written to Firestore. */
  ingestedAt:    number;
}
