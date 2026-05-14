import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createChallenge } from "@/lib/actions/challenge.actions";
import { getAllSeasons } from "@/lib/actions/season.actions";

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAdminUid(): Promise<string> {
  const { adminAuth, adminDb } = await import("@/lib/firebase/admin");
  try {
    const sessionCookie = cookies().get("session")?.value;
    if (!sessionCookie) redirect("/login?from=/admin/challenges/new");
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const snap = await adminDb.collection("profiles").doc(decoded.uid).get();
    if (!snap.exists || !snap.data()?.isAdmin) redirect("/dashboard");
    return decoded.uid;
  } catch {
    redirect("/login?from=/admin/challenges/new");
  }
}

// ── Server action ─────────────────────────────────────────────────────────────

async function handleCreate(formData: FormData) {
  "use server";

  const { adminAuth, adminDb } = await import("@/lib/firebase/admin");
  const sessionCookie = cookies().get("session")?.value ?? "";
  let uid = "";
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    uid = decoded.uid;
  } catch {
    redirect("/login?from=/admin/challenges/new");
  }

  const startAt = new Date(formData.get("startAt") as string);
  const endAt   = new Date(formData.get("endAt")   as string);

  const result = await createChallenge({
    title:          (formData.get("title")          as string).trim(),
    description:    (formData.get("description")    as string).trim(),
    type:           formData.get("type")            as Parameters<typeof createChallenge>[0]["type"],
    duration:       formData.get("duration")        as string,
    targetValue:    Number(formData.get("targetValue")),
    pointValue:     Number(formData.get("pointValue")),
    memberXpReward: Number(formData.get("memberXpReward")),
    clanXpReward:   Number(formData.get("clanXpReward")),
    badgeReward:    (formData.get("badgeReward")    as string) || undefined,
    titleReward:    (formData.get("titleReward")    as string) || undefined,
    seasonId:       (formData.get("seasonId")       as string) || undefined,
    startAt,
    endAt,
    createdBy: uid,
  });

  if (result.success) {
    redirect("/admin/challenges");
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CHALLENGE_TYPES = [
  { value: "tournament_participate", label: "Tournament Participation" },
  { value: "tournament_win",         label: "Tournament Wins"          },
  { value: "post_create",            label: "Clan Posts"               },
  { value: "member_recruit",         label: "Member Recruiting"        },
  { value: "xp_earn",               label: "XP Earned"                },
  { value: "match_win",              label: "Match Wins"               },
];

const DURATIONS = ["daily", "weekly", "monthly", "seasonal"];

// ── Shared input styles ───────────────────────────────────────────────────────

const inputStyle = {
  background:  "var(--bg-overlay)",
  border:      "1px solid var(--border-default)",
  color:       "var(--text-primary)",
  borderRadius: "0.5rem",
  padding:     "0.5rem 0.75rem",
  fontSize:    "0.875rem",
  width:       "100%",
  outline:     "none",
} as React.CSSProperties;

const labelStyle = {
  display:    "block",
  fontSize:   "0.75rem",
  fontWeight: 500,
  color:      "var(--text-muted)",
  marginBottom: "0.375rem",
} as React.CSSProperties;

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function NewChallengePage() {
  await getAdminUid();

  const seasonsResult = await getAllSeasons();
  const seasons = seasonsResult.data ?? [];

  const now    = new Date();
  const inWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const fmt    = (d: Date) => d.toISOString().slice(0, 16);

  return (
    <div className="max-w-2xl">
      {/* Header */}
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
          New Challenge
        </h1>
      </div>

      <form
        action={handleCreate}
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        <div className="px-6 py-5 flex flex-col gap-5">

          {/* Title */}
          <div>
            <label style={labelStyle}>Title *</label>
            <input name="title" required placeholder="e.g. Weekly Tournament Warriors" style={inputStyle} />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description *</label>
            <textarea
              name="description"
              required
              rows={3}
              placeholder="Describe what clans need to do to complete this challenge."
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          {/* Type + Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Challenge Type *</label>
              <select name="type" required style={inputStyle}>
                {CHALLENGE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Duration *</label>
              <select name="duration" required style={inputStyle}>
                {DURATIONS.map(d => (
                  <option key={d} value={d} className="capitalize">{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Start Date &amp; Time *</label>
              <input
                name="startAt"
                type="datetime-local"
                required
                defaultValue={fmt(now)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>End Date &amp; Time *</label>
              <input
                name="endAt"
                type="datetime-local"
                required
                defaultValue={fmt(inWeek)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Target + Points */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Target Value *</label>
              <input name="targetValue" type="number" required min={1} defaultValue={5} style={inputStyle} />
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                How many actions to complete the challenge
              </p>
            </div>
            <div>
              <label style={labelStyle}>Challenge Points *</label>
              <input name="pointValue" type="number" required min={0} defaultValue={100} style={inputStyle} />
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Points added to clan leaderboard score
              </p>
            </div>
          </div>

          {/* XP Rewards */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Member XP Reward</label>
              <input name="memberXpReward" type="number" min={0} defaultValue={50} style={inputStyle} />
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>XP per contributing member</p>
            </div>
            <div>
              <label style={labelStyle}>Clan XP Reward</label>
              <input name="clanXpReward" type="number" min={0} defaultValue={200} style={inputStyle} />
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>XP added to clan total</p>
            </div>
          </div>

          {/* Badge + Title rewards */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Badge Reward Slug</label>
              <input
                name="badgeReward"
                placeholder="e.g. challenge_champion"
                style={inputStyle}
              />
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Leave blank for no badge</p>
            </div>
            <div>
              <label style={labelStyle}>Title Reward</label>
              <input
                name="titleReward"
                placeholder="e.g. Tournament Hunter"
                style={inputStyle}
              />
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Leave blank for no title</p>
            </div>
          </div>

          {/* Season */}
          <div>
            <label style={labelStyle}>Season (optional)</label>
            <select name="seasonId" style={inputStyle}>
              <option value="">— No season —</option>
              {seasons.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* Footer */}
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
            Create Challenge
          </button>
        </div>
      </form>
    </div>
  );
}
