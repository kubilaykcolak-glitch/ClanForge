import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { getNotifications, markAllNotificationsRead } from "@/lib/actions/notification.actions";
import type { NotificationRow } from "@/lib/actions/notification.actions";
import { timeAgo } from "@/lib/utils";

// ── Data fetch ────────────────────────────────────────────────────────────────

async function getPageData() {
  const { adminAuth } = await import("@/lib/firebase/admin");
  let uid: string | null = null;
  try {
    const sessionCookie = cookies().get("session")?.value;
    if (sessionCookie) {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
      uid = decoded.uid;
    }
  } catch {
    /* ignore */
  }
  return uid;
}

// ── Mark-all form action ──────────────────────────────────────────────────────

async function handleMarkAll(formData: FormData) {
  "use server";
  const uid = formData.get("uid") as string;
  if (uid) await markAllNotificationsRead(uid);
  redirect("/notifications");
}

// ── Type icon map ─────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, string> = {
  challenge_started:   "🚀",
  challenge_completed: "🏆",
  rank_up:             "📈",
  rank_down:           "📉",
  reward_earned:       "🎁",
  rival_overtook:      "⚔️",
  clan_level_up:       "🌟",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function NotificationsPage() {
  const uid = await getPageData();
  if (!uid) redirect("/login?from=/notifications");

  const result = await getNotifications(uid, 50);
  const notifs: NotificationRow[] = result.data ?? [];
  const unreadCount = notifs.filter(n => !n.read).length;

  return (
    <div className="max-w-2xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-3xl" style={{ color: "var(--text-primary)" }}>
            Notifications
          </h1>
          {unreadCount > 0 && (
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              {unreadCount} unread
            </p>
          )}
        </div>

        {unreadCount > 0 && (
          <form action={handleMarkAll}>
            <input type="hidden" name="uid" value={uid} />
            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: "var(--bg-surface)",
                border:     "1px solid var(--border-default)",
                color:      "var(--text-secondary)",
              }}
            >
              <CheckCheck size={14} />
              Mark all read
            </button>
          </form>
        )}
      </div>

      {/* ── List ── */}
      {notifs.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-2xl py-24 text-center"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
        >
          <Bell size={40} className="mb-4 opacity-20" style={{ color: "var(--text-muted)" }} />
          <p className="font-display font-semibold text-xl mb-2" style={{ color: "var(--text-primary)" }}>
            All clear
          </p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No notifications yet. Complete clan challenges to earn rewards and updates here.
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
        >
          {notifs.map((n, i) => (
            <div
              key={n.id}
              className="px-5 py-4 flex items-start gap-4"
              style={{
                background:   n.read ? "transparent" : "rgba(99,102,241,0.04)",
                borderBottom: i < notifs.length - 1 ? "1px solid var(--border-subtle)" : "none",
              }}
            >
              <span className="text-xl shrink-0 mt-0.5">
                {TYPE_ICONS[n.type] ?? "🔔"}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {n.title}
                    </p>
                    <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      {n.body}
                    </p>
                  </div>
                  {!n.read && (
                    <div
                      className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                      style={{ background: "var(--accent)" }}
                    />
                  )}
                </div>

                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {timeAgo(new Date(n.createdAt))}
                  </span>
                  {n.href && (
                    <Link
                      href={n.href}
                      className="text-xs font-medium transition-colors"
                      style={{ color: "var(--accent)" }}
                    >
                      View →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
