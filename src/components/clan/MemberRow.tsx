import { Crown } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { getInitials, formatDate } from "@/lib/utils";
import type { ClanRole } from "@/types";

interface MemberRowProps {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  role: ClanRole;
  joinedAt: Date;
}

export function MemberRow({ displayName, avatarUrl, role, joinedAt }: MemberRowProps) {
  const roleBadge = role === "leader"
    ? "danger"
    : role === "officer"
    ? "warning"
    : role === "pending"
    ? "default"
    : "clan";

  return (
    <div className="flex items-center gap-3 py-2.5">
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 overflow-hidden"
        style={{ background: "var(--accent)" }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          getInitials(displayName)
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {role === "leader" && (
            <Crown size={12} style={{ color: "var(--warning)" }} />
          )}
          <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
            {displayName}
          </p>
        </div>
        <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
          Joined {formatDate(joinedAt)}
        </p>
      </div>

      {/* Role badge */}
      <Badge variant={roleBadge as Parameters<typeof Badge>[0]["variant"]}>
        {role}
      </Badge>
    </div>
  );
}
