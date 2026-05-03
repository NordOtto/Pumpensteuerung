// pi/frontend/components/ui/toggle.tsx
// Theme-aware Toggle-Switch — Ersatz für den bisherigen inline-Toggle

import { cn } from "@/lib/utils";

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function Toggle({ checked, onChange, disabled, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        checked
          ? "border-transparent bg-[var(--color-green)]"
          : "border-border bg-bg3",
        className
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all duration-200",
          checked
            ? "left-[18px] bg-[var(--color-bg0)]"
            : "left-0.5 bg-tx3"
        )}
      />
    </button>
  );
}
