import Link from "next/link";
import { Trophy, Users, Star, Zap } from "lucide-react";
import { ClanLevelBadge } from "@/components/clan/ClanLevelBadge";
import { getClanLeaderboard, getPlayerLeaderboard } from "@/lib/actions/leaderboard.actions";
import { getActiveSeason } from "@/lib/actions/season.actions";
import type { LeaderboardEntry, LeaderboardPeriod, PlayerLeaderboardEntry } from "@/lib/actions/leaderboard.actions";

// ── Data fetch ────────────────────────────────────────────────────────────────

async function getLeaderboardData() {
  const [weekly, monthly, alltime, seasonResult, playersResult] = await Promise.all([
    getClanLeaderboard("weekly",  undefined, 25),
    getClanLeaderboard("monthly", undefined, 25),
    getClanLeaderboard("alltime", undefined, 25),
    getActiveSeason(),
    getPlayerLeaderboard(25),
  ]);

  const season = seasonResult.data ?? null;
  const seasonal = season
    ? await getClanLeaderboard("season", season.id, 25)
    : { success: true, data: [] as LeaderboardEntry[] };

  return {
    weekly:   weekly.data       ?? [],
    monthly:  monthly.data      ?? [],
    alltime:  alltime.data      ?? [],
    seasonal: seasonal.data     ?? [],
    players:  playersResult.data ?? [],
    season,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg">🥇</span>;
  if (rank === 2) return <span className="text-lg">🥈</span>;
  if (rank === 3) return <span className="text-lg">🥉</span>;
  return (
    <span
      className="w-7 text-center text-sm font-bold"
      style={{ color: "var(--text-muted)" }}
    >
      {rank}
    </span>
  );
}

function LeaderboardTable({ entries, emptyLabel }: { entries: LeaderboardEntry[]; emptyLabel: string }) {
  if (entries.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-2xl py-20 text-center"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
      >
        <Trophy size={32} className="mb-3 opacity-20" style={{ color: "var(--text-muted)" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
    >
      {/* Column headers */}
      <div
        className="grid items-center px-5 py-2.5"
        style={{
          gridTemplateColumns: "48px 1fr auto auto",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        {["Rank", "Clan", "Members", "Points"].map(h => (
          <span key={h} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            {h}
          </span>
        ))}
      </div>

      {entries.map((entry, i) => (
        <Link
          key={entry.clanId}
          href={`/clans/${entry.clanSlug}`}
          className="grid items-center px-5 py-4 transition-colors"
          style={{
            gridTemplateColumns: "48px 1fr auto auto",
            borderBottom: i < entries.length - 1 ? "1px solid var(--border-subtle)" : "none",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-elevated)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          {/* Rank */}
          <div className="flex items-center">
            <RankBadge rank={entry.rank} />
          </div>

          {/* Clan */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-white font-bold font-display overflow-hidden text-sm"
              style={{ background: "var(--violet)" }}
            >
              {entry.clanAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.clanAvatarUrl} alt={entry.clanName} className="w-full h-full object-cover" />
              ) : (
                entry.clanName[0]?.toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-display font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>
                  {entry.clanName}
                </span>
                <ClanLevelBadge xp={entry.clanXp} size="sm" />
                {entry.clanTag && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded font-mono shrink-0"
                    style={{
                      background: "var(--bg-overlay)",
                      color:      "var(--text-muted)",
                      border:     "1px solid var(--border-subtle)",
                    }}
                  >
                    [{entry.clanTag}]
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Members */}
          <div className="flex items-center gap-1 text-sm pr-6" style={{ color: "var(--text-muted)" }}>
            <Users size={13} />
            <span>{entry.memberCount}</span>
          </div>

          {/* Points */}
          <div className="text-right">
            <span className="font-bold font-display text-base" style={{ color: "var(--warning)" }}>
              {entry.points.toLocaleString()}
            </span>
            <span className="text-xs ml-1" style={{ color: "var(--text-muted)" }}>pts</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ── Player table ──────────────────────────────────────────────────────────────

function PlayerTable({ entries }: { entries: PlayerLeaderboardEntry[] }) {
  if (entries.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-2xl py-20 text-center"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
      >
        <Trophy size={32} className="mb-3 opacity-20" style={{ color: "var(--text-muted)" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No players on the board yet.</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
    >
      {/* Column headers */}
      <div
        className="grid items-center px-5 py-2.5"
        style={{
          gridTemplateColumns: "48px 1fr auto auto",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        {["Rank", "Player", "Level", "XP"].map(h => (
          <span key={h} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            {h}
          </span>
        ))}
      </div>

      {entries.map((entry, i) => (
        <Link
          key={entry.uid}
          href={`/profile/${entry.username}`}
          className="grid items-center px-5 py-4 transition-colors"
          style={{
            gridTemplateColumns: "48px 1fr auto auto",
            borderBottom: i < entries.length - 1 ? "1px solid var(--border-subtle)" : "none",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-elevated)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          {/* Rank */}
          <div className="flex items-center">
            <RankBadge rank={entry.rank} />
          </div>

          {/* Player */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-sm overflow-hidden"
              style={{ background: "var(--accent)" }}
            >
              {entry.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.avatarUrl} alt={entry.displayName} className="w-full h-full object-cover" />
              ) : (
                entry.displayName[0]?.toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>
                {entry.displayName}
              </p>
              <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                @{entry.username}
              </p>
            </div>
          </div>

          {/* Level */}
          <div className="text-sm pr-6" style={{ color: "var(--text-secondary)" }}>
            Lv. {entry.level}
          </div>

          {/* XP */}
          <div className="text-right">
            <div className="flex items-center gap-1 justify-end">
              <Zap size={12} style={{ color: "var(--accent)" }} />
              <span className="font-bold font-display text-base" style={{ color: "var(--accent)" }}>
                {entry.xp.toLocaleString()}
              </span>
            </div>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>XP</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ── Tab component (pure CSS, no client JS needed) ─────────────────────────────

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className="px-5 py-2 rounded-lg text-sm font-medium transition-colors"
      style={{
        background: active ? "var(--bg-elevated)" : "transparent",
        color:      active ? "var(--text-primary)" : "var(--text-muted)",
        border:     active ? "1px solid var(--border-default)" : "1px solid transparent",
      }}
    >
      {label}
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface Props {
  searchParams: { tab?: string };
}

export default async function LeaderboardPage({ searchParams }: Props) {
  const { weekly, monthly, alltime, seasonal, players, season } = await getLeaderboardData();
  const tab = searchParams.tab ?? "weekly";

  const isPlayersTab = tab === "players";
  const clanPeriod   = tab as LeaderboardPeriod;

  const clanTabs: Array<{ value: string; label: string }> = [
    { value: "weekly",   label: "Weekly"   },
    { value: "monthly",  label: "Monthly"  },
    ...(season ? [{ value: "season", label: season.name }] : []),
    { value: "alltime",  label: "All-Time" },
  ];

  const currentClan =
    clanPeriod === "weekly"  ? weekly   :
    clanPeriod === "monthly" ? monthly  :
    clanPeriod === "season"  ? seasonal :
    alltime;

  return (
    <div className="max-w-4xl mx-auto">

      {/* ── Header ── */}
      <div className="mb-8">
        <h1 className="font-display font-bold text-4xl" style={{ color: "var(--text-primary)" }}>
          Leaderboard
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {isPlayersTab
            ? "Top players ranked by total XP earned."
            : "Top clans ranked by challenge points earned."}
        </p>
      </div>

      {/* ── Season banner (clans only) ── */}
      {!isPlayersTab && season && (
        <div
          className="rounded-xl px-5 py-4 mb-6 flex items-center gap-3"
          style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)",
            border:     "1px solid rgba(99,102,241,0.25)",
          }}
        >
          <Star size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {season.name} is active
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {season.description || "Complete challenges to earn season points and exclusive rewards."}
            </p>
          </div>
        </div>
      )}

      {/* ── Top-level view toggle (Clans / Players) ── */}
      <div className="flex items-center gap-3 mb-4">
        <TabLink href="/leaderboard?tab=weekly"  label="Clans"   active={!isPlayersTab} />
        <TabLink href="/leaderboard?tab=players" label="Players" active={isPlayersTab}  />
      </div>

      {/* ── Period tabs (clans only) ── */}
      {!isPlayersTab && (
        <div
          className="flex items-center gap-1 p-1 rounded-xl mb-6 w-fit"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
        >
          {clanTabs.map(t => (
            <TabLink
              key={t.value}
              href={`/leaderboard?tab=${t.value}`}
              label={t.label}
              active={tab === t.value}
            />
          ))}
        </div>
      )}

      {/* ── Table ── */}
      {isPlayersTab ? (
        <PlayerTable entries={players} />
      ) : (
        <LeaderboardTable
          entries={currentClan}
          emptyLabel={
            tab === "weekly"  ? "No points earned this week yet. Complete challenges to get on the board!" :
            tab === "monthly" ? "No points earned this month yet." :
            tab === "season"  ? "No season points yet. Complete challenges to climb the rankings!" :
            "No points on record yet."
          }
        />
      )}
    </div>
  );
}
