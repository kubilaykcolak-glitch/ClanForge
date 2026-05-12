import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      // ─── Fonts ────────────────────────────────────────────────────────────
      fontFamily: {
        display: ["Rajdhani", "sans-serif"],
        sans:    ["DM Sans", "sans-serif"],
        mono:    ["var(--font-geist-mono)"],
      },

      // ─── Colours ──────────────────────────────────────────────────────────
      colors: {
        // ClanForge design tokens
        base:          "var(--bg-base)",
        surface:       "var(--bg-surface)",
        elevated:      "var(--bg-elevated)",
        overlay:       "var(--bg-overlay)",
        accent:        "var(--accent)",
        "accent-hover":"var(--accent-hover)",
        violet:        "var(--violet)",
        success:       "var(--success)",
        warning:       "var(--warning)",
        danger:        "var(--danger)",
        info:          "var(--info)",
        primary:       "var(--text-primary)",
        secondary:     "var(--text-secondary)",
        muted:         "var(--text-muted)",

        // shadcn compatibility (hsl tokens)
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        border:     "hsl(var(--border))",
        input:      "hsl(var(--input))",
        ring:       "hsl(var(--ring))",
        card: {
          DEFAULT:    "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT:    "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        destructive: {
          DEFAULT:    "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
      },

      // ─── Border colours ───────────────────────────────────────────────────
      borderColor: {
        subtle:  "var(--border-subtle)",
        default: "var(--border-default)",
        strong:  "var(--border-strong)",
      },

      // ─── Border radius ────────────────────────────────────────────────────
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },

      // ─── Box shadows ──────────────────────────────────────────────────────
      boxShadow: {
        glow:    "0 0 20px var(--accent-glow), 0 0 40px var(--accent-glow)",
        "glow-sm":"0 0 10px var(--accent-glow)",
      },

      // ─── Keyframes & animations ───────────────────────────────────────────
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to:   { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to:   { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up":   "accordion-up 0.2s ease-out",
        "fade-in":        "fade-in 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
