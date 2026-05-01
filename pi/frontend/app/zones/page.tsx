"use client";

import { Section } from "@/components/section";
import { StatusBadge } from "@/components/status-badge";
import { useStatus } from "@/lib/ws";
import { api } from "@/lib/api";
import { moistureColor, cn } from "@/lib/utils";

export default function ZonesPage() {
  const { status } = useStatus();

  if (!status) return <div className="flex h-64 items-center justify-center text-slate-400">Lade…</div>;

  const programs = status.irrigation.programs;
  const decision = status.irrigation.decision;
  const w = status.irrigation.weather;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <Section
        title="Wetter & ET0"
        action={
          decision.allowed ? (
            <StatusBadge tone="ok">Bereit</StatusBadge>
          ) : (
            <StatusBadge tone="warn">{decision.reason}</StatusBadge>
          )
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Temperatur" value={w.temp_c != null ? `${w.temp_c.toFixed(1)} °C` : "—"} />
          <Stat label="Regen 24h" value={`${w.rain_24h_mm.toFixed(1)} mm`} />
          <Stat label="ET0" value={w.et0_mm != null ? `${w.et0_mm.toFixed(1)} mm` : "—"} />
          <Stat
            label="Bodenfeuchte"
            value={w.soil_moisture_pct != null ? `${Math.round(w.soil_moisture_pct)} %` : "—"}
          />
        </div>
      </Section>

      {programs.map((program) => (
        <Section key={program.id} title={program.name}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {program.zones.map((zone) => {
              const isActive =
                decision.running &&
                decision.active_program === program.id &&
                decision.active_zone === zone.id;
              const moisture = w.soil_moisture_pct ?? 50;
              const tone = moistureColor(moisture);
              const barColor = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger" }[tone];

              return (
                <div
                  key={zone.id}
                  className={cn(
                    "flex flex-col gap-3 rounded-lg border bg-white p-5 shadow-sm",
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

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => api.runProgram(program.id, true)}
                      className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-white"
                    >
                      Start
                    </button>
                    <button
                      type="button"
                      onClick={() => api.stopProgram(program.id)}
                      className="flex-1 rounded-lg border border-border bg-white py-2 text-sm font-semibold text-slate-700"
                    >
                      Stop
                    </button>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-3 shadow-sm">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="num text-2xl font-semibold text-primary">{value}</div>
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
