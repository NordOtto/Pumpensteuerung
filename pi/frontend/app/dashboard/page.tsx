"use client";

import { useEffect, useState } from "react";
import { Play, Square, RotateCcw, AlertCircle, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useStatus } from "@/lib/ws";
import { api } from "@/lib/api";
import { cn, formatFixed, formatSmart } from "@/lib/utils";
import { DurationPicker } from "@/components/duration-picker";
import type { IrrigationProgram } from "@/lib/types";

const QUICK_MINUTES = [10, 20, 30, 45, 60];

function mapBackendError(detail: string, prog?: IrrigationProgram): string {
  if (detail.includes("Automatik läuft")) return "Automatik läuft gerade — bitte erst stoppen";
  if (detail.includes("läuft bereits")) return "Programm läuft bereits";
  if (detail.includes("Sperrtag")) return "Heute ist Sperrtag";
  if (detail.includes("Sperrzeit")) return `Sperrzeit dieses Programms aktiv${prog?.name ? ` (${prog.name})` : ""}`;
  if (detail.includes("Wochenlimit")) return `Wochenlimit erreicht — max. ${prog?.max_runs_per_week ?? "?"} Starts/Woche`;
  if (detail.includes("Wind")) return "Zu windig für Bewässerung";
  if (detail.includes("Bodenfeuchte")) return "Boden ist noch feucht genug";
  if (detail.includes("Regen kommt heute")) return "Regen heute vorhergesagt — Bewässerung wartet";
  if (detail.includes("Regen kompensiert")) return "Vorhergesagter Regen deckt das Defizit";
  if (detail.includes("Regen deckt")) return "Regen deckt den Wasserbedarf";
  if (detail.includes("Regenprognose")) return "Regen vorhergesagt — Bewässerung übersprungen";
  if (detail.includes("Defizit")) return "Kein Wasserbedarf — Defizit zu klein";
  if (detail.includes("Budget")) return "Wasserbudget bereits ausreichend";
  return detail;
}

export default function DashboardPage() {
  const { status } = useStatus();
  const [selectedProgId, setSelectedProgId] = useState("");
  const [manualMin, setManualMin] = useState(30);
  const [showPicker, setShowPicker] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const decisionRunning = status?.irrigation.decision.running ?? false;
  const decisionPaused = status?.irrigation.decision.paused ?? false;
  useEffect(() => {
    if (!decisionRunning || decisionPaused) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [decisionRunning, decisionPaused]);

  if (!status) {
    return <div className="flex h-64 items-center justify-center text-tx3">Verbinde mit Steuerung...</div>;
  }

  const v = status.v20;
  const programs = status.irrigation.programs;
  const decision = status.irrigation.decision;

  // Echter aktueller Wasserbedarf = größtes Zonen-Defizit über alle aktiven Zonen.
  // decision.water_budget_mm ist 0, wenn das angezeigte Programm gerade gesperrt
  // ist (Sperrzeit) — dann trotzdem den realen Bedarf zeigen, nicht 0,0.
  const maxDeficitMm = Math.max(
    0,
    ...programs.flatMap((p) => p.zones.filter((z) => z.enabled).map((z) => z.deficit_mm ?? 0)),
  );
  const wasserbedarfMm = decision.water_budget_mm > 0 ? decision.water_budget_mm : maxDeficitMm;

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
    ? `${decisionProgram.name}${decisionZones.length ? ` · ${decisionZones.map((z) => z.name).join(", ")}` : ""}`
    : "Kein Programm";
  const totalPlannedS = Math.max(decision.total_planned_s || 0, decision.remaining_s || 0);
  // Lokaler 1s-Timer interpoliert zwischen Backend-Ticks (Backend ticked nur alle 30s)
  const startedMs = decision.started_at ? new Date(decision.started_at).getTime() : 0;
  const liveElapsedS = decision.running && startedMs > 0 && !decision.paused
    ? Math.max(0, Math.floor((nowMs - startedMs) / 1000))
    : Math.max(0, totalPlannedS - decision.remaining_s);
  const elapsedS = decision.running ? Math.min(totalPlannedS || liveElapsedS, liveElapsedS) : 0;
  const liveRemainingS = decision.running
    ? Math.max(0, totalPlannedS - elapsedS)
    : decision.remaining_s;
  const progressPct = totalPlannedS > 0 ? Math.min(100, Math.max(0, (elapsedS / totalPlannedS) * 100)) : 0;
  const startedAtLabel = decision.started_at
    ? new Date(decision.started_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
    : "--:--";
  const expectedEndLabel = decision.started_at && totalPlannedS > 0
    ? new Date(new Date(decision.started_at).getTime() + totalPlannedS * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
    : "--:--";

  const runAction = async (fn: () => Promise<unknown>, success: string) => {
    setActionMsg(null);
    try {
      await fn();
      setActionMsg({ text: success, isError: false });
    } catch (err) {
      let detail = err instanceof Error ? err.message : "Aktion fehlgeschlagen";
      try {
        const parsed = JSON.parse(detail);
        detail = parsed?.detail ?? detail;
      } catch { /* detail bleibt */ }
      setActionMsg({ text: mapBackendError(detail, selectedProg), isError: true });
    }
  };

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
          <div className="mb-3.5 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <KpiTile label="Druck" value={formatFixed(status.pressure_bar, 2)} unit="bar" colorClass="text-primary"
              sub={`P_ein ${formatFixed(status.pi.p_on, 1)} / P_aus ${formatFixed(status.pi.p_off, 1)}`} />
            <KpiTile label="Durchfluss" value={formatFixed(status.flow_rate, 1)} unit="L/min" colorClass="text-ok"
              sub={status.flow_estimated ? "geschätzt" : "Sensor"} />
            <KpiTile label="Frequenz" value={formatFixed(v.frequency, 1)} unit="Hz" colorClass="text-warn"
              sub={`Soll ${formatFixed(v.freq_setpoint, 1)} Hz`} />
            <KpiTile label="Leistung" value={formatSmart(v.power, 0)} unit="W" colorClass="text-purple"
              sub={`${formatFixed(v.current, 1)} A / ${formatSmart(v.voltage, 0)} V`} />
            <KpiTile label="Wassertemp" value={formatFixed(status.water_temp, 1)} unit="°C" colorClass="text-primary"
              sub="Brunnen" />
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
          <div className="mb-3 flex flex-col gap-3 rounded-tile border border-border bg-bg2 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-tx3">🕐</span>
              <span className="text-xs text-tx2">Nächster Start:</span>
              <span className="num text-xs font-bold text-ok">{nextStart}</span>
              <span className="min-w-0 break-words text-xs font-semibold text-tx">{nextRunLabel}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip label="Grund" value={decision.reason ? mapBackendError(decision.reason, selectedProg) : "Bereit"} />
              <Chip label="Wasserbedarf" value={`${formatFixed(wasserbedarfMm, 1)} mm`} />
              <Chip label="Faktor" value={`×${formatSmart(decision.runtime_factor, 2)}`} />
              <Chip
                label="Regen 24h"
                value={`${formatFixed(status.irrigation.weather.forecast_rain_24h_mm ?? 0, 1)} mm`}
                valueClass={(status.irrigation.weather.forecast_rain_24h_mm ?? 0) >= 1 ? "text-primary" : "text-tx2"}
              />
              <Chip
                label="Regen 48h"
                value={`${formatFixed(status.irrigation.weather.forecast_rain_48h_mm ?? 0, 1)} mm`}
                valueClass={(status.irrigation.weather.forecast_rain_48h_mm ?? 0) >= 5 ? "text-primary" : "text-tx2"}
              />
            </div>
          </div>

          {decision.running && (
            <div className="mb-3 rounded-tile border border-border bg-bg2 px-3 py-2.5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-tx3">Aktueller Lauf</span>
                <Badge tone="ok">{Math.round(progressPct)}%</Badge>
              </div>
              <div className="mb-2 h-2 overflow-hidden rounded-full bg-bg3">
                <div
                  className="h-full rounded-full bg-ok transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-tx2 sm:grid-cols-4">
                <div><span className="text-tx3">Start</span><div className="num font-bold text-tx">{startedAtLabel}</div></div>
                <div><span className="text-tx3">Ende</span><div className="num font-bold text-tx">{expectedEndLabel}</div></div>
                <div><span className="text-tx3">Verstrichen</span><div className="num font-bold text-tx">{formatDurationCompact(elapsedS)}</div></div>
                <div><span className="text-tx3">Verbleibend</span><div className="num font-bold text-ok">{formatDurationCompact(liveRemainingS)}</div></div>
              </div>
            </div>
          )}

          {/* Auto-Hinweis */}
          {selectedProg && (
            <div className="mb-3 rounded-tile border border-border bg-bg2 px-3 py-2 text-[11px] text-tx3">
              Automatik läuft täglich um <span className="num font-bold text-tx2">
                {String(selectedProg.start_hour).padStart(2, "0")}:{String(selectedProg.start_min).padStart(2, "0")}
              </span>, sofern Wetter+Defizit es zulassen. Manueller Start nur wenn keine Automatik gerade läuft.
            </div>
          )}

          {/* Action tiles */}
          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ActionTile
              icon={<Play size={15} />}
              label={`Manuell ${manualMin} min`}
              sub="Zeitgesteuert"
              color="var(--color-green)"
              disabled={decision.running}
              onClick={() => selectedProg && runAction(
                () => api.runProgram(selectedProg.id, true, manualMin),
                `Manuelle Bewässerung für ${manualMin} min gestartet.`
              )}
            />
            <ActionTile
              icon={<Square size={14} />}
              label="Stoppen"
              sub="Zone + Pumpe"
              color="var(--color-red)"
              disabled={!decision.running}
              onClick={() => runAction(
                () => api.stopProgram(decision.active_program || selectedProg?.id),
                "Bewässerung gestoppt."
              )}
            />
          </div>

          {actionMsg && (
            <div className={cn(
              "mb-3 flex items-center gap-2 rounded-tile border px-3 py-2 text-xs font-semibold",
              actionMsg.isError
                ? "border-[var(--color-red)]/30 bg-[var(--color-red-dim)] text-danger"
                : "border-[var(--color-green)]/30 bg-[var(--color-green-dim)] text-ok"
            )}>
              {actionMsg.isError
                ? <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                : <CheckCircle className="h-3.5 w-3.5 shrink-0" />}
              {actionMsg.text}
            </div>
          )}

          {/* Quick time + custom picker */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-tx3 shrink-0">Laufzeit min:</span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_MINUTES.map((m) => (
                <button key={m} type="button" onClick={() => { setManualMin(m); setShowPicker(false); }}
                  className={cn(
                    "h-8 min-w-9 rounded-tile border px-2 text-xs font-bold transition",
                    manualMin === m && !showPicker ? "border-[var(--color-green)]/35 bg-[var(--color-green-dim)] text-ok" : "border-border bg-bg2 text-tx2"
                  )}>
                  {m}
                </button>
              ))}
              <button type="button" onClick={() => setShowPicker(!showPicker)}
                className={cn(
                  "h-8 rounded-tile border px-2.5 text-xs font-bold transition",
                  showPicker ? "border-[var(--color-blue)]/35 bg-[var(--color-blue-dim)] text-primary" : "border-border bg-bg2 text-tx2"
                )}>
                {showPicker ? `${manualMin} min ✓` : "Eigene…"}
              </button>
            </div>
          </div>

          {showPicker && (
            <div className="mt-2">
              <DurationPicker value={manualMin} onChange={(v) => setManualMin(v)} />
            </div>
          )}

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
    <div className="min-w-0 flex flex-col gap-0.5 rounded-tile border border-border bg-bg2 px-2.5 py-1.5">
      <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-tx3">{label}</span>
      <span className={cn("break-words text-[13px] font-semibold text-tx", valueClass)}>{value}</span>
    </div>
  );
}

function modeLabel(mode: number) {
  return ["Druck", "Durchfl.", "Fix-Hz", "Hahn"][mode] ?? "?";
}

function formatDurationCompact(totalSeconds: number) {
  const secs = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
