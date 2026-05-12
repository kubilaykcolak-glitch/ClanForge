"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { TournamentCard } from "./TournamentCard";
import type { Tournament } from "@/types";

interface TournamentTabsProps {
  open:      Tournament[];
  live:      Tournament[];
  upcoming:  Tournament[];
  completed: Tournament[];
}

interface TabData {
  value: string;
  label: string;
  items: Tournament[];
}

function EmptyState({ label }: { label: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-2xl py-20 text-center"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <span className="text-5xl mb-4 opacity-30">🏆</span>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        No {label.toLowerCase()} tournaments right now
      </p>
    </div>
  );
}

export function TournamentTabs({
  open,
  live,
  upcoming,
  completed,
}: TournamentTabsProps) {
  const tabs: TabData[] = [
    { value: "open",     label: `Open (${open.length})`,        items: open },
    { value: "live",     label: `Live (${live.length})`,        items: live },
    { value: "upcoming", label: `Starting Soon (${upcoming.length})`, items: upcoming },
    { value: "completed",label: `Completed (${completed.length})`,    items: completed },
  ];

  return (
    <Tabs defaultValue="open">
      <TabsList
        className="mb-6 h-auto p-1 gap-1"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {tabs.map(tab => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors data-[active]:!bg-[var(--bg-elevated)] data-[active]:!text-[var(--text-primary)] data-[active]:!border-[var(--border-default)] hover:!text-[var(--text-secondary)]"
            style={
              {
                color: "var(--text-muted)",
                "--tw-ring-shadow": "none",
              } as React.CSSProperties
            }
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.map(tab => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.items.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {tab.items.map(t => (
                <TournamentCard key={t.id} tournament={t} />
              ))}
            </div>
          ) : (
            <EmptyState label={tab.label} />
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
