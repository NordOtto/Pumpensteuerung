import { cn } from "@/lib/utils";

type Tone = "default" | "ok" | "warn" | "danger";

const TONE: Record<Tone, string> = {
  default: "text-primary",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
};

export interface KpiCardProps {
  label: string;
  value: string;
  unit?: string;
  tone?: Tone;
  hint?: string;
  size?: "lg" | "xl";
}

export function KpiCard({ label, value, unit, tone = "default", hint, size = "lg" }: KpiCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-white p-4 shadow-sm animate-fade-in">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className={cn(size === "xl" ? "num-3xl" : "num-2xl", TONE[tone])}>{value}</span>
        {unit && <span className="text-sm font-bold uppercase text-slate-400">{unit}</span>}
      </div>
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </div>
  );
}
