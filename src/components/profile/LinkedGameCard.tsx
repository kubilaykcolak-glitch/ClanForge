"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import type { LeagueIntegration } from "@/types/integrations";
import { championIconUrl, formatRank, tierColour } from "@/lib/riot/assets";
import { refreshLeagueStats } from "@/lib/actions/integrations.actions";

interface LinkedGameCardProps {
  uid: string;
  isOwner: boolean;
  integration: LeagueIntegration;
}

// ─── LinkedGameCard ───────────────────────────────────────────────────────────
// Compact, single-game integration card. Same external dimensions as
// GameRecordCard so it fits the existing profile grid without layout shift.
// Designed to be the canonical shape for future game integrations (Valorant,
// TFT, …) — provider-specific bits live in this file's render only.

export function LinkedGameCard({ uid, isOwner, integration }: LinkedGameCardProps) {
  const [pending, startTransition] = useTransition();
  const [lastSync, setLastSync] = useState<Date>(() => coerceDate(integration.lastSyncAt));

  const { account, snapshot } = integration;
  const rank   = snapshot.soloRank ?? snapshot.flexRank;
  const tier   = rank?.tier ?? null;
  const colour = tierColour(tier);
  const total  = (rank?.wins ?? 0) + (rank?.losses ?? 0);
  const winPct = total > 0 ? Math.round(((rank?.wins ?? 0) / total) * 100) : null;

  const handleRefresh = () => {
    startTransition(async () => {
      const res = await refreshLeagueStats(uid, true);
      if (res.success && res.data) {
        setLastSync(new Date(res.data.lastSyncAt));
        toast.success("Stats refreshed");
      } else {
        toast.error(res.error ?? "Failed to refresh");
      }
    });
  };

  return (
    <div
      className="relative rounded-xl p-5 flex flex-col gap-3"
      style={{
        background: "var(--bg-elevated)",
        border:     "1px solid var(--border-default)",
      }}
    >
      {/* ── Header: game name + verified pill ──────────────────────────────── */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            className="font-display font-semibold leading-tight truncate"
            style={{ fontSize: 20, color: "var(--text-primary)" }}
          >
            League of Legends
          </h3>
          <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
            {account.gameName}#{account.tagLine} · {account.region.toUpperCase()}
          </p>
        </div>

        <span
          title="Synced from Riot"
          className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider"
          style={{
            background: "rgba(99,102,241,0.12)",
            color:      "var(--accent)",
            border:     "1px solid rgba(99,102,241,0.30)",
          }}
        >
          <LinkIcon size={9} />
          Linked
        </span>
      </div>

      {/* ── Rank chip + W/L summary ────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {rank ? (
          <>
            <div
              className="flex flex-col items-start px-3 py-1.5 rounded-lg"
              style={{
                background: `${colour}1A`,
                border:     `1px solid ${colour}55`,
              }}
            >
              <span
                className="text-xs font-bold uppercase tracking-wider leading-tight"
                style={{ color: colour }}
              >
                {formatRank(rank.tier, rank.division)}
              </span>
              <span className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>
                {rank.lp} LP
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex gap-3 text-xs">
                <span style={{ color: "var(--success)" }}>{rank.wins}W</span>
                <span style={{ color: "var(--danger)"  }}>{rank.losses}L</span>
                {winPct !== null && (
                  <span style={{ color: "var(--text-muted)" }}>{winPct}%</span>
                )}
              </div>
              <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                {snapshot.soloRank ? "Ranked Solo/Duo" : "Ranked Flex"}
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1">
            <span
              className="inline-block text-xs font-semibold px-2.5 py-1 rounded-md uppercase tracking-wider"
              style={{
                background: "var(--bg-overlay)",
                color:      "var(--text-muted)",
                border:     "1px solid var(--border-subtle)",
              }}
            >
              Unranked
            </span>
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
              Level {snapshot.summonerLevel}
            </p>
          </div>
        )}
      </div>

      {/* ── Top champions ───────────────────────────────────────────────────── */}
      {snapshot.topChampions.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Top
          </span>
          <div className="flex gap-1.5">
            {snapshot.topChampions.slice(0, 3).map(c => (
              <div
                key={c.championId}
                className="relative w-9 h-9 rounded-md overflow-hidden"
                style={{ border: "1px solid var(--border-subtle)" }}
                title={`Mastery ${c.level} · ${c.points.toLocaleString()} pts`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={championIconUrl(c.championId)}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                <span
                  className="absolute bottom-0 right-0 text-[9px] font-bold px-1 leading-tight"
                  style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}
                >
                  {c.level}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Footer: last sync + refresh ─────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          Updated {relativeTime(lastSync)}
        </span>
        {isOwner && (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={pending}
            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md transition-colors disabled:opacity-50"
            style={{
              background: "var(--bg-surface)",
              border:     "1px solid var(--border-subtle)",
              color:      "var(--text-secondary)",
            }}
            title="Refresh stats from Riot"
          >
            <RefreshCw size={11} className={pending ? "animate-spin" : undefined} />
            Refresh
          </button>
        )}
      </div>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function coerceDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    const maybe = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybe.toDate === "function") return maybe.toDate();
    if (typeof maybe.seconds === "number")  return new Date(maybe.seconds * 1000);
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

function relativeTime(date: Date): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60)    return "just now";
  if (diffSec < 3600)  return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}
