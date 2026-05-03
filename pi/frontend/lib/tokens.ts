// pi/frontend/lib/tokens.ts
// Design-Tokens für Pumpensteuerung — Hell & Dunkel
// Verwendung: import { tokens } from "@/lib/tokens"

export const tokens = {
  light: {
    // Hintergründe
    bg0:     "#f0f4f8",   // App-Hintergrund
    bg1:     "#ffffff",   // Karten / Panels
    bg2:     "#f4f6f9",   // Innere Kacheln / Inputs
    bg3:     "#e4e8ed",   // Subtile Trennflächen

    // Rahmen
    border:  "#dde2ea",
    border2: "#eaeef3",   // noch subtiler

    // Text
    text:    "#0f1923",   // Haupttext
    text2:   "#4a5568",   // Sekundärtext
    text3:   "#9aa5b4",   // Labels / Hints

    // Akzentfarben
    green:     "#00a372",
    greenDim:  "rgba(0,163,114,0.10)",
    blue:      "#1a6fd4",
    blueDim:   "rgba(26,111,212,0.10)",
    amber:     "#c47d0a",
    amberDim:  "rgba(196,125,10,0.10)",
    red:       "#d63030",
    redDim:    "rgba(214,48,48,0.10)",
    purple:    "#6d4fd4",
    purpleDim: "rgba(109,79,212,0.10)",
  },

  dark: {
    bg0:     "#0d1117",
    bg1:     "#161b22",
    bg2:     "#21262d",
    bg3:     "#30363d",

    border:  "#30363d",
    border2: "#21262d",

    text:    "#e6edf3",
    text2:   "#8b949e",
    text3:   "#484f58",

    green:     "#00c896",
    greenDim:  "rgba(0,200,150,0.12)",
    blue:      "#58a6ff",
    blueDim:   "rgba(88,166,255,0.12)",
    amber:     "#f59e0b",
    amberDim:  "rgba(245,158,11,0.12)",
    red:       "#ef4444",
    redDim:    "rgba(239,68,68,0.12)",
    purple:    "#a78bfa",
    purpleDim: "rgba(167,139,250,0.12)",
  },
} as const;

export type Theme = keyof typeof tokens;
export type TokenSet = typeof tokens.light;

// Tailwind-kompatible Farbwerte (für tailwind.config.ts)
export const twColors = {
  // Semantische Aliase — werden per CSS-Variable gesetzt
  surface:  "var(--color-bg1)",
  tile:     "var(--color-bg2)",
  border:   "var(--color-border)",
  text:     "var(--color-text)",
  text2:    "var(--color-text2)",
  text3:    "var(--color-text3)",
  accent:   "var(--color-green)",
  primary:  "var(--color-blue)",
  ok:       "var(--color-green)",
  warn:     "var(--color-amber)",
  danger:   "var(--color-red)",
  purple:   "var(--color-purple)",
};
