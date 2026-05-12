"use client";

/**
 * DateTimePicker
 * A fully custom date + time picker matching the ClanForge dark theme.
 * No external calendar library required — uses native JS Date arithmetic.
 *
 * Props:
 *   value       – controlled Date | null
 *   onChange    – called with the new Date on selection
 *   placeholder – shown when no date is selected
 *   minDate     – dates before this are disabled (defaults to now)
 *   label       – optional label rendered above the trigger
 */

import React, { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";

// ── helpers ───────────────────────────────────────────────────────────────────

const DAYS   = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
] as const;

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function startDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay(); // 0 = Sunday
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function formatDisplay(d: Date) {
  return d.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  }) + "  " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// ── minute options (every 5 min) ──────────────────────────────────────────────

const MINUTE_OPTS = Array.from({ length: 12 }, (_, i) => i * 5);

// ── styles (inline, uses CSS vars) ───────────────────────────────────────────

const PANEL_W = 300;

// ── component ─────────────────────────────────────────────────────────────────

interface DateTimePickerProps {
  value:        Date | null;
  onChange:     (d: Date | null) => void;
  placeholder?: string;
  minDate?:     Date;
  label?:       React.ReactNode;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Select date & time",
  minDate,
  label,
}: DateTimePickerProps) {
  const today   = new Date();
  const floor   = minDate ?? today;

  // Calendar navigation state (independent of selected value)
  const initDate = value ?? today;
  const [viewYear,  setViewYear]  = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  // Picked date parts (before confirming)
  const [pickedDate, setPickedDate] = useState<Date | null>(value);
  const [hour,   setHour]   = useState(value ? value.getHours()   : 12);
  const [minute, setMinute] = useState(value ? value.getMinutes() : 0);

  const [open, setOpen] = useState(false);

  const panelRef  = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Sync internal state when external value changes
  useEffect(() => {
    if (value) {
      setPickedDate(value);
      setHour(value.getHours());
      setMinute(value.getMinutes());
      setViewYear(value.getFullYear());
      setViewMonth(value.getMonth());
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current  && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // ── calendar grid helpers ──
  const totalDays  = daysInMonth(viewYear, viewMonth);
  const startDay   = startDayOfMonth(viewYear, viewMonth);

  // Prev / next month nav (never go before current month)
  const canGoPrev = () => {
    const floorYear  = floor.getFullYear();
    const floorMonth = floor.getMonth();
    return viewYear > floorYear || (viewYear === floorYear && viewMonth > floorMonth);
  };

  const prevMonth = () => {
    if (!canGoPrev()) return;
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  // Is a given day disabled?
  const isDayDisabled = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    d.setHours(23, 59, 59);
    return d < floor;
  };

  // Confirm and emit
  const handleConfirm = () => {
    if (!pickedDate) return;
    const result = new Date(pickedDate);
    result.setHours(hour, minute, 0, 0);
    onChange(result);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setPickedDate(null);
  };

  // ── styles ──
  const cell = (active: boolean, disabled: boolean, isToday: boolean): React.CSSProperties => ({
    width: 36,
    height: 36,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    cursor: disabled ? "default" : "pointer",
    background: active
      ? "var(--accent)"
      : isToday
      ? "rgba(99,102,241,0.10)"
      : "transparent",
    color: disabled
      ? "var(--text-muted)"
      : active
      ? "#fff"
      : isToday
      ? "var(--accent)"
      : "var(--text-secondary)",
    border: isToday && !active ? "1px solid rgba(99,102,241,0.35)" : "1px solid transparent",
    opacity: disabled ? 0.35 : 1,
    transition: "background 120ms, color 120ms",
  });

  const selectStyle: React.CSSProperties = {
    background: "var(--bg-overlay)",
    border: "1px solid var(--border-default)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 14,
    padding: "6px 8px",
    outline: "none",
    cursor: "pointer",
  };

  return (
    <div style={{ position: "relative" }}>
      {label && (
        <p className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
          {label}
        </p>
      )}

      {/* ── Trigger button ── */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors text-left"
        style={{
          background: "var(--bg-elevated)",
          border: `1px solid ${open ? "var(--accent)" : "var(--border-default)"}`,
          color: value ? "var(--text-primary)" : "var(--text-muted)",
          boxShadow: open ? "0 0 0 2px var(--accent-glow)" : "none",
        }}
      >
        <CalendarDays size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <span className="flex-1 truncate">
          {value ? formatDisplay(value) : placeholder}
        </span>
        {value && (
          <span
            onClick={handleClear}
            role="button"
            aria-label="Clear date"
            className="ml-auto p-0.5 rounded transition-colors"
            style={{ color: "var(--text-muted)", cursor: "pointer" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--danger)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
          >
            <X size={13} />
          </span>
        )}
      </button>

      {/* ── Panel ── */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            width: PANEL_W,
            zIndex: 50,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            borderRadius: 14,
            boxShadow: "0 8px 40px rgba(0,0,0,0.45)",
            overflow: "hidden",
          }}
        >

          {/* ── Month navigation header ── */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <button
              type="button"
              onClick={prevMonth}
              disabled={!canGoPrev()}
              className="p-1 rounded-lg transition-colors disabled:opacity-30"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={e => { if (canGoPrev()) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
            >
              <ChevronLeft size={16} />
            </button>

            <span className="text-sm font-semibold select-none" style={{ color: "var(--text-primary)" }}>
              {MONTHS[viewMonth]} {viewYear}
            </span>

            <button
              type="button"
              onClick={nextMonth}
              className="p-1 rounded-lg transition-colors"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* ── Calendar grid ── */}
          <div className="px-3 pt-3 pb-1">

            {/* Day-of-week headers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
              {DAYS.map(d => (
                <div
                  key={d}
                  style={{
                    textAlign: "center",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    paddingBottom: 4,
                  }}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
              {/* Leading empty cells */}
              {Array.from({ length: startDay }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}

              {/* Day buttons */}
              {Array.from({ length: totalDays }, (_, i) => {
                const day      = i + 1;
                const thisDate = new Date(viewYear, viewMonth, day);
                const disabled = isDayDisabled(day);
                const active   = !!pickedDate && sameDay(thisDate, pickedDate);
                const isToday  = sameDay(thisDate, today);

                return (
                  <button
                    key={day}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return;
                      setPickedDate(thisDate);
                    }}
                    style={cell(active, disabled, isToday)}
                    onMouseEnter={e => {
                      if (!disabled && !active) {
                        (e.currentTarget as HTMLElement).style.background = "var(--bg-overlay)";
                        (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                      }
                    }}
                    onMouseLeave={e => {
                      if (!disabled && !active) {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                        (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                      }
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Time picker ── */}
          <div
            className="px-4 py-3 flex items-center gap-3"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <Clock size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Time</span>

            {/* Hour */}
            <select
              value={hour}
              onChange={e => setHour(Number(e.target.value))}
              style={selectStyle}
              aria-label="Hour"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {String(i).padStart(2, "0")}
                </option>
              ))}
            </select>

            <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>:</span>

            {/* Minute */}
            <select
              value={minute}
              onChange={e => setMinute(Number(e.target.value))}
              style={selectStyle}
              aria-label="Minute"
            >
              {MINUTE_OPTS.map(m => (
                <option key={m} value={m}>
                  {String(m).padStart(2, "0")}
                </option>
              ))}
            </select>

            <span className="text-xs ml-1" style={{ color: "var(--text-muted)" }}>
              {hour < 12 ? "AM" : "PM"}
            </span>
          </div>

          {/* ── Confirm button ── */}
          <div
            className="px-4 pb-4"
            style={{ paddingTop: 2 }}
          >
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!pickedDate}
              className="w-full py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: pickedDate ? "var(--accent)" : "var(--bg-overlay)",
                boxShadow: pickedDate ? "0 0 14px var(--accent-glow)" : "none",
              }}
            >
              {pickedDate
                ? `Confirm — ${pickedDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at ${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`
                : "Pick a date first"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
