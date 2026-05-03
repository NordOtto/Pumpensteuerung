"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Clock3, Play, RotateCcw, ShieldCheck, Square, TimerReset } from "lucide-react";
import { WarningList } from "@/components/warning-list";
import { SortablePanels } from "@/components/sortable-panels";
import { Badge } from "@/components/ui/badge";
import { KpiTile } from "@/components/ui/kpi-tile";
import { ZoneChip } from "@/components/ui/zone-chip";
import { useStatus } from "@/lib/ws";
import { api } from "@/lib/api";
import { cn, formatBar, formatHz, formatLpm } from "@/lib/utils";
import type { IrrigationProgram } from "@/lib/types";

const QUICK_MINUTES = [10, 20, 30, 45, 60];
const DEFAULT_SECTION_ORDER = ["live", "pump", "irrigation", "zones", "warnings"] as const;
type DashboardSectionId = (typeof DEFAULT_SECTION_ORDER)[number];
const SECTION_TITLES: Record<DashboardSectionId, string> = {
  live: "Live-Werte",
  pump: "Pumpe steuern",
  irrigation: "Bewaesserung",
  zones: "Bewaesserungs-Zonen",
  warnings: "Warnungen",
};

export default function DashboardPage() {
  const { status, warnings } = useStatus();
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [manualMinutes, setManualMinutes] = useState(30);
  const [actionError, setActionError] = useState("");

  const programs = status?.irrigation.programs ?? [];
  const decisionForSelection = status?.irrigation.decision;
  const selectedProgram = useMemo(() => {
    if (!programs.length) return null;
    return (
      programs.find((p) => p.id === selectedProgramId) ??
      programs.find((p) => p.id === decisionForSelection?.program_id) ??
      programs[0]
    );
  }, [programs, selectedProgramId, decisionForSelection?.program_id]);

  if (!status) {
    return <div className="flex h-64 items-center justify-center text-tx3">Verbinde mit Steuerung...</div>;
  }

  const v = status.v20;
  const decision = status.irrigation.decision;
  const pumpTone = v.fault ? "danger" : v.running ? "ok" : "muted";
  const pumpLabel = v.fault ? "Fehler" : v.running ? "Laeuft" : "Aus";
  const pressureTone =
    status.pressure_bar > status.pi.p_off
      ? "danger"
      : status.pressure_bar < status.pi.p_on
        ? "warn"
        : "default";

  const runProgram = async (program: IrrigationProgram, forceWeather: boolean, duration?: number) => {
    setActionError("");
    try {
      await api.runProgram(program.id, forceWeather, duration);
      setSelectedProgramId(program.id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Start fehlgeschlagen");
    }
  };

  const stopIrrigation = async () => {
    setActionError("");
    try {
      await api.stopProgram(decision.active_program || selectedProgram?.id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Stop fehlgeschlagen");
    }
  };

  const resumeIrrigation = async () => {
    setActionError("");
    try {
      await api.resumeProgram();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Fortsetzen fehlgeschlagen");
    }
  };

  const handlePumpToggle = async () => {
    setActionError("");
    try {
      if (decision.paused) {
        await api.resumeProgram();
      } else if (v.running) {
        await api.v20Stop();
      } else {
        await api.v20Start();
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Pumpenbefehl fehlgeschlagen");
    }
  };

  const nextStart = decision.next_start
    ? new Date(decision.next_start).toLocaleString("de-DE", {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "kein Start geplant";

  return (
    <motion.div
      className="flex flex-col gap-5 animate-fade-in"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <SortablePanels
        storageKey="pumpe.dashboard.sections"
        defaultOrder={DEFAULT_SECTION_ORDER}
        titles={SECTION_TITLES}
        hidden={{ warnings: warnings.length === 0 }}
      >
        {{
          live: (
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <KpiTile
                  label="Druck"
                  value={formatBar(status.pressure_bar)}
                  unit="bar"
                  colorClass={pressureTone === "danger" ? "text-danger" : pressureTone === "warn" ? "text-warn" : "text-primary"}
                  sub={`Ein ${formatBar(status.pi.p_on)} / Aus ${formatBar(status.pi.p_off)}`}
                />
                <KpiTile
                  label="Durchfluss"
                  value={formatLpm(status.flow_rate)}
                  unit="L/min"
                  colorClass="text-ok"
                  sub={status.flow_estimated ? "Geschaetzt" : "Sensor"}
                />
                <KpiTile
                  label="Pumpenfrequenz"
                  value={formatHz(v.frequency)}
                  unit="Hz"
                  colorClass={v.running ? "text-ok" : "text-primary"}
                  sub={v.freq_setpoint ? `Soll ${formatHz(v.freq_setpoint)}` : undefined}
                />
              </div>
          ),

          pump: (
              <motion.div
                className="rounded-card border border-border bg-bg1 p-4 shadow-card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24 }}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge tone={pumpTone} pulse={v.running}>{pumpLabel}</Badge>
                    <PumpInfo label="Preset" value={status.active_preset || "Normal"} />
                    <PumpInfo label="Regelung" value={modeLabel(status.ctrl_mode)} />
                    <PumpInfo label="FU" value={v.status || (v.connected ? "bereit" : "offline")} />
                    <PumpInfo label="RTU" value={v.connected ? "verbunden" : "getrennt"} />
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={handlePumpToggle}
                      disabled={!decision.paused && !v.running && (v.fault || status.vacation.enabled)}
                      className={cn(
                        "inline-flex h-14 min-w-44 items-center justify-center gap-2 rounded-tile px-5 text-sm font-bold uppercase tracking-wide text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
                        v.running ? "bg-danger hover:bg-danger/90" : "bg-ok hover:bg-ok/90"
                      )}
                    >
                      {v.running ? <Square size={18} /> : <Play size={18} />}
                      {decision.paused ? "Fortsetzen" : v.running ? "Pumpe stoppen" : "Pumpe starten"}
                    </button>
                    {v.fault && (
                      <button
                        type="button"
                        onClick={() => api.v20Reset()}
                        className="inline-flex h-14 min-w-32 items-center justify-center gap-2 rounded-tile border border-[var(--color-amber)]/35 bg-[var(--color-amber-dim)] px-5 text-sm font-bold uppercase tracking-wide text-warn transition active:scale-[0.98]"
                      >
                        <RotateCcw size={18} />
                        FU Reset
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
          ),

          irrigation: (
              <div className={cn("grid gap-4", decision.running && "xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]")}>
                <motion.div
                  className="rounded-card border border-border bg-bg1 p-4 shadow-card"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24 }}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge tone={decision.paused ? "warn" : decision.running ? "ok" : decision.allowed ? "muted" : "warn"} pulse={decision.running && !decision.paused}>
                          {decision.paused ? "Pausiert" : decision.running ? "Bewaessert" : decision.allowed ? "Bereit" : "Wartet"}
                        </Badge>
                        <span className="rounded border border-border bg-bg2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-tx2">
                          {decision.running
                            ? decision.started_by === "manual" ? "Manuell" : "Automatisch"
                            : selectedProgram?.mode === "smart_et" ? "Smart ET" : "Fest"}
                        </span>
                        {decision.phase === "soak" && (
                          <Badge tone="ok">Sickerpause</Badge>
                        )}
                        {decision.paused && (
                          <Badge tone="warn">Sicher gestoppt</Badge>
                        )}
                      </div>
                      <h1 className="text-2xl font-bold text-tx">
                        {decision.running ? decision.active_program_name || "Bewaesserung aktiv" : selectedProgram?.name || "Kein Programm"}
                      </h1>
                      <p className="mt-1 max-w-2xl text-sm text-tx2">
                        {decision.running
                          ? decision.paused
                            ? `${decision.active_zone_name || "Zone"} ist pausiert. Du kannst heute fortsetzen oder die Bewaesserung beenden.`
                            : `${decision.active_zone_name || "Zone"} ${decision.phase === "soak" ? "sickert" : "laeuft"} mit Preset ${decision.active_preset || status.active_preset || "Normal"}.`
                          : `Naechster Automatikstart: ${nextStart}. ${decision.reason || "Bereit"}.`}
                      </p>
                    </div>
                    <div className="grid min-w-[220px] grid-cols-2 gap-2 rounded-tile border border-border bg-bg2 p-3">
                      <RunMetric icon={<TimerReset size={16} />} label="Gesamt" value={formatDuration(decision.remaining_s)} />
                      <RunMetric icon={<Clock3 size={16} />} label="Aktueller Schritt" value={formatDuration(decision.zone_remaining_s)} />
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {programs.map((p) => {
                          const selected = selectedProgram?.id === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setSelectedProgramId(p.id)}
                              className={cn(
                                "rounded-tile border px-3 py-2 text-left text-sm font-semibold transition active:scale-[0.98]",
                                selected
                                  ? "border-[var(--color-blue)]/35 bg-primary text-white"
                                  : "border-border bg-bg2 text-tx2 hover:bg-bg1"
                              )}
                            >
                              <span>{p.name}</span>
                              <span className={cn("ml-2 text-xs font-medium", selected ? "text-white/75" : "text-tx3")}>
                                {p.mode === "smart_et" ? "ET" : "Fest"} | {p.zones.length} Zone{p.zones.length === 1 ? "" : "n"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        {decision.paused ? (
                          <ActionButton icon={<Play size={18} />} title="Fortsetzen" subtitle="setzt die pausierte Zone fort" tone="primary" onClick={resumeIrrigation} />
                        ) : (
                          <ActionButton icon={<ShieldCheck size={18} />} title="Automatik jetzt" subtitle="nutzt Wetter, ET und Wochenlimit" disabled={!selectedProgram || decision.running} onClick={() => selectedProgram && runProgram(selectedProgram, false)} />
                        )}
                        <ActionButton icon={<Play size={18} />} title={`Manuell ${manualMinutes} min`} subtitle="uebergeht Wetterpruefung" disabled={!selectedProgram || decision.running} onClick={() => selectedProgram && runProgram(selectedProgram, true, manualMinutes)} />
                        <ActionButton icon={<Square size={18} />} title={decision.paused ? "Bewaesserung beenden" : "Bewaesserung stoppen"} subtitle={decision.paused ? "setzt den Lauf zurueck" : "Zone und Pumpe stoppen"} tone="danger" disabled={!decision.running} onClick={stopIrrigation} />
                      </div>
                    </div>
                    <div className="rounded-card border border-border bg-bg2 p-3">
                      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-tx3">Manuelle Laufzeit</div>
                      <div className="flex flex-wrap gap-2">
                        {QUICK_MINUTES.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setManualMinutes(m)}
                            className={cn(
                              "h-10 min-w-12 rounded-tile border px-3 text-sm font-bold transition active:scale-[0.98]",
                              manualMinutes === m ? "border-primary bg-primary text-white" : "border-border bg-bg1 text-tx2 hover:bg-bg2"
                            )}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                      <label className="mt-3 block">
                        <span className="mb-1 block text-xs font-semibold text-tx3">Minuten</span>
                        <input
                          type="number"
                          min={1}
                          max={480}
                          value={manualMinutes}
                          onChange={(e) => setManualMinutes(Math.max(1, Math.min(480, Number(e.target.value) || 1)))}
                          className="h-11 w-full rounded-tile border border-border bg-bg1 px-3 text-sm font-semibold text-tx outline-none ring-primary/20 focus:ring-4"
                        />
                      </label>
                    </div>
                  </div>
                  {actionError && (
                    <div className="mt-3 rounded-tile border border-[var(--color-red)]/25 bg-[var(--color-red-dim)] px-3 py-2 text-sm font-semibold text-danger">
                      {actionError}
                    </div>
                  )}
                </motion.div>

                {decision.running && (
                  <motion.div
                    className="rounded-card border border-border bg-bg1 p-4 shadow-card"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.04, duration: 0.24 }}
                  >
                    <div className="mb-3 text-sm font-bold text-tx">Aktives Programm</div>
                    <div className="space-y-3">
                      <InfoRow label="Programm" value={decision.active_program_name || "-"} />
                      <InfoRow label="Zone" value={decision.active_zone_name || "-"} />
                      <InfoRow label="Startart" value={decision.started_by === "manual" ? "Manuell" : "Automatisch"} />
                      <InfoRow label="Phase" value={decision.paused ? "Pausiert" : decision.phase === "soak" ? "Sickerpause" : "Laeuft"} />
                      <InfoRow label="Preset" value={decision.active_preset || status.active_preset || "Normal"} />
                      <InfoRow label="Rest gesamt" value={formatDuration(decision.remaining_s)} />
                    </div>
                  </motion.div>
                )}
              </div>
          ),

          zones: (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {dashboardZones(status.irrigation.programs).map((z) => {
                  const moisture = status.irrigation.weather.soil_moisture_pct ?? z.fallbackMoisture;
                  const isRunning = decision.running && decision.active_zone === z.id;
                  return (
                    <ZoneChip
                      key={z.id}
                      name={z.name}
                      moisturePct={moisture}
                      etTodayMm={status.irrigation.weather.et0_mm ?? null}
                      nextRun={decision.next_start
                        ? new Date(decision.next_start).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" })
                        : null}
                      active={isRunning}
                    />
                  );
                })}
              </div>
          ),

          warnings: <WarningList warnings={warnings} />,
        }}
      </SortablePanels>
    </motion.div>
  );
}

function ActionButton({
  icon,
  title,
  subtitle,
  onClick,
  disabled,
  tone = "primary",
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-24 flex-col items-start justify-between rounded-tile border p-3 text-left shadow-card transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
        tone === "danger"
          ? "border-[var(--color-red)]/25 bg-[var(--color-red-dim)] text-danger"
          : "border-border bg-bg2 text-tx hover:bg-bg1"
      )}
    >
      <span className={cn("rounded-tile p-2", tone === "danger" ? "bg-[var(--color-red-dim)]" : "bg-[var(--color-blue-dim)] text-primary")}>
        {icon}
      </span>
      <span>
        <span className="block text-sm font-bold">{title}</span>
        <span className={cn("mt-0.5 block text-xs", tone === "danger" ? "text-danger/75" : "text-tx3")}>{subtitle}</span>
      </span>
    </button>
  );
}

function RunMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-tx3">
        {icon}
        {label}
      </div>
      <div className="num mt-1 text-xl font-bold text-tx">{value}</div>
    </div>
  );
}

function PumpInfo({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-tile border border-border bg-bg2 px-3 py-2">
      <span className="mr-2 text-[10px] font-bold uppercase tracking-wider text-tx3">{label}</span>
      <span className="text-sm font-semibold text-tx">{value}</span>
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border2 pb-2 last:border-0 last:pb-0">
      <span className="text-xs font-semibold uppercase tracking-wider text-tx3">{label}</span>
      <span className="text-right text-sm font-semibold text-tx">{value}</span>
    </div>
  );
}

function dashboardZones(programs: IrrigationProgram[]) {
  const zones = programs.flatMap((p) => p.zones).slice(0, 3);
  if (zones.length) {
    return zones.map((z, idx) => ({
      id: z.id,
      name: z.name,
      fallbackMoisture: [70, 55, 45][idx] ?? 50,
    }));
  }
  return [
    { id: "hecke", name: "Hecke", fallbackMoisture: 70 },
    { id: "garten", name: "Garten", fallbackMoisture: 55 },
    { id: "vorgarten", name: "Vorgarten", fallbackMoisture: 45 },
  ];
}

function formatDuration(seconds: number | undefined | null) {
  const total = Math.max(0, Math.round(seconds ?? 0));
  if (total <= 0) return "--";
  const h = Math.floor(total / 3600);
  const m = Math.ceil((total % 3600) / 60);
  if (h <= 0) return `${m} min`;
  return `${h} h ${m.toString().padStart(2, "0")} min`;
}

function modeLabel(mode: number) {
  if (mode === 0) return "Druck";
  if (mode === 1) return "Durchfluss";
  if (mode === 2) return "Fix-Hz";
  if (mode === 3) return "Hahnmodus";
  return "Unbekannt";
}
