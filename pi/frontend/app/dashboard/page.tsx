"use client";

import { Section } from "@/components/section";
import { KpiCard } from "@/components/kpi-card";
import { ZoneCard } from "@/components/zone-card";
import { WarningList } from "@/components/warning-list";
import { StatusBadge } from "@/components/status-badge";
import { HoldButton } from "@/components/hold-button";
import { useStatus } from "@/lib/ws";
import { api } from "@/lib/api";
import { formatBar, formatHz, formatLpm } from "@/lib/utils";

export default function DashboardPage() {
  const { status, warnings } = useStatus();

  if (!status) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        Verbinde mit Steuerung…
      </div>
    );
  }

  const v = status.v20;
  const pumpTone = v.fault ? "danger" : v.running ? "ok" : "muted";
  const pumpLabel = v.fault ? "Fehler" : v.running ? "Läuft" : "Aus";

  const pressureTone =
    status.pressure_bar > status.pi.p_off
      ? "danger"
      : status.pressure_bar < status.pi.p_on
      ? "warn"
      : "default";

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* KPI-Section */}
      <Section title="Live-Werte">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            label="Druck"
            value={formatBar(status.pressure_bar)}
            unit="bar"
            tone={pressureTone}
            hint={`Sollwert ${formatBar(status.pi.setpoint)} bar`}
            size="xl"
          />
          <KpiCard
            label="Durchfluss"
            value={formatLpm(status.flow_rate)}
            unit="L/min"
            hint={status.flow_estimated ? "Geschätzt" : "Sensor"}
            size="xl"
          />
          <KpiCard
            label="Pumpenfrequenz"
            value={formatHz(v.frequency)}
            unit="Hz"
            tone={v.running ? "ok" : "default"}
            hint={
              v.freq_setpoint
                ? `Soll ${formatHz(v.freq_setpoint)} Hz`
                : undefined
            }
            size="xl"
          />
        </div>
      </Section>

      {/* Pumpenstatus */}
      <Section title="Pumpe">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <StatusBadge tone={pumpTone} pulse={v.running}>
              {pumpLabel}
            </StatusBadge>
            <span className="text-sm text-slate-500">
              {v.connected ? "RTU verbunden" : "RTU getrennt"}
            </span>
            {status.active_preset && (
              <span className="text-sm text-slate-500">· Preset: {status.active_preset}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <HoldButton
              label="Start (halten)"
              tone="ok"
              onTrigger={() => api.v20Start()}
              disabled={v.fault || status.vacation.enabled}
            />
            <button
              type="button"
              onClick={() => api.v20Stop()}
              className="h-20 min-w-32 rounded-xl border border-border bg-white px-6 text-lg font-semibold uppercase tracking-wide text-slate-700 transition active:scale-[0.98] hover:bg-slate-50"
            >
              Stop
            </button>
          </div>
        </div>
      </Section>

      {/* Zonen-Übersicht (Hecke / Garten / Vorgarten) — fällt auf irrigation.zones zurück */}
      <Section title="Bewässerungs-Zonen">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {DASHBOARD_ZONES.map((z) => {
            const moisture =
              status.irrigation.weather.soil_moisture_pct ?? z.fallbackMoisture;
            const decision = status.irrigation.decision;
            const isRunning =
              decision.running && decision.active_zone === z.id;
            const dryBelow = moisture < 30;
            const state = isRunning ? "läuft" : dryBelow ? "trocken" : "ok";
            return (
              <ZoneCard
                key={z.id}
                name={z.name}
                moisturePct={moisture}
                state={state}
                etTodayMm={status.irrigation.weather.et0_mm ?? null}
                nextRun={
                  decision.next_start
                    ? new Date(decision.next_start).toLocaleString("de-DE", {
                        weekday: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : null
                }
                active={isRunning}
              />
            );
          })}
        </div>
      </Section>

      {/* Warnungen */}
      <Section title="Warnungen">
        <WarningList warnings={warnings} />
      </Section>
    </div>
  );
}

// Dashboard zeigt diese drei festen Zonen — die echten Zonen kommen aus
// der Programm-Konfiguration (siehe /zones), aber für die Übersicht halten
// wir uns an den Spec-Brief: Hecke / Garten / Vorgarten.
const DASHBOARD_ZONES = [
  { id: "hecke", name: "Hecke", fallbackMoisture: 70 },
  { id: "garten", name: "Garten", fallbackMoisture: 55 },
  { id: "vorgarten", name: "Vorgarten", fallbackMoisture: 45 },
];
