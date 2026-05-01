"use client";

import { useEffect, useRef, useState } from "react";
import { Section } from "@/components/section";
import { useStatus } from "@/lib/ws";
import { api } from "@/lib/api";
import type { IrrigationProgram, IrrigationZone, OtaStatus, Preset } from "@/lib/types";

const DAY_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const PLANTS = ["Rasen", "Hecke", "Beet", "Tropfschlauch"];
const SOILS = ["sandig", "lehmig", "schwer"];
const SUN = ["schattig", "halbsonnig", "vollsonnig"];

export default function SettingsPage() {
  const { status } = useStatus();
  if (!status) return <div className="flex h-64 items-center justify-center text-slate-400">Lade...</div>;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <ProgramsSection programs={status.irrigation.programs as IrrigationProgram[]} />
      <PresetsSection active={status.active_preset} />
      <PiSection
        setpoint={status.pi.setpoint}
        pOn={status.pi.p_on}
        pOff={status.pi.p_off}
        kp={status.pi.kp}
        ki={status.pi.ki}
        freqMin={status.pi.freq_min}
        freqMax={status.pi.freq_max}
        enabled={status.pi.enabled}
        spike={status.pi.spike_enabled}
      />
      <TimeguardSection tg={status.timeguard} />
      <OtaSection fw={status.sys.fw} />
      <VacationSection enabled={status.vacation.enabled} />
      <SystemInfo
        ip={status.sys.ip}
        fw={status.sys.fw}
        uptime={status.sys.uptime}
        mqtt={status.sys.mqtt}
        rtu={status.sys.rtu_connected}
      />
    </div>
  );
}

const EMPTY_ZONE: IrrigationZone = {
  id: "",
  name: "",
  enabled: true,
  duration_min: 20,
  water_mm: 10,
  min_deficit_mm: 8,
  deficit_mm: 0,
  target_mm: 15,
  preset: "Normal",
  plant_type: "Rasen",
};

const EMPTY_PROGRAM: IrrigationProgram = {
  id: "",
  name: "",
  enabled: true,
  mode: "smart_et",
  days: [true, true, true, true, true, false, false],
  start_hour: 7,
  start_min: 0,
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
    thresholds: {
      skip_rain_mm: p.thresholds?.skip_rain_mm ?? EMPTY_PROGRAM.thresholds!.skip_rain_mm,
      reduce_rain_mm: p.thresholds?.reduce_rain_mm ?? EMPTY_PROGRAM.thresholds!.reduce_rain_mm,
      wind_max_kmh: p.thresholds?.wind_max_kmh ?? EMPTY_PROGRAM.thresholds!.wind_max_kmh,
      soil_moisture_skip_pct: p.thresholds?.soil_moisture_skip_pct ?? EMPTY_PROGRAM.thresholds!.soil_moisture_skip_pct,
      et0_default_mm: p.thresholds?.et0_default_mm ?? EMPTY_PROGRAM.thresholds!.et0_default_mm,
    },
    zones: p.zones.map((z) => ({ ...EMPTY_ZONE, ...z })),
  })) as IrrigationProgram[];
}

function ProgramsSection({ programs }: { programs: IrrigationProgram[] }) {
  const [draft, setDraft] = useState<IrrigationProgram[]>(() => clonePrograms(programs));
  const [openIdx, setOpenIdx] = useState(0);
  const [editingZone, setEditingZone] = useState<{ pIdx: number; zIdx: number | null; z: IrrigationZone } | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [wizard, setWizard] = useState({
    plant_type: "Rasen",
    soil_type: "lehmig",
    sun_exposure: "vollsonnig",
    measured_mm: 5,
    test_minutes: 10,
    max_runs_per_week: 3,
    preset: "Rasen",
  });
  const [wizardSummary, setWizardSummary] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { setDraft(clonePrograms(programs)); }, [programs]);
  useEffect(() => { api.fetchPresets().then((r) => setPresets(r.presets)).catch(() => {}); }, []);

  const updateProg = (i: number, patch: Partial<IrrigationProgram>) => {
    setDraft((d) => d.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };

  const savePrograms = async () => {
    setErr("");
    try {
      await api.savePrograms(draft);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  };

  const applyWizard = async () => {
    const pIdx = openIdx;
    const program = draft[pIdx];
    if (!program) return;
    const zone = program.zones[0] ?? { ...EMPTY_ZONE, id: `zone_${Date.now()}`, name: "Zone 1" };
    const rec = await api.recommendSmartEt(wizard);
    setWizardSummary(rec.summary);
    setDraft((d) => d.map((p, idx) => {
      if (idx !== pIdx) return p;
      const nextZone = { ...zone, ...rec.zone_patch, enabled: true };
      return {
        ...p,
        ...rec.program_patch,
        zones: p.zones.length ? [nextZone, ...p.zones.slice(1)] : [nextZone],
      } as IrrigationProgram;
    }));
  };

  const saveZone = () => {
    if (!editingZone) return;
    const { pIdx, zIdx, z } = editingZone;
    const id = z.id || `zone_${Date.now()}`;
    setDraft((d) => d.map((p, i) => {
      if (i !== pIdx) return p;
      const zones = zIdx === null
        ? [...p.zones, { ...z, id }]
        : p.zones.map((item, j) => (j === zIdx ? { ...z, id: item.id || id } : item));
      return { ...p, zones };
    }));
    setEditingZone(null);
  };

  const addProgram = () => {
    setDraft((d) => {
      const next = { ...EMPTY_PROGRAM, id: `prog_${Date.now()}`, name: `Programm ${d.length + 1}` };
      setOpenIdx(d.length);
      return [...d, next];
    });
  };

  const presetNames = presets.map((p) => p.name);

  return (
    <Section title="Bewasserungs-Programme">
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="rounded-lg border border-border bg-slate-950 p-4 text-white shadow-sm">
          <div className="text-xs font-bold uppercase tracking-widest text-primary/80">Smart-ET Assistent</div>
          <div className="mt-2 text-sm text-slate-300">
            Die Tage sind Freigabefenster. Gestartet wird nur, wenn ET-Defizit, Wetter und Sicherheitslogik passen.
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Select label="Nutzung" value={wizard.plant_type} options={PLANTS} onChange={(v) => setWizard({ ...wizard, plant_type: v })} />
            <Select label="Preset" value={wizard.preset} options={[...presetNames, "Benutzerdefiniert"]} onChange={(v) => setWizard({ ...wizard, preset: v })} />
            <Select label="Boden" value={wizard.soil_type} options={SOILS} onChange={(v) => setWizard({ ...wizard, soil_type: v })} />
            <Select label="Sonne" value={wizard.sun_exposure} options={SUN} onChange={(v) => setWizard({ ...wizard, sun_exposure: v })} />
            <DarkNum label="Test-mm" value={wizard.measured_mm} step={0.5} onChange={(v) => setWizard({ ...wizard, measured_mm: v })} />
            <DarkNum label="Test-min" value={wizard.test_minutes} step={1} onChange={(v) => setWizard({ ...wizard, test_minutes: v })} />
            <DarkNum label="Max/Woche" value={wizard.max_runs_per_week} step={1} onChange={(v) => setWizard({ ...wizard, max_runs_per_week: v })} />
          </div>
          <button type="button" onClick={applyWizard} className="mt-4 w-full rounded-lg bg-primary py-3 text-sm font-bold text-white">
            Werte fur offenes Programm berechnen
          </button>
          {wizardSummary && <div className="mt-3 rounded-md bg-white/10 p-3 text-xs text-slate-200">{wizardSummary}</div>}
        </div>

        <div className="flex flex-col gap-3">
          {draft.map((p, i) => {
            const isOpen = openIdx === i;
            const maxDeficit = Math.max(0, ...p.zones.map((z) => z.deficit_mm ?? 0));
            return (
              <div key={p.id || i} className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
                <button type="button" onClick={() => setOpenIdx(isOpen ? -1 : i)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <Toggle checked={p.enabled} onChange={(v) => updateProg(i, { enabled: v })} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-900">{p.name || "Unbenannt"}</div>
                    <div className="text-xs text-slate-500">
                      {p.mode === "smart_et" ? "Smart ET" : "Fest"} | {timeLabel(p)} | {p.zones.length} Zone(n) | Defizit {maxDeficit.toFixed(1)} mm
                    </div>
                  </div>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                    {p.last_skip_reason || "bereit"}
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-border bg-slate-50 p-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <TextField label="Name" value={p.name} onChange={(v) => updateProg(i, { name: v })} />
                      <Select label="Modus" value={p.mode} options={["smart_et", "fixed"]} onChange={(v) => updateProg(i, { mode: v as "smart_et" | "fixed" })} />
                      <TimeField label="Startfenster" h={p.start_hour} m={p.start_min} onChange={(h, m) => updateProg(i, { start_hour: h, start_min: m })} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {DAY_NAMES.map((name, d) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => {
                            const days = [...p.days];
                            days[d] = !days[d];
                            updateProg(i, { days });
                          }}
                          className={`h-10 w-10 rounded-lg text-sm font-bold ${p.days[d] ? "bg-primary text-white" : "bg-slate-100 text-slate-500"}`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <NumField label="Saisonfaktor" value={p.seasonal_factor} step={0.05} onChange={(v) => updateProg(i, { seasonal_factor: v })} />
                      <NumField label="Max/Woche" value={p.max_runs_per_week} step={1} onChange={(v) => updateProg(i, { max_runs_per_week: v })} />
                      <NumField label="Wind max km/h" value={p.thresholds?.wind_max_kmh ?? 35} step={1} onChange={(v) => updateProg(i, { thresholds: { ...p.thresholds!, wind_max_kmh: v } })} />
                      <NumField label="Regen Skip mm" value={p.thresholds?.skip_rain_mm ?? 6} step={0.5} onChange={(v) => updateProg(i, { thresholds: { ...p.thresholds!, skip_rain_mm: v } })} />
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {p.zones.map((z, j) => <ZoneRow key={z.id || j} zone={z} onEdit={() => setEditingZone({ pIdx: i, zIdx: j, z: { ...z } })} onDelete={() => updateProg(i, { zones: p.zones.filter((_, idx) => idx !== j) })} />)}
                      <button type="button" onClick={() => setEditingZone({ pIdx: i, zIdx: null, z: { ...EMPTY_ZONE } })} className="rounded-lg border border-dashed border-primary p-4 text-sm font-bold text-primary">
                        + Zone hinzufugen
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {editingZone && (
            <ZoneEditor
              value={editingZone.z}
              presets={presetNames}
              onChange={(z) => setEditingZone({ ...editingZone, z })}
              onCancel={() => setEditingZone(null)}
              onSave={saveZone}
            />
          )}

          {err && <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{err}</div>}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={addProgram} className="rounded-lg border border-dashed border-primary px-4 py-2 text-sm font-bold text-primary">+ Neues Programm</button>
            <button type="button" onClick={savePrograms} className="rounded-lg bg-primary px-5 py-2 text-sm font-bold text-white">Alle Programme speichern</button>
          </div>
        </div>
      </div>
    </Section>
  );
}

function ZoneRow({ zone, onEdit, onDelete }: { zone: IrrigationZone; onEdit: () => void; onDelete: () => void }) {
  const pct = Math.min(100, Math.round((zone.deficit_mm / Math.max(zone.target_mm, 1)) * 100));
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-900">{zone.name || "Zone"}</div>
          <div className="text-xs text-slate-500">{zone.plant_type || "-"} | {zone.preset || "Normal"} | {zone.duration_min} min</div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onEdit} className="rounded border border-border px-2 py-1 text-xs font-semibold">Bearbeiten</button>
          <button type="button" onClick={onDelete} className="rounded border border-danger/40 px-2 py-1 text-xs font-semibold text-danger">X</button>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-600">
        <span>Defizit {zone.deficit_mm.toFixed(1)} mm</span>
        <span>Ziel {zone.target_mm.toFixed(1)} mm</span>
        <span>Start ab {zone.min_deficit_mm.toFixed(1)} mm</span>
      </div>
    </div>
  );
}

function ZoneEditor({ value, presets, onChange, onCancel, onSave }: {
  value: IrrigationZone;
  presets: string[];
  onChange: (z: IrrigationZone) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
      <div className="mb-3 text-sm font-bold text-slate-800">Zone bearbeiten</div>
      <div className="grid gap-3 md:grid-cols-3">
        <TextField label="Name" value={value.name} onChange={(v) => onChange({ ...value, name: v })} />
        <Select label="Preset" value={value.preset} options={[...presets, "Benutzerdefiniert"]} onChange={(v) => onChange({ ...value, preset: v })} />
        <Select label="Pflanzentyp" value={value.plant_type || "Rasen"} options={PLANTS} onChange={(v) => onChange({ ...value, plant_type: v })} />
        <NumField label="Laufzeit min" value={value.duration_min} step={1} onChange={(v) => onChange({ ...value, duration_min: v })} />
        <NumField label="Wasser mm" value={value.water_mm} step={0.5} onChange={(v) => onChange({ ...value, water_mm: v })} />
        <NumField label="Ziel mm" value={value.target_mm} step={0.5} onChange={(v) => onChange({ ...value, target_mm: v })} />
        <NumField label="Start ab mm" value={value.min_deficit_mm} step={0.5} onChange={(v) => onChange({ ...value, min_deficit_mm: v })} />
        <NumField label="Akt. Defizit mm" value={value.deficit_mm} step={0.5} onChange={(v) => onChange({ ...value, deficit_mm: v })} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-border bg-white px-4 py-2 text-sm">Abbrechen</button>
        <button type="button" onClick={onSave} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">Zone speichern</button>
      </div>
    </div>
  );
}

const EMPTY_PRESET: Preset = {
  name: "",
  mode: 0,
  setpoint: 3,
  kp: 8,
  ki: 1,
  freq_min: 35,
  freq_max: 52,
  setpoint_hz: 40,
  expected_pressure: 3,
};

const MODE_LABEL: Record<number, string> = { 0: "Druck", 1: "Durchfluss", 2: "FixHz" };

function PresetsSection({ active }: { active: string }) {
  const [data, setData] = useState<{ active: string; presets: Preset[] } | null>(null);
  const [editing, setEditing] = useState<Preset | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [err, setErr] = useState("");
  const load = () => api.fetchPresets().then(setData).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!data) return <Section title="Presets"><div className="p-4 text-sm text-slate-400">Lade...</div></Section>;

  const save = async () => {
    if (!editing) return;
    setErr("");
    try {
      await api.savePreset(editing);
      await load();
      setEditing(null);
      setIsNew(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  };

  return (
    <Section title="Pumpen-Presets">
      <div className="rounded-lg border border-border bg-white shadow-sm">
        <div className="divide-y divide-border">
          {data.presets.map((p) => (
            <div key={p.name} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-48 flex-1">
                <span className="font-semibold text-slate-900">{p.name}</span>
                <span className="ml-2 text-xs text-slate-500">{MODE_LABEL[p.mode]}</span>
                {(data.active === p.name || active === p.name) && <span className="ml-2 rounded bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">aktiv</span>}
              </div>
              <button type="button" onClick={() => api.applyPreset(p.name).then(load)} className="rounded border border-border px-3 py-1 text-xs font-semibold">Anwenden</button>
              <button type="button" onClick={() => { setEditing({ ...p }); setIsNew(false); }} className="rounded border border-border px-3 py-1 text-xs font-semibold">Bearbeiten</button>
              <button type="button" onClick={() => api.deletePreset(p.name).then(load).catch((e) => setErr(e.message))} className="rounded border border-danger/40 px-3 py-1 text-xs font-semibold text-danger">Loschen</button>
            </div>
          ))}
        </div>
        {editing && (
          <div className="border-t border-border bg-slate-50 p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <TextField label="Name" value={editing.name} disabled={!isNew} onChange={(v) => setEditing({ ...editing, name: v })} />
              <Select label="Modus" value={String(editing.mode)} options={["0", "1", "2"]} onChange={(v) => setEditing({ ...editing, mode: Number(v) as 0 | 1 | 2 })} />
              <NumField label="Setpoint" value={editing.setpoint} step={0.1} onChange={(v) => setEditing({ ...editing, setpoint: v })} />
              <NumField label="Soll-Hz" value={editing.setpoint_hz} step={1} onChange={(v) => setEditing({ ...editing, setpoint_hz: v })} />
              <NumField label="Kp" value={editing.kp} step={0.5} onChange={(v) => setEditing({ ...editing, kp: v })} />
              <NumField label="Ki" value={editing.ki} step={0.1} onChange={(v) => setEditing({ ...editing, ki: v })} />
              <NumField label="Hz min" value={editing.freq_min} step={1} onChange={(v) => setEditing({ ...editing, freq_min: v })} />
              <NumField label="Hz max" value={editing.freq_max} step={1} onChange={(v) => setEditing({ ...editing, freq_max: v })} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-border bg-white px-4 py-2 text-sm">Abbrechen</button>
              <button type="button" onClick={save} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">Speichern</button>
            </div>
          </div>
        )}
        {err && <div className="px-4 pb-3 text-sm text-danger">{err}</div>}
        <div className="border-t border-border px-4 py-3">
          <button type="button" onClick={() => { setEditing({ ...EMPTY_PRESET }); setIsNew(true); }} className="rounded-lg border border-dashed border-primary px-4 py-2 text-sm font-bold text-primary">+ Neuer Preset</button>
        </div>
      </div>
    </Section>
  );
}

function PiSection({ setpoint, pOn, pOff, kp, ki, freqMin, freqMax, enabled, spike }: {
  setpoint: number; pOn: number; pOff: number; kp: number; ki: number; freqMin: number; freqMax: number; enabled: boolean; spike: boolean;
}) {
  const [draft, setDraft] = useState({ setpoint, p_on: pOn, p_off: pOff, kp, ki, freq_min: freqMin, freq_max: freqMax });
  return (
    <Section title="PI-Druckregelung">
      <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Regler aktiv</span>
          <Toggle checked={enabled} onChange={(v) => api.setPressure({ enabled: v })} />
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <NumField label="Soll bar" value={draft.setpoint} step={0.1} onChange={(v) => setDraft({ ...draft, setpoint: v })} />
          <NumField label="Ein bar" value={draft.p_on} step={0.1} onChange={(v) => setDraft({ ...draft, p_on: v })} />
          <NumField label="Aus bar" value={draft.p_off} step={0.1} onChange={(v) => setDraft({ ...draft, p_off: v })} />
          <NumField label="Hz min" value={draft.freq_min} step={1} onChange={(v) => setDraft({ ...draft, freq_min: v })} />
          <NumField label="Hz max" value={draft.freq_max} step={1} onChange={(v) => setDraft({ ...draft, freq_max: v })} />
          <NumField label="Kp" value={draft.kp} step={0.5} onChange={(v) => setDraft({ ...draft, kp: v })} />
          <NumField label="Ki" value={draft.ki} step={0.1} onChange={(v) => setDraft({ ...draft, ki: v })} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500">Hahn-zu-Erkennung: {spike ? "an" : "aus"}</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => api.resetDryrun()} className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-2 text-sm font-semibold text-warn">Trockenlauf reset</button>
            <button type="button" onClick={() => api.setPressure(draft)} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">Speichern</button>
          </div>
        </div>
      </div>
    </Section>
  );
}

function TimeguardSection({ tg }: { tg: { enabled: boolean; start_hour: number; start_min: number; end_hour: number; end_min: number; days: boolean[]; allowed: boolean } }) {
  const [d, setD] = useState({ start_hour: tg.start_hour, start_min: tg.start_min, end_hour: tg.end_hour, end_min: tg.end_min, days: [...tg.days] });
  return (
    <Section title="Zeitfenster">
      <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Aktiv {tg.allowed ? "(im Fenster)" : "(gesperrt)"}</span>
          <Toggle checked={tg.enabled} onChange={(v) => api.setTimeguard({ enabled: v })} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <TimeField label="Start" h={d.start_hour} m={d.start_min} onChange={(h, m) => setD({ ...d, start_hour: h, start_min: m })} />
          <TimeField label="Ende" h={d.end_hour} m={d.end_min} onChange={(h, m) => setD({ ...d, end_hour: h, end_min: m })} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {DAY_NAMES.map((name, i) => (
            <button key={name} type="button" onClick={() => {
              const days = [...d.days];
              days[i] = !days[i];
              setD({ ...d, days });
            }} className={`h-10 w-10 rounded-lg text-sm font-bold ${d.days[i] ? "bg-primary text-white" : "bg-slate-100 text-slate-500"}`}>{name}</button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={() => api.setTimeguard(d)} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">Speichern</button>
        </div>
      </div>
    </Section>
  );
}

function OtaSection({ fw }: { fw: string }) {
  const [ota, setOta] = useState<OtaStatus | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [polling, setPolling] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    api.otaStatus().then(setOta).catch(() => {});
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  const poll = () => {
    setPolling(true);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      const r = await api.otaLog().catch(() => null);
      if (!r) return;
      setLog(r.lines);
      if (!r.running) {
        if (timer.current) clearInterval(timer.current);
        setPolling(false);
        api.otaStatus().then(setOta).catch(() => {});
      }
    }, 1000);
  };

  return (
    <Section title="System-Update">
      <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <Info label="Installiert" value={ota?.current_version ?? fw} />
          <Info label="Neueste Version" value={ota?.latest_version ?? "-"} />
          <Info label="Commit" value={ota?.latest_commit?.slice(0, 12) ?? "-"} />
        </div>
        {ota?.changelog && <div className="mt-3 rounded-lg border border-border bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-line">{ota.changelog}</div>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={async () => { await api.otaCheck(); poll(); }} disabled={polling || ota?.running} className="rounded-lg border border-border px-4 py-2 text-sm font-bold">Prufen</button>
          <button type="button" onClick={async () => { await api.otaInstall(ota?.latest_version ?? undefined); poll(); }} disabled={polling || ota?.running || !ota?.update_available} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Installieren</button>
          <button type="button" onClick={async () => { await api.otaRollback(); poll(); }} disabled={polling || ota?.running} className="rounded-lg border border-warn/40 px-4 py-2 text-sm font-bold text-warn">Rollback</button>
        </div>
        {log.length > 0 && <pre ref={logRef} className="mt-4 max-h-56 overflow-y-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-200">{log.join("\n")}</pre>}
      </div>
    </Section>
  );
}

function VacationSection({ enabled }: { enabled: boolean }) {
  return (
    <Section title="Urlaubsmodus">
      <div className="flex items-center justify-between rounded-lg border border-border bg-white p-4 shadow-sm">
        <div>
          <div className="font-semibold text-slate-700">Pumpe gesperrt</div>
          <div className="text-xs text-slate-500">Alle Bewasserungen pausiert.</div>
        </div>
        <Toggle checked={enabled} onChange={(v) => api.setVacation(v)} />
      </div>
    </Section>
  );
}

function SystemInfo({ ip, fw, uptime, mqtt, rtu }: { ip: string; fw: string; uptime: number; mqtt: boolean; rtu: boolean }) {
  const days = Math.floor(uptime / 86400);
  const hrs = Math.floor((uptime % 86400) / 3600);
  const min = Math.floor((uptime % 3600) / 60);
  return (
    <Section title="System">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Info label="Firmware" value={fw} />
        <Info label="IP" value={ip || "-"} />
        <Info label="Uptime" value={`${days}d ${hrs}h ${min}m`} />
        <Info label="Verbindungen" value={`${mqtt ? "MQTT ok" : "MQTT aus"} | ${rtu ? "RTU ok" : "RTU aus"}`} />
      </div>
    </Section>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onChange(!checked); }} className={`relative h-7 w-12 rounded-full transition ${checked ? "bg-primary" : "bg-slate-300"}`}>
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-6" : "left-1"}`} />
    </button>
  );
}

function NumField({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <input type="number" value={Number.isFinite(value) ? value : 0} step={step} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} className="h-11 rounded-lg border border-border bg-white px-3 text-base font-semibold tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
    </label>
  );
}

function DarkNum({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <input type="number" value={value} step={step} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} className="h-10 rounded-lg border border-white/10 bg-white/10 px-3 text-sm font-bold text-white outline-none focus:border-primary" />
    </label>
  );
}

function TextField({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <input type="text" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-11 rounded-lg border border-border bg-white px-3 text-sm disabled:bg-slate-100" />
    </label>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 rounded-lg border border-border bg-white px-3 text-sm font-semibold">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function TimeField({ label, h, m, onChange }: { label: string; h: number; m: number; onChange: (h: number, m: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <input type="time" value={`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`} onChange={(e) => {
        const [hh, mm] = e.target.value.split(":").map(Number);
        onChange(hh, mm);
      }} className="h-11 rounded-lg border border-border bg-white px-3 text-base font-semibold tabular-nums" />
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-3 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="truncate text-sm font-medium text-slate-700">{value}</div>
    </div>
  );
}

function timeLabel(p: IrrigationProgram) {
  return `${String(p.start_hour).padStart(2, "0")}:${String(p.start_min).padStart(2, "0")}`;
}
