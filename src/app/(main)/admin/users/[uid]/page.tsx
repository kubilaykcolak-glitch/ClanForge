import { notFound, redirect } from "next/navigation";
import { adminGetUser, getMyRole } from "@/lib/actions/admin.actions";
import { AdminUserActions } from "@/components/admin/AdminUserActions";

// ─── /admin/users/[uid] ──────────────────────────────────────────────────────
//
// Server-rendered detail page. Fetches the target user via adminGetUser
// (admin-gated) and renders a client component with the action buttons so the
// step-up modal can hook into them via useStepUp.

export default async function AdminUserDetailPage({ params }: { params: { uid: string } }) {
  const meRes  = await getMyRole();
  const myRole = meRes.success ? meRes.data?.role ?? null : null;
  if (myRole !== "admin" && myRole !== "super_admin") redirect("/admin");

  const res = await adminGetUser(params.uid);
  if (!res.success || !res.data) notFound();
  const u = res.data;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl truncate" style={{ color: "var(--text-primary)" }}>
          {u.profile.displayName ?? u.profile.username ?? "(no name)"}
        </h1>
        <p className="text-sm mt-1 font-mono" style={{ color: "var(--text-muted)" }}>
          {u.uid}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <DetailCard title="Account">
          <DetailRow label="Email"     value={u.email ?? "(none)"} />
          <DetailRow label="Verified"  value={u.emailVerified ? "yes" : "no"} />
          <DetailRow label="Disabled"  value={u.disabled ? "yes (banned at auth)" : "no"} />
          <DetailRow label="Created"   value={u.createdAt ? new Date(u.createdAt).toLocaleString() : "(unknown)"} />
          <DetailRow label="Last sign-in" value={u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : "never"} />
        </DetailCard>

        <DetailCard title="Profile">
          <DetailRow label="Username"   value={u.profile.username ?? "(none)"} />
          <DetailRow label="Clan"       value={u.profile.clanName ?? "(none)"} />
          <DetailRow label="XP"         value={String(u.profile.xp)} />
          <DetailRow label="Tournaments" value={`${u.profile.tournamentsWon}W / ${u.profile.tournamentsPlayed}P`} />
          <DetailRow label="Private"    value={u.profile.isPrivate ? "yes" : "no"} />
          <DetailRow label="Verified"   value={u.profile.isVerified ? "yes" : "no"} />
        </DetailCard>
      </div>

      <DetailCard title="Role & Status">
        <DetailRow
          label="Current role"
          value={u.role ?? "(user)"}
          highlight={u.role === "super_admin" ? "danger" : u.role === "admin" ? "accent" : u.role === "moderator" ? "success" : null}
        />
        {u.profile.bannedAt && (
          <>
            <DetailRow label="Banned at"     value={new Date(u.profile.bannedAt).toLocaleString()} highlight="danger" />
            <DetailRow label="Ban reason"    value={u.profile.bannedReason ?? "(none recorded)"} />
          </>
        )}
      </DetailCard>

      {/* Actions (client island — uses useStepUp) */}
      <AdminUserActions
        targetUid={u.uid}
        targetEmail={u.email}
        targetRole={u.role}
        targetBanned={!!u.profile.bannedAt}
        myRole={myRole}
      />
    </div>
  );
}

// ─── Layout helpers ──────────────────────────────────────────────────────────

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
    >
      <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>
        {title}
      </h2>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  highlight,
}: {
  label:     string;
  value:     string;
  highlight?: "danger" | "accent" | "success" | null;
}) {
  const colour = highlight === "danger"  ? "var(--danger)"
              : highlight === "accent"  ? "var(--accent)"
              : highlight === "success" ? "var(--success)"
              : "var(--text-primary)";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-xs text-right truncate" style={{ color: colour }}>{value}</span>
    </div>
  );
}
