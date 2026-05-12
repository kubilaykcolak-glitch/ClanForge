import Link from "next/link";
import { Shield, Lock, ArrowRight } from "lucide-react";
import type { Profile } from "@/types";
import { getInitials } from "@/lib/utils";

// ── Shared helpers ────────────────────────────────────────────────────────────

function getLevel(xp: number) {
  return Math.floor(xp / 1000) + 1;
}

function avatarGradient(username: string): string {
  const gradients = [
    "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)",
    "linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)",
    "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
    "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
    "linear-gradient(135deg, #14b8a6 0%, #6366f1 100%)",
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = (hash << 5) - hash + username.charCodeAt(i);
    hash |= 0;
  }
  return gradients[Math.abs(hash) % gradients.length];
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function Avatar({
  username,
  avatarUrl,
  displayName,
}: {
  username:    string;
  avatarUrl?:  string;
  displayName?: string;
}) {
  return (
    <div
      className="shrink-0 rounded-full flex items-center justify-center text-white font-bold font-display overflow-hidden"
      style={{
        width:      44,
        height:     44,
        background: avatarGradient(username),
        fontSize:   15,
      }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={displayName ?? username} className="w-full h-full object-cover" />
      ) : (
        getInitials(displayName ?? username)
      )}
    </div>
  );
}

function ClanTagBadge({ tag }: { tag: string }) {
  return (
    <span
      style={{
        fontFamily:    "'Rajdhani', sans-serif",
        fontSize:      11,
        fontWeight:    700,
        letterSpacing: "0.06em",
        background:    "#8b5cf6",
        color:         "#ede9fe",
        borderRadius:  9999,
        padding:       "2px 8px",
        lineHeight:    1.4,
        whiteSpace:    "nowrap",
        flexShrink:    0,
      }}
    >
      #{tag}
    </span>
  );
}

// ── DEFAULT EXPORT — PlayerCard ───────────────────────────────────────────────

export default function PlayerCard({ profile }: { profile: Profile }) {
  const level   = getLevel(profile.xp);
  const winRate =
    profile.tournamentsPlayed > 0
      ? Math.round((profile.tournamentsWon / profile.tournamentsPlayed) * 100)
      : null;

  return (
    <div
      className="group rounded-2xl transition-[transform,border-color] duration-150 hover:-translate-y-0.5 hover:[border-color:rgba(255,255,255,0.18)]"
      style={{
        background:   "var(--bg-surface)",
        border:       "0.5px solid rgba(255,255,255,0.06)",
        borderRadius: 16,
        padding:      "1rem",
      }}
    >
      {/* ── Top row: avatar + identity ───────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4">
        <Avatar
          username={profile.username}
          avatarUrl={profile.avatarUrl}
          displayName={profile.displayName}
        />

        <div className="flex-1 min-w-0">
          {/* Username + clan tag */}
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span
              className="truncate"
              style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}
            >
              {profile.username}
            </span>
            {profile.clanTag && <ClanTagBadge tag={profile.clanTag} />}
          </div>

          {/* Clan name or no-clan */}
          {profile.clanName && profile.clanSlug ? (
            <Link
              href={`/clans/${profile.clanSlug}`}
              className="inline-flex items-center gap-1 transition-colors hover:underline"
              style={{ fontSize: 12, color: "var(--text-muted)" }}
            >
              <Shield size={11} style={{ flexShrink: 0 }} />
              {profile.clanName}
            </Link>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>No clan</span>
          )}
        </div>
      </div>

      {/* ── Stats row ────────────────────────────────────────────────────── */}
      <div
        className="flex items-center flex-wrap gap-x-1.5 gap-y-1 mb-4"
        style={{ fontSize: 11, color: "var(--text-muted)" }}
      >
        <span>Lvl {level}</span>

        {winRate !== null && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{winRate}% WR</span>
          </>
        )}

        <span style={{ opacity: 0.4 }}>·</span>
        <span>{profile.tournamentsPlayed} tournament{profile.tournamentsPlayed !== 1 ? "s" : ""}</span>
      </div>

      {/* ── Action row ───────────────────────────────────────────────────── */}
      <div
        style={{
          borderTop:  "0.5px solid rgba(255,255,255,0.06)",
          paddingTop: 12,
        }}
      >
        <Link
          href={`/profile/${profile.username}`}
          className="flex items-center justify-between w-full rounded-lg px-3 py-2 transition-colors duration-150 group-hover:[border-color:rgba(255,255,255,0.12)] group-hover:[color:var(--text-primary)]"
          style={{
            background: "transparent",
            border:     "0.5px solid rgba(255,255,255,0.06)",
            color:      "var(--text-secondary)",
            fontSize:   13,
            fontWeight: 500,
          }}
        >
          <span>View Profile</span>
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

// ── NAMED EXPORT — PrivatePlayerCard ─────────────────────────────────────────

type PrivateProps = Pick<Profile, "username" | "clanTag" | "clanName" | "clanSlug">;

export function PrivatePlayerCard({ username, clanTag, clanName, clanSlug }: PrivateProps) {
  return (
    <div
      style={{
        background:   "var(--bg-surface)",
        border:       "0.5px solid rgba(255,255,255,0.06)",
        borderRadius: 16,
        padding:      "1rem",
      }}
    >
      {/* ── Top row ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4">
        <Avatar username={username} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span
              className="truncate"
              style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}
            >
              {username}
            </span>
            {clanTag && <ClanTagBadge tag={clanTag} />}
          </div>

          {clanName && clanSlug ? (
            <Link
              href={`/clans/${clanSlug}`}
              className="inline-flex items-center gap-1 hover:underline"
              style={{ fontSize: 12, color: "var(--text-muted)" }}
            >
              <Shield size={11} style={{ flexShrink: 0 }} />
              {clanName}
            </Link>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>No clan</span>
          )}
        </div>
      </div>

      {/* ── Private body ─────────────────────────────────────────────────── */}
      <div
        className="flex flex-col items-center justify-center py-5 rounded-lg"
        style={{
          background: "var(--bg-elevated)",
          border:     "0.5px solid rgba(255,255,255,0.04)",
        }}
      >
        <Lock
          style={{ color: "var(--text-muted)", marginBottom: 8 }}
          size={40}
          strokeWidth={1.5}
        />
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Private profile</span>
      </div>
    </div>
  );
}
