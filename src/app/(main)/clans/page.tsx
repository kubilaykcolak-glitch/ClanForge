import Link from "next/link";
import { cookies } from "next/headers";
import type { Clan } from "@/types";
import { ClanCard } from "@/components/clan/ClanCard";

// ── Data fetch ────────────────────────────────────────────────────────────────

async function getPageData(): Promise<{ publicClans: Clan[]; ownClan: Clan | null }> {
  const { adminDb, adminAuth } = await import("@/lib/firebase/admin");

  // Public clans (browse list)
  const snap = await adminDb
    .collection("clans")
    .where("isPublic", "==", true)
    .orderBy("memberCount", "desc")
    .limit(12)
    .get();

  const publicClans: Clan[] = snap.docs.map(d => {
    const data = d.data();
    return {
      id:        d.id,
      ...(data as Omit<Clan, "id" | "createdAt" | "updatedAt">),
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    } as Clan;
  });

  // Check if the logged-in user owns a private clan so we can surface it
  let ownClan: Clan | null = null;
  try {
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get("session")?.value;
    if (sessionCookie) {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
      const uid = decoded.uid;

      // Get the user's clanId from their profile
      const profileSnap = await adminDb.collection("profiles").doc(uid).get();
      const clanId = (profileSnap.data()?.clanId as string | null) ?? null;

      if (clanId) {
        const clanSnap = await adminDb.collection("clans").doc(clanId).get();
        if (clanSnap.exists) {
          const data = clanSnap.data()!;
          // Only surface it here if: they are the owner AND it's private
          // (if it's public it already appears in the list below)
          if (data.ownerId === uid && data.isPublic === false) {
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
  } catch {
    // Invalid/missing session — continue without ownClan
  }

  return { publicClans, ownClan };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ClansPage() {
  const { publicClans, ownClan } = await getPageData();

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
            {/* Clan avatar */}
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
                <span
                  style={{
                    fontSize:     10,
                    fontWeight:   700,
                    letterSpacing: "0.05em",
                    padding:      "2px 7px",
                    borderRadius: 999,
                    background:   "rgba(239,68,68,0.12)",
                    color:        "var(--danger)",
                    border:       "1px solid rgba(239,68,68,0.25)",
                    whiteSpace:   "nowrap",
                  }}
                >
                  PRIVATE
                </span>
              </div>
              <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                Your clan · hidden from browse
              </p>
            </div>
          </div>

          <Link
            href={`/clans/${ownClan.slug}`}
            className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{
              background: "var(--bg-elevated)",
              border:     "1px solid var(--border-default)",
              color:      "var(--text-secondary)",
            }}
          >
            View Clan
          </Link>
        </div>
      )}

      {/* ── Public clans grid ── */}
      {publicClans.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {publicClans.map(clan => (
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
