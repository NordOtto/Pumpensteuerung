// pi/frontend/components/ui/action-tile.tsx
// Quadratische Aktions-Kachel für Start/Stop/Automatik-Buttons

import { cn } from "@/lib/utils";

export interface ActionTileProps {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** hex-Farbe, z.B. "var(--color-blue)" */
  color?: string;
  className?: string;
}

export function ActionTile({
  icon,
  label,
  sub,
  onClick,
  disabled,
  color = "var(--color-blue)",
  className,
}: ActionTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={
        disabled
          ? undefined
          : { borderColor: `${color}40`, background: `${color}10` }
      }
      className={cn(
        "flex flex-col items-start gap-2 rounded-tile border p-3 text-left",
        "transition-all active:scale-[0.97]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        // Disabled: neutrale Farben
        disabled && "border-border bg-bg2",
        className
      )}
    >
      <span style={{ color: disabled ? "var(--color-text3)" : color }}>
        {icon}
      </span>
      <div>
        <div
          className="text-[12px] font-bold"
          style={{ color: disabled ? "var(--color-text3)" : "var(--color-text)" }}
        >
          {label}
        </div>
        {sub && (
          <div className="mt-0.5 text-[10px] text-tx3">{sub}</div>
        )}
      </div>
    </button>
  );
}
