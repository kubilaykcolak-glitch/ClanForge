import Link from "next/link";
import { Plus } from "lucide-react";
import { getAllChallenges } from "@/lib/actions/challenge.actions";
import { updateChallengeStatus } from "@/lib/actions/challenge.actions";
import { redirect } from "next/navigation";
import type { ChallengeStatus } from "@/types";

// ── Server actions for status updates ────────────────────────────────────────

async function activateChallenge(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  await updateChallengeStatus(id, "active");
  redirect("/admin/challenges");
}

async function cancelChallenge(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  await updateChallengeStatus(id, "cancelled");
  redirect("/admin/challenges");
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ChallengeStatus, string> = {
  upcoming:  "rgba(99,102,241,0.15)",
  active:    "rgba(34,197,94,0.15)",
  completed: "rgba(107,114,128,0.15)",
  cancelled: "rgba(239,68,68,0.12)",
};

const STATUS_TEXT: Record<ChallengeStatus, string> = {
  upcoming:  "var(--accent)",
  active:    "var(--success)",
  completed: "var(--text-muted)",
  cancelled: "var(--danger)",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminChallengesPage() {
  const result = await getAllChallenges();
  const challenges = result.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl" style={{ color: "var(--text-primary)" }}>Challenges</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{challenges.length} total</p>
        </div>
        <Link
          href="/admin/challenges/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: "var(--accent)" }}
        >
          <Plus size={15} /> New Challenge
        </Link>
      </div>

      {challenges.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-2xl py-20 text-center"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No challenges yet. Create your first one!</p>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
        >
          {challenges.map((c, i) => (
            <div
              key={c.id}
              className="px-5 py-4 flex items-center gap-4"
              style={{ borderBottom: i < challenges.length - 1 ? "1px solid var(--border-subtle)" : "none" }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate" style={{ color: "var(--text-primary)" }}>
                    {c.title}
                  </span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: STATUS_COLORS[c.status], color: STATUS_TEXT[c.status] }}
                  >
                    {c.status}
                  </span>
                  <span className="text-xs capitalize shrink-0" style={{ color: "var(--text-muted)" }}>
                    {c.duration}
                  </span>
                </div>
                <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                  {c.type.replace(/_/g, " ")} · Target: {c.targetValue} · {c.pointValue} pts
                  · Ends {new Date(c.endAt).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {c.status === "upcoming" && (
                  <form action={activateChallenge}>
                    <input type="hidden" name="id" value={c.id} />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ background: "rgba(34,197,94,0.12)", color: "var(--success)", border: "1px solid rgba(34,197,94,0.25)" }}
                    >
                      Activate
                    </button>
                  </form>
                )}
                {(c.status === "active" || c.status === "upcoming") && (
                  <form action={cancelChallenge}>
                    <input type="hidden" name="id" value={c.id} />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ background: "rgba(239,68,68,0.08)", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.2)" }}
                    >
                      Cancel
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
