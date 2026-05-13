"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { LogOut, Mail, Shield, UserCog } from "lucide-react";
import { toast } from "sonner";
import { auth } from "@/lib/firebase/client";

// ── Section card ──────────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title:        string;
  description?: string;
  children:     React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-6 flex flex-col gap-5"
      style={{
        background: "var(--bg-surface)",
        border:     "1px solid var(--border-default)",
      }}
    >
      <div>
        <h2
          className="font-display font-bold text-lg"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h2>
        {description && (
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Read-only row ─────────────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  value,
}: {
  icon:  React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
        style={{
          background: "var(--bg-elevated)",
          border:     "1px solid var(--border-default)",
          color:      "var(--text-secondary)",
        }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {label}
        </p>
        <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
          {value}
        </p>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async user => {
      if (!user) {
        router.replace("/login");
        return;
      }
      setEmail(user.email ?? "");
      // Display name is the closest thing we have to a "username" without
      // an extra Firestore read; show what's on the auth profile.
      setUsername(user.displayName ?? user.email ?? "");
      setLoading(false);
    });
  }, [router]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      await fetch("/api/auth/session", { method: "DELETE" });
      window.location.href = "/";
    } catch {
      toast.error("Failed to sign out — please try again");
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <p style={{ color: "var(--text-muted)" }}>Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5">

      {/* ── Header ── */}
      <div className="mb-2">
        <h1
          className="font-display font-bold text-3xl"
          style={{ color: "var(--text-primary)" }}
        >
          Account Settings
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Manage your account, sign-in, and privacy. For profile details, banner, and
          appearance, use <Link href="/profile/edit" className="underline" style={{ color: "var(--accent)" }}>Edit Profile</Link>.
        </p>
      </div>

      {/* ── Account ── */}
      <Section
        title="Account"
        description="The email and sign-in details for your ClanForge account."
      >
        <InfoRow
          icon={<Mail size={16} />}
          label="Email"
          value={email || "(not set)"}
        />
        <InfoRow
          icon={<UserCog size={16} />}
          label="Display name"
          value={username || "(not set)"}
        />
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Username, display name, avatar, and bio can be updated from{" "}
          <Link href="/profile/edit" className="underline" style={{ color: "var(--text-secondary)" }}>
            Edit Profile
          </Link>
          .
        </p>
      </Section>

      {/* ── Privacy ── */}
      <Section
        title="Privacy"
        description="Control who can find and view your profile."
      >
        <div
          className="flex items-start gap-3 rounded-lg p-3"
          style={{
            background: "var(--bg-elevated)",
            border:     "1px solid var(--border-default)",
          }}
        >
          <Shield size={16} style={{ color: "var(--text-secondary)", marginTop: 2, flexShrink: 0 }} />
          <div className="min-w-0">
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
              Visibility toggle
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Use the visibility toggle on{" "}
              <Link href="/profile/edit" className="underline" style={{ color: "var(--text-secondary)" }}>
                Edit Profile
              </Link>{" "}
              to hide your profile from search and player listings.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Session ── */}
      <Section
        title="Session"
        description="Sign out of this device."
      >
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center justify-center gap-2 self-start px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          style={{
            background: "rgba(239,68,68,0.1)",
            border:     "1px solid rgba(239,68,68,0.3)",
            color:      "var(--danger)",
          }}
        >
          <LogOut size={15} />
          Sign Out
        </button>
      </Section>
    </div>
  );
}
