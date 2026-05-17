import Link from "next/link";
import { Trophy, Calendar, Users, ScrollText, Shield } from "lucide-react";
import { getAllChallenges } from "@/lib/actions/challenge.actions";
import { getAllSeasons } from "@/lib/actions/season.actions";
import { listRoleHolders, listAuditLog, getMyRole } from "@/lib/actions/admin.actions";

export default async function AdminOverviewPage() {
  const meRes = await getMyRole();
  const myRole = meRes.success ? meRes.data?.role ?? null : null;

  const [challengesResult, seasonsResult, holdersResult, auditResult] = await Promise.all([
    getAllChallenges(),
    getAllSeasons(),
    listRoleHolders(),
    listAuditLog({ pageSize: 10 }),
  ]);

  const challenges  = challengesResult.data ?? [];
  const seasons     = seasonsResult.data    ?? [];
  const holders     = holdersResult.data    ?? [];
  const recentAudit = auditResult.data?.items ?? [];

  const active   = challenges.filter(c => c.status === "active").length;
  const upcoming = challenges.filter(c => c.status === "upcoming").length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl" style={{ color: "var(--text-primary)" }}>Admin Overview</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          You are signed in as <strong style={{ color: "var(--text-primary)" }}>{myRole?.replace("_", " ") ?? "(no role)"}</strong>.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Challenges"      value={challenges.length} sub={`${active} active · ${upcoming} upcoming`} icon={<Trophy size={18} />} href="/admin/challenges" />
        <StatCard label="Seasons"         value={seasons.length}    icon={<Calendar size={18} />} href="/admin/seasons" />
        <StatCard label="Role holders"    value={holders.length}    icon={<Shield size={18} style={{ color: "var(--accent)" }} />} href="/admin/users" />
        <StatCard label="Audit entries"   value={recentAudit.length === 10 ? "10+" : recentAudit.length} icon={<ScrollText size={18} />} href="/admin/audit" />
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 flex-wrap mb-8">
        <Link href="/admin/users" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: "var(--accent)" }}>
          <Users size={14} /> Manage users
        </Link>
        <Link href="/admin/audit" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}>
          <ScrollText size={14} /> View audit log
        </Link>
        <Link href="/admin/challenges/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}>
          <Trophy size={14} /> New challenge
        </Link>
        <Link href="/admin/seasons/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}>
          <Calendar size={14} /> New season
        </Link>
      </div>

      {/* Recent audit */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
            Recent admin activity
          </h2>
          <Link href="/admin/audit" className="text-xs" style={{ color: "var(--accent)" }}>
            View all →
          </Link>
        </div>
        {recentAudit.length === 0 ? (
          <p className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>
            Nothing yet. Privileged actions will appear here.
          </p>
        ) : (
          <div className="flex flex-col">
            {recentAudit.map(r => (
              <div key={r.id} className="flex items-center gap-2 py-2 text-xs"
                style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <code className="font-mono px-1.5 py-0.5 rounded shrink-0"
                  style={{ background: "var(--bg-elevated)", color: r.result === "failure" ? "var(--danger)" : "var(--accent)" }}>
                  {r.action}
                </code>
                <span className="truncate flex-1" style={{ color: "var(--text-secondary)" }}>
                  {r.reason}
                </span>
                <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
                  {new Date(r.at).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon, href,
}: {
  label: string;
  value: number | string;
  sub?:  string;
  icon:  React.ReactNode;
  href:  string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl px-5 py-4 transition-colors block"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
    >
      <div className="flex items-center gap-2 mb-2 opacity-60">{icon}</div>
      <div className="font-display font-bold text-2xl" style={{ color: "var(--text-primary)" }}>{value}</div>
      <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{label}</div>
      {sub && <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </Link>
  );
}
