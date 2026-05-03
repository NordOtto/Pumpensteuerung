"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useStatus } from "@/lib/ws";
import { cn } from "@/lib/utils";
import type { AppStatus, IrrigationProgram } from "@/lib/types";

export default function ZonesPage() {
  const { status } = useStatus();
  if (!status) return <div className="flex h-64 items-center justify-center text-tx3">Lade...</div>;

  const programs = status.irrigation.programs;
  const w = status.irrigation.weather;
  const decision = status.irrigation.decision;

  return (
    <div className="flex flex-col gap-2.5">

      {/* Decision summary */}
      <div className="relative overflow-hidden rounded-card border border-border bg-bg1">
        <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: "linear-gradient(to right, var(--color-green), var(--color-blue))" }} />
        <div className="p-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-tx3">Bewässerungs-Entscheidung</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatBox label="Nächster Start" value={decision.next_start
              ? new Date(decision.next_start).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" })
              : "—"} colorClass="text-ok" />
            <StatBox label="Entscheidung" value={decision.reason || "Bereit"} colorClass="text-primary" />
            <StatBox label="Wasserbedarf" value={`${decision.water_budget_mm.toFixed(1)} mm`} colorClass="text-warn" />
            <StatBox label="Laufzeitfaktor" value={`× ${decision.runtime_factor.toFixed(2)}`} />
          </div>
        </div>
      </div>

      {/* Per-program zone panels */}
      {programs.map((prog) => (
        <ProgramPanel key={prog.id} prog={prog} decision={decision} weather={w} />
      ))}
    </div>
  );
}

function ProgramPanel({ prog, decision, weather: w }: {
  prog: IrrigationProgram;
  decision: AppStatus["irrigation"]["decision"];
  weather: AppStatus["irrigation"]["weather"];
}) {
  const [expandedZone, setExpandedZone] = useState<string | null>(null);

  return (
    <div className="rounded-card border border-border bg-bg1 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-tx">{prog.name}</div>
          <div className="mt-0.5 text-[10px] text-tx3">
            {prog.mode === "smart_et" ? "Smart ET" : "Fest"} · {prog.zones.length} Zone(n) · Max {prog.max_runs_per_week}/Woche
          </div>
        </div>
        <Badge tone={prog.enabled ? "ok" : "muted"}>{prog.enabled ? "Aktiv" : "Inaktiv"}</Badge>
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {prog.zones.map((zone) => {
          const moisture = w.soil_moisture_pct ?? 50;
          const color = moisture >= 60 ? "var(--color-green)" : moisture >= 30 ? "var(--color-amber)" : "var(--color-red)";
          const isActive = decision.running && decision.active_zone === zone.id;
          const isExpanded = expandedZone === zone.id;

          return (
            <div
              key={zone.id}
              className={cn(
                "cursor-pointer overflow-hidden rounded-tile border",
                isActive ? "border-[var(--color-green)]" : "border-border"
              )}
              style={{ background: "var(--color-bg2)" }}
              onClick={() => setExpandedZone(isExpanded ? null : zone.id)}
            >
              <div className="p-3" style={{ borderLeft: `3px solid ${color}` }}>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-tx">{zone.name}</div>
                    <div className="text-[10px] text-tx3">{zone.plant_type}</div>
                  </div>
                  {isActive && <Badge tone="ok" pulse>Läuft</Badge>}
                </div>

                {/* Moisture bar */}
                <div className="mb-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] text-tx3">Bodenfeuchte</span>
                    <span className="num text-sm font-bold" style={{ color }}>{Math.round(moisture)}%</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-bg3">
                    <div className="h-full" style={{ width: `${Math.min(100, moisture)}%`, background: color }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1">
                  {[["Defizit", `${zone.deficit_mm.toFixed(1)} mm`], ["Laufzeit", `${zone.duration_min} min`]].map(([l, v]) => (
                    <div key={l} className="text-[10px]">
                      <span className="text-tx3">{l}: </span>
                      <span className="font-semibold text-tx2">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-border bg-bg1 px-3 py-2">
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      ["ET heute", w.et0_mm != null ? `${w.et0_mm.toFixed(1)} mm` : "—"],
                      ["Start ab", `${zone.min_deficit_mm.toFixed(1)} mm`],
                      ["Ziel", `${zone.target_mm.toFixed(1)} mm`],
                      ["Preset", zone.preset || "Normal"],
                      ["Beregnungsblock", zone.cycle_min ? `${zone.cycle_min} min` : "—"],
                      ["Sickerpause", zone.soak_min ? `${zone.soak_min} min` : "—"],
                    ].map(([l, v]) => (
                      <div key={l} className="border-b border-border2 py-1 text-[10px]">
                        <span className="text-tx3">{l}: </span>
                        <span className="font-semibold text-tx">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatBox({ label, value, colorClass }: { label: string; value: string; colorClass?: string }) {
  return (
    <div className="rounded-tile border border-border bg-bg2 px-3 py-2.5">
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.1em] text-tx3">{label}</div>
      <div className={cn("truncate text-sm font-bold text-tx", colorClass)}>{value}</div>
    </div>
  );
}
