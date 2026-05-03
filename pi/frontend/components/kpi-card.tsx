import { cn } from "@/lib/utils";

type Tone = "default" | "ok" | "warn" | "danger";

const TONE: Record<Tone, string> = {
  default: "text-primary",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
};

const TONE_BAR: Record<Tone, string> = {
  default: "from-primary to-cyan-300",
  ok: "from-ok to-emerald-200",
  warn: "from-warn to-amber-200",
  danger: "from-danger to-red-200",
};

export interface KpiCardProps {
  label: string;
  value: string;
  unit?: string;
  tone?: Tone;
  hint?: string;
  size?: "sm" | "lg" | "xl";
}

export function KpiCard({ label, value, unit, tone = "default", hint, size = "lg" }: KpiCardProps) {
  const compact = size === "sm";
  return (
    <div className={cn(
      "group relative flex flex-col overflow-hidden rounded-lg border border-white/70 bg-gradient-to-br from-white/90 via-white/80 to-sky-50/75 shadow-[0_16px_38px_rgba(15,23,42,0.08)] backdrop-blur animate-fade-in",
      compact ? "min-h-24 gap-1 p-3" : "min-h-36 gap-2 p-4"
    )}>
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", TONE_BAR[tone])} />
      <span className={cn("font-bold uppercase tracking-wider text-slate-500", compact ? "text-[10px]" : "text-xs")}>{label}</span>
      <div className={cn("flex items-baseline", compact ? "gap-1" : "gap-2")}>
        <span className={cn(size === "xl" ? "num-3xl" : compact ? "num text-2xl font-semibold leading-none" : "num-2xl", TONE[tone])}>{value}</span>
        {unit && <span className={cn("font-bold uppercase text-slate-400", compact ? "text-[10px]" : "text-sm")}>{unit}</span>}
      </div>
      {hint && <span className={cn("mt-auto font-medium text-slate-500", compact ? "truncate text-[10px]" : "text-xs")}>{hint}</span>}
    </div>
  );
}
