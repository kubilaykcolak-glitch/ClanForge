import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createSeason } from "@/lib/actions/season.actions";

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAdminUid(): Promise<void> {
  const { adminAuth, adminDb } = await import("@/lib/firebase/admin");
  try {
    const sessionCookie = cookies().get("session")?.value;
    if (!sessionCookie) redirect("/login?from=/admin/seasons/new");
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const snap = await adminDb.collection("profiles").doc(decoded.uid).get();
    if (!snap.exists || !snap.data()?.isAdmin) redirect("/dashboard");
  } catch {
    redirect("/login?from=/admin/seasons/new");
  }
}

// ── Server action ─────────────────────────────────────────────────────────────

async function handleCreate(formData: FormData) {
  "use server";
  const result = await createSeason({
    name:        (formData.get("name")        as string).trim(),
    description: (formData.get("description") as string).trim(),
    startAt:     new Date(formData.get("startAt") as string),
    endAt:       new Date(formData.get("endAt")   as string),
  });

  if (result.success) {
    redirect("/admin/seasons");
  }
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle = {
  background:   "var(--bg-overlay)",
  border:       "1px solid var(--border-default)",
  color:        "var(--text-primary)",
  borderRadius: "0.5rem",
  padding:      "0.5rem 0.75rem",
  fontSize:     "0.875rem",
  width:        "100%",
  outline:      "none",
} as React.CSSProperties;

const labelStyle = {
  display:      "block",
  fontSize:     "0.75rem",
  fontWeight:   500,
  color:        "var(--text-muted)",
  marginBottom: "0.375rem",
} as React.CSSProperties;

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function NewSeasonPage() {
  await getAdminUid();

  const now      = new Date();
  const inMonth  = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const in3Month = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const fmt      = (d: Date) => d.toISOString().slice(0, 16);

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin/seasons"
          className="flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: "var(--text-muted)" }}
        >
          <ArrowLeft size={14} /> Back
        </Link>
        <span style={{ color: "var(--border-default)" }}>/</span>
        <h1 className="font-display font-bold text-2xl" style={{ color: "var(--text-primary)" }}>
          New Season
        </h1>
      </div>

      <form
        action={handleCreate}
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        <div className="px-6 py-5 flex flex-col gap-5">

          {/* Name */}
          <div>
            <label style={labelStyle}>Season Name *</label>
            <input
              name="name"
              required
              placeholder="e.g. Season 1 — Rise of the Clans"
              style={inputStyle}
            />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              rows={3}
              placeholder="Optional description shown on the leaderboard page."
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Start Date &amp; Time *</label>
              <input
                name="startAt"
                type="datetime-local"
                required
                defaultValue={fmt(inMonth)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>End Date &amp; Time *</label>
              <input
                name="endAt"
                type="datetime-local"
                required
                defaultValue={fmt(in3Month)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Info box */}
          <div
            className="rounded-lg px-4 py-3 text-xs"
            style={{
              background: "rgba(99,102,241,0.08)",
              border:     "1px solid rgba(99,102,241,0.2)",
              color:      "var(--text-secondary)",
            }}
          >
            The season will be set to <strong>upcoming</strong> automatically. Activate it manually
            when you&apos;re ready to launch. Only one season can be active at a time.
          </div>

        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 flex items-center justify-end gap-3"
          style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--bg-overlay)" }}
        >
          <Link
            href="/admin/seasons"
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: "transparent",
              border:     "1px solid var(--border-default)",
              color:      "var(--text-secondary)",
            }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            Create Season
          </button>
        </div>
      </form>
    </div>
  );
}
