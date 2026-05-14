import Link from "next/link";
import { Users } from "lucide-react";
import type { Clan } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { getInitials } from "@/lib/utils";
import { ClanCardJoinButton } from "./ClanCardJoinButton";
import { ClanLevelBadge } from "./ClanLevelBadge";

interface ClanCardProps {
  clan:               Clan;
  currentUid?:        string | null;
  currentClanId?:     string | null;
  currentDisplayName?: string;
  currentAvatarUrl?:  string;
}

export function ClanCard({
  clan,
  currentUid        = null,
  currentClanId     = null,
  currentDisplayName = "",
  currentAvatarUrl,
}: ClanCardProps) {
  const slug            = clan.slug ?? clan.id ?? "";
  const isAlreadyMember = currentClanId === clan.id;
  const isInAnotherClan = currentClanId !== null && currentClanId !== clan.id;
  const isFull          = clan.memberCount >= clan.memberLimit;

  return (
    <div
      className="group rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-glow flex flex-col"
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-default)",
      }}
    >
      {/* ── Clickable area (banner + info) ── */}
      <Link href={`/clans/${slug}`} className="block flex-1">

        {/* Banner */}
        <div className="relative" style={{ height: 120 }}>
          {clan.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clan.bannerUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full"
              style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #0a0a0f 100%)" }}
            />
          )}

          {clan.isRecruiting && (
            <span className="absolute top-2 right-2">
              <Badge variant="success">
                <span className="mr-1 inline-block w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                Recruiting
              </Badge>
            </span>
          )}

          {/* Avatar */}
          <div
            className="absolute flex items-center justify-center rounded-xl text-white font-bold font-display overflow-hidden"
            style={{
              width:      40,
              height:     40,
              bottom:    -16,
              left:       16,
              background: "var(--violet)",
              border:     "2px solid var(--bg-surface)",
            }}
          >
            {clan.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={clan.avatarUrl} alt={clan.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm">{getInitials(clan.name)}</span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-4 pt-6 pb-3">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3
              className="font-display font-bold text-lg leading-tight truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {clan.name}
            </h3>
            <ClanLevelBadge xp={clan.xp ?? 0} size="sm" />
          </div>

          <div className="flex items-center gap-2 mb-3">
            <Badge variant="tournament">{clan.gameFocus}</Badge>
            <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
              <Users size={12} />
              {clan.memberCount}/{clan.memberLimit}
            </span>
          </div>

          {clan.description && (
            <p
              className="text-sm leading-relaxed line-clamp-2"
              style={{ color: "var(--text-secondary)" }}
            >
              {clan.description}
            </p>
          )}
        </div>
      </Link>

      {/* ── Join / action button (outside the Link) ── */}
      <div className="px-4 pb-4">
        <ClanCardJoinButton
          clanId={clan.id ?? ""}
          clanSlug={slug}
          isRecruiting={clan.isRecruiting}
          isFull={isFull}
          isAlreadyMember={isAlreadyMember}
          isInAnotherClan={isInAnotherClan}
          currentUid={currentUid}
          currentDisplayName={currentDisplayName}
          currentAvatarUrl={currentAvatarUrl}
        />
      </div>
    </div>
  );
}
