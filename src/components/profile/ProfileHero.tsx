import Link from "next/link";
import { Shield } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import type { Profile } from "@/types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface ProfileHeroProps {
  profile:       Profile;
  clanTag?:      string | null;
  clanName?:     string | null;
  clanSlug?:     string | null;
  bannerUrl?:    string | null;
  accentColour?: string | null;
}

// ── Platform links ────────────────────────────────────────────────────────────

function PlatformLinks({ profile }: { profile: Profile }) {
  const links = [
    { key: "steamUrl",     label: "Steam",   href: profile.steamUrl,    icon: "🎮" },
    { key: "twitchUrl",    label: "Twitch",  href: profile.twitchUrl,   icon: "📺" },
    { key: "discordTag",   label: "Discord", href: null,                icon: "💬", display: profile.discordTag },
    { key: "xboxGamertag", label: "Xbox",    href: null,                icon: "🎯", display: profile.xboxGamertag },
    { key: "psnId",        label: "PSN",     href: null,                icon: "🕹️", display: profile.psnId },
  ].filter(l => l.href || l.display);

  if (links.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {links.map(l =>
        l.href ? (
          <a
            key={l.key}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors"
            style={{
              background: "var(--bg-elevated)",
              border:     "1px solid var(--border-default)",
              color:      "var(--text-secondary)",
            }}
          >
            <span>{l.icon}</span> {l.label}
          </a>
        ) : (
          <span
            key={l.key}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
            style={{
              background: "var(--bg-elevated)",
              border:     "1px solid var(--border-default)",
              color:      "var(--text-secondary)",
            }}
            title={l.display ?? ""}
          >
            <span>{l.icon}</span> {l.display}
          </span>
        )
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProfileHero({
  profile,
  clanTag,
  clanName,
  clanSlug,
  bannerUrl,
  accentColour,
}: ProfileHeroProps) {
  const accent = accentColour ?? "#6366f1";
  return (
    <>
      {/* ── Banner + avatar ──────────────────────────────────────────────── */}
      <div className="relative mb-14">
        <div className="w-full rounded-xl overflow-hidden" style={{ height: 160 }}>
          <div
            className="w-full h-full"
            style={bannerUrl
              ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
              : { background: "linear-gradient(135deg, #1e1b4b 0%, #0a0a0f 100%)" }}
          />
        </div>

        {/* Avatar — overlapping banner bottom */}
        <div className="absolute left-6 flex items-end" style={{ bottom: -44 }}>
          <div
            className="flex items-center justify-center rounded-full text-2xl font-bold text-white font-display overflow-hidden"
            style={{
              width:     88,
              height:    88,
              background: accent,
              border:    "3px solid var(--bg-base)",
              boxShadow: `0 0 0 2px ${accent}`,
            }}
          >
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt={profile.username}
                className="w-full h-full object-cover"
              />
            ) : (
              profile.displayName?.[0]?.toUpperCase() ?? "?"
            )}
          </div>
        </div>

        {/* Verified / admin badges — top-right of banner */}
        <div className="absolute top-3 right-3 flex gap-2">
          {profile.isVerified && <Badge variant="info">✓ Verified</Badge>}
          {profile.isAdmin    && <Badge variant="danger">Admin</Badge>}
        </div>
      </div>

      {/* ── Identity ─────────────────────────────────────────────────────── */}
      <div className="px-2 mb-6">

        {/* Username row — inline clan tag badge when set */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <h1
            className="font-display font-bold"
            style={{ fontSize: 28, color: "var(--text-primary)", lineHeight: 1.1 }}
          >
            {profile.username}
          </h1>

          {clanTag && (
            <span
              style={{
                display:       "inline-flex",
                alignItems:    "center",
                fontSize:      11,
                fontWeight:    700,
                letterSpacing: "0.06em",
                fontFamily:    "'Rajdhani', sans-serif",
                padding:       "2px 8px",
                borderRadius:  999,
                background:    accent,
                color:         "#fff",
                lineHeight:    1,
                whiteSpace:    "nowrap",
              }}
            >
              #{clanTag}
            </span>
          )}
        </div>

        {/* Clan name row — only shown when clan name is known */}
        {clanName && (
          <div
            className="flex items-center gap-1.5 mt-1"
            style={{ minHeight: 20 }}
          >
            <Shield
              size={13}
              style={{ color: "#8b5cf6", flexShrink: 0 }}
              aria-hidden="true"
            />
            <Link
              href={`/clans/${clanSlug ?? ""}`}
              className="text-sm font-medium transition-colors hover:underline"
              style={{ color: "#8b5cf6" }}
            >
              {clanName}
            </Link>
          </div>
        )}

        {/* Display name */}
        <p className="text-base mt-1" style={{ color: "var(--text-secondary)" }}>
          {profile.displayName}
        </p>

        {profile.country && (
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            {profile.country}
          </p>
        )}

        {profile.bio && (
          <p
            className="mt-3 text-sm leading-relaxed max-w-xl"
            style={{ color: "var(--text-secondary)" }}
          >
            {profile.bio.slice(0, 200)}
          </p>
        )}

        <PlatformLinks profile={profile} />

        <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Joined {formatDate(profile.createdAt)}
        </p>
      </div>
    </>
  );
}
