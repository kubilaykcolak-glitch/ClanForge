import Link from "next/link";
import { cookies } from "next/headers";
import { Plus } from "lucide-react";
import type { Clan } from "@/types";
import { getClanList, type ClanRow } from "@/lib/actions/clan-list.actions";
import { ClansClient } from "@/components/clan/ClansClient";
import { MonoPill } from "@/components/ui/MonoPill";

// ── Data fetch ────────────────────────────────────────────────────────────────

async function getPageData(): Promise<{
  initialItems:       ClanRow[];
  initialCursor:      string | null;
  ownClan:            Clan | null;
  currentUid:         string | null;
  currentClanId:      string | null;
}> {
  const { adminDb, adminAuth } = await import("@/lib/firebase/admin");

  // Public clans — default sort (most members)
  const listResult = await getClanList("members", null);

  let ownClan:            Clan | null   = null;
  let currentUid:         string | null = null;
  let currentClanId:      string | null = null;

  try {
    const cookieStore   = cookies();
    const sessionCookie = cookieStore.get("session")?.value;
    if (sessionCookie) {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
      currentUid = decoded.uid;

      const profileSnap = await adminDb.collection("profiles").doc(currentUid).get();
      if (profileSnap.exists) {
        const pData        = profileSnap.data()!;
        currentClanId      = (pData.clanId      as string | null) ?? null;

        // Surface private clan so owner/members can always find it.
        let candidateClanId = currentClanId;

        if (!candidateClanId) {
          const ownedSnap = await adminDb
            .collection("clans")
            .where("ownerId", "==", currentUid)
            .limit(1)
            .get();
          if (!ownedSnap.empty) {
            candidateClanId = ownedSnap.docs[0].id;
            currentClanId   = candidateClanId;
          }
        }

        if (candidateClanId) {
          const clanSnap = await adminDb.collection("clans").doc(candidateClanId).get();
          if (clanSnap.exists) {
            const data = clanSnap.data()!;
            if (data.isPublic === false) {
              ownClan = {
                id:        clanSnap.id,
                ...(data as Omit<Clan, "id" | "createdAt" | "updatedAt">),
                createdAt: data.createdAt?.toDate?.() ?? new Date(),
                updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
              } as Clan;
            }
          }
        }
      }
    }
  } catch {
    // Invalid/missing session — continue with nulls
  }

  return {
    initialItems:       listResult.data?.items      ?? [],
    initialCursor:      listResult.data?.nextCursor ?? null,
    ownClan,
    currentUid,
    currentClanId,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ClansPage() {
  const {
    initialItems,
    initialCursor,
    ownClan,
    currentUid,
    currentClanId,
  } = await getPageData();

  return (
    <div className="max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
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
        <Link href="/clans/create" className="arena-cta shrink-0">
          <Plus size={14} />
          Create Clan
        </Link>
      </div>

      {/* ── Owner's private clan banner ── */}
      {ownClan && (
        <div
          className="flex items-center justify-between gap-4 rounded-xl px-5 py-4 mb-8"
          style={{
            background: "var(--bg-surface)",
            border:     "1px solid var(--border-default)",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="shrink-0 rounded-lg flex items-center justify-center text-white font-bold font-display overflow-hidden"
              style={{
                width:      40,
                height:     40,
                background: "var(--violet)",
                fontSize:   16,
              }}
            >
              {ownClan.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ownClan.avatarUrl} alt={ownClan.name} className="w-full h-full object-cover" />
              ) : (
                ownClan.name[0]?.toUpperCase()
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="font-display font-semibold truncate"
                  style={{ fontSize: 15, color: "var(--text-primary)" }}
                >
                  {ownClan.name}
                </span>
                <MonoPill
                  color="var(--danger)"
                  bg="rgba(239,68,68,0.12)"
                  style={{ border: "1px solid rgba(239,68,68,0.25)", fontWeight: 700 }}
                >
                  Private
                </MonoPill>
              </div>
              <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                Private clan · hidden from browse
              </p>
            </div>
          </div>

          <Link href={`/clans/${ownClan.slug}`} className="arena-cta-ghost shrink-0">
            View Clan
          </Link>
        </div>
      )}

      {/* ── Interactive clans list ── */}
      <ClansClient
        initialItems={initialItems}
        initialCursor={initialCursor}
        currentUid={currentUid}
        currentClanId={currentClanId}
      />

    </div>
  );
}
