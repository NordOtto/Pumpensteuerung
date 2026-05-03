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
      <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border bg-bg2 px-6 py-8 text-center">
        <CloudOff className="h-8 w-8 text-tx3" />
        <div className="text-sm font-semibold text-tx2">Keine Wetterdaten</div>
        <div className="text-xs text-tx3">
          Home Assistant pusht via MQTT-Topic
          <br />
          <code className="mt-1 inline-block rounded bg-bg1 px-1.5 py-0.5 text-[11px] text-tx2">
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
  primary: "bg-[var(--color-blue-dim)] border-[var(--color-blue)]/20",
  ok: "bg-[var(--color-green-dim)] border-[var(--color-green)]/20",
  warn: "bg-[var(--color-amber-dim)] border-[var(--color-amber)]/20",
  danger: "bg-[var(--color-red-dim)] border-[var(--color-red)]/20",
  muted: "bg-bg2 border-border",
} as const;

const TONE_TEXT = {
  primary: "text-primary",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  muted: "text-tx3",
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
    <div className={cn("rounded-card border p-3 shadow-card transition", TONE_BG[tone])}>
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5", TONE_TEXT[tone])} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-tx3">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn("num text-2xl font-semibold leading-none", TONE_TEXT[tone])}>{value}</span>
        <span className="text-xs font-medium text-tx3">{unit}</span>
      </div>
      {hint && <div className="mt-1 text-[10px] text-tx3">{hint}</div>}
    </div>
  );
}

