"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection } from "firebase/firestore";
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { auth, db } from "@/lib/firebase/client";
import type { TournamentFormat } from "@/types";
import ComingSoon from "@/components/ui/ComingSoon";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { validateImageFile } from "@/lib/uploads";

// ── Constants ─────────────────────────────────────────────────────────────────

const POPULAR_GAMES = [
  "Valorant", "League of Legends", "CS2", "Dota 2", "Apex Legends",
  "Fortnite", "Rocket League", "Overwatch 2", "Rainbow Six Siege", "Call of Duty",
  "Warzone", "PUBG", "Minecraft", "Rust", "Escape from Tarkov",
  "FIFA", "NBA 2K", "Street Fighter 6", "Tekken 8", "Mortal Kombat 1",
  "World of Warcraft", "Final Fantasy XIV", "Lost Ark", "Path of Exile", "Diablo IV",
];

const MAX_SIZES = [8, 16, 32, 64] as const;

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS = ["Basics", "Settings", "Review"] as const;

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-10">
      {STEPS.map((label, i) => {
        const num  = i + 1;
        const done = num < current;
        const active = num === current;
        return (
          <div key={label} className="flex items-center">
            {/* Circle */}
            <div className="flex flex-col items-center">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all"
                style={{
                  background: active
                    ? "var(--accent)"
                    : done
                    ? "var(--success)"
                    : "var(--bg-overlay)",
                  color: active || done ? "#fff" : "var(--text-muted)",
                  boxShadow: active ? "0 0 16px var(--accent-glow)" : "none",
                }}
              >
                {done ? "✓" : num}
              </div>
              <span
                className="text-xs mt-1.5"
                style={{
                  color: active
                    ? "var(--accent)"
                    : done
                    ? "var(--success)"
                    : "var(--text-muted)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {label}
              </span>
            </div>

            {/* Connector */}
            {i < STEPS.length - 1 && (
              <div
                className="h-px w-16 mx-2 mb-5 transition-all"
                style={{
                  background: done ? "var(--success)" : "var(--border-subtle)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Format SVG bracket diagrams ───────────────────────────────────────────────

function SingleEliminationSVG() {
  const box  = { fill: "rgba(255,255,255,0.06)", stroke: "rgba(255,255,255,0.15)", rx: 3 };
  const line = { stroke: "rgba(255,255,255,0.15)", strokeWidth: 1 };
  const win  = { fill: "rgba(99,102,241,0.25)",   stroke: "rgba(99,102,241,0.6)",  rx: 3 };
  return (
    <svg viewBox="0 0 130 90" className="w-full h-16 opacity-80">
      {/* R1 */}
      <rect x="2"  y="10" width="38" height="12" {...box} />
      <rect x="2"  y="28" width="38" height="12" {...box} />
      <rect x="2"  y="52" width="38" height="12" {...box} />
      <rect x="2"  y="70" width="38" height="12" {...box} />
      {/* R1 connectors */}
      <line x1="40" y1="16" x2="50" y2="16" {...line} />
      <line x1="40" y1="34" x2="50" y2="34" {...line} />
      <line x1="50" y1="16" x2="50" y2="34" {...line} />
      <line x1="40" y1="58" x2="50" y2="58" {...line} />
      <line x1="40" y1="76" x2="50" y2="76" {...line} />
      <line x1="50" y1="58" x2="50" y2="76" {...line} />
      {/* R2 */}
      <rect x="52" y="20" width="38" height="12" {...box} />
      <rect x="52" y="62" width="38" height="12" {...box} />
      {/* R2 connectors */}
      <line x1="90" y1="26" x2="100" y2="26" {...line} />
      <line x1="90" y1="68" x2="100" y2="68" {...line} />
      <line x1="100" y1="26" x2="100" y2="68" {...line} />
      {/* Final */}
      <rect x="102" y="40" width="26" height="12" {...win} />
      <text x="115" y="49" textAnchor="middle" fontSize="7" fill="rgba(99,102,241,0.9)">WIN</text>
    </svg>
  );
}

function DoubleEliminationSVG() {
  const box  = { fill: "rgba(255,255,255,0.06)", stroke: "rgba(255,255,255,0.15)", rx: 3 };
  const lose = { fill: "rgba(139,92,246,0.12)",  stroke: "rgba(139,92,246,0.4)",  rx: 3 };
  const win  = { fill: "rgba(99,102,241,0.25)",  stroke: "rgba(99,102,241,0.6)",  rx: 3 };
  const line = { stroke: "rgba(255,255,255,0.12)", strokeWidth: 1 };
  return (
    <svg viewBox="0 0 130 90" className="w-full h-16 opacity-80">
      {/* Winners bracket */}
      <text x="2" y="9" fontSize="6" fill="rgba(255,255,255,0.3)">WINNERS</text>
      <rect x="2"  y="12" width="30" height="10" {...box} />
      <rect x="2"  y="26" width="30" height="10" {...box} />
      <line x1="32" y1="17" x2="40" y2="17" {...line} />
      <line x1="32" y1="31" x2="40" y2="31" {...line} />
      <line x1="40" y1="17" x2="40" y2="31" {...line} />
      <rect x="42" y="21" width="28" height="10" {...box} />
      {/* Losers bracket */}
      <text x="2" y="57" fontSize="6" fill="rgba(139,92,246,0.6)">LOSERS</text>
      <rect x="2"  y="60" width="30" height="10" {...lose} />
      <rect x="2"  y="74" width="30" height="10" {...lose} />
      <line x1="32" y1="65" x2="40" y2="65" {...line} />
      <line x1="32" y1="79" x2="40" y2="79" {...line} />
      <line x1="40" y1="65" x2="40" y2="79" {...line} />
      <rect x="42" y="69" width="28" height="10" {...lose} />
      {/* Grand Final */}
      <text x="80" y="9" fontSize="6" fill="rgba(99,102,241,0.7)">GRAND FINAL</text>
      <rect x="78" y="12" width="48" height="10" {...win} />
      <rect x="78" y="26" width="48" height="10" {...win} />
      <text x="102" y="21" textAnchor="middle" fontSize="6" fill="rgba(99,102,241,0.9)">W</text>
      <text x="102" y="35" textAnchor="middle" fontSize="6" fill="rgba(99,102,241,0.9)">L</text>
    </svg>
  );
}

function RoundRobinSVG() {
  const box  = { fill: "rgba(255,255,255,0.06)", stroke: "rgba(255,255,255,0.15)", rx: 3 };
  const line = { stroke: "rgba(255,255,255,0.12)", strokeWidth: 1, strokeDasharray: "3,2" };
  const players = ["A", "B", "C", "D"];
  const cx = [20, 60, 100, 60];
  const cy = [20, 10, 20, 40];
  return (
    <svg viewBox="0 0 130 60" className="w-full h-16 opacity-80">
      {/* Match lines */}
      {players.map((_, i) =>
        players.slice(i + 1).map((__, j) => (
          <line
            key={`${i}-${j}`}
            x1={cx[i]} y1={cy[i]}
            x2={cx[i + 1 + j]} y2={cy[i + 1 + j]}
            {...line}
          />
        ))
      )}
      {/* Nodes */}
      {players.map((p, i) => (
        <g key={p}>
          <rect x={cx[i] - 10} y={cy[i] - 7} width="22" height="14" {...box} />
          <text x={cx[i] + 1} y={cy[i] + 4} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.5)">{p}</text>
        </g>
      ))}
      {/* Table illustration */}
      <text x="2" y="58" fontSize="6" fill="rgba(255,255,255,0.25)">All players face each other</text>
    </svg>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-6 flex flex-col gap-5"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
    >
      <h2 className="font-display font-bold text-lg" style={{ color: "var(--text-primary)" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

// ── Field helpers ─────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
      {children}
    </label>
  );
}

function inputStyle(error?: boolean): React.CSSProperties {
  return {
    background: "var(--bg-elevated)",
    border: `1px solid ${error ? "var(--danger)" : "var(--border-default)"}`,
    color: "var(--text-primary)",
    borderRadius: 8,
    padding: "10px 14px",
    width: "100%",
    fontSize: 14,
    outline: "none",
  };
}

// ── Step 1 ────────────────────────────────────────────────────────────────────

interface Step1State {
  name:        string;
  game:        string;
  gameQuery:   string;
  description: string;
  format:      TournamentFormat | "";
  bannerFile:  File | null;
  bannerPreview: string | null;
}

interface Step1Props {
  state: Step1State;
  onChange: (next: Partial<Step1State>) => void;
  errors: Partial<Record<keyof Step1State, string>>;
}

function Step1({ state, onChange, errors }: Step1Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const formats: {
    value: TournamentFormat;
    label: string;
    desc:  string;
    svg:   React.ReactNode;
  }[] = [
    {
      value: "single_elim",
      label: "Single Elimination",
      desc:  "Most popular. Lose once and you're out.",
      svg:   <SingleEliminationSVG />,
    },
    {
      value: "double_elim",
      label: "Double Elimination",
      desc:  "Second chance via losers bracket.",
      svg:   <DoubleEliminationSVG />,
    },
    {
      value: "round_robin",
      label: "Round Robin",
      desc:  "Everyone plays everyone. Best overall record wins.",
      svg:   <RoundRobinSVG />,
    },
  ];

  const filtered = POPULAR_GAMES.filter(g =>
    g.toLowerCase().includes(state.gameQuery.toLowerCase())
  );

  const handleBanner = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file) {
      const v = validateImageFile(file);
      if (!v.ok) {
        toast.error(v.error ?? "Invalid file");
        e.target.value = "";
        return;
      }
    }
    if (state.bannerPreview) URL.revokeObjectURL(state.bannerPreview);
    onChange({
      bannerFile:    file,
      bannerPreview: file ? URL.createObjectURL(file) : null,
    });
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-5">
      <Section title="Tournament Details">

        {/* Name */}
        <div>
          <Label>Tournament Name <span style={{ color: "var(--danger)" }}>*</span></Label>
          <input
            type="text"
            value={state.name}
            onChange={e => onChange({ name: e.target.value })}
            placeholder="Weekend Warriors Cup"
            maxLength={60}
            style={inputStyle(!!errors.name)}
            onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = errors.name ? "var(--danger)" : "var(--border-default)"; }}
          />
          {errors.name && <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>{errors.name}</p>}
        </div>

        {/* Game */}
        <div>
          <Label>Game <span style={{ color: "var(--danger)" }}>*</span></Label>
          <input
            type="text"
            value={state.game || state.gameQuery}
            onChange={e => onChange({ gameQuery: e.target.value, game: "" })}
            placeholder="Search games…"
            style={inputStyle(!!errors.game)}
            onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = errors.game ? "var(--danger)" : state.game ? "var(--success)" : "var(--border-default)"; }}
          />
          {state.gameQuery && !state.game && (
            <div
              className="mt-1 rounded-lg overflow-hidden max-h-44 overflow-y-auto"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
            >
              {filtered.map(g => (
                <button
                  key={g}
                  type="button"
                  className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                  style={{ color: "var(--text-secondary)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-overlay)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                  onClick={() => onChange({ game: g, gameQuery: g })}
                >
                  {g}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>No games found</p>
              )}
            </div>
          )}
          {errors.game && <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>{errors.game}</p>}
        </div>

        {/* Description */}
        <div>
          <Label>Description</Label>
          <textarea
            value={state.description}
            onChange={e => onChange({ description: e.target.value })}
            placeholder="Tell participants what this tournament is about…"
            rows={3}
            maxLength={500}
            style={{ ...inputStyle(), resize: "none" }}
            onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "var(--border-default)"; }}
          />
        </div>
      </Section>

      {/* Format cards */}
      <Section title="Tournament Format">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {formats.map(f => {
            const selected = state.format === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => onChange({ format: f.value })}
                className="flex flex-col p-4 rounded-xl text-left transition-all"
                style={{
                  background: selected ? "rgba(99,102,241,0.08)" : "var(--bg-elevated)",
                  border: `1px solid ${selected ? "var(--accent)" : "var(--border-default)"}`,
                  boxShadow: selected ? "0 0 12px var(--accent-glow)" : "none",
                }}
              >
                <div className="mb-3">{f.svg}</div>
                <p
                  className="text-sm font-semibold mb-1"
                  style={{ color: selected ? "var(--accent)" : "var(--text-primary)" }}
                >
                  {f.label}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {f.desc}
                </p>
              </button>
            );
          })}
        </div>
        {errors.format && <p className="text-xs" style={{ color: "var(--danger)" }}>{errors.format}</p>}
      </Section>

      {/* Banner upload */}
      <Section title="Banner Image">
        <div
          className="relative rounded-xl overflow-hidden flex items-center justify-center cursor-pointer"
          style={{
            height: 120,
            background: state.bannerPreview ? "transparent" : "var(--bg-elevated)",
            border: "1px dashed var(--border-default)",
          }}
          onClick={() => !state.bannerPreview && fileRef.current?.click()}
        >
          {state.bannerPreview ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={state.bannerPreview} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  if (state.bannerPreview) URL.revokeObjectURL(state.bannerPreview);
                  onChange({ bannerFile: null, bannerPreview: null });
                }}
                className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-white"
                style={{ background: "var(--danger)" }}
              >
                <X size={12} />
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 text-center">
              <Upload size={20} style={{ color: "var(--text-muted)" }} />
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Click to upload a banner (JPG/PNG, 16:9 recommended)
              </p>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleBanner} />
      </Section>
    </div>
  );
}

// ── Step 2 ────────────────────────────────────────────────────────────────────

interface Step2State {
  maxParticipants:       number | null;
  prizePool:             number;   // whole pounds
  registrationClosesAt:  Date | null;
  startsAt:              Date | null;
  rules:                 string;
}

interface Step2Props {
  state: Step2State;
  onChange: (next: Partial<Step2State>) => void;
  errors: Partial<Record<keyof Step2State, string>>;
}

function Step2({ state, onChange, errors }: Step2Props) {
  return (
    <div className="flex flex-col gap-5">
      {/* Participant cap */}
      <Section title="Participant Cap">
        <div className="grid grid-cols-4 gap-3">
          {MAX_SIZES.map(n => {
            const selected = state.maxParticipants === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => onChange({ maxParticipants: n })}
                className="flex flex-col items-center py-5 rounded-xl font-display font-bold text-2xl transition-all"
                style={{
                  background: selected ? "rgba(99,102,241,0.08)" : "var(--bg-elevated)",
                  border: `1px solid ${selected ? "var(--accent)" : "var(--border-default)"}`,
                  color: selected ? "var(--accent)" : "var(--text-primary)",
                  boxShadow: selected ? "0 0 12px var(--accent-glow)" : "none",
                }}
              >
                {n}
                <span className="text-xs font-sans font-normal mt-1" style={{ color: "var(--text-muted)" }}>
                  players
                </span>
              </button>
            );
          })}
        </div>
        {errors.maxParticipants && (
          <p className="text-xs" style={{ color: "var(--danger)" }}>{errors.maxParticipants}</p>
        )}
      </Section>

      <Section title="Entry & Prize">
        {/* Entry type toggle — always free for now */}
        <div
          className="flex items-center justify-between p-3 rounded-xl"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
        >
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Entry Type</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--success)" }}>Free Entry</p>
          </div>
          {/* SNIPPET B: Paid entry — Phase 2 placeholder */}
          <ComingSoon label="Phase 2">
            {/* Disabled toggle row */}
            <div
              className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-not-allowed"
              style={{
                background: "var(--bg-overlay)",
                border:     "1px solid var(--border-default)",
              }}
            >
              {/* Toggle track */}
              <div
                className="relative shrink-0 rounded-full"
                style={{ width: 36, height: 20, background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
              >
                <div
                  className="absolute top-0.5 left-0.5 rounded-full"
                  style={{ width: 16, height: 16, background: "var(--text-muted)" }}
                />
              </div>
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Paid Entry
              </span>
            </div>
          </ComingSoon>
          <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            Paid tournaments with Stripe integration — coming soon.
          </p>
        </div>

        {/* Prize pool */}
        <div>
          <Label>Prize Pool (£)</Label>
          <input
            type="number"
            min={0}
            value={state.prizePool || ""}
            onChange={e => onChange({ prizePool: Number(e.target.value) || 0 })}
            placeholder="e.g. 50 for a £50 prize"
            style={inputStyle()}
            onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "var(--border-default)"; }}
          />
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Leave 0 for no prize pool. Enter whole pounds (e.g. 50 = £50).
          </p>
        </div>
      </Section>

      <Section title="Schedule">
        {/* Registration closes */}
        <div>
          <DateTimePicker
            label={<>Registration Closes <span style={{ color: "var(--danger)" }}>*</span></>}
            value={state.registrationClosesAt}
            onChange={d => onChange({ registrationClosesAt: d })}
            placeholder="Select registration close date & time"
            minDate={new Date()}
          />
          {errors.registrationClosesAt && (
            <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
              {errors.registrationClosesAt}
            </p>
          )}
        </div>

        {/* Tournament starts */}
        <div>
          <DateTimePicker
            label={<>Tournament Starts <span style={{ color: "var(--danger)" }}>*</span></>}
            value={state.startsAt}
            onChange={d => onChange({ startsAt: d })}
            placeholder="Select tournament start date & time"
            minDate={state.registrationClosesAt ?? new Date()}
          />
          {errors.startsAt && (
            <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>{errors.startsAt}</p>
          )}
        </div>
      </Section>

      {/* Rules */}
      <Section title="Rules">
        <textarea
          value={state.rules}
          onChange={e => onChange({ rules: e.target.value })}
          placeholder={"Be respectful. No cheating.\nAll matches must be played by the scheduled time.\nDisputes must be reported within 15 minutes."}
          rows={6}
          style={{ ...inputStyle(), resize: "vertical" }}
          onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "var(--border-default)"; }}
        />
      </Section>
    </div>
  );
}

// ── Step 3 (Review) ───────────────────────────────────────────────────────────

interface Step3Props {
  step1: Step1State;
  step2: Step2State;
}

function Step3({ step1, step2 }: Step3Props) {
  const formatLabels: Record<string, string> = {
    single_elim: "Single Elimination",
    double_elim: "Double Elimination",
    round_robin:  "Round Robin",
  };

  const rows: [string, string][] = [
    ["Name",              step1.name],
    ["Game",              step1.game],
    ["Format",            formatLabels[step1.format] ?? step1.format],
    ["Max participants",  step2.maxParticipants?.toString() ?? "—"],
    ["Entry",             "Free"],
    ["Prize pool",        step2.prizePool > 0 ? `£${step2.prizePool}` : "None"],
    ["Registration closes", step2.registrationClosesAt
      ? step2.registrationClosesAt.toLocaleString()
      : "—"],
    ["Starts",            step2.startsAt
      ? step2.startsAt.toLocaleString()
      : "—"],
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Banner preview */}
      {step1.bannerPreview && (
        <div className="rounded-xl overflow-hidden" style={{ height: 140 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={step1.bannerPreview} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        <div
          className="px-5 py-3"
          style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border-subtle)" }}
        >
          <h3 className="font-display font-bold text-base" style={{ color: "var(--text-primary)" }}>
            Review Summary
          </h3>
        </div>

        <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-start justify-between px-5 py-3 gap-4">
              <span className="text-sm shrink-0" style={{ color: "var(--text-muted)" }}>
                {label}
              </span>
              <span
                className="text-sm font-medium text-right"
                style={{ color: value === "—" ? "var(--text-muted)" : "var(--text-primary)" }}
              >
                {value || "—"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Description preview */}
      {step1.description && (
        <div
          className="rounded-xl p-4 text-sm"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-secondary)",
          }}
        >
          {step1.description}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CreateTournamentPage() {
  const router = useRouter();

  const [uid, setUid]           = useState<string | null>(null);
  const [step, setStep]         = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState<string | null>(null);
  const [isSlow, setIsSlow]         = useState(false);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [s1, setS1] = useState<Step1State>({
    name:          "",
    game:          "",
    gameQuery:     "",
    description:   "",
    format:        "",
    bannerFile:    null,
    bannerPreview: null,
  });

  const [s2, setS2] = useState<Step2State>({
    maxParticipants:      null,
    prizePool:            0,
    registrationClosesAt: null,
    startsAt:             null,
    rules:                "",
  });

  const [errors1, setErrors1] = useState<Partial<Record<keyof Step1State, string>>>({});
  const [errors2, setErrors2] = useState<Partial<Record<keyof Step2State, string>>>({});

  // ── Auth gate ──
  useEffect(() => {
    return onAuthStateChanged(auth, user => {
      if (!user) { window.location.href = "/login"; return; }
      setUid(user.uid);
    });
  }, []);

  // ── Validation ──
  const validateStep1 = (): boolean => {
    const e: typeof errors1 = {};
    if (!s1.name.trim() || s1.name.length < 3)
      e.name = "Tournament name must be at least 3 characters";
    if (!s1.game)
      e.game = "Select a game";
    if (!s1.format)
      e.format = "Select a format";
    setErrors1(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = (): boolean => {
    const e: typeof errors2 = {};
    if (!s2.maxParticipants)
      e.maxParticipants = "Select a participant cap";
    if (!s2.registrationClosesAt)
      e.registrationClosesAt = "Set a registration close date";
    else if (s2.registrationClosesAt <= new Date())
      e.registrationClosesAt = "Must be in the future";
    if (!s2.startsAt)
      e.startsAt = "Set a start date";
    else if (s2.registrationClosesAt && s2.startsAt <= s2.registrationClosesAt)
      e.startsAt = "Must be after registration closes";
    setErrors2(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep(s => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    setStep(s => s - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Upload helper ──
  // Posts the file to our server-side API route which uploads via Firebase
  // Admin SDK — no CORS preflight to Firebase Storage from the browser.
  const uploadBanner = async (): Promise<string | null> => {
    if (!s1.bannerFile) return null;

    const tempId   = Date.now().toString();
    const filePath = `tournament-banners/${tempId}/banner`;
    const ext      = s1.bannerFile.name.split(".").pop() ?? "jpg";
    const formData = new FormData();
    formData.append("file", s1.bannerFile, `banner.${ext}`);
    formData.append("path", filePath);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Banner upload failed");
    }
    const { url } = await res.json() as { url: string };
    return url;
  };

  // ── Submit ──
  const handleSubmit = async () => {
    if (!uid) return;
    setSubmitting(true);
    setSubmitStep("Preparing…");
    setIsSlow(false);
    slowTimerRef.current = setTimeout(() => setIsSlow(true), 8_000);

    try {
      if (s1.bannerFile) setSubmitStep("Uploading banner…");
      const bannerUrl = await uploadBanner();
      setSubmitStep("Creating tournament…");

      const docRef = await addDoc(collection(db, "tournaments"), {
        name:                 s1.name.trim(),
        game:                 s1.game,
        description:          s1.description.trim(),
        format:               s1.format,
        bannerUrl:            bannerUrl,
        maxParticipants:      s2.maxParticipants,
        entryFee:             0,
        prizePool:            s2.prizePool * 100, // convert £ to pence
        registrationClosesAt: s2.registrationClosesAt,
        startsAt:             s2.startsAt,
        rosterLockedAt:       s2.startsAt, // same as start for now
        rules:                s2.rules.trim(),
        status:               "open",
        creatorId:            uid,
        participantCount:     0,
        createdAt:            new Date(),
      });

      toast.success("Tournament created! 🏆");
      router.push(`/tournaments/${docRef.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create tournament";
      toast.error(msg);
      setSubmitting(false);
      setSubmitStep(null);
      setIsSlow(false);
    } finally {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    }
  };

  if (!uid) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--text-muted)" }} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-8">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-2 rounded-lg transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-elevated)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="font-display font-bold text-3xl" style={{ color: "var(--text-primary)" }}>
            Create Tournament
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Set up your tournament in a few steps.
          </p>
        </div>
      </div>

      {/* ── Step indicator ── */}
      <StepIndicator current={step} />

      {/* ── Step content ── */}
      {step === 1 && (
        <Step1
          state={s1}
          onChange={partial => setS1(prev => ({ ...prev, ...partial }))}
          errors={errors1}
        />
      )}
      {step === 2 && (
        <Step2
          state={s2}
          onChange={partial => setS2(prev => ({ ...prev, ...partial }))}
          errors={errors2}
        />
      )}
      {step === 3 && <Step3 step1={s1} step2={s2} />}

      {/* ── Navigation ── */}
      <div className={`flex mt-6 ${step > 1 ? "justify-between" : "justify-end"}`}>
        {step > 1 && (
          <button
            type="button"
            onClick={handleBack}
            disabled={submitting}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
            }}
          >
            <ChevronLeft size={15} />
            Back
          </button>
        )}

        {step < 3 ? (
          <button
            type="button"
            onClick={handleNext}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: "var(--accent)", boxShadow: "0 0 20px var(--accent-glow)" }}
          >
            Next
            <ChevronRight size={15} />
          </button>
        ) : (
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: "var(--accent)", boxShadow: "0 0 24px var(--accent-glow)" }}
            >
              {submitting && <Loader2 size={15} className="animate-spin" />}
              {submitting ? (submitStep ?? "Creating…") : "Create Tournament 🏆"}
            </button>
            {isSlow && (
              <div className="flex items-center gap-1.5">
                <AlertCircle size={13} style={{ color: "var(--warning)", flexShrink: 0 }} />
                <p className="text-xs" style={{ color: "var(--warning)" }}>
                  Taking longer than expected — please don&apos;t close this tab.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
