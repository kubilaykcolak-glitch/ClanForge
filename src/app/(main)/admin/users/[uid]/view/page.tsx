import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Eye, AlertCircle } from "lucide-react";
import { adminViewUserState, getMyRole } from "@/lib/actions/admin.actions";

// ─── /admin/users/[uid]/view ─────────────────────────────────────────────────
//
// Read-only comprehensive "show me everything about this user" page.
// Joins profile + auth + Riot integration + recent notifications + recent
// tournament participation + recent audit entries targeting this user.
// The opening of the page is itself audit-logged (action: user.view_state).

export default async function AdminUserViewPage({ params }: { params: { uid: string } }) {
  const meRes = await getMyRole();
  const myRole = meRes.success ? meRes.data?.role ?? null : null;
  if (myRole !== "admin" && myRole !== "super_admin") redirect("/admin");

  const res = await adminViewUserState(params.uid);
  if (!res.success || !res.data) notFound();
  const s = res.data;

  return (
    <div>
      <div className="mb-4">
        <Link href={`/admin/users/${params.uid}`} className="text-xs" style={{ color: "var(--text-muted)" }}>
          ← Back to user
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <Eye size={22} /> {s.profile.displayName ?? s.profile.username ?? "(no name)"}
        </h1>
        <p className="text-xs mt-1 font-mono" style={{ color: "var(--text-muted)" }}>{s.profile.uid}</p>
        <p className="text-[11px] mt-2 inline-flex items-center gap-1 px-2 py-1 rounded"
          style={{ background: "rgba(99,102,241,0.10)", color: "var(--accent)", border: "1px solid rgba(99,102,241,0.30)" }}>
          <AlertCircle size={11} /> This page is read-only. Opening it has been recorded in the audit log.
        </p>
      </div>

      {/* Banned banner if applicable */}
      {s.profile.bannedAt && (
        <div className="rounded-xl px-4 py-3 mb-4 flex items-center gap-3"
          style={{ background: "rgba(239,68,68,0.10)", border: "1px solid var(--danger)" }}>
          <AlertCircle size={16} style={{ color: "var(--danger)" }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--danger)" }}>
              Banned at {new Date(s.profile.bannedAt).toLocaleString()}
            </p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {s.profile.bannedReason ?? "(no reason recorded)"}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Card title="Profile">
          <Row label="Username"  value={s.profile.username ?? "—"} />
          <Row label="Email"     value={s.profile.email ?? "—"} />
          <Row label="Role"      value={s.profile.role ?? "(user)"} />
          <Row label="Clan"      value={s.profile.clanName ?? "—"} />
          <Row label="XP"        value={String(s.profile.xp)} />
          <Row label="Tournaments" value={`${s.profile.tournamentsWon}W / ${s.profile.tournamentsPlayed}P`} />
        </Card>

        <Card title="League integration">
          {s.integration ? (
            <>
              <Row label="Riot ID" value={`${s.integration.gameName}#${s.integration.tagLine}`} />
              <Row label="Region"  value={s.integration.region} />
              <Row label="Summoner Lv" value={String(s.integration.summonerLevel)} />
              {s.integration.soloRank && (
                <>
                  <Row label="Solo rank" value={`${s.integration.soloRank.tier} ${s.integration.soloRank.division} · ${s.integration.soloRank.lp} LP`} />
                  <Row label="W/L"       value={`${s.integration.soloRank.wins}W / ${s.integration.soloRank.losses}L`} />
                </>
              )}
              <Row label="Linked at" value={s.integration.linkedAt ? new Date(s.integration.linkedAt).toLocaleString() : "—"} />
            </>
          ) : (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>No Riot integration linked.</p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Card title="Recent notifications (last 10)">
          {s.recentNotifications.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>None.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {s.recentNotifications.map(n => (
                <div key={n.id} className="text-xs">
                  <code style={{ color: n.read ? "var(--text-muted)" : "var(--accent)" }}>{n.type}</code>
                  <span className="ml-2" style={{ color: "var(--text-muted)" }}>
                    {n.createdAt ? new Date(n.createdAt).toLocaleString() : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Recent tournament participation (last 20)">
          {s.recentTournaments.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>No participation.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {s.recentTournaments.map(t => (
                <Link key={t.id} href={`/admin/tournaments/${t.id}`} className="text-xs flex justify-between gap-3">
                  <span className="truncate" style={{ color: "var(--text-primary)" }}>{t.name}</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {t.status} {t.paymentStatus && `· ${t.paymentStatus}`}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Recent audit entries targeting this user (last 10)">
        {s.recentAuditTargeting.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>No audit history.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {s.recentAuditTargeting.map(a => (
              <div key={a.id} className="text-xs flex items-center gap-2">
                <code className="font-mono px-1.5 py-0.5 rounded"
                  style={{
                    background: "var(--bg-elevated)",
                    color: a.result === "failure" ? "var(--danger)" : "var(--accent)",
                  }}>
                  {a.action}
                </code>
                <span className="truncate flex-1" style={{ color: "var(--text-secondary)" }}>{a.reason}</span>
                <span style={{ color: "var(--text-muted)" }}>
                  {a.at ? new Date(a.at).toLocaleString() : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
      <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-xs text-right truncate" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}
