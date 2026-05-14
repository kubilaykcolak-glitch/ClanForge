"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, X, CheckCheck } from "lucide-react";
import { useNotifications } from "@/lib/firebase/hooks";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notification.actions";
import { timeAgo } from "@/lib/utils";

const TYPE_ICONS: Record<string, string> = {
  challenge_started:   "🚀",
  challenge_completed: "🏆",
  rank_up:             "📈",
  rank_down:           "📉",
  reward_earned:       "🎁",
  rival_overtook:      "⚔️",
  clan_level_up:       "🌟",
};

interface Props {
  uid: string;
}

export function NotificationBell({ uid }: Props) {
  const { notifications, unreadCount } = useNotifications(uid);
  const [open, setOpen]       = useState(false);
  const [marking, setMarking] = useState(false);

  const handleMarkAll = async () => {
    setMarking(true);
    await markAllNotificationsRead(uid);
    setMarking(false);
  };

  const handleClickNotif = async (notifId: string, read: boolean) => {
    if (!read) await markNotificationRead(uid, notifId);
    setOpen(false);
  };

  return (
    // Fixed to bottom-right corner, above footer-level z-index
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">

      {/* ── Floating panel ── */}
      {open && (
        <>
          {/* Backdrop — closes panel on outside click */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div
            className="relative z-50 w-80 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            style={{
              background:  "var(--bg-elevated)",
              border:      "1px solid var(--border-default)",
              maxHeight:   440,
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 shrink-0"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Notifications
                {unreadCount > 0 && (
                  <span
                    className="ml-2 text-xs px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(239,68,68,0.15)", color: "var(--danger)" }}
                  >
                    {unreadCount} new
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAll}
                    disabled={marking}
                    title="Mark all as read"
                    className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                    style={{ color: "var(--text-muted)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
                  >
                    <CheckCheck size={15} />
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--text-secondary)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell size={24} className="mx-auto mb-2 opacity-20" style={{ color: "var(--text-muted)" }} />
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    No notifications yet
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
                    Complete challenges and clan activities to get updates here.
                  </p>
                </div>
              ) : (
                notifications.map(n => {
                  const notifId = (n as typeof n & { id?: string }).id ?? "";
                  return (
                    <div
                      key={notifId}
                      onClick={() => handleClickNotif(notifId, n.read)}
                      className="px-4 py-3 cursor-pointer transition-colors"
                      style={{
                        background:   n.read ? "transparent" : "rgba(99,102,241,0.05)",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-overlay)")}
                      onMouseLeave={e => (e.currentTarget.style.background = n.read ? "transparent" : "rgba(99,102,241,0.05)")}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-base shrink-0 mt-0.5">
                          {TYPE_ICONS[n.type] ?? "🔔"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-tight" style={{ color: "var(--text-primary)" }}>
                            {n.title}
                          </p>
                          <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-muted)" }}>
                            {n.body}
                          </p>
                          <p className="text-xs mt-1" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
                            {timeAgo(new Date((n.createdAt as unknown as number | Date) instanceof Date ? (n.createdAt as unknown as Date).getTime() : (n.createdAt as unknown as number)))}
                          </p>
                        </div>
                        {!n.read && (
                          <div
                            className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
                            style={{ background: "var(--accent)" }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center py-2.5 text-xs font-medium transition-colors"
                style={{ color: "var(--accent)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-overlay)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                View all notifications
              </Link>
            </div>
          </div>
        </>
      )}

      {/* ── Floating bell button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center justify-center rounded-full shadow-lg transition-transform active:scale-95"
        style={{
          width:      52,
          height:     52,
          background: open ? "var(--accent)" : "var(--bg-elevated)",
          border:     "1px solid var(--border-default)",
          color:      open ? "#fff" : "var(--text-secondary)",
          boxShadow:  "0 4px 24px rgba(0,0,0,0.35)",
        }}
        onMouseEnter={e => {
          if (!open) {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-surface)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-elevated)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
          }
        }}
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ background: "var(--danger)" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
