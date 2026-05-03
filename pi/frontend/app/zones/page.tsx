"use client";

import type React from "react";
import { SortablePanels } from "@/components/sortable-panels";
import { WeatherWidget } from "@/components/weather-widget";
import { IrrigationAdvisor } from "@/components/irrigation-advisor";
import { Badge } from "@/components/ui/badge";
import { StatBox } from "@/components/ui/card";
import { useStatus } from "@/lib/ws";
import { moistureColor, cn } from "@/lib/utils";
import type { AppStatus, IrrigationProgram } from "@/lib/types";

export default function ZonesPage() {
  const { status } = useStatus();

  if (!status) return <div className="flex h-64 items-center justify-center text-tx3">Lade...</div>;

  const programs = status.irrigation.programs;
  const decision = status.irrigation.decision;
  const w = status.irrigation.weather;
  const panelIds = ["advisor", "weather", ...programs.map((program) => `program:${program.id}`)] as const;
  const titles = Object.fromEntries([
    ["advisor", "Bewasserungs-Entscheidung"],
    ["weather", "Wetter & ET"],
    ...programs.map((program) => [`program:${program.id}`, program.name]),
  ]) as Record<string, string>;
  const panels = Object.fromEntries([
    ["advisor", <IrrigationAdvisor key="advisor" decision={decision} />],
    ["weather", <WeatherWidget key="weather" weather={w} />],
    ...programs.map((program) => [
      `program:${program.id}`,
      <ProgramOverview key={program.id} program={program} decision={decision} weather={w} />,
    ]),
  ]) as Record<string, React.ReactNode>;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <SortablePanels storageKey="pumpe.zones.sections" defaultOrder={panelIds} titles={titles}>
        {panels}
      </SortablePanels>
    </div>
  );
}

function ProgramOverview({
  program,
  decision,
  weather,
}: {
  program: IrrigationProgram;
  decision: AppStatus["irrigation"]["decision"];
  weather: AppStatus["irrigation"]["weather"];
}) {
  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatBox label="Modus" value={program.mode === "smart_et" ? "Smart ET" : "Fest"} />
        <StatBox label="Max/Woche" value={String(program.max_runs_per_week ?? 3)} />
        <StatBox
          label="Naechster Lauf"
          value={decision.next_start ? new Date(decision.next_start).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "-"}
        />
        <StatBox label="Entscheidung" value={program.last_skip_reason || decision.reason} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {program.zones.map((zone) => {
          const isActive =
            decision.running &&
            decision.active_program === program.id &&
            decision.active_zone === zone.id;
          const moisture = weather.soil_moisture_pct ?? 50;
          const tone = moistureColor(moisture);
          const barColor = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger" }[tone];
          const borderL = isActive
            ? "border-l-primary"
            : tone === "ok"
            ? "border-l-ok"
            : tone === "warn"
            ? "border-l-warn"
            : "border-l-danger";

          return (
            <div
              key={zone.id}
              className={cn(
                "flex flex-col gap-3 rounded-card border border-l-4 bg-bg1 p-4 shadow-card",
                borderL,
                isActive ? "border-primary ring-2 ring-primary/20" : "border-border"
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-tx">{zone.name}</div>
                  <div className="text-xs text-tx3">{zone.plant_type || "-"}</div>
                </div>
                {isActive && (
                  <Badge tone="ok" pulse>
                    Laeuft
                  </Badge>
                )}
              </div>

              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-wider text-tx3">Bodenfeuchte</span>
                  <span className="num-xl">{Math.round(moisture)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-bg3">
                  <div className={cn("h-full", barColor)} style={{ width: `${Math.max(0, Math.min(100, moisture))}%` }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <KV label="ET heute" value={weather.et0_mm != null ? `${weather.et0_mm.toFixed(1)} mm` : "-"} />
                <KV label="Defizit" value={`${zone.deficit_mm.toFixed(1)} mm`} />
                <KV label="Start ab" value={`${zone.min_deficit_mm.toFixed(1)} mm`} />
                <KV label="Ziel" value={`${zone.target_mm.toFixed(1)} mm`} />
                <KV label="Laufzeit" value={`${zone.duration_min} min`} />
                <KV label="Preset" value={zone.preset || "Normal"} />
                <KV
                  label="Letzte"
                  value={
                    program.last_run_at
                      ? new Date(program.last_run_at).toLocaleString("de-DE", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "-"
                  }
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border/60 py-1">
      <span className="text-tx3">{label}</span>
      <span className="font-medium text-tx2">{value}</span>
    </div>
  );
}
