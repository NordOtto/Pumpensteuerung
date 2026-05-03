// pi/frontend/components/ui/btn.tsx
// Primärer Button — ersetzt die ad-hoc Button-Stile in den Pages

import { cn } from "@/lib/utils";
import { forwardRef } from "react";

export type BtnTone = "primary" | "green" | "red" | "amber" | "ghost" | "muted" | "purple";
export type BtnSize = "sm" | "md" | "lg";

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: BtnTone;
  size?: BtnSize;
  icon?: React.ReactNode;
  full?: boolean;
}

const TONE_STYLES: Record<BtnTone, string> = {
  primary: [
    "bg-[var(--color-blue)] text-[var(--color-bg0)]",
    "border-transparent shadow-[0_0_24px_rgba(88,166,255,0.20)]",
  ].join(" "),
  green: [
    "bg-[var(--color-green)] text-[var(--color-bg0)]",
    "border-transparent shadow-[0_0_24px_rgba(0,200,150,0.20)]",
  ].join(" "),
  red: [
    "bg-[var(--color-red-dim)] text-[var(--color-red)]",
    "border-[var(--color-red)]/35",
  ].join(" "),
  amber: [
    "bg-[var(--color-amber-dim)] text-[var(--color-amber)]",
    "border-[var(--color-amber)]/35",
  ].join(" "),
  ghost: [
    "bg-transparent text-tx2",
    "border-border",
  ].join(" "),
  muted: [
    "bg-bg2 text-tx",
    "border-border",
  ].join(" "),
  purple: [
    "bg-[var(--color-purple-dim)] text-[var(--color-purple)]",
    "border-[var(--color-purple)]/35",
  ].join(" "),
};

const SIZE_STYLES: Record<BtnSize, string> = {
  sm: "h-8 px-2.5 text-[11px] gap-1.5",
  md: "h-10 px-4 text-[13px] gap-2",
  lg: "h-[52px] px-5 text-[14px] gap-2",
};

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn(
  { tone = "primary", size = "md", icon, full, children, className, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-tile border",
        "font-bold uppercase tracking-[0.05em]",
        "transition-all active:scale-[0.97]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        TONE_STYLES[tone],
        SIZE_STYLES[size],
        full && "w-full",
        className
      )}
      {...rest}
    >
      {icon && <span className="flex">{icon}</span>}
      {children}
    </button>
  );
});
