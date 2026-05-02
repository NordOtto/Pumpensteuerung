import { cn, moistureColor } from "@/lib/utils";
import { StatusBadge } from "./status-badge";

interface ZoneCardProps {
  name: string;
  moisturePct: number;
  state: "ok" | "trocken" | "laeuft";
  etTodayMm: number | null;
  nextRun: string | null;
  active?: boolean;
}

const STATE_TONE = {
  ok: "ok",
  trocken: "warn",
  laeuft: "ok",
} as const;

const STATE_LABEL = {
  ok: "OK",
  trocken: "Trocken",
  laeuft: "Bewaesserung laeuft",
} as const;

const STATE_ACCENT = {
  ok: "from-ok",
  trocken: "from-warn",
  laeuft: "from-primary",
} as const;

export function ZoneCard({ name, moisturePct, state, etTodayMm, nextRun, active }: ZoneCardProps) {
  const tone = moistureColor(moisturePct);
  const barColor = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger" }[tone];

  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 overflow-hidden rounded-lg border border-white/70 bg-gradient-to-br from-white/90 via-white/80 to-sky-50/70 p-4 shadow-[0_16px_38px_rgba(15,23,42,0.08)] backdrop-blur animate-fade-in",
        active ? "ring-2 ring-primary/20" : ""
      )}
    >
      <div className={cn("absolute inset-y-0 left-0 w-1 bg-gradient-to-b to-white/20", STATE_ACCENT[state])} />

      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold uppercase tracking-tight text-slate-900">{name}</div>
        <StatusBadge tone={STATE_TONE[state]} pulse={state === "laeuft"}>
          {STATE_LABEL[state]}
        </StatusBadge>
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between text-xs text-slate-500">
          <span>Bodenfeuchte</span>
          <span className="num text-base font-semibold text-slate-700">
            {Math.round(moisturePct)}%
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-white shadow-inner">
          <div
            className={cn("h-full transition-[width]", barColor)}
            style={{ width: `${Math.max(0, Math.min(100, moisturePct))}%` }}
          />
        </div>
      </div>

      <div className="flex items-baseline justify-between text-xs">
        <span className="text-slate-500">ET heute</span>
        <span className="num font-medium text-slate-700">
          {etTodayMm != null ? `-${etTodayMm.toFixed(1)} mm` : "--"}
        </span>
      </div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-slate-500">Naechste Bewaesserung</span>
        <span className="font-medium text-slate-700">{nextRun ?? "--"}</span>
      </div>
    </div>
  );
}
