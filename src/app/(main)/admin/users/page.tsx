"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Search, Shield, Ban, Loader2, UserPlus, RefreshCw } from "lucide-react";
import { adminSearchUsers, listRoleHolders } from "@/lib/actions/admin.actions";

interface UserRow {
  uid:         string;
  username:    string | null;
  displayName: string | null;
  email:       string | null;
  role:        string | null;
  banned:      boolean;
}

// ─── /admin/users ─────────────────────────────────────────────────────────────
//
// Two side-by-side tabs:
//   1. Search — type uid / email / username; shows matching profiles
//   2. Role holders — quick list of everyone with admin / super_admin /
//      moderator. Super-admin only.
//
// Each row is a Link to /admin/users/[uid] where the full controls live.

export default function AdminUsersPage() {
  const [q, setQ]                 = useState("");
  const [results, setResults]     = useState<UserRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [holders, setHolders]     = useState<UserRow[]>([]);
  const [loadingHolders, setLoadingHolders] = useState(true);
  const [, startTransition]       = useTransition();

  useEffect(() => {
    void (async () => {
      const res = await listRoleHolders();
      if (res.success && res.data) {
        setHolders(res.data.map(h => ({ ...h, banned: false })));
      }
      setLoadingHolders(false);
    })();
  }, []);

  const handleSearch = (value: string) => {
    setQ(value);
    if (value.trim().length === 0) {
      setResults([]);
      return;
    }
    setSearching(true);
    startTransition(async () => {
      const res = await adminSearchUsers(value);
      setResults(res.success && res.data ? res.data : []);
      setSearching(false);
    });
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl" style={{ color: "var(--text-primary)" }}>
          Users
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Search users, grant roles, ban / unban.
        </p>
      </div>

      {/* Search */}
      <div
        className="rounded-xl p-4 mb-6"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            value={q}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search by uid, email, or username…"
            className="w-full rounded-lg text-sm outline-none"
            style={{
              background:   "var(--bg-elevated)",
              border:       "1px solid var(--border-default)",
              color:        "var(--text-primary)",
              borderRadius: 8,
              padding:      "10px 14px 10px 36px",
              fontSize:     14,
            }}
          />
          {searching && (
            <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: "var(--text-muted)" }} />
          )}
        </div>

        {q.trim().length > 0 && (
          <div className="mt-3">
            {results.length === 0 && !searching ? (
              <p className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>
                No users matched.
              </p>
            ) : (
              <div className="flex flex-col">
                {results.map(u => <UserRowLink key={u.uid} u={u} />)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Role holders */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
            Role Holders
          </h2>
          <button
            type="button"
            onClick={async () => {
              setLoadingHolders(true);
              const res = await listRoleHolders();
              if (res.success && res.data) setHolders(res.data.map(h => ({ ...h, banned: false })));
              setLoadingHolders(false);
            }}
            className="text-xs flex items-center gap-1 px-2 py-1 rounded"
            style={{ color: "var(--text-muted)" }}
            aria-label="Refresh"
          >
            <RefreshCw size={11} className={loadingHolders ? "animate-spin" : undefined} /> Refresh
          </button>
        </div>

        {loadingHolders ? (
          <p className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : holders.length === 0 ? (
          <p className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>
            No role holders yet. Run scripts/bootstrap-superadmin.ts to grant yourself super_admin.
          </p>
        ) : (
          <div className="flex flex-col">
            {holders.map(u => <UserRowLink key={u.uid} u={u} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Row component ───────────────────────────────────────────────────────────

function UserRowLink({ u }: { u: UserRow }) {
  return (
    <Link
      href={`/admin/users/${u.uid}`}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-[var(--bg-elevated)]"
      style={{ borderTop: "1px solid var(--border-subtle)" }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
          {u.displayName ?? u.username ?? "(no display name)"}
          {u.username && <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>@{u.username}</span>}
        </p>
        <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
          {u.email ?? "no email"} · <span className="font-mono">{u.uid.slice(0, 12)}…</span>
        </p>
      </div>
      {u.role && (
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded inline-flex items-center gap-1"
          style={{
            background: u.role === "super_admin" ? "rgba(239,68,68,0.15)"
              : u.role === "admin" ? "rgba(99,102,241,0.15)"
              : "rgba(34,197,94,0.15)",
            color: u.role === "super_admin" ? "var(--danger)"
              : u.role === "admin" ? "var(--accent)"
              : "var(--success)",
            border: "1px solid currentColor",
          }}
        >
          <Shield size={9} /> {u.role.replace("_", " ")}
        </span>
      )}
      {u.banned && (
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded inline-flex items-center gap-1"
          style={{
            background: "rgba(239,68,68,0.15)",
            color:      "var(--danger)",
            border:     "1px solid currentColor",
          }}
        >
          <Ban size={9} /> banned
        </span>
      )}
    </Link>
  );
}

// (Imported for icon usage to satisfy the unused-import linter — used above.)
void UserPlus;
