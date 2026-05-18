import Link from "next/link";
import { Plus, ChevronDown } from "lucide-react";
import { getAllChallenges, updateChallengeStatus } from "@/lib/actions/challenge.actions";
import { redirect } from "next/navigation";
import type { ChallengeStatus } from "@/types";

// ─── Server actions for status updates ────────────────────────────────────────

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

// ─── Status palette ───────────────────────────────────────────────────────────

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

// ─── Page ──────────────────────────────────────────────────────────────────────
//
// Server-rendered list with a native <details>/<summary> per row. Each summary
// shows the headline info (title, status, type, target, end date); expanding
// reveals the full description + every reward + dates + season + audit info
// without needing a separate "view" page. Native <details> keeps this a pure
// server component (no client JS).

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
            <details
              key={c.id}
              className="group"
              style={{ borderBottom: i < challenges.length - 1 ? "1px solid var(--border-subtle)" : "none" }}
            >
              {/* ── Summary row (collapsed view) ─────────────────────────────── */}
              <summary
                className="px-5 py-4 flex items-center gap-4 cursor-pointer list-none"
                style={{ color: "var(--text-primary)" }}
              >
                <ChevronDown
                  size={14}
                  className="shrink-0 transition-transform group-open:rotate-180"
                  style={{ color: "var(--text-muted)" }}
                />
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

                {/* Action buttons — wrap in span to dodge the <summary>'s default
                    toggle-on-click. Buttons live inside forms which submit
                    independently. */}
                <span className="flex items-center gap-2 shrink-0">
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
                </span>
              </summary>

              {/* ── Expanded detail panel ────────────────────────────────────── */}
              <div
                className="px-5 pb-5"
                style={{ background: "rgba(99,102,241,0.03)" }}
              >
                <div
                  className="rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
                >
                  {/* Description */}
                  <div className="md:col-span-2">
                    <p
                      className="text-[10px] font-bold uppercase tracking-wider mb-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Description
                    </p>
                    <p
                      className="text-xs whitespace-pre-wrap"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {c.description || <em style={{ color: "var(--text-muted)" }}>(none)</em>}
                    </p>
                  </div>

                  {/* Identification */}
                  <Section title="Identification">
                    <Row label="ID"       value={c.id} mono />
                    <Row label="Type"     value={c.type.replace(/_/g, " ")} />
                    <Row label="Duration" value={c.duration} />
                    <Row label="Season"   value={c.seasonId ?? "—"} mono={!!c.seasonId} />
                  </Section>

                  {/* Goal */}
                  <Section title="Goal">
                    <Row label="Target value" value={String(c.targetValue)} />
                    <Row label="Point value"  value={`${c.pointValue} pts`} />
                  </Section>

                  {/* Rewards */}
                  <Section title="Rewards">
                    <Row label="Member XP" value={c.memberXpReward > 0 ? `+${c.memberXpReward}` : "—"} />
                    <Row label="Clan XP"   value={c.clanXpReward   > 0 ? `+${c.clanXpReward}`   : "—"} />
                    <Row label="Badge"     value={c.badgeReward ?? "—"} />
                    <Row label="Title"     value={c.titleReward ?? "—"} />
                  </Section>

                  {/* Timeline + audit */}
                  <Section title="Timeline">
                    <Row label="Starts"     value={new Date(c.startAt).toLocaleString()} />
                    <Row label="Ends"       value={new Date(c.endAt).toLocaleString()} />
                    <Row label="Created at" value={new Date(c.createdAt).toLocaleString()} />
                    <Row label="Created by" value={c.createdBy} mono />
                  </Section>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Layout helpers (local — local to this file by design) ───────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p
        className="text-[10px] font-bold uppercase tracking-wider mb-1"
        style={{ color: "var(--text-muted)" }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span
        className={`text-xs text-right truncate ${mono ? "font-mono" : ""}`}
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}
