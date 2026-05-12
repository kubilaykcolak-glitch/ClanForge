import { Badge } from "@/components/ui/Badge";

// ── ComingSoon ────────────────────────────────────────────────────────────────
// Wraps any content in a disabled overlay with a small "Coming Soon" badge
// anchored to the top-right corner. Use for Phase 2+ features that are
// visually present but not yet interactive.

interface ComingSoonProps {
  children: React.ReactNode;
  /** Badge label. Defaults to "Coming Soon". */
  label?: string;
  /** Extra class names applied to the outer wrapper. */
  className?: string;
}

export default function ComingSoon({
  children,
  label = "Coming Soon",
  className = "",
}: ComingSoonProps) {
  return (
    <div className={`relative inline-block ${className}`}>
      {/* Disabled children — no clicks, visually dimmed */}
      <div className="pointer-events-none opacity-50 select-none">
        {children}
      </div>

      {/* Phase label badge — top-right, floats above content */}
      <div className="absolute -top-2.5 -right-2 z-10">
        <Badge variant="info">{label}</Badge>
      </div>
    </div>
  );
}
