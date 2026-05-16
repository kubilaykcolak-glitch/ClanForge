"use client";

import { Trophy } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GameRecordCard } from "@/components/profile/GameRecordCard";
import { LinkedGameCard } from "@/components/profile/LinkedGameCard";
import type { GameRecord } from "@/types";
import type { LeagueIntegration } from "@/types/integrations";

// ── ProfileTabs ───────────────────────────────────────────────────────────────
// Client component that renders the tabbed lower section of a profile page:
//   • Tab 1 — Game Records (linked-game integrations first, then manual records)
//   • Tab 2 — Achievements (Phase 2 placeholder)

interface ProfileTabsProps {
  gameRecords:  GameRecord[];
  integrations: LeagueIntegration[];
  profileUid:   string;
  isOwner:      boolean;
}

export function ProfileTabs({ gameRecords, integrations, profileUid, isOwner }: ProfileTabsProps) {
  const hasAny = gameRecords.length > 0 || integrations.length > 0;
  return (
    <Tabs defaultValue="games" className="mb-10">

      {/* ── Tab bar ── */}
      <TabsList
        className="mb-6 h-auto p-1 gap-1"
        style={{
          background: "var(--bg-surface)",
          border:     "1px solid var(--border-subtle)",
          borderRadius: 12,
        }}
      >
        <TabsTrigger
          value="games"
          className="rounded-lg px-5 py-2 text-sm font-medium transition-all data-[state=active]:text-white"
          style={{ fontFamily: "inherit" }}
        >
          Game Records
        </TabsTrigger>

        <TabsTrigger
          value="achievements"
          disabled
          className="rounded-lg px-5 py-2 text-sm font-medium opacity-50 cursor-not-allowed flex items-center gap-2"
          style={{ fontFamily: "inherit" }}
        >
          Achievements
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{
              background: "rgba(99,102,241,0.15)",
              color: "var(--accent)",
              border: "1px solid rgba(99,102,241,0.25)",
            }}
          >
            Phase 2
          </span>
        </TabsTrigger>
      </TabsList>

      {/* ── Game Records content ── */}
      <TabsContent value="games">
        {hasAny ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Linked integrations first — they're live data and most authoritative. */}
            {integrations.map(integration => (
              <LinkedGameCard
                key={`int-${integration.provider}`}
                uid={profileUid}
                isOwner={isOwner}
                integration={integration}
              />
            ))}
            {gameRecords.map(record => (
              <GameRecordCard key={record.id as string} record={record} />
            ))}
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center rounded-xl py-10 text-center"
            style={{
              background: "var(--bg-surface)",
              border:     "1px solid var(--border-subtle)",
              minHeight:  160,
            }}
          >
            <span className="text-3xl mb-3 opacity-30">🏆</span>
            <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              No games logged yet
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Add game records from your profile settings
            </p>
          </div>
        )}
      </TabsContent>

      {/* ── Achievements content (Phase 2 placeholder) ── */}
      <TabsContent value="achievements">
        <div
          className="flex flex-col items-center justify-center rounded-xl py-10 text-center"
          style={{
            background: "var(--bg-surface)",
            border:     "1px solid var(--border-subtle)",
            minHeight:  160,
          }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
            style={{
              background: "rgba(99,102,241,0.10)",
              border:     "1px solid rgba(99,102,241,0.20)",
            }}
          >
            <Trophy size={22} style={{ color: "var(--accent)" }} />
          </div>

          <h3
            className="font-display font-bold text-base mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            Achievements Coming Soon
          </h3>

          <p
            className="text-xs max-w-xs leading-relaxed"
            style={{ color: "var(--text-muted)" }}
          >
            Earn XP and unlock badges as you compete.
          </p>
        </div>
      </TabsContent>
    </Tabs>
  );
}
