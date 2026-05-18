import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getChallengeById, updateChallenge } from "@/lib/actions/challenge.actions";
import { getAllSeasons } from "@/lib/actions/season.actions";
import type { ChallengeType } from "@/types";

// ─── Auth helper ──────────────────────────────────────────────────────────────
// Mirrors the new-challenge page's gate. Reads role from session cookie + the
// legacy isAdmin field. Defence-in-depth — the server action also checks via
// getAdminUid before writing.

async function ensureAdmin(returnTo: string): Promise<void> {
  const { adminAuth, adminDb } = await import("@/lib/firebase/admin");
  try {
    const sessionCookie = cookies().get("session")?.value;
    if (!sessionCookie) redirect(`/login?from=${returnTo}`);
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const claimRole = decoded.role as string | undefined;
    if (claimRole === "admin" || claimRole === "super_admin") return;
    const snap = await adminDb.collection("profiles").doc(decoded.uid).get();
    if (snap.exists && snap.data()?.isAdmin) return;
    redirect("/dashboard");
  } catch {
    redirect(`/login?from=${returnTo}`);
  }
}

// ─── Server action ────────────────────────────────────────────────────────────
//
// Patch the existing challenge with the form values. We pass through every
// editable field — even if the user left the optional ones blank, the server
// normalises empty strings to null.

async function handleUpdateChallengeAction(challengeId: string, formData: FormData) {
  "use server";
  const result = await updateChallenge(challengeId, {
    title:          (formData.get("title")          as string).trim(),
    description:    (formData.get("description")    as string).trim(),
    type:           formData.get("type")            as ChallengeType,
    duration:       formData.get("duration")        as string,
    targetValue:    Number(formData.get("targetValue")),
    pointValue:     Number(formData.get("pointValue")),
    memberXpReward: Number(formData.get("memberXpReward")),
    clanXpReward:   Number(formData.get("clanXpReward")),
    badgeReward:    (formData.get("badgeReward")    as string) || undefined,
    titleReward:    (formData.get("titleReward")    as string) || undefined,
    seasonId:       (formData.get("seasonId")       as string) || undefined,
    startAt:        new Date(formData.get("startAt") as string),
    endAt:          new Date(formData.get("endAt")   as string),
    // createdBy intentionally omitted — updateChallenge's patch builder
    // only writes fields that are !== undefined, so omitting preserves
    // the original creator on the doc. Passing "" would clobber it.
  });
  if (result.success) redirect("/admin/challenges");
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHALLENGE_TYPES: { value: ChallengeType; label: string }[] = [
  { value: "tournament_participate", label: "Tournament Participation" },
  { value: "tournament_win",         label: "Tournament Wins"          },
  { value: "post_create",            label: "Clan Posts"               },
  { value: "member_recruit",         label: "Member Recruiting"        },
  { value: "xp_earn",                label: "XP Earned"                },
  { value: "match_win",              label: "Match Wins"               },
];

const DURATIONS = ["daily", "weekly", "monthly", "seasonal"];

const inputStyle: React.CSSProperties = {
  background:   "var(--bg-overlay)",
  border:       "1px solid var(--border-default)",
  color:        "var(--text-primary)",
  borderRadius: "0.5rem",
  padding:      "0.5rem 0.75rem",
  fontSize:     "0.875rem",
  width:        "100%",
  outline:      "none",
};

const labelStyle: React.CSSProperties = {
  display:      "block",
  fontSize:     "0.75rem",
  fontWeight:   500,
  color:        "var(--text-muted)",
  marginBottom: "0.375rem",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function EditChallengePage({ params }: { params: { id: string } }) {
  await ensureAdmin(`/admin/challenges/${params.id}/edit`);

  const [chRes, seasonsRes] = await Promise.all([
    getChallengeById(params.id),
    getAllSeasons(),
  ]);
  if (!chRes.success || !chRes.data) notFound();
  const c = chRes.data;
  const seasons = seasonsRes.data ?? [];

  // datetime-local expects "YYYY-MM-DDThh:mm". Cast from epoch (ms).
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 16);

  // Bind the server action to this specific challenge id so the form action
  // works without leaking the id through a hidden input.
  const action = handleUpdateChallengeAction.bind(null, params.id);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin/challenges"
          className="flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: "var(--text-muted)" }}
        >
          <ArrowLeft size={14} /> Back
        </Link>
        <span style={{ color: "var(--border-default)" }}>/</span>
        <h1 className="font-display font-bold text-2xl" style={{ color: "var(--text-primary)" }}>
          Edit Challenge
        </h1>
      </div>

      <form
        action={action}
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        <div className="px-6 py-5 flex flex-col gap-5">

          <div>
            <label style={labelStyle}>Title *</label>
            <input name="title" required defaultValue={c.title} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Description *</label>
            <textarea
              name="description"
              required
              rows={3}
              defaultValue={c.description}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Challenge Type *</label>
              <select name="type" required defaultValue={c.type} style={inputStyle}>
                {CHALLENGE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Duration *</label>
              <select name="duration" required defaultValue={c.duration} style={inputStyle}>
                {DURATIONS.map(d => (
                  <option key={d} value={d} className="capitalize">{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Start Date &amp; Time *</label>
              <input
                name="startAt"
                type="datetime-local"
                required
                defaultValue={fmt(c.startAt)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>End Date &amp; Time *</label>
              <input
                name="endAt"
                type="datetime-local"
                required
                defaultValue={fmt(c.endAt)}
                style={inputStyle}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Target Value *</label>
              <input name="targetValue" type="number" required min={1} defaultValue={c.targetValue} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Challenge Points *</label>
              <input name="pointValue" type="number" required min={0} defaultValue={c.pointValue} style={inputStyle} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Member XP Reward</label>
              <input name="memberXpReward" type="number" min={0} defaultValue={c.memberXpReward} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Clan XP Reward</label>
              <input name="clanXpReward" type="number" min={0} defaultValue={c.clanXpReward} style={inputStyle} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Badge Reward Slug</label>
              <input name="badgeReward" defaultValue={c.badgeReward ?? ""} style={inputStyle} />
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Leave blank for no badge</p>
            </div>
            <div>
              <label style={labelStyle}>Title Reward</label>
              <input name="titleReward" defaultValue={c.titleReward ?? ""} style={inputStyle} />
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Leave blank for no title</p>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Season (optional)</label>
            <select name="seasonId" defaultValue={c.seasonId ?? ""} style={inputStyle}>
              <option value="">— No season —</option>
              {seasons.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </select>
          </div>

          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{
              background: "rgba(99,102,241,0.06)",
              border:     "1px solid rgba(99,102,241,0.25)",
              color:      "var(--text-secondary)",
            }}
          >
            <strong>Current status:</strong> {c.status}. Editing fields does
            not change the status — use the Activate / Reactivate / Cancel
            buttons on the list page to change it.
          </div>

        </div>

        <div
          className="px-6 py-4 flex items-center justify-end gap-3"
          style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--bg-overlay)" }}
        >
          <Link
            href="/admin/challenges"
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
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
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}
