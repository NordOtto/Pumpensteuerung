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
  const decision = status.irrigation.decision;
  const weather = status.irrigation.weather;

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <section className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-white shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-primary/80">Leitstand</div>
            <div className="text-sm text-slate-300">
              {decision.running
                ? `${decision.active_program} / ${decision.active_zone} aktiv`
                : `Bereit: ${decision.reason}`}
            </div>
          </div>
          <StatusBadge tone={pumpTone} pulse={v.running}>{pumpLabel}</StatusBadge>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <CommandMetric label="Druck" value={formatBar(status.pressure_bar)} unit="bar" tone={pressureTone} />
          <CommandMetric label="Soll" value={formatBar(status.pi.setpoint)} unit="bar" />
          <CommandMetric label="Flow" value={formatLpm(status.flow_rate)} unit="L/min" />
          <CommandMetric label="Hz" value={formatHz(v.frequency)} unit="Hz" tone={v.running ? "ok" : "default"} />
          <CommandMetric label="ET0" value={weather.et0_mm != null ? weather.et0_mm.toFixed(1) : "--"} unit="mm" />
          <CommandMetric label="Budget" value={decision.water_budget_mm.toFixed(1)} unit="mm" tone={decision.allowed ? "ok" : "warn"} />
        </div>
      </section>

      <Section title="Schnellstart">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {status.irrigation.programs.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.mode === "smart_et" ? "Smart ET" : "Fest"} | {p.zones.length} Zone(n)</div>
                </div>
                <StatusBadge tone={p.enabled ? "ok" : "muted"}>{p.enabled ? "aktiv" : "aus"}</StatusBadge>
              </div>
              <div className="mt-3 text-xs text-slate-500">{p.last_skip_reason || decision.reason}</div>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => api.runProgram(p.id, false)} className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-white">Smart Start</button>
                <button type="button" onClick={() => api.stopProgram(p.id)} className="rounded-lg border border-border px-3 py-2 text-sm font-bold text-slate-700">Stop</button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Live-Werte">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard
            label="Druck"
            value={formatBar(status.pressure_bar)}
            unit="bar"
            tone={pressureTone}
            hint={`Sollwert ${formatBar(status.pi.setpoint)} bar`}
            size="lg"
          />
          <KpiCard
            label="Durchfluss"
            value={formatLpm(status.flow_rate)}
            unit="L/min"
            hint={status.flow_estimated ? "Geschätzt" : "Sensor"}
            size="lg"
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
            size="lg"
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
              className="h-14 min-w-28 rounded-lg border border-border bg-white px-5 text-sm font-bold uppercase tracking-wide text-slate-700 transition active:scale-[0.98] hover:bg-slate-50"
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

      {/* Warnungen — nur wenn vorhanden */}
      {warnings.length > 0 && (
        <Section title="Warnungen">
          <WarningList warnings={warnings} />
        </Section>
      )}
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

function CommandMetric({ label, value, unit, tone = "default" }: { label: string; value: string; unit: string; tone?: "default" | "ok" | "warn" | "danger" }) {
  const tones = {
    default: "text-white",
    ok: "text-ok",
    warn: "text-warn",
    danger: "text-danger",
  };
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
      <div className={`num mt-1 text-2xl font-bold ${tones[tone]}`}>{value}</div>
      <div className="text-[10px] uppercase text-slate-500">{unit}</div>
    </div>
  );
}
