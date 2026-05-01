import { cn, moistureColor } from "@/lib/utils";
import { StatusBadge } from "./status-badge";

interface ZoneCardProps {
  name: string;
  moisturePct: number;
  state: "ok" | "trocken" | "läuft";
  etTodayMm: number | null;
  nextRun: string | null;
  active?: boolean;
}

const STATE_TONE = {
  ok: "ok",
  trocken: "warn",
  läuft: "ok",
} as const;

const STATE_LABEL = {
  ok: "OK",
  trocken: "Trocken",
  läuft: "Bewässerung läuft",
} as const;

const STATE_BORDER_L = {
  ok: "border-l-ok",
  trocken: "border-l-warn",
  läuft: "border-l-primary",
} as const;

export function ZoneCard({ name, moisturePct, state, etTodayMm, nextRun, active }: ZoneCardProps) {
  const tone = moistureColor(moisturePct);
  const barColor = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger" }[tone];

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-l-4 bg-white p-4 shadow-sm animate-fade-in",
        STATE_BORDER_L[state],
        active ? "border-primary ring-2 ring-primary/20" : "border-border"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold uppercase tracking-tight text-slate-900">{name}</div>
        <StatusBadge tone={STATE_TONE[state]} pulse={state === "läuft"}>
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
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={cn("h-full transition-[width]", barColor)}
            style={{ width: `${Math.max(0, Math.min(100, moisturePct))}%` }}
          />
        </div>
      </div>

      <div className="flex items-baseline justify-between text-xs">
        <span className="text-slate-500">ET heute</span>
        <span className="num font-medium text-slate-700">
          {etTodayMm != null ? `−${etTodayMm.toFixed(1)} mm` : "—"}
        </span>
      </div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-slate-500">Nächste Bewässerung</span>
        <span className="font-medium text-slate-700">{nextRun ?? "—"}</span>
      </div>
    </div>
  );
}
