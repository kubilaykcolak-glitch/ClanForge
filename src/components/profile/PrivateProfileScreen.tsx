import { Lock } from "lucide-react";

export default function PrivateProfileScreen() {
  return (
    <div
      className="flex flex-col items-center justify-center py-20 rounded-2xl text-center"
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-subtle)",
        marginBottom: 32,
      }}
    >
      <Lock
        size={40}
        strokeWidth={1.5}
        style={{ color: "var(--text-muted)", marginBottom: 16 }}
      />
      <h2
        className="font-display font-semibold"
        style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 8 }}
      >
        This profile is private
      </h2>
      <p style={{ fontSize: 14, color: "var(--text-muted)", maxWidth: 320 }}>
        Only the username and clan tag are visible.
      </p>
    </div>
  );
}
