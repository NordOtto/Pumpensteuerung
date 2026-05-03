"use client";

import { Section } from "@/components/section";
import { StatusBadge } from "@/components/status-badge";
import { WeatherWidget } from "@/components/weather-widget";
import { IrrigationAdvisor } from "@/components/irrigation-advisor";
import { useStatus } from "@/lib/ws";
import { moistureColor, cn } from "@/lib/utils";

export default function ZonesPage() {
  const { status } = useStatus();

  if (!status) return <div className="flex h-64 items-center justify-center text-slate-400">Lade…</div>;

  const programs = status.irrigation.programs;
  const decision = status.irrigation.decision;
  const w = status.irrigation.weather;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <IrrigationAdvisor decision={decision} />

      <Section title="Wetter & ET">
        <WeatherWidget weather={w} />
      </Section>

      {programs.map((program) => (
        <Section key={program.id} title={program.name}>
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <ControllerStat label="Modus" value={program.mode === "smart_et" ? "Smart ET" : "Fest"} />
            <ControllerStat label="Max/Woche" value={String(program.max_runs_per_week ?? 3)} />
            <ControllerStat
              label="Naechster Lauf"
              value={decision.next_start ? new Date(decision.next_start).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "-"}
            />
            <ControllerStat label="Entscheidung" value={program.last_skip_reason || decision.reason} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {program.zones.map((zone) => {
              const isActive =
                decision.running &&
                decision.active_program === program.id &&
                decision.active_zone === zone.id;
              const moisture = w.soil_moisture_pct ?? 50;
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
                    "flex flex-col gap-3 rounded-lg border border-l-4 bg-white p-5 shadow-sm",
                    borderL,
                    isActive ? "border-primary ring-2 ring-primary/20" : "border-border"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{zone.name}</div>
                      <div className="text-xs text-slate-500">{zone.plant_type || "—"}</div>
                    </div>
                    {isActive && (
                      <StatusBadge tone="ok" pulse>
                        Läuft
                      </StatusBadge>
                    )}
                  </div>

                  <div>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-xs uppercase tracking-wider text-slate-500">
                        Bodenfeuchte
                      </span>
                      <span className="num-xl">{Math.round(moisture)}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn("h-full", barColor)}
                        style={{ width: `${Math.max(0, Math.min(100, moisture))}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <KV label="ET heute" value={w.et0_mm != null ? `${w.et0_mm.toFixed(1)} mm` : "—"} />
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
                          : "—"
                      }
                    />
                  </div>

                </div>
              );
            })}
          </div>
        </Section>
      ))}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border/60 py-1">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}

function ControllerStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-3 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="truncate text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}
