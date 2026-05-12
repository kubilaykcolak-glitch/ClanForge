import Link from "next/link";
import type { Clan } from "@/types";
import { ClanCard } from "@/components/clan/ClanCard";

async function getPublicClans(): Promise<Clan[]> {
  const { adminDb } = await import("@/lib/firebase/admin");

  const snap = await adminDb
    .collection("clans")
    .where("isPublic", "==", true)
    .orderBy("memberCount", "desc")
    .limit(12)
    .get();

  return snap.docs.map(d => {
    const data = d.data();
    return {
      id:          d.id,
      ...(data as Omit<Clan, "id" | "createdAt" | "updatedAt">),
      createdAt:   data.createdAt?.toDate?.()  ?? new Date(),
      updatedAt:   data.updatedAt?.toDate?.()  ?? new Date(),
    } as Clan;
  });
}

export default async function ClansPage() {
  const clans = await getPublicClans();

  return (
    <div className="max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1
            className="font-display font-bold text-4xl"
            style={{ color: "var(--text-primary)" }}
          >
            Find Your Clan
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Join a community, compete together, dominate.
          </p>
        </div>
        <Link
          href="/clans/create"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all shrink-0"
          style={{ background: "var(--accent)" }}
        >
          + Create Clan
        </Link>
      </div>

      {/* ── Grid or empty state ── */}
      {clans.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {clans.map(clan => (
            <ClanCard key={clan.id} clan={clan} />
          ))}
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center rounded-2xl py-24 text-center"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <span className="text-6xl mb-5 opacity-30">🛡️</span>
          <p
            className="font-display font-semibold text-xl mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            No clans yet
          </p>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            Be the first to create a clan and start recruiting.
          </p>
          <Link
            href="/clans/create"
            className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            + Create Clan
          </Link>
        </div>
      )}
    </div>
  );
}
