import Link from "next/link";
import { Plus } from "lucide-react";
import { listAllContentForAdmin } from "@/lib/actions/game-content.actions";

// Admin auth reads the session cookie — must render dynamically.
export const dynamic = "force-dynamic";
import { CONTENT_TYPE_LABELS } from "@/types/game-content";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";

export default async function AdminGameContentPage() {
  const items = await listAllContentForAdmin();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-2xl" style={{ color: "var(--text-primary)" }}>
            Game Content
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Author guides, items, locations, and update notes shown on each game hub.
          </p>
        </div>
        <Link
          href="/admin/game-content/new"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold"
          style={{ background: "var(--accent)", color: "white" }}
        >
          <Plus size={14} /> New entry
        </Link>
      </div>

      {items.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No content yet — create the first entry to populate the Arc Raiders hub.
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
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Game</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/game-content/${item.id}`}
                      className="font-medium hover:underline"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {item.title}
                    </Link>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      /{item.slug}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                    {item.gameSlug}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                    {CONTENT_TYPE_LABELS[item.type].singular}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={item.status === "published" ? "success" : "default"}>
                      {item.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                    {formatDate(item.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
