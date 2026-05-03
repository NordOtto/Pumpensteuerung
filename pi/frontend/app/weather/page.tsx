"use client";

import { CloudRain, Thermometer, Wind, Droplets, Sun, Cloud, CheckCircle2, AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useStatus } from "@/lib/ws";
import { cn } from "@/lib/utils";
import type { WeatherState } from "@/lib/types";

export default function WeatherPage() {
  const { status } = useStatus();
  if (!status) return <div className="flex h-64 items-center justify-center text-tx3">Lade...</div>;
  const w = status.irrigation.weather;
  return <WeatherView weather={w} />;
}

function WeatherView({ weather: w }: { weather: WeatherState }) {
  const rec = useMemo(() => {
    if (w.rain_24h_mm > 6)                   return { action: "Überspringen",    reason: `${w.rain_24h_mm} mm Regen in 24h — ausreichend versorgt.`,          tone: "ok"     as const, score: 0   };
    if ((w.soil_moisture_pct ?? 50) >= 70)   return { action: "Überspringen",    reason: `Bodenfeuchte ${w.soil_moisture_pct}% — kein Bedarf.`,                 tone: "ok"     as const, score: 5   };
    if ((w.soil_moisture_pct ?? 50) < 30)    return { action: "Jetzt bewässern", reason: `Kritisch trockener Boden (${w.soil_moisture_pct}%). Sofort.`,         tone: "danger" as const, score: 100 };
    if ((w.et0_mm ?? 0) > 5)                 return { action: "Bewässern",       reason: `Hohe Verdunstung (ET₀ ${w.et0_mm?.toFixed(1)} mm) — Bedarf hoch.`,   tone: "warn"   as const, score: 75  };
    if (w.forecast_rain_mm > 4)              return { action: "Warten",          reason: `Regenvorhersage +${w.forecast_rain_mm.toFixed(1)} mm — abwarten.`,   tone: "blue"   as const, score: 20  };
    return                                          { action: "Normal",           reason: "Bedingungen im Normalbereich. Automatik übernimmt.",                  tone: "muted"  as const, score: 50  };
  }, [w]);

  const scoreColor = rec.score > 70 ? "var(--color-red)" : rec.score > 40 ? "var(--color-amber)" : "var(--color-green)";

  const tips = [
    { ok: w.wind_kmh <= 35,             icon: Wind,        text: w.wind_kmh <= 35       ? `Wind ${w.wind_kmh} km/h — Bewässerung möglich.`                : `Wind ${w.wind_kmh} km/h — zu stark, Driftverluste.` },
    { ok: (w.temp_c ?? 20) <= 28,       icon: Thermometer, text: (w.temp_c ?? 20) <= 28 ? `${w.temp_c}°C — optimale Bewässerungstemperatur.`              : `${w.temp_c}°C — früh morgens bewässern.` },
    { ok: w.rain_24h_mm < 6,            icon: CloudRain,   text: w.rain_24h_mm >= 6     ? `${w.rain_24h_mm} mm Regen — heute aussetzen.`                  : "Kein nennenswerter Regen. ET-Ausgleich nötig." },
    { ok: w.forecast_rain_mm >= 4,      icon: Cloud,       text: w.forecast_rain_mm >= 4? `Vorhersage +${w.forecast_rain_mm.toFixed(1)} mm — Bewässerung verschieben.` : "Kein Regen erwartet — nicht verschieben." },
  ];

  return (
    <div className="flex flex-col gap-4 animate-fade-up">

      {/* KI-Empfehlung */}
      <Card accent={`linear-gradient(to right, var(--color-${rec.tone === "ok" ? "green" : rec.tone === "danger" ? "red" : rec.tone === "warn" ? "amber" : rec.tone === "blue" ? "blue" : "border"}), transparent)`}>
        <SectionLabel>Tagesempfehlung</SectionLabel>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="text-xl font-bold text-tx mb-1">→ {rec.action}</div>
            <div className="text-sm text-tx2 leading-relaxed">{rec.reason}</div>
          </div>
          <Badge tone={rec.tone}>{rec.action.toUpperCase()}</Badge>
        </div>
        <div>
          <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-tx3 mb-1.5">
            <span>Bewässerungsbedarf</span>
            <span className="num">{rec.score}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-bg3 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${rec.score}%`, background: scoreColor }} />
          </div>
        </div>
      </Card>

      {/* Aktuelle Wetterwerte */}
      <Card>
        <SectionLabel>Aktuelle Bedingungen</SectionLabel>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <WeatherTile icon={Thermometer} label="Temperatur"   value={w.temp_c?.toFixed(1) ?? "—"}                                            unit="°C"   accent={w.temp_c != null && w.temp_c > 28 ? "warn" : "blue"} />
          <WeatherTile icon={CloudRain}   label="Regen 24h"    value={w.rain_24h_mm.toFixed(1)}                                               unit="mm"   accent={w.rain_24h_mm > 6 ? "ok" : "blue"} hint={w.forecast_rain_mm > 0 ? `+${w.forecast_rain_mm.toFixed(1)} mm Prognose` : undefined} />
          <WeatherTile icon={Sun}         label="ET₀ heute"    value={w.et0_mm?.toFixed(1) ?? "—"}                                            unit="mm"   accent={(w.et0_mm ?? 0) > 5 ? "warn" : "blue"} />
          <WeatherTile icon={Droplets}    label="Bodenfeuchte" value={w.soil_moisture_pct != null ? String(Math.round(w.soil_moisture_pct)) : "—"} unit="%" accent={(w.soil_moisture_pct ?? 50) < 30 ? "danger" : (w.soil_moisture_pct ?? 50) < 50 ? "warn" : "ok"} />
          <WeatherTile icon={Wind}        label="Wind"         value={w.wind_kmh.toFixed(0)}                                                  unit="km/h" accent={w.wind_kmh > 35 ? "warn" : "blue"} />
          <WeatherTile icon={Cloud}       label="Vorhersage"   value={w.forecast_rain_mm.toFixed(1)}                                          unit="mm"   accent={w.forecast_rain_mm > 4 ? "blue" : "muted"} />
        </div>
        {w.updated_at && (
          <div className="mt-3 text-[10px] text-tx3">Aktualisiert: {new Date(w.updated_at).toLocaleString("de-DE")}</div>
        )}
      </Card>

      {/* Optimierungshinweise */}
      <Card>
        <SectionLabel>Optimierungshinweise</SectionLabel>
        <div className="flex flex-col gap-2">
          {tips.map((tip, i) => (
            <div key={i} className={cn(
              "flex items-start gap-3 rounded-tile border p-2.5",
              tip.ok
                ? "border-[var(--color-green)]/20 bg-[var(--color-green-dim)]"
                : "border-[var(--color-amber)]/20 bg-[var(--color-amber-dim)]"
            )}>
              <tip.icon className={cn("mt-0.5 h-4 w-4 shrink-0", tip.ok ? "text-ok" : "text-warn")} />
              <span className="text-sm text-tx2 leading-relaxed flex-1">{tip.text}</span>
              {tip.ok
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
                : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              }
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

type TileAccent = "ok" | "warn" | "danger" | "blue" | "muted";

const TILE_BG: Record<TileAccent, string> = {
  ok:     "bg-[var(--color-green-dim)] border-[var(--color-green)]/20",
  warn:   "bg-[var(--color-amber-dim)] border-[var(--color-amber)]/20",
  danger: "bg-[var(--color-red-dim)]   border-[var(--color-red)]/20",
  blue:   "bg-[var(--color-blue-dim)]  border-[var(--color-blue)]/20",
  muted:  "bg-bg2 border-border",
};
const TILE_TEXT: Record<TileAccent, string> = {
  ok:     "text-ok",
  warn:   "text-warn",
  danger: "text-danger",
  blue:   "text-primary",
  muted:  "text-tx3",
};

function WeatherTile({ icon: Icon, label, value, unit, accent, hint }: {
  icon: React.FC<{ className?: string }>;
  label: string; value: string; unit: string;
  accent: TileAccent; hint?: string;
}) {
  return (
    <div className={cn("rounded-tile border p-3", TILE_BG[accent])}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={cn("h-3.5 w-3.5", TILE_TEXT[accent])} />
        <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-tx3">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn("num text-2xl font-bold leading-none", TILE_TEXT[accent])}>{value}</span>
        <span className="text-xs text-tx3">{unit}</span>
      </div>
      {hint && <div className="mt-1 text-[10px] text-tx3">{hint}</div>}
    </div>
  );
}
