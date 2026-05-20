"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import {
  createGameContent,
  updateGameContent,
  deleteGameContent,
  type CreateGameContentInput,
} from "@/lib/actions/game-content.actions";
import { CONTENT_TYPE_LABELS, type GameContent, type GameContentType, type GameContentStatus } from "@/types/game-content";
import type { GameSlug } from "@/lib/games/types";

const TYPE_OPTIONS: GameContentType[] = ["guides", "items", "locations", "updates"];
const GAME_OPTIONS: { value: GameSlug; label: string }[] = [
  { value: "arc-raiders",       label: "Arc Raiders" },
  { value: "league-of-legends", label: "League of Legends" },
];

export function GameContentForm({ existing }: { existing?: GameContent }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deletePending, startDelete] = useTransition();

  const [gameSlug,     setGameSlug]     = useState<GameSlug>(existing?.gameSlug ?? "arc-raiders");
  const [type,         setType]         = useState<GameContentType>(existing?.type ?? "guides");
  const [title,        setTitle]        = useState(existing?.title ?? "");
  const [summary,      setSummary]      = useState(existing?.summary ?? "");
  const [body,         setBody]         = useState(existing?.body ?? "");
  const [heroImageUrl, setHeroImageUrl] = useState(existing?.heroImageUrl ?? "");
  const [externalUrl,  setExternalUrl]  = useState(existing?.externalUrl  ?? "");
  const [status,       setStatus]       = useState<GameContentStatus>(existing?.status ?? "draft");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: CreateGameContentInput = {
      gameSlug,
      type,
      title,
      summary,
      body,
      heroImageUrl: heroImageUrl.trim() || null,
      externalUrl:  externalUrl.trim()  || null,
      status,
    };
    startTransition(async () => {
      const res = existing?.id
        ? await updateGameContent(existing.id, input)
        : await createGameContent(input);
      if (res.success) {
        toast.success(existing ? "Saved" : "Created");
        router.push("/admin/game-content");
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not save");
      }
    });
  };

  const onDelete = () => {
    if (!existing?.id) return;
    if (!window.confirm("Delete this entry? This cannot be undone.")) return;
    startDelete(async () => {
      const res = await deleteGameContent(existing.id!);
      if (res.success) {
        toast.success("Deleted");
        router.push("/admin/game-content");
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not delete");
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Game">
          <select
            value={gameSlug}
            onChange={e => setGameSlug(e.target.value as GameSlug)}
            className="w-full px-3 py-2 rounded-md text-sm"
            style={inputStyle}
          >
            {GAME_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select
            value={type}
            onChange={e => setType(e.target.value as GameContentType)}
            className="w-full px-3 py-2 rounded-md text-sm"
            style={inputStyle}
          >
            {TYPE_OPTIONS.map(t => (
              <option key={t} value={t}>{CONTENT_TYPE_LABELS[t].singular}</option>
            ))}
          </select>
        </Field>
      </div>

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

      <Field label="Summary" hint="Shown in the card list. Max 200 chars.">
        <input
          type="text"
          value={summary}
          onChange={e => setSummary(e.target.value)}
          maxLength={200}
          className="w-full px-3 py-2 rounded-md text-sm"
          style={inputStyle}
        />
      </Field>

      <Field label="Body" hint={`${body.length}/8000 — line breaks preserved on render`}>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          maxLength={8000}
          required
          rows={12}
          className="w-full px-3 py-2 rounded-md text-sm font-mono"
          style={inputStyle}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Hero image URL" hint="Optional. Uploaded image URL from /api/upload.">
          <input
            type="url"
            value={heroImageUrl}
            onChange={e => setHeroImageUrl(e.target.value)}
            placeholder="https://…"
            className="w-full px-3 py-2 rounded-md text-sm"
            style={inputStyle}
          />
        </Field>
        <Field label="External link" hint="Optional. Adds a 'View source' link.">
          <input
            type="url"
            value={externalUrl}
            onChange={e => setExternalUrl(e.target.value)}
            placeholder="https://…"
            className="w-full px-3 py-2 rounded-md text-sm"
            style={inputStyle}
          />
        </Field>
      </div>

      <Field label="Status">
        <select
          value={status}
          onChange={e => setStatus(e.target.value as GameContentStatus)}
          className="w-full px-3 py-2 rounded-md text-sm"
          style={inputStyle}
        >
          <option value="draft">Draft (hidden from public)</option>
          <option value="published">Published</option>
        </select>
      </Field>

      <div className="flex items-center justify-between gap-3 pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        <div>
          {existing && (
            <button
              type="button"
              onClick={onDelete}
              disabled={deletePending}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium disabled:opacity-40"
              style={{ background: "transparent", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.30)" }}
            >
              {deletePending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/admin/game-content")}
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
            {existing ? "Save changes" : "Create"}
          </button>
        </div>
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
