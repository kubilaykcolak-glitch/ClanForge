"use client";

import { useEffect, useState } from "react";

interface CountdownTimerProps {
  targetDate: Date;
  label?: string;
}

interface TimeLeft {
  days:    number;
  hours:   number;
  minutes: number;
  seconds: number;
}

function calcTimeLeft(target: Date): TimeLeft | null {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    days:    Math.floor(diff / 86_400_000),
    hours:   Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
  };
}

export function CountdownTimer({
  targetDate,
  label = "Closes in",
}: CountdownTimerProps) {
  // Start null to avoid SSR/client mismatch
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);

  useEffect(() => {
    const tick = () => setTimeLeft(calcTimeLeft(targetDate));
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [targetDate]);

  // Not yet hydrated
  if (timeLeft === undefined) return null;

  // Expired
  if (timeLeft === null) {
    return (
      <p className="text-sm font-medium" style={{ color: "var(--danger)" }}>
        Registration Closed
      </p>
    );
  }

  const underOneHour =
    timeLeft.days === 0 && timeLeft.hours === 0;

  const formatted = [
    timeLeft.days > 0 ? `${timeLeft.days}d` : null,
    `${timeLeft.hours}h`,
    `${timeLeft.minutes}m`,
    `${String(timeLeft.seconds).padStart(2, "0")}s`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <p className="text-sm" style={{ color: "var(--text-muted)" }}>
      {label}:{" "}
      <span
        className="font-mono font-semibold"
        style={{ color: underOneHour ? "var(--danger)" : "var(--text-primary)" }}
      >
        {formatted}
      </span>
    </p>
  );
}
