"use client";

interface ChallengeProgressBarProps {
  progress:    number;
  target:      number;
  completed?:  boolean;
  showLabel?:  boolean;
  height?:     number;
}

export function ChallengeProgressBar({
  progress,
  target,
  completed = false,
  showLabel  = true,
  height     = 6,
}: ChallengeProgressBarProps) {
  const pct = Math.min(100, target > 0 ? Math.round((progress / target) * 100) : 0);

  return (
    <div>
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height, background: "var(--bg-overlay)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width:      `${pct}%`,
            background: completed ? "var(--success)" : "var(--accent)",
          }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between mt-1">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {completed ? "Completed ✓" : `${progress.toLocaleString()} / ${target.toLocaleString()}`}
          </span>
          <span className="text-xs font-medium" style={{ color: completed ? "var(--success)" : "var(--accent)" }}>
            {pct}%
          </span>
        </div>
      )}
    </div>
  );
}
