// ─── Game-hub Clans section ───────────────────────────────────────────────────
//
// Server component. First page of public clans whose gameFocus matches this
// game. For full search/sort, users follow "View all" out to /clans.

import Link from "next/link";
import { cookies } from "next/headers";
import { Plus, Shield } from "lucide-react";
import { getClanList, type ClanRow } from "@/lib/actions/clan-list.actions";
import { ClanCard } from "@/components/clan/ClanCard";
import type { Clan } from "@/types";
import type { GameSectionProps } from "@/lib/games/types";

function rowToClan(row: ClanRow): Clan {
  return {
    id:           row.id,
    name:         row.name,
    slug:         row.slug,
    description:  row.description,
    bannerUrl:    row.bannerUrl,
    avatarUrl:    row.avatarUrl,
    gameFocus:    row.gameFocus,
    tags:         row.tags,
    ownerId:      row.ownerId,
    isPublic:     row.isPublic,
    isRecruiting: row.isRecruiting,
    memberLimit:  row.memberLimit,
    memberCount:  row.memberCount,
    xp:           row.xp,
    clanTag:      row.clanTag,
  } as Clan;
}

async function getCurrentUserContext() {
  try {
    const { adminAuth, adminDb } = await import("@/lib/firebase/admin");
    const sessionCookie = cookies().get("session")?.value;
    if (!sessionCookie) return null;
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const profSnap = await adminDb.collection("profiles").doc(decoded.uid).get();
    const prof = profSnap.exists ? profSnap.data() : null;
    return {
      uid:         decoded.uid,
      clanId:      (prof?.clanId         as string | null | undefined) ?? null,
      displayName: (prof?.displayName    as string | undefined)         ?? "",
      avatarUrl:   prof?.avatarUrl       as string | undefined,
    };
  } catch {
    return null;
  }
}

export default async function ClansSection({ gameName }: GameSectionProps) {
  const [listRes, me] = await Promise.all([
    getClanList("members", null, gameName),
    getCurrentUserContext(),
  ]);
  const items = listRes.data?.items ?? [];

  return (
    <div>
      <SectionHeader gameName={gameName} count={items.length} />

      {items.length === 0 ? (
        <EmptyState gameName={gameName} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map(row => (
            <ClanCard
              key={row.id}
              clan={rowToClan(row)}
              currentUid={me?.uid ?? null}
              currentClanId={me?.clanId ?? null}
              currentDisplayName={me?.displayName ?? ""}
              currentAvatarUrl={me?.avatarUrl}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ gameName, count }: { gameName: string; count: number }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
      <div>
        <h2 className="font-display font-bold text-xl" style={{ color: "var(--text-primary)" }}>
          Clans playing {gameName}
        </h2>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {count > 0 ? `${count} public clans` : "No clans yet"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/clans"
          className="text-xs font-medium underline-offset-2 hover:underline"
          style={{ color: "var(--text-secondary)" }}
        >
          View all →
        </Link>
        <Link href="/clans/create" className="arena-cta shrink-0">
          <Plus size={14} />
          Create
        </Link>
      </div>
    </div>
  );
}

function EmptyState({ gameName }: { gameName: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-2xl py-16 text-center"
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-subtle)",
      }}
    >
      <Shield size={32} style={{ color: "var(--text-muted)" }} className="mb-3 opacity-40" />
      <p className="text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
        No public clans focused on {gameName} yet
      </p>
      <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
        Build one and grow your roster.
      </p>
      <Link href="/clans/create" className="arena-cta">
        <Plus size={14} />
        Create clan
      </Link>
    </div>
  );
}
