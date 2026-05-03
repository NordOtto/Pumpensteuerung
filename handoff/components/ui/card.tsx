// pi/frontend/components/ui/card.tsx
// Basis-Card — ersetzt die glassmorphischen Panels

import { cn } from "@/lib/utils";

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  accent?: string;   // CSS-Gradient-String für den 2px Top-Stripe
  pad?: "sm" | "md" | "none";
}

export function Card({ children, className, accent, pad = "md" }: CardProps) {
  const padClass = pad === "none" ? "" : pad === "sm" ? "p-3" : "p-4";
  return (
    <div className={cn(
      "relative overflow-hidden rounded-card border border-border bg-bg1",
      "shadow-card",
      padClass,
      className
    )}>
      {accent && (
        <div
          className="absolute inset-x-0 top-0 h-0.5"
          style={{ background: accent }}
        />
      )}
      {children}
    </div>
  );
}

// ── SectionLabel ─────────────────────────────────────────────────────────────
export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(
      "mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-tx3",
      className
    )}>
      {children}
    </div>
  );
}

// ── StatBox ─────────────────────────────────────────────────────────────
// Kleines Kachel für Entscheidungs-/Status-Übersichten
export function StatBox({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-tile border border-border bg-bg2 px-3 py-2.5">
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.1em] text-tx3">
        {label}
      </div>
      <div className={cn(
        "truncate text-[13px] font-bold text-tx",
        valueClassName
      )}>
        {value}
      </div>
    </div>
  );
}
