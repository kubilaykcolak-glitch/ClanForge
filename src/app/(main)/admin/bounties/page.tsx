import { listBountiesForAdmin } from "@/lib/actions/bounty.actions";

// Admin auth reads the session cookie — must render dynamically.
export const dynamic = "force-dynamic";

import { AdminBountyQueue } from "@/components/admin/AdminBountyQueue";
import { AdminPublishBountySheet } from "@/components/admin/AdminPublishBountySheet";

// ─── /admin/bounties ─────────────────────────────────────────────────────────
//
// Mod-side primary surface for the Wanted/Bounty system. Server fetches
// every bounty once via listBountiesForAdmin (mod-gated; capped at 200),
// then hands the payload to AdminBountyQueue which owns all interactive
// state: tab selection (?tab=), search, count badges, filtered list.
//
// Stacked-sections layout retired in §2d — replaced with the tabbed queue.
// The "Publish from intake" CTA still lives here for now; once §2g lands
// it'll move into a side-panel slide-over.

export default async function AdminBountiesPage() {
  const bounties = await listBountiesForAdmin();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-2xl" style={{ color: "var(--text-primary)" }}>
            Bounties
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Review intake tickets, publish new bounties, and approve/reject claim evidence.
          </p>
        </div>
        <AdminPublishBountySheet />
      </div>

      <AdminBountyQueue bounties={bounties} />
    </div>
  );
}
