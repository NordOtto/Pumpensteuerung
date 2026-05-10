"use client";

import { CloudRain, Thermometer, Wind, Droplets, Sun, Cloud, CheckCircle2, AlertTriangle, MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useStatus } from "@/lib/ws";
import { cn, formatFixed } from "@/lib/utils";
import { api } from "@/lib/api";
import type { WeatherConfig, WeatherState } from "@/lib/types";

export default function WeatherPage() {
  const { status } = useStatus();
  if (!status) return <div className="flex h-64 items-center justify-center text-tx3">Lade...</div>;
  const w = status.irrigation.weather;
  return <WeatherView weather={w} />;
}

function locationLabel(cfg: WeatherConfig | null): string {
  if (!cfg?.location?.name) return "";
  return `${cfg.location.postal_code ? `${cfg.location.postal_code} ` : ""}${cfg.location.name}`;
}

type WeatherSource = WeatherConfig["source"];

const SOURCE_LABEL: Record<WeatherSource, string> = {
  manual_ha: "HA / Ecowitt",
  hybrid: "Hybrid (OWM)",
  openweathermap: "OpenWeatherMap",
  hybrid_stormglass: "Hybrid (Stormglass)",
  stormglass: "Stormglass",
};

function isOwmSource(s: WeatherSource) { return s === "openweathermap" || s === "hybrid"; }
function isStormglassSource(s: WeatherSource) { return s === "stormglass" || s === "hybrid_stormglass"; }

function WeatherSourceCard() {
  const [cfg, setCfg] = useState<WeatherConfig | null>(null);
  const [source, setSource] = useState<WeatherSource>("manual_ha");
  const [owmLocationQuery, setOwmLocationQuery] = useState("");
  const [owmApiKey, setOwmApiKey] = useState("");
  const [sgLocationQuery, setSgLocationQuery] = useState("");
  const [sgApiKey, setSgApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = () => api.weatherConfig().then((next) => {
    setCfg(next);
    setSource(next.source);
    setOwmLocationQuery(next.openweathermap.location_query || locationLabel(next));
    setSgLocationQuery(next.stormglass?.location_query || locationLabel(next));
  }).catch((err) => setMessage(err instanceof Error ? err.message : "Wetter-Konfiguration konnte nicht geladen werden."));

  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      const payload: Record<string, unknown> = { source };
      if (isOwmSource(source)) {
        payload.openweathermap = {
          api_key: owmApiKey.trim() || undefined,
          location_query: owmLocationQuery.trim(),
        };
      }
      if (isStormglassSource(source)) {
        payload.stormglass = {
          api_key: sgApiKey.trim() || undefined,
          location_query: sgLocationQuery.trim(),
        };
      }
      const next = await api.saveWeatherConfig(payload);
      setOwmApiKey("");
      setSgApiKey("");
      setCfg(next);
      setMessage("Wetterquelle gespeichert.");
      if (source !== "manual_ha") {
        const res = await api.refreshWeather();
        setMessage(res.message);
        load();
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Wetterquelle konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    setMessage("");
    try {
      const res = await api.refreshWeather();
      setMessage(res.message);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Wetter konnte nicht aktualisiert werden.");
    } finally {
      setBusy(false);
    }
  };

  const badgeLabel = cfg ? SOURCE_LABEL[cfg.source] : "Lade...";
  const keyMissing = cfg && (
    (cfg.source === "openweathermap" || cfg.source === "hybrid") && !cfg.openweathermap.configured
    || (cfg.source === "stormglass" || cfg.source === "hybrid_stormglass") && !cfg.stormglass?.configured
  );

  const sourceButton = (id: WeatherSource, title: string, subtitle: string, tone: "green" | "blue" | "amber") => (
    <button type="button" onClick={() => setSource(id)}
      className={cn("rounded-tile border px-3 py-2 text-left text-xs font-bold",
        source === id
          ? `border-[var(--color-${tone})]/35 bg-[var(--color-${tone}-dim)] ${tone === "blue" ? "text-primary" : tone === "amber" ? "text-warn" : "text-ok"}`
          : "border-border bg-bg2 text-tx2"
      )}>
      {title}
      <div className="mt-1 text-[10px] font-medium text-tx3">{subtitle}</div>
    </button>
  );

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionLabel>Wetterquelle</SectionLabel>
          <div className="mt-1 text-sm text-tx2">Ecowitt/HA fuer Ist-Werte, OpenWeatherMap oder Stormglass fuer Forecast und Planung.</div>
        </div>
        <Badge tone={cfg?.last_ok ? "ok" : keyMissing ? "warn" : cfg?.source !== "manual_ha" ? "warn" : "muted"}>
          {keyMissing ? "Key fehlt" : badgeLabel}
        </Badge>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {sourceButton("manual_ha", "HA / Ecowitt", "MQTT: pumpensteuerung/irrigation/weather/input", "green")}
        {sourceButton("hybrid", "Hybrid (OWM)", "Lokal jetzt, OpenWeatherMap fuer Planung", "green")}
        {sourceButton("openweathermap", "OpenWeatherMap", "Nur Online-Wetter, automatischer Abruf", "blue")}
        {sourceButton("hybrid_stormglass", "Hybrid (Stormglass)", "Lokal jetzt, Stormglass fuer Planung", "green")}
        {sourceButton("stormglass", "Stormglass", "Free: 10 Abrufe/Tag", "amber")}
      </div>

      {isOwmSource(source) && (
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <WeatherInput label="OpenWeatherMap API-Key" value={owmApiKey} onChange={setOwmApiKey} placeholder={cfg?.openweathermap.configured ? "hinterlegt" : "API-Key"} password />
          <WeatherInput label="Ort oder PLZ" value={owmLocationQuery} onChange={setOwmLocationQuery} placeholder="z. B. 29229 Celle" />
        </div>
      )}

      {isStormglassSource(source) && (
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <WeatherInput label="Stormglass API-Key" value={sgApiKey} onChange={setSgApiKey} placeholder={cfg?.stormglass?.configured ? "hinterlegt" : "API-Key"} password />
          <WeatherInput label="Ort oder PLZ" value={sgLocationQuery} onChange={setSgLocationQuery} placeholder="z. B. 29229 Celle" />
        </div>
      )}

      {source !== "manual_ha" && (
        <div className="mb-3 rounded-tile border border-border bg-bg2 px-3 py-2 text-[10px] text-tx3">
          Aktualisierung alle 3 Stunden (fest, wegen API-Limits — Stormglass Free hat nur 10 Abrufe/Tag).
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={save}
          className="rounded-tile bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Speichern</button>
        <button type="button" disabled={busy || source === "manual_ha"} onClick={refresh}
          className="rounded-tile border border-border bg-bg2 px-4 py-2 text-xs font-bold text-tx2 disabled:opacity-40">Jetzt aktualisieren</button>
        {cfg?.last_refresh && <span className="text-[11px] text-tx3">Letzter Abruf: {new Date(cfg.last_refresh).toLocaleString("de-DE")}</span>}
      </div>
      {(message || cfg?.last_message) && <div className="mt-2 text-[11px] text-tx3">{message || cfg?.last_message}</div>}
      {source !== "manual_ha" && cfg?.location?.name && (
        <div className="mt-2 flex items-center gap-2 rounded-tile border border-border bg-bg2 px-3 py-2 text-[11px] text-tx2">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          <span className="min-w-0 break-words">
            Standort: <b>{cfg.location.postal_code ? `${cfg.location.postal_code} ` : ""}{cfg.location.name}{cfg.location.country ? `, ${cfg.location.country}` : ""}</b>
            {" "}Koordinaten: {formatFixed(cfg.location.lat, 4)} / {formatFixed(cfg.location.lon, 4)}
          </span>
        </div>
      )}
      {source === "hybrid" && <div className="mt-2 text-[10px] text-tx3">Hybrid nutzt Ecowitt/HA fuer aktuelle Werte und OpenWeatherMap nur fuer Forecast, Regenplanung und ET0-Schaetzung.</div>}
      {source === "hybrid_stormglass" && <div className="mt-2 text-[10px] text-tx3">Hybrid nutzt Ecowitt/HA fuer aktuelle Werte und Stormglass nur fuer Forecast und ET0-Schaetzung.</div>}
      {source === "stormglass" && <div className="mt-2 text-[10px] text-tx3">Stormglass Free erlaubt 10 Abrufe/Tag. Bei 3h-Intervall sind das 8/Tag — sicher unter dem Limit.</div>}
      {source === "openweathermap" && <div className="mt-2 text-[10px] text-tx3">Hinweis: ET0 wird aus OpenWeather-Daten geschaetzt. Exakter bleibt ein lokaler Sensor- oder HA-Wetterwert.</div>}
    </Card>
  );
}

function WeatherInput({ label, value, onChange, placeholder, password }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; password?: boolean }) {
  return (
    <label className="rounded-tile border border-border bg-bg2 px-3 py-2">
      <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.1em] text-tx3">{label}</span>
      <input type={password ? "password" : "text"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="h-7 w-full bg-transparent text-sm font-semibold text-tx outline-none placeholder:text-tx3" />
    </label>
  );
}

function WeatherView({ weather: w }: { weather: WeatherState }) {
  const rec = useMemo(() => {
    const r24 = w.forecast_rain_24h_mm ?? 0;
    const r48 = w.forecast_rain_48h_mm ?? w.forecast_rain_mm ?? 0;
    if (w.rain_24h_mm > 6)                   return { action: "Überspringen",    reason: `${w.rain_24h_mm} mm Regen in 24h — ausreichend versorgt.`,           tone: "ok"     as const, score: 0   };
    if ((w.soil_moisture_pct ?? 50) >= 70)   return { action: "Überspringen",    reason: `Bodenfeuchte ${w.soil_moisture_pct}% — kein Bedarf.`,                  tone: "ok"     as const, score: 5   };
    if ((w.soil_moisture_pct ?? 50) < 30)    return { action: "Jetzt bewässern", reason: `Kritisch trockener Boden (${w.soil_moisture_pct}%). Sofort.`,          tone: "danger" as const, score: 100 };
    if (r24 >= 4)                            return { action: "Warten",          reason: `Heute ${formatFixed(r24, 1)} mm Regen erwartet — abwarten.`,            tone: "blue"   as const, score: 15  };
    if ((w.et0_mm ?? 0) > 5)                 return { action: "Bewässern",       reason: `Hohe Verdunstung (ET₀ ${formatFixed(w.et0_mm, 1)} mm) — Bedarf hoch.`,    tone: "warn"   as const, score: 75  };
    if (r48 >= 5)                            return { action: "Reduziert",       reason: `In 48h ${formatFixed(r48, 1)} mm Regen — Smart-Lauf läuft reduziert.`,   tone: "blue"   as const, score: 35  };
    return                                          { action: "Normal",           reason: "Bedingungen im Normalbereich. Automatik übernimmt.",                  tone: "muted"  as const, score: 50  };
  }, [w]);

  const scoreColor = rec.score > 70 ? "var(--color-red)" : rec.score > 40 ? "var(--color-amber)" : "var(--color-green)";

  const tips = [
    { ok: w.wind_kmh <= 35,             icon: Wind,        text: w.wind_kmh <= 35       ? `Wind ${w.wind_kmh} km/h — Bewässerung möglich.`                : `Wind ${w.wind_kmh} km/h — zu stark, Driftverluste.` },
    { ok: (w.temp_c ?? 20) <= 28,       icon: Thermometer, text: (w.temp_c ?? 20) <= 28 ? `${w.temp_c}°C — optimale Bewässerungstemperatur.`              : `${w.temp_c}°C — früh morgens bewässern.` },
    { ok: w.rain_24h_mm < 6,            icon: CloudRain,   text: w.rain_24h_mm >= 6     ? `${w.rain_24h_mm} mm Regen — heute aussetzen.`                  : "Kein nennenswerter Regen. ET-Ausgleich nötig." },
    { ok: (w.forecast_rain_24h_mm ?? 0) < 4, icon: Cloud,   text: (w.forecast_rain_24h_mm ?? 0) >= 4 ? `Heute +${formatFixed(w.forecast_rain_24h_mm, 1)} mm — Lauf verschieben.` : `Heute trocken (${formatFixed(w.forecast_rain_24h_mm ?? 0, 1)} mm).` },
  ];

  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      <WeatherSourceCard />

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
        <div className="mb-3 flex flex-wrap gap-2 text-[10px] text-tx3">
          <Badge tone="muted">Ist: {w.current_source === "openweathermap" ? "OpenWeatherMap" : w.current_source === "stormglass" ? "Stormglass" : "HA / Ecowitt"}</Badge>
          <Badge tone={w.forecast_source === "openweathermap" || w.forecast_source === "stormglass" ? "blue" : "muted"}>Forecast: {w.forecast_source === "openweathermap" ? "OpenWeatherMap" : w.forecast_source === "stormglass" ? "Stormglass" : "lokal"}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <WeatherTile icon={Thermometer} label="Temperatur"   value={formatFixed(w.temp_c, 1) ?? "—"}                                            unit="°C"   accent={w.temp_c != null && w.temp_c > 28 ? "warn" : "blue"} />
          <WeatherTile icon={CloudRain}   label="Regen 24h"    value={formatFixed(w.rain_24h_mm, 1)}                                               unit="mm"   accent={w.rain_24h_mm > 6 ? "ok" : "blue"} hint={w.forecast_rain_mm > 0 ? `+${formatFixed(w.forecast_rain_mm, 1)} mm Prognose` : undefined} />
          <WeatherTile icon={Sun}         label="ET₀ heute"    value={formatFixed(w.et0_mm, 1) ?? "—"}                                            unit="mm"   accent={(w.et0_mm ?? 0) > 5 ? "warn" : "blue"} />
          <WeatherTile icon={Droplets}    label="Bodenfeuchte" value={w.soil_moisture_pct != null ? String(Math.round(w.soil_moisture_pct)) : "—"} unit="%" accent={(w.soil_moisture_pct ?? 50) < 30 ? "danger" : (w.soil_moisture_pct ?? 50) < 50 ? "warn" : "ok"} />
          <WeatherTile icon={Wind}        label="Wind"         value={formatFixed(w.wind_kmh, 0)}                                                  unit="km/h" accent={w.wind_kmh > 35 ? "warn" : "blue"} />
          <WeatherTile icon={Cloud}       label="Vorhersage"   value={formatFixed(w.forecast_rain_mm, 1)}                                          unit="mm"   accent={w.forecast_rain_mm > 4 ? "blue" : "muted"} />
        </div>
        {w.updated_at && (
          <div className="mt-3 text-[10px] text-tx3">Aktualisiert: {new Date(w.updated_at).toLocaleString("de-DE")}</div>
        )}
      </Card>

      <Card>
        <SectionLabel>Forecast Planung</SectionLabel>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <WeatherTile icon={CloudRain} label="Naechste Std." value={formatFixed(w.forecast_rain_1h_mm, 1) ?? "0.0"} unit="mm" accent={(w.forecast_rain_1h_mm ?? 0) > 1 ? "blue" : "muted"} />
          <WeatherTile icon={CloudRain} label="24 Stunden" value={formatFixed(w.forecast_rain_24h_mm, 1) ?? "0.0"} unit="mm" accent={(w.forecast_rain_24h_mm ?? 0) > 4 ? "blue" : "muted"} />
          <WeatherTile icon={CloudRain} label="48 Stunden" value={formatFixed(w.forecast_rain_48h_mm, 1) ?? "0.0"} unit="mm" accent={(w.forecast_rain_48h_mm ?? 0) > 6 ? "blue" : "muted"} />
          <WeatherTile icon={CloudRain} label="7 Tage" value={formatFixed(w.forecast_rain_7d_mm, 1) ?? "0.0"} unit="mm" accent={(w.forecast_rain_7d_mm ?? 0) > 10 ? "blue" : "muted"} />
        </div>
        {w.forecast_updated_at && (
          <div className="mt-3 text-[10px] text-tx3">Forecast aktualisiert: {new Date(w.forecast_updated_at).toLocaleString("de-DE")}</div>
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
