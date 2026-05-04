import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatHz(v: number | undefined | null, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(digits);
}

export function formatBar(v: number | undefined | null, digits = 2): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(digits);
}

export function formatLpm(v: number | undefined | null, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(digits);
}


export function formatSmart(v: number | undefined | null, maxDigits = 2): string {
  if (v == null || Number.isNaN(v)) return "-";
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDigits,
  }).format(v);
}

export function formatFixed(v: number | undefined | null, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "-";
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
}

/** Bodenfeuchte → Farbklasse nach Design-Brief */
export function moistureColor(pct: number): "ok" | "warn" | "danger" {
  if (pct >= 60) return "ok";
  if (pct >= 30) return "warn";
  return "danger";
}
