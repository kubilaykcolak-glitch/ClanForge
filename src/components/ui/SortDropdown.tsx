"use client";

// ─── SortDropdown ─────────────────────────────────────────────────────────────
//
// Compact sort selector. Top-right of any listing page header.

interface SortOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options:  ReadonlyArray<SortOption<T>>;
  value:    T;
  onChange: (next: T) => void;
  /** Optional inline label, e.g. "Sort:". Hidden on narrow screens. */
  label?:   string;
}

export function SortDropdown<T extends string>({
  options,
  value,
  onChange,
  label,
}: Props<T>) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      {label && (
        <span className="hidden sm:inline text-xs" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
      )}
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className="rounded-lg px-3 py-1.5 text-xs font-medium outline-none cursor-pointer transition-colors"
        style={{
          background: "var(--bg-elevated)",
          border:     "1px solid var(--border-default)",
          color:      "var(--text-secondary)",
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
