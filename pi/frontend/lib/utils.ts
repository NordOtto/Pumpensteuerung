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

/** Bodenfeuchte → Farbklasse nach Design-Brief */
export function moistureColor(pct: number): "ok" | "warn" | "danger" {
  if (pct >= 60) return "ok";
  if (pct >= 30) return "warn";
  return "danger";
}
