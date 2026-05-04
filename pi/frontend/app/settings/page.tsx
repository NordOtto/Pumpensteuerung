"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useStatus } from "@/lib/ws";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { IrrigationProgram, IrrigationZone, OtaStatus, Preset } from "@/lib/types";

const DAY_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const SECTIONS = [
  { id: "programs",  label: "Programme" },
  { id: "presets",   label: "Presets" },
  { id: "pi",        label: "PI-Regler" },
  { id: "timeguard", label: "Zeitfenster" },
  { id: "system",    label: "System" },
] as const;
type SectionId = typeof SECTIONS[number]["id"];

export default function SettingsPage() {
  const { status } = useStatus();
  const [active, setActive] = useState<SectionId>("programs");
  const [presetData, setPresetData] = useState<{ active: string; presets: Preset[] } | null>(null);
  const loadPresets = useCallback(() => { api.fetchPresets().then(setPresetData).catch(() => {}); }, []);
  useEffect(() => { loadPresets(); }, [loadPresets]);

  if (!status) return <div className="flex h-64 items-center justify-center text-tx3">Lade...</div>;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Section tabs */}
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" onClick={() => setActive(s.id)}
            className={cn(
              "shrink-0 rounded-tile border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] transition",
              active === s.id
                ? "border-[var(--color-blue)]/35 bg-[var(--color-blue-dim)] text-primary"
                : "border-border bg-bg2 text-tx2 hover:text-tx"
            )}>
            {s.label}
          </button>
        ))}
      </div>

      {active === "programs"  && <ProgramsSettings programs={status.irrigation.programs} presets={presetData?.presets ?? []} />}
      {active === "presets"   && <PresetsSettings active={status.active_preset} data={presetData} onReload={loadPresets} />}
      {active === "pi"        && <PiSettings pi={status.pi} />}
      {active === "timeguard" && <TimeguardSettings tg={status.timeguard} />}
      {active === "system"    && <SystemSettings sys={status.sys} />}
    </div>
  );
}

// ── Programme ────────────────────────────────────────────────────────────────
const EMPTY_ZONE: IrrigationZone = {
  id: "",
  name: "",
  enabled: true,
  duration_min: 20,
  water_mm: 10,
  min_deficit_mm: 8,
  deficit_mm: 0,
  target_mm: 15,
  cycle_min: 0,
  soak_min: 0,
  preset: "Normal",
  plant_type: "Rasen",
};

const EMPTY_PROGRAM: IrrigationProgram = {
  id: "",
  name: "",
  enabled: true,
  mode: "smart_et",
  start_hour: 7,
  start_min: 0,
  days: [true, true, true, true, true, false, false],
  seasonal_factor: 1,
  weather_enabled: true,
  max_runs_per_week: 3,
  min_runtime_factor: 0.25,
  max_runtime_factor: 1.5,
  thresholds: {
    skip_rain_mm: 6,
    reduce_rain_mm: 2,
    wind_max_kmh: 35,
    soil_moisture_skip_pct: 70,
    et0_default_mm: 3,
  },
  zones: [],
  last_run_at: null,
  last_skip_reason: "",
};

function clonePrograms(programs: IrrigationProgram[]) {
  return programs.map((p) => ({
    ...EMPTY_PROGRAM,
    ...p,
    days: [...(p.days ?? EMPTY_PROGRAM.days)],
    thresholds: { ...EMPTY_PROGRAM.thresholds, ...(p.thresholds ?? {}) },
    zones: (p.zones ?? []).map((z) => ({ ...EMPTY_ZONE, ...z })),
  })) as IrrigationProgram[];
}

function ProgramsSettings({ programs, presets }: { programs: IrrigationProgram[]; presets: Preset[] }) {
  const [openIdx, setOpenIdx] = useState(-1);
  const [draft, setDraft] = useState<IrrigationProgram[]>(() => clonePrograms(programs));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const presetNames = Array.from(new Set(presets.map((p) => p.name)));

  useEffect(() => {
    if (!dirty) setDraft(clonePrograms(programs));
  }, [programs, dirty]);

  const updateProgram = (idx: number, patch: Partial<IrrigationProgram>) => {
    setDirty(true);
    setMessage("");
    setDraft((items) => items.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const updateZone = (pIdx: number, zIdx: number, patch: Partial<IrrigationZone>) => {
    setDirty(true);
    setMessage("");
    setDraft((items) => items.map((p, i) => {
      if (i !== pIdx) return p;
      return { ...p, zones: p.zones.map((z, j) => (j === zIdx ? { ...z, ...patch } : z)) };
    }));
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await api.savePrograms(draft);
      setDirty(false);
      setMessage("Programme gespeichert.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Programme konnten nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  const addProgram = () => {
    setDirty(true);
    setMessage("");
    setDraft((items) => {
      const next = { ...EMPTY_PROGRAM, id: `programm_${Date.now()}`, name: `Programm ${items.length + 1}` };
      setOpenIdx(items.length);
      return [...items, next];
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {draft.map((p, i) => (
        <div key={p.id || i} className="overflow-hidden rounded-card border border-border bg-bg1">
          <button type="button" onClick={() => setOpenIdx(openIdx === i ? -1 : i)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left">
            <Toggle checked={p.enabled} onChange={(enabled) => updateProgram(i, { enabled })} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-tx">{p.name || "Unbenannt"}</div>
              <div className="mt-0.5 text-[10px] text-tx3">
                {p.mode === "smart_et" ? "Smart ET" : "Fest"} | Start {String(p.start_hour).padStart(2, "0")}:{String(p.start_min).padStart(2, "0")} | {p.zones.length} Zone(n)
              </div>
            </div>
            <Badge tone={p.last_skip_reason ? "warn" : "ok"}>{p.last_skip_reason || "bereit"}</Badge>
          </button>

          {openIdx === i && (
            <div className="border-t border-border p-4">
              <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <TextEdit label="Name" value={p.name} onChange={(name) => updateProgram(i, { name })} />
                <SelectEdit label="Modus" value={p.mode} options={[["smart_et", "Smart ET"], ["fixed", "Fest"]]} onChange={(mode) => updateProgram(i, { mode: mode as IrrigationProgram["mode"] })} />
                <TimeEdit label="Start" hour={p.start_hour} minute={p.start_min} onChange={(start_hour, start_min) => updateProgram(i, { start_hour, start_min })} />
                <NumberEdit label="Max/Woche" value={p.max_runs_per_week} step={1} onChange={(max_runs_per_week) => updateProgram(i, { max_runs_per_week })} />
              </div>

              <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.08em] text-tx3">Wochentage</div>
              <div className="mb-3 flex gap-1.5">
                {DAY_NAMES.map((d, idx) => (
                  <button key={d} type="button" onClick={() => {
                    const days = [...p.days];
                    days[idx] = !days[idx];
                    updateProgram(i, { days });
                  }} className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-tile border text-[10px] font-bold",
                    p.days[idx] ? "border-[var(--color-blue)]/35 bg-[var(--color-blue-dim)] text-primary" : "border-border bg-bg3 text-tx3"
                  )}>{d}</button>
                ))}
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <NumberEdit label="Saisonfaktor" value={p.seasonal_factor} step={0.05} onChange={(seasonal_factor) => updateProgram(i, { seasonal_factor })} />
                <NumberEdit label="Min-Faktor" value={p.min_runtime_factor} step={0.05} onChange={(min_runtime_factor) => updateProgram(i, { min_runtime_factor })} />
                <NumberEdit label="Max-Faktor" value={p.max_runtime_factor} step={0.05} onChange={(max_runtime_factor) => updateProgram(i, { max_runtime_factor })} />
                <label className="rounded-tile border border-border bg-bg2 px-3 py-2">
                  <span className="mb-2 block text-[9px] font-bold uppercase tracking-[0.1em] text-tx3">Wetter</span>
                  <Toggle checked={p.weather_enabled} onChange={(weather_enabled) => updateProgram(i, { weather_enabled })} />
                </label>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                <NumberEdit label="Regen Skip mm" value={p.thresholds?.skip_rain_mm ?? 6} step={0.5} onChange={(v) => updateProgram(i, { thresholds: { ...p.thresholds!, skip_rain_mm: v } })} />
                <NumberEdit label="Regen Reduz. mm" value={p.thresholds?.reduce_rain_mm ?? 2} step={0.5} onChange={(v) => updateProgram(i, { thresholds: { ...p.thresholds!, reduce_rain_mm: v } })} />
                <NumberEdit label="Wind max km/h" value={p.thresholds?.wind_max_kmh ?? 35} step={1} onChange={(v) => updateProgram(i, { thresholds: { ...p.thresholds!, wind_max_kmh: v } })} />
                <NumberEdit label="Bodenfeuchte %" value={p.thresholds?.soil_moisture_skip_pct ?? 70} step={1} onChange={(v) => updateProgram(i, { thresholds: { ...p.thresholds!, soil_moisture_skip_pct: v } })} />
                <NumberEdit label="ET0 Default" value={p.thresholds?.et0_default_mm ?? 3} step={0.1} onChange={(v) => updateProgram(i, { thresholds: { ...p.thresholds!, et0_default_mm: v } })} />
              </div>

              <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.08em] text-tx3">Zonen</div>
              {p.zones.map((z, zIdx) => (
                <div key={z.id || zIdx} className="mb-1.5 rounded-tile border border-border bg-bg2 p-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <TextEdit label="Zone" value={z.name} onChange={(name) => updateZone(i, zIdx, { name })} />
                    <TextEdit label="Typ" value={z.plant_type} onChange={(plant_type) => updateZone(i, zIdx, { plant_type })} />
                    <SelectEdit label="Preset" value={z.preset || "Normal"} options={["Normal", ...presetNames].map((name) => [name, name])} onChange={(preset) => updateZone(i, zIdx, { preset })} />
                    <NumberEdit label="Dauer min" value={z.duration_min} step={1} onChange={(duration_min) => updateZone(i, zIdx, { duration_min })} />
                    <NumberEdit label="Wasser mm" value={z.water_mm} step={0.5} onChange={(water_mm) => updateZone(i, zIdx, { water_mm })} />
                    <NumberEdit label="Start ab mm" value={z.min_deficit_mm} step={0.5} onChange={(min_deficit_mm) => updateZone(i, zIdx, { min_deficit_mm })} />
                    <NumberEdit label="Zyklus min" value={z.cycle_min} step={1} onChange={(cycle_min) => updateZone(i, zIdx, { cycle_min })} />
                    <NumberEdit label="Sickern min" value={z.soak_min} step={1} onChange={(soak_min) => updateZone(i, zIdx, { soak_min })} />
                  </div>
                  <button type="button" onClick={() => updateProgram(i, { zones: p.zones.filter((_, idx) => idx !== zIdx) })}
                    className="mt-2 rounded-tile border border-danger/25 bg-bg1 px-3 py-1.5 text-[11px] font-semibold text-danger">
                    Zone entfernen
                  </button>
                </div>
              ))}

              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => updateProgram(i, { zones: [...p.zones, { ...EMPTY_ZONE, id: `zone_${Date.now()}`, name: `Zone ${p.zones.length + 1}` }] })}
                  className="rounded-tile border border-dashed border-[var(--color-blue)] px-4 py-2 text-xs font-bold text-primary">
                  + Zone
                </button>
                <button type="button" onClick={() => updateProgram(i, { zones: [] })}
                  className="rounded-tile border border-border bg-bg1 px-4 py-2 text-xs font-semibold text-tx2">
                  Zonen leeren
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-bg1 p-3">
        <button type="button" onClick={addProgram}
          className="rounded-tile border border-dashed border-[var(--color-blue)] px-4 py-2 text-xs font-bold text-primary">
          + Neues Programm
        </button>
        <button type="button" disabled={!dirty || saving} onClick={save}
          className="rounded-tile bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
          {saving ? "Speichert..." : "Programme speichern"}
        </button>
        {dirty && <Badge tone="warn">Ungespeichert</Badge>}
        {message && <span className="text-[11px] text-tx3">{message}</span>}
      </div>
    </div>
  );
}

// ── PI-Regler ─────────────────────────────────────────────────────────────────

// Presets
const MODE_LABEL: Record<number, string> = { 0: "Druckregelung", 1: "Durchflussregelung", 2: "Fixe Frequenz", 3: "Hahnmodus" };

const EMPTY_PRESET: Preset = {
  name: "Neuer Preset",
  mode: 3,
  setpoint: 3,
  kp: 8,
  ki: 1,
  p_on: 2.2,
  p_off: 3.7,
  freq_min: 35,
  freq_max: 52,
  setpoint_hz: 45,
  expected_pressure: 0,
};

function PresetsSettings({ active, data, onReload }: {
  active: string;
  data: { active: string; presets: Preset[] } | null;
  onReload: () => void;
}) {
  const [editing, setEditing] = useState<Preset | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  if (!data) return <div className="rounded-card border border-border bg-bg1 p-4 text-sm text-tx3">Lade...</div>;

  const savePreset = async () => {
    if (!editing) return;
    setSaving(true);
    setMessage("");
    try {
      await api.savePreset(editing);
      setEditing(null);
      setMessage("Preset gespeichert.");
      onReload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Preset konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  const deletePreset = async (name: string) => {
    setMessage("");
    try {
      await api.deletePreset(name);
      if (editing?.name === name) setEditing(null);
      setMessage("Preset entfernt.");
      onReload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Preset konnte nicht entfernt werden.");
    }
  };

  return (
    <div className="rounded-card border border-border bg-bg1">
      <div className="divide-y divide-border">
        {data.presets.map((p) => (
          <div key={p.name} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <span className="text-sm font-semibold text-tx">{p.name}</span>
              <span className="ml-2 text-xs text-tx3">{MODE_LABEL[p.mode]}</span>
              {(data.active === p.name || active === p.name) && (
                <Badge tone="blue" className="ml-2">Aktiv</Badge>
              )}
            </div>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => api.applyPreset(p.name).then(onReload)}
                className="rounded-tile border border-border bg-bg2 px-3 py-1.5 text-xs font-semibold text-tx2">
                Anwenden
              </button>
              <button type="button" onClick={() => setEditing({ ...p })}
                className="rounded-tile border border-border bg-bg2 px-3 py-1.5 text-xs font-semibold text-tx2">
                Bearbeiten
              </button>
              {p.name !== "Normal" && p.name !== active && (
                <button type="button" onClick={() => deletePreset(p.name)}
                  className="rounded-tile border border-danger/25 bg-bg2 px-3 py-1.5 text-xs font-semibold text-danger">
                  Entfernen
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="border-t border-border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-xs font-bold text-tx">Preset bearbeiten</div>
            <Badge tone={editing.mode === 3 ? "blue" : editing.mode === 2 ? "warn" : "ok"}>{MODE_LABEL[editing.mode]}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <TextEdit label="Name" value={editing.name} onChange={(name) => setEditing({ ...editing, name })} />
            <SelectEdit label="Modus" value={String(editing.mode)} options={[[0, "Druckregelung"], [1, "Durchflussregelung"], [2, "Fixe Frequenz"], [3, "Hahnmodus"]].map(([v, l]) => [String(v), String(l)])} onChange={(mode) => setEditing({ ...editing, mode: Number(mode) as Preset["mode"] })} />
            <NumberEdit label="Solldruck bar" value={editing.setpoint} step={0.1} onChange={(setpoint) => setEditing({ ...editing, setpoint })} />
            <NumberEdit label="Ein bar" value={editing.p_on} step={0.1} onChange={(p_on) => setEditing({ ...editing, p_on })} />
            <NumberEdit label="Aus bar" value={editing.p_off} step={0.1} onChange={(p_off) => setEditing({ ...editing, p_off })} />
            <NumberEdit label="Kp" value={editing.kp} step={0.1} onChange={(kp) => setEditing({ ...editing, kp })} />
            <NumberEdit label="Ki" value={editing.ki} step={0.05} onChange={(ki) => setEditing({ ...editing, ki })} />
            <NumberEdit label="Hz min" value={editing.freq_min} step={1} onChange={(freq_min) => setEditing({ ...editing, freq_min })} />
            <NumberEdit label="Hz max" value={editing.freq_max} step={1} onChange={(freq_max) => setEditing({ ...editing, freq_max })} />
            <NumberEdit label="Fix Hz" value={editing.setpoint_hz} step={1} onChange={(setpoint_hz) => setEditing({ ...editing, setpoint_hz })} />
            <NumberEdit label="Erwart. Druck" value={editing.expected_pressure} step={0.1} onChange={(expected_pressure) => setEditing({ ...editing, expected_pressure })} />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)}
              className="rounded-tile border border-border bg-bg1 px-4 py-2 text-xs font-semibold">
              Abbrechen
            </button>
            <button type="button" disabled={saving || !editing.name.trim()} onClick={savePreset}
              className="rounded-tile bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
              {saving ? "Speichert..." : "Speichern"}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        <button type="button" onClick={() => setEditing({ ...EMPTY_PRESET, name: `Preset ${data.presets.length + 1}` })}
          className="rounded-tile border border-dashed border-[var(--color-blue)] px-4 py-2 text-xs font-bold text-primary">
          + Neuer Preset
        </button>
        {message && <span className="text-[11px] text-tx3">{message}</span>}
      </div>
    </div>
  );
}

function PiSettings({ pi }: { pi: { enabled: boolean; setpoint: number; p_on: number; p_off: number; kp: number; ki: number; freq_min: number; freq_max: number } }) {
  const [draft, setDraft] = useState({ setpoint: pi.setpoint, p_on: pi.p_on, p_off: pi.p_off, kp: pi.kp, ki: pi.ki, freq_min: pi.freq_min, freq_max: pi.freq_max });

  return (
    <div className="rounded-card border border-border bg-bg1 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-tx3">PI-Druckregelung</div>
        <Toggle checked={pi.enabled} onChange={(v) => api.setPressure({ enabled: v })} />
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
        {([
          ["Solldruck", "setpoint", "bar"],
          ["Einschaltdruck", "p_on", "bar"],
          ["Ausschaltdruck", "p_off", "bar"],
          ["Kp Reaktion", "kp", ""],
          ["Ki Nachregelung", "ki", ""],
          ["Hz min", "freq_min", "Hz"],
          ["Hz max", "freq_max", "Hz"],
        ] as const).map(([label, key, unit]) => (
          <SettingField key={label} label={label} value={`${(draft[key as keyof typeof draft] as number).toFixed(key === "ki" ? 2 : 1)} ${unit}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => api.resetDryrun()}
          className="rounded-tile border border-warn/35 bg-[var(--color-amber-dim)] px-4 py-2 text-xs font-bold text-warn">
          Trockenlauf Reset
        </button>
        <button type="button" onClick={() => api.setPressure(draft)}
          className="rounded-tile bg-primary px-4 py-2 text-xs font-bold text-white">
          Speichern
        </button>
      </div>
    </div>
  );
}

// ── Zeitfenster ───────────────────────────────────────────────────────────────
function TimeguardSettings({ tg }: { tg: { enabled: boolean; start_hour: number; start_min: number; end_hour: number; end_min: number; days: boolean[]; allowed: boolean } }) {
  const [d, setD] = useState({ start_hour: tg.start_hour, start_min: tg.start_min, end_hour: tg.end_hour, end_min: tg.end_min, days: [...tg.days] });
  const fmt = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

  return (
    <div className="rounded-card border border-border bg-bg1 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-tx3">Zeitfenster-Sperre</div>
        <Toggle checked={tg.enabled} onChange={(v) => api.setTimeguard({ enabled: v })} />
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-tx3">Start</span>
          <input type="time" value={fmt(d.start_hour, d.start_min)}
            onChange={(e) => { const [h, m] = e.target.value.split(":").map(Number); setD({ ...d, start_hour: h, start_min: m }); }}
            className="h-11 rounded-tile border border-border bg-bg2 px-3 text-sm font-semibold text-tx outline-none" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-tx3">Ende</span>
          <input type="time" value={fmt(d.end_hour, d.end_min)}
            onChange={(e) => { const [h, m] = e.target.value.split(":").map(Number); setD({ ...d, end_hour: h, end_min: m }); }}
            className="h-11 rounded-tile border border-border bg-bg2 px-3 text-sm font-semibold text-tx outline-none" />
        </label>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {DAY_NAMES.map((name, i) => (
          <button key={name} type="button"
            onClick={() => { const days = [...d.days]; days[i] = !days[i]; setD({ ...d, days }); }}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-tile border text-[11px] font-bold transition",
              d.days[i] ? "border-[var(--color-green)]/35 bg-[var(--color-green-dim)] text-ok" : "border-border bg-bg3 text-tx3"
            )}>
            {name}
          </button>
        ))}
      </div>
      <div className="mb-3">
        <Badge tone={tg.allowed ? "ok" : "warn"}>{tg.allowed ? "Im Zeitfenster" : "Außerhalb des Zeitfensters"}</Badge>
      </div>
      <button type="button" onClick={() => api.setTimeguard(d)}
        className="rounded-tile bg-primary px-4 py-2 text-xs font-bold text-white">
        Speichern
      </button>
    </div>
  );
}

// ── System ────────────────────────────────────────────────────────────────────
function SystemSettings({ sys }: { sys: { ip: string; fw: string; uptime: number; mqtt: boolean; rtu_connected: boolean } }) {
  const [ota, setOta] = useState<OtaStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [checked, setChecked] = useState(false);
  const [tokenDraft, setTokenDraft] = useState("");
  const [tokenBusy, setTokenBusy] = useState(false);
  const [tokenMessage, setTokenMessage] = useState("");

  const refreshOta = useCallback(() => api.otaStatus().then(setOta).catch(() => {}), []);

  useEffect(() => { refreshOta(); }, [refreshOta]);

  const pollOta = useCallback(async () => {
    for (let i = 0; i < 90; i += 1) {
      const next = await api.otaStatus();
      setOta(next);
      if (!next.running) return next;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return null;
  }, []);

  const checkUpdates = async () => {
    setChecking(true);
    setTokenMessage("");
    try {
      await api.otaCheck();
      await pollOta();
      setChecked(true);
    } finally {
      setChecking(false);
      refreshOta();
    }
  };

  const installUpdate = async () => {
    setInstalling(true);
    setTokenMessage("");
    try {
      await api.otaInstall(ota?.latest_version ?? undefined);
      await pollOta();
      setChecked(true);
    } finally {
      setInstalling(false);
      refreshOta();
    }
  };

  const saveToken = async () => {
    const token = tokenDraft.trim();
    if (!token) return;
    setTokenBusy(true);
    setTokenMessage("");
    try {
      const res = await api.otaTokenSet(token);
      setTokenDraft("");
      setTokenMessage(res.message || "Token gespeichert.");
      await refreshOta();
    } catch (err) {
      setTokenMessage(err instanceof Error ? err.message : "Token konnte nicht gespeichert werden.");
    } finally {
      setTokenBusy(false);
    }
  };

  const deleteToken = async () => {
    setTokenBusy(true);
    setTokenMessage("");
    try {
      await api.otaTokenDelete();
      setTokenDraft("");
      setTokenMessage("Token entfernt.");
      await refreshOta();
    } catch (err) {
      setTokenMessage(err instanceof Error ? err.message : "Token konnte nicht entfernt werden.");
    } finally {
      setTokenBusy(false);
    }
  };

  const upH = Math.floor(sys.uptime / 3600);
  const upD = Math.floor(upH / 24);
  const otaBusy = checking || installing || Boolean(ota?.running);
  const updateAvailable = Boolean(ota?.update_available && ota.latest_version);
  const tokenTone = ota?.token_ok ? "ok" : ota?.token_configured ? "warn" : "muted";
  const tokenLabel = ota?.token_ok ? "OK" : ota?.token_configured ? "Pruefen" : "Nicht gesetzt";

  return (
    <div className="flex flex-col gap-2">
      {/* OTA */}
      <div className="relative overflow-hidden rounded-card border border-border bg-bg1 p-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary via-cyan-400 to-ok" />
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-tx">Online-Updates</div>
            <div className="mt-0.5 text-[11px] text-tx3">Prüft GitHub Releases und installiert freigegebene Pakete.</div>
          </div>
          <span className={cn(
            "rounded-full border px-3 py-1 text-[10px] font-bold",
            checking ? "border-primary/20 bg-[var(--color-blue-dim)] text-primary"
            : checked ? "border-ok/20 bg-[var(--color-green-dim)] text-ok"
            : "border-border bg-bg2 text-tx3"
          )}>
            {checking ? "Prüfe…" : checked ? "Aktuell" : "Nicht geprüft"}
          </span>
        </div>
        <div className="mb-3 grid grid-cols-3 gap-2">
          {[["Installiert", sys.fw], ["Neueste Version", ota?.latest_version ?? "—"], ["Letzter Check", checked ? new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "—"]].map(([l, v]) => (
            <SettingField key={l} label={l} value={v} />
          ))}
        </div>
        <div className="mb-3 rounded-tile border border-border bg-bg2 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-tx3">GitHub-Token</div>
              <div className="mt-0.5 text-[11px] text-tx3">Wird verdeckt auf dem Pi gespeichert und nur fuer private Releases genutzt.</div>
            </div>
            <Badge tone={tokenTone}>{tokenLabel}</Badge>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              autoComplete="off"
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              placeholder={ota?.token_configured ? "Neuen Token eintragen" : "GitHub Token eintragen"}
              className="min-h-10 flex-1 rounded-tile border border-border bg-bg1 px-3 text-sm font-semibold text-tx outline-none placeholder:text-tx3"
            />
            <button type="button" disabled={tokenBusy || tokenDraft.trim().length < 20} onClick={saveToken}
              className="rounded-tile bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
              Speichern
            </button>
            {ota?.token_configured && (
              <button type="button" disabled={tokenBusy} onClick={deleteToken}
                className="rounded-tile border border-border bg-bg1 px-4 py-2 text-xs font-semibold text-tx2 disabled:opacity-40">
                Entfernen
              </button>
            )}
          </div>
          {(tokenMessage || ota?.token_message) && (
            <div className="mt-2 text-[11px] text-tx3">{tokenMessage || ota?.token_message}</div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={otaBusy}
            onClick={checkUpdates}
            className="inline-flex items-center gap-2 rounded-tile border border-border bg-bg2 px-4 py-2 text-xs font-bold text-tx2 disabled:opacity-50">
            <RefreshCw className={cn("h-3.5 w-3.5", otaBusy && "animate-spin")} />
            {checking ? "Prüfe…" : "Auf Updates prüfen"}
          </button>
          <button type="button" disabled={!updateAvailable || otaBusy} onClick={installUpdate}
            className="inline-flex items-center gap-2 rounded-tile bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
            {installing || ota?.running ? "Installiert..." : "Update installieren"}
          </button>
        </div>
      </div>

      {/* System info */}
      <div className="rounded-card border border-border bg-bg1 p-4">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-tx3">Systeminformationen</div>
        <div className="divide-y divide-border2">
          {[
            ["IP-Adresse", sys.ip],
            ["Firmware", sys.fw],
            ["Laufzeit", `${upD}d ${upH % 24}h`],
            ["MQTT", sys.mqtt ? "Verbunden" : "Getrennt"],
            ["RTU", sys.rtu_connected ? "Verbunden" : "Getrennt"],
          ].map(([l, v]) => (
            <div key={l} className="flex items-center justify-between py-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-tx3">{l}</span>
              <span className="num text-xs font-semibold text-tx">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function TextEdit({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="rounded-tile border border-border bg-bg2 px-3 py-2">
      <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.1em] text-tx3">{label}</span>
      <input value={value ?? ""} onChange={(e) => onChange(e.target.value)}
        className="h-7 w-full bg-transparent text-sm font-semibold text-tx outline-none" />
    </label>
  );
}

function NumberEdit({ label, value, step, onChange }: { label: string; value: number; step?: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value ?? 0));
  useEffect(() => { setText(String(value ?? 0)); }, [value]);
  return (
    <label className="rounded-tile border border-border bg-bg2 px-3 py-2">
      <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.1em] text-tx3">{label}</span>
      <input inputMode="decimal" value={text} onChange={(e) => {
        const next = e.target.value.replace(",", ".");
        setText(next);
        if (next === "" || next === "." || next === "-") return;
        const parsed = Number(next);
        if (Number.isFinite(parsed)) onChange(parsed);
      }} onBlur={() => setText(String(value ?? 0))} step={step}
        className="num h-7 w-full bg-transparent text-sm font-semibold text-tx outline-none" />
    </label>
  );
}

function SelectEdit({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
  return (
    <label className="rounded-tile border border-border bg-bg2 px-3 py-2">
      <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.1em] text-tx3">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-7 w-full bg-transparent text-sm font-semibold text-tx outline-none">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function TimeEdit({ label, hour, minute, onChange }: { label: string; hour: number; minute: number; onChange: (hour: number, minute: number) => void }) {
  const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return (
    <label className="rounded-tile border border-border bg-bg2 px-3 py-2">
      <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.1em] text-tx3">{label}</span>
      <input type="time" value={value} onChange={(e) => {
        const [h, m] = e.target.value.split(":").map(Number);
        if (Number.isFinite(h) && Number.isFinite(m)) onChange(h, m);
      }} className="h-7 w-full bg-transparent text-sm font-semibold text-tx outline-none" />
    </label>
  );
}

function SettingField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-tile border border-border bg-bg2 px-3 py-2">
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.1em] text-tx3">{label}</div>
      <div className="num text-sm font-semibold text-tx">{value}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={cn("relative h-5 w-9 rounded-full transition", checked ? "bg-ok" : "bg-bg3 border border-border")}>
      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-bg1 shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}
