"use client";

import { useState } from "react";
import { Play, Square, RotateCcw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useStatus } from "@/lib/ws";
import { api } from "@/lib/api";
import { cn, formatFixed, formatSmart } from "@/lib/utils";
import type { IrrigationProgram } from "@/lib/types";

const QUICK_MINUTES = [10, 20, 30, 45, 60];

export default function DashboardPage() {
  const { status } = useStatus();
  const [selectedProgId, setSelectedProgId] = useState("");
  const [manualMin, setManualMin] = useState(30);

  if (!status) {
    return <div className="flex h-64 items-center justify-center text-tx3">Verbinde mit Steuerung...</div>;
  }

  const v = status.v20;
  const programs = status.irrigation.programs;
  const decision = status.irrigation.decision;

  const selectedProg: IrrigationProgram =
    programs.find((p) => p.id === selectedProgId) ??
    programs.find((p) => p.id === decision.program_id) ??
    programs[0];

  const nextStart = decision.next_start
    ? new Date(decision.next_start).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";

  const decisionProgram = programs.find((p) => p.id === decision.program_id);
  const decisionZones = decisionProgram?.zones.filter((z) => {
    if (!z.enabled) return false;
    if (decisionProgram.mode !== "smart_et") return true;
    return z.deficit_mm >= z.min_deficit_mm;
  }) ?? [];
  const nextRunLabel = decisionProgram
    ? `${decisionProgram.name}${decisionZones.length ? ` ? ${decisionZones.map((z) => z.name).join(", ")}` : ""}`
    : "Kein Programm";

  return (
    <div className="flex flex-col gap-2.5">

      {/* ── PUMPENSTEUERUNG ── */}
      <div className="relative overflow-hidden rounded-card border border-border bg-bg1">
        <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(to right, var(--color-blue), ${v.running ? "var(--color-green)" : "var(--color-text3)"})`}} />
        <div className="p-4">
          {/* Header */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-tx3">Pumpensteuerung</span>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={v.fault ? "danger" : v.running ? "ok" : "muted"} pulse={v.running}>
                {v.fault ? "Fehler" : v.running ? "Läuft" : "Aus"}
              </Badge>
              <Badge tone="muted">Preset: {status.active_preset || "Normal"}</Badge>
              <Badge tone="muted">FU: {v.status || "bereit"}</Badge>
            </div>
          </div>

          {/* KPI Grid */}
          <div className="mb-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <KpiTile label="Druck" value={formatFixed(status.pressure_bar, 2)} unit="bar" colorClass="text-primary"
              sub={`P_ein ${formatFixed(status.pi.p_on, 1)} / P_aus ${formatFixed(status.pi.p_off, 1)}`} />
            <KpiTile label="Durchfluss" value={formatFixed(status.flow_rate, 1)} unit="L/min" colorClass="text-ok"
              sub={status.flow_estimated ? "geschätzt" : "Sensor"} />
            <KpiTile label="Frequenz" value={formatFixed(v.frequency, 1)} unit="Hz" colorClass="text-warn"
              sub={`Soll ${formatFixed(v.freq_setpoint, 1)} Hz`} />
            <KpiTile label="Leistung" value={formatSmart(v.power, 0)} unit="W" colorClass="text-purple"
              sub={`${formatFixed(v.current, 1)} A / ${formatSmart(v.voltage, 0)} V`} />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => v.running ? api.v20Stop() : api.v20Start()}
              className={cn(
                "inline-flex h-14 min-w-44 items-center justify-center gap-2 rounded-tile px-5 text-sm font-bold uppercase tracking-wide text-white transition active:scale-[0.97]",
                v.running ? "bg-danger shadow-[0_10px_24px_rgba(214,48,48,0.25)]" : "bg-ok shadow-[0_10px_24px_rgba(0,163,114,0.25)]"
              )}
            >
              {v.running ? <Square size={16} /> : <Play size={16} />}
              {v.running ? "Pumpe stoppen" : "Pumpe starten"}
            </button>
            {v.fault && (
              <button type="button" onClick={() => api.v20Reset()}
                className="inline-flex h-14 min-w-32 items-center justify-center gap-2 rounded-tile border border-warn/35 bg-[var(--color-amber-dim)] px-5 text-sm font-bold uppercase tracking-wide text-warn transition active:scale-[0.97]">
                <RotateCcw size={14} />
                FU Reset
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <Chip label="Regelung" value={modeLabel(status.ctrl_mode)} />
              <Chip label="RTU" value={v.connected ? "Online" : "Offline"} valueClass={v.connected ? "text-ok" : "text-danger"} />
            </div>
          </div>
        </div>
      </div>

      {/* ── BEWÄSSERUNGSSTEUERUNG ── */}
      <div className="relative overflow-hidden rounded-card border border-border bg-bg1">
        <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: "linear-gradient(to right, var(--color-green), var(--color-blue))" }} />
        <div className="p-4">
          {/* Header */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-tx3">Bewässerungssteuerung</span>
            <div className="flex gap-1.5">
              <Badge tone={decision.running ? "ok" : "muted"} pulse={decision.running}>
                {decision.running ? "Läuft" : "Bereit"}
              </Badge>
              <Badge tone={selectedProg?.mode === "smart_et" ? "blue" : "muted"}>
                {selectedProg?.mode === "smart_et" ? "Smart ET" : "Fest"}
              </Badge>
            </div>
          </div>

          {/* Program selector */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {programs.map((p) => (
              <button key={p.id} type="button" onClick={() => setSelectedProgId(p.id)}
                className={cn(
                  "rounded-tile border px-3 py-2 text-sm font-semibold transition active:scale-[0.98]",
                  (selectedProg?.id === p.id)
                    ? "border-[var(--color-green)]/35 bg-[var(--color-green-dim)] text-ok"
                    : "border-border bg-bg2 text-tx2 hover:bg-bg1"
                )}>
                {p.name}
                <span className={cn("ml-1.5 text-[10px] font-medium", selectedProg?.id === p.id ? "text-ok/70" : "text-tx3")}>
                  {p.zones.length} Zonen
                </span>
              </button>
            ))}
          </div>

          {/* Next run info */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-tile border border-border bg-bg2 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-tx3">🕐</span>
              <span className="text-xs text-tx2">Nächster Start:</span>
              <span className="num text-xs font-bold text-ok">{nextStart}</span>
              <span className="text-xs font-semibold text-tx">{nextRunLabel}</span>
            </div>
            <div className="flex gap-2">
              <Chip label="Grund" value={decision.reason || "Bereit"} />
              <Chip label="Wasserbedarf" value={`${formatFixed(decision.water_budget_mm, 1)} mm`} />
              <Chip label="Faktor" value={`×${formatSmart(decision.runtime_factor, 2)}`} />
            </div>
          </div>

          {/* Action tiles */}
          <div className="mb-3 grid grid-cols-3 gap-2">
            <ActionTile
              icon={<Sparkles size={16} />}
              label="Automatik jetzt"
              sub="ET + Wetter"
              color="var(--color-blue)"
              disabled={decision.running}
              onClick={() => selectedProg && api.runProgram(selectedProg.id, false)}
            />
            <ActionTile
              icon={<Play size={15} />}
              label={`Manuell ${manualMin} min`}
              sub="Zeitgesteuert"
              color="var(--color-green)"
              disabled={decision.running}
              onClick={() => selectedProg && api.runProgram(selectedProg.id, true, manualMin)}
            />
            <ActionTile
              icon={<Square size={14} />}
              label="Stoppen"
              sub="Zone + Pumpe"
              color="var(--color-red)"
              disabled={!decision.running}
              onClick={() => api.stopProgram(decision.active_program || selectedProg?.id)}
            />
          </div>

          {/* Quick time */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-tx3 shrink-0">Laufzeit min:</span>
            <div className="flex gap-1.5">
              {QUICK_MINUTES.map((m) => (
                <button key={m} type="button" onClick={() => setManualMin(m)}
                  className={cn(
                    "h-8 min-w-9 rounded-tile border px-2 text-xs font-bold transition",
                    manualMin === m ? "border-[var(--color-green)]/35 bg-[var(--color-green-dim)] text-ok" : "border-border bg-bg2 text-tx2"
                  )}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── ZONEN-STATUS ── */}
      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-tx3">Zonen-Status</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {dashboardZones(programs).map((z, idx) => {
            const moisture = status.irrigation.weather.soil_moisture_pct ?? [70, 28, 55][idx] ?? 50;
            const isActive = decision.running && decision.active_zone === z.id;
            return (
              <ZoneChip
                key={z.id}
                name={z.name}
                moisture={moisture}
                et={status.irrigation.weather.et0_mm ?? 3.2}
                next={decision.next_start
                  ? new Date(decision.next_start).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" })
                  : "—"}
                active={isActive}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiTile({ label, value, unit, colorClass, sub }: {
  label: string; value: string; unit: string; colorClass: string; sub: string;
}) {
  return (
    <div className="rounded-tile border border-border bg-bg2 p-3">
      <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-tx3">{label}</div>
      <div className="flex items-baseline gap-1 mb-1">
        <span className={cn("num text-[1.75rem] font-bold leading-none", colorClass)}>{value}</span>
        <span className="text-[10px] font-bold uppercase text-tx3">{unit}</span>
      </div>
      <div className="text-[10px] text-tx3">{sub}</div>
    </div>
  );
}

function ActionTile({ icon, label, sub, color, disabled, onClick }: {
  icon: React.ReactNode; label: string; sub: string;
  color: string; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="flex flex-col items-start gap-2 rounded-tile border p-3 text-left transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        borderColor: disabled ? "var(--color-border)" : color + "40",
        background: disabled ? "var(--color-bg2)" : color + "10",
      }}>
      <span style={{ color: disabled ? "var(--color-text3)" : color }}>{icon}</span>
      <div>
        <div className="text-xs font-bold text-tx">{label}</div>
        <div className="mt-0.5 text-[10px] text-tx3">{sub}</div>
      </div>
    </button>
  );
}

function Chip({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-tile border border-border bg-bg2 px-2.5 py-1.5">
      <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-tx3">{label}</span>
      <span className={cn("num text-[13px] font-semibold text-tx", valueClass)}>{value}</span>
    </div>
  );
}

function ZoneChip({ name, moisture, et, next, active }: {
  name: string; moisture: number; et: number; next: string; active: boolean;
}) {
  const color = moisture >= 60 ? "var(--color-green)" : moisture >= 30 ? "var(--color-amber)" : "var(--color-red)";
  const tone = moisture >= 60 ? "ok" : moisture >= 30 ? "warn" : "danger";
  return (
    <div className={cn("rounded-tile border bg-bg1 p-2.5", active ? "border-[var(--color-green)]" : "border-border")}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold text-tx">{name}</span>
        <Badge tone={tone}>{Math.round(moisture)}%</Badge>
      </div>
      <div className="mb-2 h-1 overflow-hidden rounded-full bg-bg3">
        <div className="h-full rounded-full" style={{ width: `${moisture}%`, background: color }} />
      </div>
      <div className="flex justify-between text-[10px] text-tx3">
        <span>ET {formatFixed(et, 1)} mm</span>
        <span>{next}</span>
      </div>
    </div>
  );
}

function modeLabel(mode: number) {
  return ["Druck", "Durchfl.", "Fix-Hz", "Hahn"][mode] ?? "?";
}

function dashboardZones(programs: IrrigationProgram[]) {
  const zones = programs.flatMap((p) => p.zones).slice(0, 3);
  if (zones.length) return zones.map((z) => ({ id: z.id, name: z.name }));
  return [
    { id: "hecke", name: "Hecke" },
    { id: "garten", name: "Garten" },
    { id: "vorgarten", name: "Vorgarten" },
  ];
}
