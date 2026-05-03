// pi/frontend/components/ui/kpi-tile.tsx
// Kompakte KPI-Kachel für Live-Werte (Druck, Durchfluss, Hz, Leistung)
// Ersetzt / ergänzt kpi-card.tsx

import { cn } from "@/lib/utils";

export interface KpiTileProps {
  label: string;
  value: string;
  unit: string;
  /** Tailwind text-color class, z.B. "text-[var(--color-blue)]" */
  colorClass?: string;
  sub?: string;
  className?: string;
}

export function KpiTile({
  label,
  value,
  unit,
  colorClass = "text-[var(--color-blue)]",
  sub,
  className,
}: KpiTileProps) {
  return (
    <div className={cn(
      "rounded-tile border border-border bg-bg2 p-3",
      className
    )}>
      {/* Label */}
      <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-tx3">
        {label}
      </div>

      {/* Wert + Einheit */}
      <div className="flex items-baseline gap-1 mb-1">
        <span className={cn("num text-[1.75rem] font-bold leading-none", colorClass)}>
          {value}
        </span>
        <span className="text-[10px] font-bold uppercase text-tx3">{unit}</span>
      </div>

      {/* Sub-Hinweis */}
      {sub && (
        <div className="text-[10px] text-tx3 truncate">{sub}</div>
      )}
    </div>
  );
}
