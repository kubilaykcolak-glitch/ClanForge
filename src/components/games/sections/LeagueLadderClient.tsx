"use client";

// ─── LoL Ladder client island ────────────────────────────────────────────────
//
// Pure presentation + tab state. The server fetches both lists; we just flip
// which one renders. Rows link to the player's public profile. The viewer's
// own row is tinted to make it easy to find.

import Link from "next/link";
import { useState } from "react";
import { Globe, Shield } from "lucide-react";
import { formatRank, tierColour } from "@/lib/riot/assets";
import type { LadderRow } from "@/lib/riot/ladder";

type Tab = "global" | "clan";

export function LeagueLadderClient({
  global,
  clan,
  hasClan,
  viewerUid,
}: {
  global:    LadderRow[];
  clan:      LadderRow[];
  hasClan:   boolean;
  viewerUid: string | null;
}) {
  const [tab, setTab] = useState<Tab>(hasClan && clan.length > 0 ? "clan" : "global");
  const rows = tab === "clan" ? clan : global;

  return (
    <section className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 -mx-1 px-1" role="tablist">
        <TabButton
          active={tab === "global"}
          onClick={() => setTab("global")}
          icon={<Globe size={12} />}
          label={`Global (${global.length})`}
        />
        <TabButton
          active={tab === "clan"}
          onClick={() => setTab("clan")}
          icon={<Shield size={12} />}
          label={hasClan ? `My Clan (${clan.length})` : "My Clan"}
          disabled={!hasClan}
        />
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {tab === "clan" && !hasClan
              ? "Join a clan to see a clan-only ladder."
              : tab === "clan"
                ? "No clanmates have linked their LoL account yet."
                : "No ranked players yet."}
          </p>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <Th width={50}>#</Th>
                <Th>Player</Th>
                <Th>Rank</Th>
                <Th align="right">W / L</Th>
                <Th align="right">Win %</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const isMe = !!viewerUid && row.uid === viewerUid;
                const games = row.wins + row.losses;
                const winPct = games > 0 ? Math.round((row.wins / games) * 100) : 0;
                return (
                  <tr
                    key={row.uid}
                    style={{
                      borderBottom: "1px solid var(--border-subtle)",
                      background: isMe ? "rgba(99,102,241,0.06)" : "transparent",
                    }}
                  >
                    <td className="px-3 py-2 text-xs font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>
                      #{idx + 1}
                    </td>
                    <td className="px-3 py-2">
                      <PlayerCell row={row} isMe={isMe} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-semibold" style={{ color: tierColour(row.tier) }}>
                        {formatRank(row.tier, row.division)}
                      </span>
                      <span className="ml-1.5 text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
                        {row.lp} LP
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs" style={{ color: "var(--text-secondary)" }}>
                      <span style={{ color: "var(--success)" }}>{row.wins}</span>
                      <span style={{ color: "var(--text-muted)" }}> / </span>
                      <span style={{ color: "var(--danger)" }}>{row.losses}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs" style={{ color: "var(--text-primary)" }}>
                      {games > 0 ? `${winPct}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  disabled,
}: {
  active:    boolean;
  onClick:   () => void;
  icon:      React.ReactNode;
  label:     string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-40"
      style={
        active
          ? { background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }
          : { color: "var(--text-muted)", border: "1px solid transparent", background: "transparent" }
      }
    >
      {icon}
      {label}
    </button>
  );
}

function Th({ children, width, align }: { children: React.ReactNode; width?: number; align?: "left" | "right" }) {
  return (
    <th
      className="px-3 py-2 text-xs font-semibold uppercase tracking-wider"
      style={{
        color: "var(--text-muted)",
        width,
        textAlign: align ?? "left",
      }}
    >
      {children}
    </th>
  );
}

function PlayerCell({ row, isMe }: { row: LadderRow; isMe: boolean }) {
  const fallback = row.displayName.charAt(0).toUpperCase() || "?";
  return (
    <Link
      href={`/profile/${encodeURIComponent(row.displayName)}`}
      className="flex items-center gap-2.5 group"
    >
      <div
        className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-xs font-semibold text-white shrink-0"
        style={{ background: "var(--accent)" }}
      >
        {row.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.avatarUrl} alt={row.displayName} className="w-full h-full object-cover" />
        ) : (
          fallback
        )}
      </div>
      <div className="min-w-0 flex flex-col">
        <span
          className="truncate font-medium group-hover:underline"
          style={{ color: isMe ? "var(--accent)" : "var(--text-primary)" }}
        >
          {row.displayName || "Unknown"}
          {isMe && <span className="ml-1 text-[10px]" style={{ color: "var(--accent)" }}>(you)</span>}
        </span>
        <span className="truncate text-[10px]" style={{ color: "var(--text-muted)" }}>
          {row.riotIdGameName}
          {row.riotIdTagline && <span>#{row.riotIdTagline}</span>}
          {row.region && <span className="ml-1 uppercase">· {row.region}</span>}
        </span>
      </div>
    </Link>
  );
}
