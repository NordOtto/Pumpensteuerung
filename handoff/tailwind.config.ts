// pi/frontend/tailwind.config.ts
// Erweitert das bestehende Config um CSS-Variablen-basierte Tokens

import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Hintergründe — via CSS-Variable (theme-aware)
        bg0:    "var(--color-bg0)",
        bg1:    "var(--color-bg1)",
        bg2:    "var(--color-bg2)",
        bg3:    "var(--color-bg3)",

        // Rahmen
        border:  "var(--color-border)",
        border2: "var(--color-border2)",

        // Text
        tx:  "var(--color-text)",
        tx2: "var(--color-text2)",
        tx3: "var(--color-text3)",

        // Semantische Farben (light + dark via Variable)
        ok:     "var(--color-green)",
        warn:   "var(--color-amber)",
        danger: "var(--color-red)",
        primary:"var(--color-blue)",
        accent: "var(--color-green)",
        purple: "var(--color-purple)",

        // Legacyfarben (für bestehende Komponenten — nicht entfernen)
        background: "var(--color-bg1)",
      },

      fontFamily: {
        // Inter als einzige Schriftfamilie
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
      },

      borderRadius: {
        card: "8px",
        tile: "6px",
        pill: "9999px",
      },

      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)",
        "card-md": "0 4px 12px rgba(0,0,0,0.08)",
      },

      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%":       { opacity: "0.3" },
        },
      },
      animation: {
        "fade-up": "fade-up 200ms ease-out",
        "fade-in": "fade-in 220ms ease-out",
        "pulse-dot": "pulse-dot 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;
