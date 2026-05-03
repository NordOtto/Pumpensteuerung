// pi/frontend/components/ui/info-chip.tsx
// Kleine Info-Kachel für Status-Chips in der TopBar / Pump-Panel
// Zeigt Label + Wert kompakt nebeneinander

import { cn } from "@/lib/utils";

export interface InfoChipProps {
  label: string;
  value: string;
  valueClassName?: string;
  className?: string;
}

export function InfoChip({ label, value, valueClassName, className }: InfoChipProps) {
  return (
    <div className={cn(
      "flex flex-col gap-0.5 rounded-tile border border-border bg-bg2 px-2.5 py-1.5",
      className
    )}>
      <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-tx3">
        {label}
      </span>
      <span className={cn("num text-[13px] font-semibold text-tx", valueClassName)}>
        {value}
      </span>
    </div>
  );
}
