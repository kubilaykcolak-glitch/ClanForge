import { cn } from "@/lib/utils";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  /** When true, the card shows a soft indigo glow on hover */
  glow?: boolean;
  onClick?: () => void;
}

export function GlowCard({ children, className, glow = false, onClick }: GlowCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        // Base
        "bg-surface border border-default rounded-xl p-6",
        "transition-all duration-200",
        // Interactive cursor when clickable
        onClick && "cursor-pointer",
        // Glow on hover
        glow && "hover:shadow-glow hover:border-[var(--accent)] hover:border-opacity-40",
        className
      )}
      style={
        glow
          ? ({
              "--hover-shadow": "0 0 20px var(--accent-glow), 0 0 40px var(--accent-glow)",
            } as React.CSSProperties)
          : undefined
      }
    >
      {children}
    </div>
  );
}
