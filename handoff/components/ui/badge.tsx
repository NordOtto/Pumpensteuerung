// pi/frontend/components/ui/badge.tsx
// Ersetzt status-badge.tsx — unterstützt mehr Tones + Theme-aware

import { cn } from "@/lib/utils";

export type BadgeTone = "ok" | "warn" | "danger" | "blue" | "purple" | "muted";

const STYLES: Record<BadgeTone, string> = {
  ok:     "bg-[var(--color-green-dim)]   text-[var(--color-green)]   border-[var(--color-green)]/25",
  warn:   "bg-[var(--color-amber-dim)]   text-[var(--color-amber)]   border-[var(--color-amber)]/25",
  danger: "bg-[var(--color-red-dim)]     text-[var(--color-red)]     border-[var(--color-red)]/25",
  blue:   "bg-[var(--color-blue-dim)]    text-[var(--color-blue)]    border-[var(--color-blue)]/25",
  purple: "bg-[var(--color-purple-dim)]  text-[var(--color-purple)]  border-[var(--color-purple)]/25",
  muted:  "bg-bg2 text-tx2 border-border",
};

export interface BadgeProps {
  tone?: BadgeTone;
  pulse?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ tone = "muted", pulse, children, className }: BadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded border px-2 py-0.5",
      "text-[10px] font-bold uppercase tracking-widest",
      "flex-shrink-0",
      STYLES[tone],
      className
    )}>
      {pulse && (
        <span className={cn(
          "h-1.5 w-1.5 rounded-full bg-current",
          "animate-pulse-dot"
        )} />
      )}
      {children}
    </span>
  );
}
