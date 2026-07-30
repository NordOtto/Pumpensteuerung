"use client";

import { useEffect, useState } from "react";
import { Play, Square, RotateCcw, AlertCircle, CheckCircle, ChevronDown, Droplets } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useStatus } from "@/lib/ws";
import { api } from "@/lib/api";
import { cn, formatFixed, formatSmart } from "@/lib/utils";
import { DurationPicker } from "@/components/duration-picker";
import type { IrrigationProgram } from "@/lib/types";

const QUICK_MINUTES = [10, 20, 30, 45, 60];
const DETAIL_KEY = "pumpe.dashboard.details";

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
  const [showDetails, setShowDetails] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Detail-Ansicht pro Gerät merken: Ehepartner-Handy bleibt einfach,
  // eigenes Handy behält die Technikwerte.
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(DETAIL_KEY) === "1") {
      setShowDetails(true);
    }
  }, []);
  const toggleDetails = () => {
    setShowDetails((v) => {
      if (typeof window !== "undefined") localStorage.setItem(DETAIL_KEY, v ? "0" : "1");
      return !v;
    });
  };

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
  const w = status.irrigation.weather;

  const maxDeficitMm = Math.max(
    0,
    ...programs.flatMap((p) => p.zones.filter((z) => z.enabled).map((z) => z.deficit_mm ?? 0)),
  );
  const wasserbedarfMm = decision.water_budget_mm > 0 ? decision.water_budget_mm : maxDeficitMm;

  const selectedProg: IrrigationProgram =
    programs.find((p) => p.id === selectedProgId) ??
    programs.find((p) => p.id === decision.program_id) ??
    programs[0];

  const nextStartShort = decision.next_start
    ? new Date(decision.next_start).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  const totalPlannedS = Math.max(decision.total_planned_s || 0, decision.remaining_s || 0);
  const startedMs = decision.started_at ? new Date(decision.started_at).getTime() : 0;
  const liveElapsedS = decision.running && startedMs > 0 && !decision.paused
    ? Math.max(0, Math.floor((nowMs - startedMs) / 1000))
    : Math.max(0, totalPlannedS - decision.remaining_s);
  const elapsedS = decision.running ? Math.min(totalPlannedS || liveElapsedS, liveElapsedS) : 0;
  const liveRemainingS = decision.running ? Math.max(0, totalPlannedS - elapsedS) : decision.remaining_s;
  const progressPct = totalPlannedS > 0 ? Math.min(100, Math.max(0, (elapsedS / totalPlannedS) * 100)) : 0;

  // Ein Satz, der alles Wichtige sagt — ersetzt die Chip-Wand.
  const statusLine = decision.running
    ? `${decision.active_program_name || "Bewässerung"} läuft — noch ${formatDurationCompact(liveRemainingS)}`
    : nextStartShort
      ? `Nächste Bewässerung ${nextStartShort}`
      : "Keine Bewässerung geplant";
  const statusHint = decision.running
    ? decision.active_zone_name ? `Zone ${decision.active_zone_name}` : ""
    : mapBackendError(decision.reason || "", selectedProg);

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

      {/* ── STATUS AUF EINEN BLICK ── */}
      <div className="relative overflow-hidden rounded-card border border-border bg-bg1">
        <div
          className="absolute inset-x-0 top-0 h-0.5"
          style={{ background: decision.running ? "var(--color-green)" : "linear-gradient(to right, var(--color-green), var(--color-blue))" }}
        />
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
              decision.running ? "bg-[var(--color-green-dim)] text-ok" : "bg-bg2 text-tx3",
            )}>
              <Droplets className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold leading-snug text-tx">{statusLine}</div>
              {statusHint && <div className="mt-0.5 text-[12px] text-tx3">{statusHint}</div>}
            </div>
            {decision.running && <Badge tone="ok" pulse>{Math.round(progressPct)}%</Badge>}
          </div>

          {decision.running && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg3">
              <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          )}

          {/* Die drei Knöpfe, die man täglich braucht */}
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={decision.running}
              onClick={() => selectedProg && runAction(
                () => api.runProgram(selectedProg.id, true, manualMin),
                `Bewässerung für ${manualMin} Minuten gestartet.`,
              )}
              className={cn(
                "inline-flex h-16 items-center justify-center gap-2 rounded-tile text-[15px] font-bold text-white transition active:scale-[0.98]",
                "bg-ok shadow-[0_10px_24px_rgba(0,163,114,0.25)]",
                "disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
              )}
            >
              <Play size={18} />
              Jetzt {manualMin} min gießen
            </button>
            <button
              type="button"
              disabled={!decision.running}
              onClick={() => runAction(
                () => api.stopProgram(decision.active_program || selectedProg?.id),
                "Bewässerung gestoppt.",
              )}
              className={cn(
                "inline-flex h-16 items-center justify-center gap-2 rounded-tile text-[15px] font-bold text-white transition active:scale-[0.98]",
                "bg-danger shadow-[0_10px_24px_rgba(214,48,48,0.25)]",
                "disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
              )}
            >
              <Square size={16} />
              Stoppen
            </button>
          </div>

          {actionMsg && (
            <div className={cn(
              "mt-3 flex items-center gap-2 rounded-tile border px-3 py-2 text-xs font-semibold",
              actionMsg.isError
                ? "border-[var(--color-red)]/30 bg-[var(--color-red-dim)] text-danger"
                : "border-[var(--color-green)]/30 bg-[var(--color-green-dim)] text-ok",
            )}>
              {actionMsg.isError
                ? <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                : <CheckCircle className="h-3.5 w-3.5 shrink-0" />}
              {actionMsg.text}
            </div>
          )}

          {/* Programmwahl + Laufzeit nur, wenn es mehr als eine Möglichkeit gibt */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {programs.length > 1 && programs.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProgId(p.id)}
                className={cn(
                  "rounded-tile border px-3 py-1.5 text-[13px] font-semibold transition active:scale-[0.98]",
                  selectedProg?.id === p.id
                    ? "border-[var(--color-green)]/35 bg-[var(--color-green-dim)] text-ok"
                    : "border-border bg-bg2 text-tx2",
                )}
              >
                {p.name}
              </button>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-tx3">Dauer</span>
            {QUICK_MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setManualMin(m); setShowPicker(false); }}
                className={cn(
                  "h-8 min-w-9 rounded-tile border px-2 text-xs font-bold transition",
                  manualMin === m && !showPicker
                    ? "border-[var(--color-green)]/35 bg-[var(--color-green-dim)] text-ok"
                    : "border-border bg-bg2 text-tx2",
                )}
              >
                {m}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowPicker(!showPicker)}
              className={cn(
                "h-8 rounded-tile border px-2.5 text-xs font-bold transition",
                showPicker ? "border-[var(--color-blue)]/35 bg-[var(--color-blue-dim)] text-primary" : "border-border bg-bg2 text-tx2",
              )}
            >
              {showPicker ? `${manualMin} ✓` : "…"}
            </button>
          </div>

          {showPicker && (
            <div className="mt-2">
              <DurationPicker value={manualMin} onChange={(val) => setManualMin(val)} />
            </div>
          )}
        </div>
      </div>

      {/* ── DETAILS AUSKLAPPBAR ── */}
      <button
        type="button"
        onClick={toggleDetails}
        className="flex items-center justify-center gap-1.5 rounded-card border border-border bg-bg1 py-2.5 text-[12px] font-semibold text-tx3 transition hover:text-tx2"
      >
        {showDetails ? "Details ausblenden" : "Details anzeigen"}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showDetails && "rotate-180")} />
      </button>

      {showDetails && (
        <>
          {/* Pumpe */}
          <div className="rounded-card border border-border bg-bg1 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-tx3">Pumpe</span>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={v.fault ? "danger" : v.running ? "ok" : "muted"} pulse={v.running}>
                  {v.fault ? "Fehler" : v.running ? "Läuft" : "Aus"}
                </Badge>
                <Badge tone="muted">{status.active_preset || "Normal"}</Badge>
                <Badge tone="muted">RTU {v.connected ? "online" : "offline"}</Badge>
              </div>
            </div>

            <div className="mb-3.5 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <KpiTile label="Druck" value={formatFixed(status.pressure_bar, 2)} unit="bar" colorClass="text-primary"
                sub={`Ein ${formatFixed(status.pi.p_on, 1)} / Aus ${formatFixed(status.pi.p_off, 1)}`} />
              <KpiTile label="Durchfluss" value={formatFixed(status.flow_rate, 1)} unit="L/min" colorClass="text-ok"
                sub={status.flow_estimated ? "geschätzt" : "Sensor"} />
              <KpiTile label="Frequenz" value={formatFixed(v.frequency, 1)} unit="Hz" colorClass="text-warn"
                sub={`Soll ${formatFixed(v.freq_setpoint, 1)} Hz`} />
              <KpiTile label="Leistung" value={formatSmart(v.power, 0)} unit="W" colorClass="text-purple"
                sub={`${formatFixed(v.current, 1)} A / ${formatSmart(v.voltage, 0)} V`} />
              <KpiTile label="Wassertemp" value={formatFixed(status.water_temp, 1)} unit="°C" colorClass="text-primary"
                sub="Brunnen" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => v.running ? api.v20Stop() : api.v20Start()}
                className={cn(
                  "inline-flex h-12 min-w-44 items-center justify-center gap-2 rounded-tile px-5 text-sm font-bold uppercase tracking-wide text-white transition active:scale-[0.97]",
                  v.running ? "bg-danger" : "bg-ok",
                )}
              >
                {v.running ? <Square size={16} /> : <Play size={16} />}
                {v.running ? "Pumpe stoppen" : "Pumpe starten"}
              </button>
              {v.fault && (
                <button
                  type="button"
                  onClick={() => api.v20Reset()}
                  className="inline-flex h-12 min-w-32 items-center justify-center gap-2 rounded-tile border border-warn/35 bg-[var(--color-amber-dim)] px-5 text-sm font-bold uppercase tracking-wide text-warn transition active:scale-[0.97]"
                >
                  <RotateCcw size={14} />
                  FU Reset
                </button>
              )}
            </div>
          </div>

          {/* Bewässerungs-Entscheidung */}
          <div className="rounded-card border border-border bg-bg1 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-tx3">Entscheidung</span>
              <Badge tone={selectedProg?.mode === "smart_et" ? "blue" : "muted"}>
                {selectedProg?.mode === "smart_et" ? "Smart ET" : "Fest"}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip label="Grund" value={decision.reason ? mapBackendError(decision.reason, selectedProg) : "Bereit"} />
              <Chip label="Wasserbedarf" value={`${formatFixed(wasserbedarfMm, 1)} mm`} />
              <Chip label="Faktor" value={`×${formatSmart(decision.runtime_factor, 2)}`} />
              <Chip label="Regen 24h" value={`${formatFixed(w.forecast_rain_24h_mm ?? 0, 1)} mm`} />
              <Chip label="Regen 48h" value={`${formatFixed(w.forecast_rain_48h_mm ?? 0, 1)} mm`} />
              <Chip label="Verdunstung" value={`${formatFixed(w.et0_mm ?? 0, 1)} mm`} />
            </div>
            {selectedProg && (
              <div className="mt-3 rounded-tile border border-border bg-bg2 px-3 py-2 text-[11px] text-tx3">
                Automatik läuft täglich um <span className="num font-bold text-tx2">
                  {String(selectedProg.start_hour).padStart(2, "0")}:{String(selectedProg.start_min).padStart(2, "0")}
                </span>, sofern Wetter und Wasserbedarf es zulassen.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Unterkomponenten ──────────────────────────────────────────────────────────

function KpiTile({ label, value, unit, colorClass, sub }: {
  label: string; value: string; unit: string; colorClass: string; sub: string;
}) {
  return (
    <div className="rounded-tile border border-border bg-bg2 p-3">
      <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-tx3">{label}</div>
      <div className="mb-1 flex items-baseline gap-1">
        <span className={cn("num text-[1.75rem] font-bold leading-none", colorClass)}>{value}</span>
        <span className="text-[10px] font-bold uppercase text-tx3">{unit}</span>
      </div>
      <div className="text-[10px] text-tx3">{sub}</div>
    </div>
  );
}

function Chip({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-tile border border-border bg-bg2 px-2.5 py-1.5">
      <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-tx3">{label}</span>
      <span className={cn("break-words text-[13px] font-semibold text-tx", valueClass)}>{value}</span>
    </div>
  );
}

function formatDurationCompact(totalSeconds: number) {
  const secs = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
