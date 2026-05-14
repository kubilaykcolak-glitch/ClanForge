import Link from "next/link";
import { Trophy, Calendar } from "lucide-react";
import { getAllChallenges } from "@/lib/actions/challenge.actions";
import { getAllSeasons } from "@/lib/actions/season.actions";

export default async function AdminOverviewPage() {
  const [challengesResult, seasonsResult] = await Promise.all([
    getAllChallenges(),
    getAllSeasons(),
  ]);

  const challenges = challengesResult.data ?? [];
  const seasons    = seasonsResult.data    ?? [];
  const active     = challenges.filter(c => c.status === "active").length;
  const upcoming   = challenges.filter(c => c.status === "upcoming").length;

  const stats = [
    { label: "Total Challenges", value: challenges.length, icon: <Trophy size={20} />, href: "/admin/challenges" },
    { label: "Active Now",        value: active,            icon: <Trophy size={20} style={{ color: "var(--success)" }} />, href: "/admin/challenges" },
    { label: "Upcoming",          value: upcoming,          icon: <Calendar size={20} />, href: "/admin/challenges" },
    { label: "Seasons",           value: seasons.length,    icon: <Calendar size={20} style={{ color: "var(--accent)" }} />, href: "/admin/seasons" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl" style={{ color: "var(--text-primary)" }}>Admin Overview</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Manage challenges, seasons, and platform settings.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(s => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-xl px-5 py-4 transition-colors"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
          >
            <div className="flex items-center gap-2 mb-2 opacity-60">{s.icon}</div>
            <div className="font-display font-bold text-2xl" style={{ color: "var(--text-primary)" }}>{s.value}</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{s.label}</div>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 flex-wrap">
        <Link
          href="/admin/challenges/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: "var(--accent)" }}
        >
          <Trophy size={15} /> New Challenge
        </Link>
        <Link
          href="/admin/seasons/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
        >
          <Calendar size={15} /> New Season
        </Link>
      </div>
    </div>
  );
}
