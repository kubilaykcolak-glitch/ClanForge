import { cn } from "@/lib/utils";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "clan"
  | "tournament"
  | "live";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default:    "bg-elevated text-secondary",
  success:    "bg-success/10 text-success border border-success/20",
  warning:    "bg-warning/10 text-warning border border-warning/20",
  danger:     "bg-danger/10  text-danger  border border-danger/20",
  info:       "bg-info/10    text-info    border border-info/20",
  clan:       "bg-violet/10  text-violet  border border-violet/20",
  tournament: "bg-accent/10  text-accent  border border-accent/20",
  live:       "bg-success/10 text-success border border-success/20 animate-pulse",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        variantStyles[variant],
        className
      )}
    >
      {variant === "live" && (
        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
      )}
      {children}
    </span>
  );
}
