"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { Trophy, Shield, Zap, ArrowRight } from "lucide-react";
import { auth } from "@/lib/firebase/client";

// ── Static data ───────────────────────────────────────────────────────────────

const STATS_DATA = [
  { end: 2847, label: "Gamers Registered" },
  { end: 412,  label: "Active Clans" },
  { end: 1203, label: "Tournaments Completed" },
];

const FEATURES_DATA = [
  {
    Icon: Trophy,
    title: "Build Your Profile",
    desc:  "Track your games, record your wins, link your platform accounts. Your gaming identity in one place.",
  },
  {
    Icon: Shield,
    title: "Form Your Clan",
    desc:  "Recruit teammates, run a social feed, organise scrimmages. Build the squad that wins.",
  },
  {
    Icon: Zap,
    title: "Run Tournaments",
    desc:  "Create brackets, set entry requirements, report results. From casual to competitive.",
  },
];

const STEPS_DATA = [
  { title: "Create Profile",     desc: "Set up your gaming identity in under 2 minutes." },
  { title: "Join a Clan",        desc: "Find your squad or build one from scratch." },
  { title: "Enter a Tournament", desc: "Register, compete, and climb the bracket." },
  { title: "Claim Glory",        desc: "Win prizes, earn XP, and forge your legacy." },
];

const GAMES = [
  "Valorant", "Rocket League", "Fortnite", "EA FC 25", "Call of Duty",
  "Apex Legends", "League of Legends", "CS2", "Overwatch 2", "Halo",
  "Minecraft", "Diablo IV", "Street Fighter 6", "Tekken 8", "Destiny 2",
];

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Fires once when the observed element first enters the viewport. */
function useInView(ref: React.RefObject<Element>, threshold = 0.2): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, threshold, inView]);

  return inView;
}

/** Eased count-up from 0 → target over `duration` ms, triggered once `start` flips true. */
function useCountUp(target: number, duration: number, start: boolean): number {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!start) return;
    const t0 = performance.now();

    function tick(now: number) {
      const p     = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setCount(Math.round(eased * target));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [start, target, duration]);

  return count;
}

// ── StatCounter ───────────────────────────────────────────────────────────────

function StatCounter({ end, label, trigger }: { end: number; label: string; trigger: boolean }) {
  const count = useCountUp(end, 1800, trigger);
  return (
    <div className="text-center">
      <p
        className="font-display font-bold leading-none mb-2"
        style={{ fontSize: 56, color: "var(--accent)" }}
      >
        {count.toLocaleString()}
      </p>
      <p className="text-base" style={{ color: "var(--text-secondary)" }}>
        {label}
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router      = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  // Redirect signed-in users straight to the dashboard — they have no reason
  // to be on the marketing page and clicking Sign In just bounces them back anyway.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user) {
        router.replace("/dashboard");
      } else {
        setAuthChecked(true);
      }
    });
    return unsub;
  }, [router]);

  const statsRef    = useRef<HTMLElement>(null);
  const featuresRef = useRef<HTMLElement>(null);
  const cardRefs    = useRef<(HTMLDivElement | null)[]>([]);

  const statsInView    = useInView(statsRef);
  const featuresInView = useInView(featuresRef, 0.15);

  // Stagger feature cards into view when section enters viewport
  useEffect(() => {
    if (!featuresInView) return;
    cardRefs.current.forEach((card, i) => {
      if (!card) return;
      setTimeout(() => card.classList.add("lp-card-visible"), i * 130);
    });
  }, [featuresInView]);

  // While we're waiting for Firebase to confirm auth state, render nothing —
  // avoids a flash of the landing page for signed-in users before the redirect.
  if (!authChecked) return null;

  return (
    <>
      {/* ── Keyframes & page-scoped utility classes ── */}
      <style>{`
        @keyframes lp-float {
          0%, 100% { transform: translateY(0px);  }
          50%       { transform: translateY(-8px); }
        }
        @keyframes lp-marquee {
          from { transform: translateX(0);    }
          to   { transform: translateX(-50%); }
        }

        /* Feature card fade-up */
        .lp-feature-card {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.55s ease, transform 0.55s ease,
                      border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .lp-feature-card.lp-card-visible {
          opacity: 1;
          transform: translateY(0);
        }
        .lp-feature-card:hover {
          border-color: rgba(99,102,241,0.38) !important;
          box-shadow: 0 0 20px rgba(99,102,241,0.12), 0 0 48px rgba(99,102,241,0.06);
        }

        /* Button/link states */
        .lp-solid-btn:hover  { opacity: 0.87; }
        .lp-ghost-btn:hover  { border-color: rgba(99,102,241,0.45) !important; color: var(--text-primary) !important; }
        .lp-nav-ghost:hover  { color: var(--text-primary) !important; }
        .lp-footer-link      { color: var(--text-muted); transition: color 0.15s; }
        .lp-footer-link:hover{ color: var(--text-secondary); }

        /* Marquee */
        .lp-marquee-track {
          display: flex;
          width: max-content;
          animation: lp-marquee 28s linear infinite;
        }
        .lp-marquee-track:hover { animation-play-state: paused; }
      `}</style>

      <div style={{ background: "#0a0a0f", minHeight: "100vh", overflowX: "hidden" }}>

        {/* ══════════════════════════════════════════════════════════
            §1 NAVBAR
        ══════════════════════════════════════════════════════════ */}
        <nav
          className="w-full px-6 sm:px-12 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <Link href="/" className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center text-white font-display font-bold text-sm shrink-0"
              style={{ background: "var(--accent)" }}
            >
              CF
            </div>
            <span
              className="font-display font-bold text-xl tracking-wide"
              style={{ color: "var(--text-primary)" }}
            >
              ClanForge
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="lp-nav-ghost px-4 py-2 rounded-lg text-sm font-medium"
              style={{ color: "var(--text-secondary)", transition: "color 0.15s" }}
            >
              Log In
            </Link>
            <Link href="/register" className="arena-cta">
              Sign Up
            </Link>
          </div>
        </nav>

        {/* ══════════════════════════════════════════════════════════
            §2 HERO
        ══════════════════════════════════════════════════════════ */}
        <section
          className="relative flex items-center overflow-hidden"
          style={{ minHeight: "calc(100vh - 65px)" }}
        >
          {/* Background: soft indigo radial glow + dot-grid */}
          <div
            className="absolute inset-0 pointer-events-none select-none"
            style={{
              backgroundImage: `
                radial-gradient(ellipse 72% 55% at 50% -8%, rgba(99,102,241,0.18) 0%, transparent 65%),
                radial-gradient(rgba(99,102,241,0.055) 1px, transparent 1px)
              `,
              backgroundSize: "100% 100%, 22px 22px",
            }}
          />

          <div className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-12 py-20 flex flex-col lg:flex-row items-center gap-14 lg:gap-10">

            {/* ── Left copy (60%) ── */}
            <div className="flex-1 min-w-0">

              {/* Free pill */}
              <div
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium mb-8"
                style={{
                  background: "rgba(99,102,241,0.10)",
                  border:     "1px solid rgba(99,102,241,0.25)",
                  color:      "var(--accent)",
                }}
              >
                🎮 Free for all gamers
              </div>

              {/* H1 — 72 px on desktop */}
              <h1
                className="font-display font-bold leading-[1.04] mb-6"
                style={{
                  fontSize:    "clamp(44px, 5.5vw, 72px)",
                  color:       "var(--text-primary)",
                  letterSpacing: "-0.01em",
                }}
              >
                Your Gaming<br />
                Legacy Starts<br />
                <span style={{ color: "var(--accent)" }}>Here</span>
              </h1>

              {/* Sub — 20 px */}
              <p
                className="mb-10 leading-relaxed"
                style={{ fontSize: 20, color: "var(--text-secondary)", maxWidth: 490 }}
              >
                Build your profile. Form your clan.<br />
                Dominate the tournament.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap gap-4 mb-8">
                <Link
                  href="/register"
                  className="arena-cta"
                  style={{ padding: "14px 26px", fontSize: 14 }}
                >
                  Create Profile <ArrowRight size={17} />
                </Link>
                <Link
                  href="/login"
                  className="lp-ghost-btn inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-medium"
                  style={{
                    fontSize:   16,
                    border:     "1px solid var(--border-default)",
                    color:      "var(--text-secondary)",
                    transition: "border-color 0.15s, color 0.15s",
                  }}
                >
                  Log In <ArrowRight size={17} />
                </Link>
              </div>

              {/* Social proof */}
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Join{" "}
                <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
                  2,400+ gamers
                </span>{" "}
                already competing. Free forever.
              </p>
            </div>

            {/* ── Right: floating mock card (40%, desktop only) ── */}
            <div className="hidden lg:block shrink-0" style={{ width: 300 }}>
              <div
                style={{
                  animation: "lp-float 3s ease-in-out infinite",
                  filter:    "drop-shadow(0 24px 64px rgba(99,102,241,0.22))",
                }}
              >
                <div
                  className="rounded-2xl p-5"
                  style={{
                    background: "var(--bg-surface)",
                    border:     "1px solid var(--border-default)",
                  }}
                >
                  {/* Avatar + name + level */}
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center font-display font-bold text-white text-sm shrink-0"
                      style={{ background: "var(--accent)" }}
                    >
                      SH
                    </div>
                    <div>
                      <p
                        className="font-display font-bold text-base leading-tight"
                        style={{ color: "var(--text-primary)" }}
                      >
                        ShadowHunter
                      </p>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-0.5"
                        style={{
                          background: "rgba(99,102,241,0.12)",
                          border:     "1px solid rgba(99,102,241,0.22)",
                          color:      "var(--accent)",
                        }}
                      >
                        Level 12
                      </span>
                    </div>
                  </div>

                  {/* Game tags */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {["Valorant", "Apex Legends", "Rocket League"].map(g => (
                      <span
                        key={g}
                        className="px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{
                          background: "var(--bg-elevated)",
                          border:     "1px solid var(--border-subtle)",
                          color:      "var(--text-secondary)",
                        }}
                      >
                        {g}
                      </span>
                    ))}
                  </div>

                  {/* Win stats */}
                  <div
                    className="rounded-xl px-4 py-3 mb-4 text-center"
                    style={{ background: "var(--bg-elevated)" }}
                  >
                    <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      94 Wins{" "}
                      <span style={{ color: "var(--text-muted)" }}>·</span>{" "}
                      <span style={{ color: "var(--success)" }}>67% Win Rate</span>
                    </p>
                  </div>

                  {/* Clan */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>Clan</span>
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                      style={{
                        background: "rgba(139,92,246,0.12)",
                        border:     "1px solid rgba(139,92,246,0.25)",
                        color:      "var(--violet)",
                      }}
                    >
                      ⚡ Elite Clan
                    </span>
                  </div>

                  {/* XP bar */}
                  <div>
                    <div
                      className="flex justify-between text-xs mb-1.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <span>XP Progress</span><span>720 / 1000</span>
                    </div>
                    <div
                      className="h-1.5 rounded-full overflow-hidden"
                      style={{ background: "var(--bg-overlay)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width:      "72%",
                          background: "linear-gradient(90deg, var(--accent), var(--violet))",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            §3 STATS STRIP
        ══════════════════════════════════════════════════════════ */}
        <section
          ref={statsRef}
          className="w-full py-16"
          style={{
            background:   "var(--bg-surface)",
            borderTop:    "1px solid var(--border-subtle)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div className="max-w-4xl mx-auto px-6 grid grid-cols-1 sm:grid-cols-3 gap-12 sm:gap-8">
            {STATS_DATA.map(s => (
              <StatCounter key={s.label} end={s.end} label={s.label} trigger={statsInView} />
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            §4 FEATURES
        ══════════════════════════════════════════════════════════ */}
        <section ref={featuresRef} className="w-full py-24">
          <div className="max-w-6xl mx-auto px-6 sm:px-12">

            <div className="text-center mb-14">
              <h2
                className="font-display font-bold mb-3"
                style={{ fontSize: "clamp(28px, 3.5vw, 44px)", color: "var(--text-primary)" }}
              >
                Everything you need to compete
              </h2>
              <p style={{ color: "var(--text-muted)" }}>One platform. Zero friction.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {FEATURES_DATA.map(({ Icon, title, desc }, i) => (
                <div
                  key={title}
                  ref={el => { cardRefs.current[i] = el; }}
                  className="lp-feature-card rounded-2xl p-7"
                  style={{
                    background: "var(--bg-surface)",
                    border:     "1px solid var(--border-default)",
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                    style={{
                      background: "rgba(99,102,241,0.10)",
                      border:     "1px solid rgba(99,102,241,0.20)",
                    }}
                  >
                    <Icon size={22} style={{ color: "var(--accent)" }} />
                  </div>
                  <h3
                    className="font-display font-bold text-xl mb-2"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            §5 HOW IT WORKS
        ══════════════════════════════════════════════════════════ */}
        <section
          className="w-full py-24"
          style={{ background: "var(--bg-surface)", borderTop: "1px solid var(--border-subtle)" }}
        >
          <div className="max-w-5xl mx-auto px-6 sm:px-12">

            <h2
              className="font-display font-bold text-center mb-16"
              style={{ fontSize: "clamp(28px, 3.5vw, 44px)", color: "var(--text-primary)" }}
            >
              Get started in minutes
            </h2>

            {/* 4-column grid; dotted connector on desktop */}
            <div className="relative grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-4">

              {/* Horizontal dotted line spanning centre-of-col-1 → centre-of-col-4 */}
              <div
                className="hidden md:block absolute"
                style={{
                  top:             20,         // vertically centred in the 40px circle
                  left:            "12.5%",    // centre of col 1
                  right:           "12.5%",   // centre of col 4
                  height:          1,
                  backgroundImage: "repeating-linear-gradient(90deg, var(--border-default) 0px, var(--border-default) 6px, transparent 6px, transparent 14px)",
                }}
              />

              {STEPS_DATA.map(({ title, desc }, i) => (
                <div
                  key={title}
                  className="relative z-10 flex flex-col items-center text-center px-3"
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-sm text-white mb-5 shrink-0"
                    style={{ background: "var(--accent)" }}
                  >
                    {i + 1}
                  </div>
                  <h3
                    className="font-display font-bold text-lg mb-2"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            §6 GAMES MARQUEE
        ══════════════════════════════════════════════════════════ */}
        <section
          className="w-full py-14 overflow-hidden"
          style={{ background: "#0a0a0f", borderTop: "1px solid var(--border-subtle)" }}
        >
          <p
            className="text-center text-sm font-medium mb-8"
            style={{ color: "var(--text-muted)" }}
          >
            Compete across all your favourite games
          </p>

          {/* Two identical copies → seamless loop when -50% translate completes */}
          <div className="lp-marquee-track" aria-hidden="true">
            {[...GAMES, ...GAMES].map((game, i) => (
              <span
                key={i}
                className="inline-flex items-center mx-2.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap"
                style={{
                  background: "var(--bg-surface)",
                  border:     "1px solid var(--border-subtle)",
                  color:      "var(--text-secondary)",
                }}
              >
                {game}
              </span>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            §7 FINAL CTA
        ══════════════════════════════════════════════════════════ */}
        <section
          className="w-full py-28 text-center relative overflow-hidden"
          style={{ background: "var(--bg-elevated)", borderTop: "1px solid var(--border-subtle)" }}
        >
          {/* Soft radial glow centred on heading */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse 55% 50% at 50% 40%, rgba(99,102,241,0.10) 0%, transparent 70%)",
            }}
          />

          <div className="relative max-w-2xl mx-auto px-6">
            <h2
              className="font-display font-bold mb-5"
              style={{
                fontSize:   "clamp(36px, 5vw, 56px)",
                color:      "var(--text-primary)",
                lineHeight: 1.08,
              }}
            >
              Ready to compete?
            </h2>

            <p
              className="mb-10 text-lg leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              Join thousands of gamers on ClanForge —{" "}
              <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                completely free.
              </span>
            </p>

            <Link
              href="/register"
              className="arena-cta"
              style={{ padding: "16px 36px", fontSize: 15 }}
            >
              Create Your Profile <ArrowRight size={18} />
            </Link>

            <p className="mt-5 text-sm" style={{ color: "var(--text-muted)" }}>
              No credit card required. No catch.
            </p>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            §8 FOOTER
        ══════════════════════════════════════════════════════════ */}
        <footer
          className="w-full px-6 sm:px-12 py-7 flex flex-col sm:flex-row items-center justify-between gap-5"
          style={{ background: "#0a0a0f", borderTop: "1px solid var(--border-subtle)" }}
        >
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div
              className="w-6 h-6 rounded flex items-center justify-center text-white font-display font-bold text-xs"
              style={{ background: "var(--accent)" }}
            >
              CF
            </div>
            <span
              className="font-display font-semibold text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              ClanForge
            </span>
          </Link>

          {/* Links */}
          <div className="flex items-center gap-6 text-sm">
            <Link href="/about"   className="lp-footer-link">About</Link>
            <a
              href="https://discord.gg"
              target="_blank"
              rel="noreferrer"
              className="lp-footer-link"
            >
              Discord
            </a>
            <Link href="/terms"   className="lp-footer-link">Terms</Link>
            <Link href="/privacy" className="lp-footer-link">Privacy</Link>
          </div>

          {/* Copyright */}
          <p className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
            © 2025 ClanForge. All rights reserved.
          </p>
        </footer>

      </div>
    </>
  );
}
