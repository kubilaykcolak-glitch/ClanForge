import { Plus } from "lucide-react";
import Link from "next/link";
import { listBountiesForAdmin } from "@/lib/actions/bounty.actions";
import { Badge } from "@/components/ui/Badge";
import { AdminBountyRow } from "@/components/admin/AdminBountyRow";

export default async function AdminBountiesPage() {
  const bounties = await listBountiesForAdmin();
  const claimed = bounties.filter(b => b.status === "claimed");
  const others  = bounties.filter(b => b.status !== "claimed");

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
        <Link
          href="/admin/bounties/new"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold"
          style={{ background: "var(--accent)", color: "white" }}
        >
          <Plus size={14} /> Publish from intake
        </Link>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-lg" style={{ color: "var(--text-primary)" }}>
            Awaiting evidence review
          </h2>
          <Badge variant={claimed.length > 0 ? "warning" : "default"}>{claimed.length}</Badge>
        </div>
        {claimed.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nothing pending.</p>
        ) : (
          <div className="space-y-2">
            {claimed.map(b => <AdminBountyRow key={b.id} bounty={b} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display font-bold text-lg mb-3" style={{ color: "var(--text-primary)" }}>
          All bounties
        </h2>
        {others.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No history yet.</p>
        ) : (
          <div className="space-y-2">
            {others.map(b => <AdminBountyRow key={b.id} bounty={b} />)}
          </div>
        )}
      </section>
    </div>
  );
}
