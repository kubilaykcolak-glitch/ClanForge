"use client";

interface ToggleProps {
  checked:      boolean;
  onChange:     (value: boolean) => void;
  label:        string;
  description?: string;
  disabled?:    boolean;
}

export default function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: ToggleProps) {
  return (
    <label
      style={{
        display:       "flex",
        alignItems:    "center",
        gap:           16,
        cursor:        disabled ? "not-allowed" : "pointer",
        opacity:       disabled ? 0.4 : 1,
        userSelect:    "none",
      }}
    >
      {/* Hidden native checkbox — keeps accessibility intact */}
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
      />

      {/* ── Track + badge ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>

        {/* Track */}
        <div
          style={{
            position:     "relative",
            width:        44,
            height:       24,
            borderRadius: 999,
            background:   checked ? "#22c55e" : "#1a1a24",
            border:       checked ? "1px solid #22c55e" : "1px solid rgba(255,255,255,0.08)",
            boxShadow:    checked ? "0 0 10px rgba(34,197,94,0.35)" : "none",
            transition:   "background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
            flexShrink:   0,
          }}
        >
          {/* Thumb */}
          <div
            style={{
              position:     "absolute",
              top:          3,
              left:         checked ? 23 : 3,
              width:        16,
              height:       16,
              borderRadius: "50%",
              background:   "#ffffff",
              boxShadow:    "0 1px 3px rgba(0,0,0,0.4)",
              transition:   "left 0.2s ease",
            }}
          />
        </div>

        {/* Status badge */}
        <span
          style={{
            fontSize:     10,
            fontWeight:   700,
            letterSpacing: "0.05em",
            padding:      "2px 7px",
            borderRadius: 999,
            background:   checked ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)",
            color:        checked ? "#22c55e" : "rgba(255,255,255,0.35)",
            border:       checked ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.08)",
            transition:   "all 0.2s ease",
          }}
        >
          {checked ? "ON" : "OFF"}
        </span>
      </div>

      {/* ── Label + description ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span
          style={{
            fontSize:   14,
            fontWeight: 500,
            color:      checked ? "#ffffff" : "rgba(255,255,255,0.5)",
            transition: "color 0.2s ease",
            lineHeight: 1.4,
          }}
        >
          {label}
        </span>
        {description && (
          <span
            style={{
              fontSize:   12,
              color:      "rgba(255,255,255,0.35)",
              lineHeight: 1.5,
            }}
          >
            {description}
          </span>
        )}
      </div>
    </label>
  );
}
