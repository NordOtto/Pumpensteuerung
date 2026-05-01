"use client";

import { CloudRain, Droplets, Sprout, Thermometer, Wind, CloudOff } from "lucide-react";
import type { WeatherState } from "@/lib/types";
import { cn } from "@/lib/utils";

interface WeatherWidgetProps {
  weather: WeatherState;
}

export function WeatherWidget({ weather: w }: WeatherWidgetProps) {
  const hasAny =
    w.temp_c != null ||
    w.et0_mm != null ||
    w.soil_moisture_pct != null ||
    w.rain_24h_mm > 0 ||
    w.wind_kmh > 0;

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-slate-50/60 px-6 py-8 text-center">
        <CloudOff className="h-8 w-8 text-slate-300" />
        <div className="text-sm font-semibold text-slate-600">Keine Wetterdaten</div>
        <div className="text-xs text-slate-500">
          Home Assistant pusht via MQTT-Topic
          <br />
          <code className="mt-1 inline-block rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-700">
            pumpensteuerung/irrigation/weather/input
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile
        icon={Thermometer}
        label="Temperatur"
        value={w.temp_c != null ? `${w.temp_c.toFixed(1)}` : "—"}
        unit="°C"
        tone={
          w.temp_c == null ? "muted" : w.temp_c > 28 ? "warn" : w.temp_c > 35 ? "danger" : "primary"
        }
      />
      <Tile
        icon={CloudRain}
        label="Regen 24h"
        value={w.rain_24h_mm != null ? w.rain_24h_mm.toFixed(1) : "—"}
        unit="mm"
        tone={w.rain_24h_mm > 6 ? "ok" : "primary"}
        hint={w.forecast_rain_mm > 0 ? `+${w.forecast_rain_mm.toFixed(1)} mm Prognose` : undefined}
      />
      <Tile
        icon={Sprout}
        label="ET₀ heute"
        value={w.et0_mm != null ? w.et0_mm.toFixed(1) : "—"}
        unit="mm"
        tone={w.et0_mm == null ? "muted" : w.et0_mm > 5 ? "warn" : "primary"}
      />
      <Tile
        icon={Droplets}
        label="Bodenfeuchte"
        value={w.soil_moisture_pct != null ? Math.round(w.soil_moisture_pct).toString() : "—"}
        unit="%"
        tone={
          w.soil_moisture_pct == null
            ? "muted"
            : w.soil_moisture_pct < 30
            ? "danger"
            : w.soil_moisture_pct < 50
            ? "warn"
            : "ok"
        }
      />
      {w.wind_kmh > 0 && (
        <Tile
          icon={Wind}
          label="Wind"
          value={w.wind_kmh.toFixed(0)}
          unit="km/h"
          tone={w.wind_kmh > 35 ? "warn" : "primary"}
        />
      )}
    </div>
  );
}

const TONE_BG = {
  primary: "bg-primary/5 border-primary/20",
  ok: "bg-ok/5 border-ok/20",
  warn: "bg-warn/5 border-warn/20",
  danger: "bg-danger/5 border-danger/20",
  muted: "bg-slate-50 border-border",
} as const;

const TONE_TEXT = {
  primary: "text-primary",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  muted: "text-slate-400",
} as const;

function Tile({
  icon: Icon,
  label,
  value,
  unit,
  tone,
  hint,
}: {
  icon: typeof Thermometer;
  label: string;
  value: string;
  unit: string;
  tone: keyof typeof TONE_BG;
  hint?: string;
}) {
  return (
    <div className={cn("rounded-xl border p-3 shadow-sm transition", TONE_BG[tone])}>
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5", TONE_TEXT[tone])} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn("num text-2xl font-semibold leading-none", TONE_TEXT[tone])}>{value}</span>
        <span className="text-xs font-medium text-slate-400">{unit}</span>
      </div>
      {hint && <div className="mt-1 text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}
