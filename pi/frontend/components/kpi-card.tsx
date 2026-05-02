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
  size?: "lg" | "xl";
}

export function KpiCard({ label, value, unit, tone = "default", hint, size = "lg" }: KpiCardProps) {
  return (
    <div className="group relative flex min-h-36 flex-col gap-2 overflow-hidden rounded-lg border border-white/70 bg-gradient-to-br from-white/90 via-white/80 to-sky-50/75 p-4 shadow-[0_16px_38px_rgba(15,23,42,0.08)] backdrop-blur animate-fade-in">
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", TONE_BAR[tone])} />
      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className={cn(size === "xl" ? "num-3xl" : "num-2xl", TONE[tone])}>{value}</span>
        {unit && <span className="text-sm font-bold uppercase text-slate-400">{unit}</span>}
      </div>
      {hint && <span className="mt-auto text-xs font-medium text-slate-500">{hint}</span>}
    </div>
  );
}
