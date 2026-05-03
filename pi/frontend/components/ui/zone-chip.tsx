// pi/frontend/components/ui/zone-chip.tsx
// Kompakte Zonen-Statusanzeige für Dashboard-Übersicht

import { cn } from "@/lib/utils";
import { Badge } from "./badge";

export interface ZoneChipProps {
  name: string;
  /** 0–100 */
  moisturePct: number;
  etTodayMm?: number | null;
  nextRun?: string | null;
  /** Wird nur als "Läuft"-Badge angezeigt */
  active?: boolean;
  className?: string;
}

export function ZoneChip({
  name,
  moisturePct,
  etTodayMm,
  nextRun,
  active,
  className,
}: ZoneChipProps) {
  const tone =
    moisturePct >= 60 ? "ok" :
    moisturePct >= 30 ? "warn" : "danger";

  const barColor =
    moisturePct >= 60 ? "var(--color-green)" :
    moisturePct >= 30 ? "var(--color-amber)" : "var(--color-red)";

  return (
    <div className={cn(
      "rounded-tile border border-border bg-bg1 p-2.5",
      active && "border-[var(--color-green)]/50",
      className
    )}>
      {/* Header */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold text-tx truncate">{name}</span>
        {active
          ? <Badge tone="ok" pulse>Läuft</Badge>
          : <Badge tone={tone}>{Math.round(moisturePct)}%</Badge>
        }
      </div>

      {/* Feuchtigkeitsbalken */}
      <div className="mb-2 h-1 overflow-hidden rounded-full bg-bg3">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, moisturePct)}%`, background: barColor }}
        />
      </div>

      {/* Footer */}
      <div className="flex justify-between text-[10px] text-tx3">
        <span>ET {etTodayMm != null ? `${etTodayMm.toFixed(1)} mm` : "—"}</span>
        <span>{nextRun ?? "—"}</span>
      </div>
    </div>
  );
}
