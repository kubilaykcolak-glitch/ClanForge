import Link from "next/link";
import { Star } from "lucide-react";
import { getClanLeaderboard, getPlayerLeaderboard } from "@/lib/actions/leaderboard.actions";
import { getActiveSeason } from "@/lib/actions/season.actions";
import { LeaderboardTable, PlayerTable } from "@/components/leaderboard/LeaderboardTables";
import type { LeaderboardEntry, LeaderboardPeriod } from "@/lib/actions/leaderboard.actions";

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
