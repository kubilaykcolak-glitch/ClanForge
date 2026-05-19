"use client";

// Small client island that drives the manual-refresh server action. Lives in
// the LoL profile section header, sits next to the "Last updated" caption.
// The cooldown enforcement is server-side; the button stays clickable and
// surfaces the cooldown message via toast.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { refreshMyMatchHistory } from "@/lib/actions/match-history.actions";

export function RefreshMatchHistoryButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onClick = () =>
    startTransition(async () => {
      const res = await refreshMyMatchHistory();
      if (res.success) {
        const n = res.data?.inserted ?? 0;
        toast.success(n > 0 ? `Pulled ${n} new match${n === 1 ? "" : "es"}` : "Already up to date");
        router.refresh();
      } else {
        toast.error(res.error ?? "Refresh failed");
      }
    });

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-50"
      style={{
        background: "var(--bg-elevated)",
        border:     "1px solid var(--border-default)",
        color:      "var(--text-primary)",
      }}
      aria-label="Refresh match history"
    >
      <RefreshCw size={11} className={pending ? "animate-spin" : ""} />
      Refresh
    </button>
  );
}
