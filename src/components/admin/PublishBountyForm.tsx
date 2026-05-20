"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { adminPublishBounty } from "@/lib/actions/bounty.actions";
import { BOUNTY_MAX_XP, BOUNTY_MIN_XP } from "@/types/bounty";
import type { GameSlug } from "@/lib/games/types";

const GAMES: { value: GameSlug; label: string }[] = [
  { value: "arc-raiders",       label: "Arc Raiders" },
  { value: "league-of-legends", label: "League of Legends" },
];

export function PublishBountyForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [gameSlug,          setGameSlug]          = useState<GameSlug>("arc-raiders");
  const [issuerUid,         setIssuerUid]         = useState("");
  const [title,             setTitle]             = useState("");
  const [description,       setDescription]       = useState("");
  const [targetDescription, setTargetDescription] = useState("");
  const [rewardXp,          setRewardXp]          = useState(150);
  const [discordTicketUrl,  setDiscordTicketUrl]  = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!issuerUid.trim()) {
      toast.error("Issuer UID is required");
      return;
    }
    startTransition(async () => {
      const res = await adminPublishBounty({
        gameSlug,
        issuerUid: issuerUid.trim(),
        title,
        description,
        targetDescription,
        rewardXp,
        discordTicketUrl: discordTicketUrl.trim() || null,
      });
      if (res.success) {
        toast.success("Bounty published");
        router.push("/admin/bounties");
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not publish");
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Game">
        <select
          value={gameSlug}
          onChange={e => setGameSlug(e.target.value as GameSlug)}
          className="w-full px-3 py-2 rounded-md text-sm"
          style={inputStyle}
        >
          {GAMES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
      </Field>

      <Field label="Issuer UID" hint="Firebase auth UID of the user whose intake ticket this is.">
        <input
          type="text"
          value={issuerUid}
          onChange={e => setIssuerUid(e.target.value)}
          required
          className="w-full px-3 py-2 rounded-md text-sm font-mono"
          style={inputStyle}
        />
      </Field>

      <Field label="Title" hint="Max 120 chars">
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={120}
          required
          className="w-full px-3 py-2 rounded-md text-sm"
          style={inputStyle}
        />
      </Field>

      <Field label="Target description" hint='One line — e.g. "Eliminate player X in Forge raid". Max 200 chars.'>
        <input
          type="text"
          value={targetDescription}
          onChange={e => setTargetDescription(e.target.value)}
          maxLength={200}
          required
          className="w-full px-3 py-2 rounded-md text-sm"
          style={inputStyle}
        />
      </Field>

      <Field label="Description" hint={`Full context. ${description.length}/2000`}>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          maxLength={2000}
          required
          rows={6}
          className="w-full px-3 py-2 rounded-md text-sm font-mono"
          style={inputStyle}
        />
      </Field>

      <Field label={`Reward XP (${BOUNTY_MIN_XP}–${BOUNTY_MAX_XP})`}>
        <input
          type="number"
          min={BOUNTY_MIN_XP}
          max={BOUNTY_MAX_XP}
          value={rewardXp}
          onChange={e => setRewardXp(Number(e.target.value))}
          required
          className="w-full px-3 py-2 rounded-md text-sm tabular-nums"
          style={inputStyle}
        />
      </Field>

      <Field label="Discord ticket URL" hint="Optional — for reviewer reference.">
        <input
          type="url"
          value={discordTicketUrl}
          onChange={e => setDiscordTicketUrl(e.target.value)}
          placeholder="https://discord.com/channels/…"
          className="w-full px-3 py-2 rounded-md text-sm"
          style={inputStyle}
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        <button
          type="button"
          onClick={() => router.push("/admin/bounties")}
          className="px-3 py-2 rounded-md text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-40"
          style={{ background: "var(--accent)", color: "white" }}
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : null}
          Publish
        </button>
      </div>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{label}</span>
        {hint && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{hint}</span>}
      </div>
      {children}
    </label>
  );
}
