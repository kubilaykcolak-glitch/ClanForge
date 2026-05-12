import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// ─── cn ───────────────────────────────────────────────────────────────────────
// Merge Tailwind classes, resolving conflicts correctly.

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ─── formatDate ───────────────────────────────────────────────────────────────
// Returns a human-readable date string, e.g. "Jan 12, 2025".

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── timeAgo ──────────────────────────────────────────────────────────────────
// Returns a relative time string, e.g. "3 hours ago", "2 days ago".

export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;

  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

// ─── slugify ──────────────────────────────────────────────────────────────────
// Converts a string to a URL-safe slug, e.g. "My Clan!" → "my-clan".

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── generateUsername ─────────────────────────────────────────────────────────
// Derives a username from an email address with a random 4-digit suffix,
// e.g. "john.doe@gmail.com" → "johndoe4821".

export function generateUsername(email: string): string {
  const base = email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${base}${suffix}`;
}

// ─── getInitials ──────────────────────────────────────────────────────────────
// Returns up to 2 uppercase initials, e.g. "John Smith" → "JS".

export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

// ─── clamp ────────────────────────────────────────────────────────────────────
// Clamps a number between min and max (inclusive).

export function clamp(num: number, min: number, max: number): number {
  return Math.min(Math.max(num, min), max);
}
