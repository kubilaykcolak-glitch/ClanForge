import Link from "next/link";
import { Plus } from "lucide-react";
import { getAllSeasons } from "@/lib/actions/season.actions";
import { updateSeasonStatus } from "@/lib/actions/season.actions";
import { redirect } from "next/navigation";

// ── Server actions ────────────────────────────────────────────────────────────

async function activateSeason(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  await updateSeasonStatus(id, "active");
  redirect("/admin/seasons");
}

async function completeSeason(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  await updateSeasonStatus(id, "completed");
  redirect("/admin/seasons");
}

// ── Status styling ────────────────────────────────────────────────────────────

const STATUS_BG: Record<string, string> = {
  upcoming:  "rgba(99,102,241,0.15)",
  active:    "rgba(34,197,94,0.15)",
  completed: "rgba(107,114,128,0.15)",
};
const STATUS_COLOR: Record<string, string> = {
  upcoming:  "var(--accent)",
  active:    "var(--success)",
  completed: "var(--text-muted)",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminSeasonsPage() {
  const result = await getAllSeasons();
  const seasons = result.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl" style={{ color: "var(--text-primary)" }}>
            Seasons
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            {seasons.length} total
          </p>
        </div>
        <Link
          href="/admin/seasons/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: "var(--accent)" }}
        >
          <Plus size={15} /> New Season
        </Link>
      </div>

      {seasons.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-2xl py-20 text-center"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No seasons yet. Create your first season to enable seasonal leaderboards.
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
        >
          {seasons.map((s, i) => (
            <div
              key={s.id}
              className="px-5 py-4 flex items-center gap-4"
              style={{ borderBottom: i < seasons.length - 1 ? "1px solid var(--border-subtle)" : "none" }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
                    {s.name}
                  </span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full shrink-0 capitalize"
                    style={{
                      background: STATUS_BG[s.status]    ?? "transparent",
                      color:      STATUS_COLOR[s.status] ?? "var(--text-muted)",
                    }}
                  >
                    {s.status}
                  </span>
                </div>
                {s.description && (
                  <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                    {s.description}
                  </p>
                )}
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {new Date(s.startAt).toLocaleDateString()} → {new Date(s.endAt).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {s.status === "upcoming" && (
                  <form action={activateSeason}>
                    <input type="hidden" name="id" value={s.id} />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{
                        background: "rgba(34,197,94,0.12)",
                        color:      "var(--success)",
                        border:     "1px solid rgba(34,197,94,0.25)",
                      }}
                    >
                      Activate
                    </button>
                  </form>
                )}
                {s.status === "active" && (
                  <form action={completeSeason}>
                    <input type="hidden" name="id" value={s.id} />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{
                        background: "rgba(107,114,128,0.12)",
                        color:      "var(--text-muted)",
                        border:     "1px solid var(--border-subtle)",
                      }}
                    >
                      Complete
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
