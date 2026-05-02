"use client";

import { motion } from "framer-motion";
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

  return (
    <motion.div
      className="flex flex-col gap-5 animate-fade-in"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <Section title="Schnellstart">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {status.irrigation.programs.map((p, index) => (
            <motion.div
              key={p.id}
              className="overflow-hidden rounded-lg border border-white/70 bg-gradient-to-br from-white/90 via-white/75 to-primary/5 p-4 shadow-[0_14px_35px_rgba(37,136,235,0.10)] backdrop-blur"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04, duration: 0.22 }}
            >
              <div className="mb-3 h-1 w-14 rounded-full bg-gradient-to-r from-primary to-ok" />
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
            </motion.div>
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
        <motion.div
          className="flex flex-col gap-4 rounded-lg border border-white/70 bg-gradient-to-br from-white/90 via-white/75 to-sky-50/70 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24 }}
        >
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
        </motion.div>
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
            const state = isRunning ? "laeuft" : dryBelow ? "trocken" : "ok";
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
    </motion.div>
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
