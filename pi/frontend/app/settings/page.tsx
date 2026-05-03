"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Droplets, Gauge, Ruler, Sparkles, SunMedium } from "lucide-react";
import type React from "react";
import { Section } from "@/components/section";
import { useStatus } from "@/lib/ws";
import { api } from "@/lib/api";
import type { IrrigationProgram, IrrigationZone, OtaStatus, Preset } from "@/lib/types";

const DAY_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const PLANTS = ["Rasen", "Hecke", "Beet", "Tropfschlauch"];
const SOILS = ["sandig", "lehmig", "schwer"];
const SUN = ["schattig", "halbsonnig", "vollsonnig"];
const GUIDE_STEPS = ["Nutzung", "Standort", "Messung", "Empfehlung"];

type SmartEtWizard = {
  plant_type: string;
  soil_type: string;
  sun_exposure: string;
  measured_mm: number;
  test_minutes: number;
  max_runs_per_week: number;
  preset: string;
};

type SmartEtRecommendation = Awaited<ReturnType<typeof api.recommendSmartEt>>;

export default function SettingsPage() {
  const { status } = useStatus();
  const [presetData, setPresetData] = useState<{ active: string; presets: Preset[] } | null>(null);
  const loadPresets = useCallback(() => {
    api.fetchPresets().then(setPresetData).catch(() => {});
  }, []);

  useEffect(() => { loadPresets(); }, [loadPresets]);

  if (!status) return <div className="flex h-64 items-center justify-center text-slate-400">Lade...</div>;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <ProgramsSection programs={status.irrigation.programs as IrrigationProgram[]} presets={presetData?.presets ?? []} />
      <PresetsSection active={status.active_preset} data={presetData} onReload={loadPresets} />
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

function ProgramsSection({ programs, presets }: { programs: IrrigationProgram[]; presets: Preset[] }) {
  const [draft, setDraft] = useState<IrrigationProgram[]>(() => clonePrograms(programs));
  const [dirty, setDirty] = useState(false);
  const [openIdx, setOpenIdx] = useState(0);
  const [editingZone, setEditingZone] = useState<{ pIdx: number; zIdx: number | null; z: IrrigationZone } | null>(null);
  const [wizard, setWizard] = useState<SmartEtWizard>({
    plant_type: "Rasen",
    soil_type: "lehmig",
    sun_exposure: "vollsonnig",
    measured_mm: 5,
    test_minutes: 10,
    max_runs_per_week: 3,
    preset: "Rasen",
  });
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardRec, setWizardRec] = useState<SmartEtRecommendation | null>(null);
  const [wizardSummary, setWizardSummary] = useState("");
  const [wizardBusy, setWizardBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!dirty) setDraft(clonePrograms(programs));
  }, [programs, dirty]);

  const updateProg = (i: number, patch: Partial<IrrigationProgram>) => {
    setDirty(true);
    setDraft((d) => d.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };

  const savePrograms = async () => {
    setErr("");
    try {
      await api.savePrograms(draft);
      setDirty(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  };

  const calculateWizard = async () => {
    setErr("");
    setWizardBusy(true);
    try {
      const rec = await api.recommendSmartEt(wizard);
      setWizardRec(rec);
      setWizardSummary(rec.summary);
      setWizardStep(3);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Empfehlung fehlgeschlagen");
    } finally {
      setWizardBusy(false);
    }
  };

  const applyWizard = async () => {
    const pIdx = openIdx;
    const program = draft[pIdx];
    if (!program) return;
    const zone = program.zones[0] ?? { ...EMPTY_ZONE, id: `zone_${Date.now()}`, name: "Zone 1" };
    const rec = wizardRec ?? await api.recommendSmartEt(wizard);
    setWizardRec(rec);
    setWizardSummary(rec.summary);
    setDirty(true);
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
    setDirty(true);
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
    setDirty(true);
    setDraft((d) => {
      const next = { ...EMPTY_PROGRAM, id: `prog_${Date.now()}`, name: `Programm ${d.length + 1}` };
      setOpenIdx(d.length);
      return [...d, next];
    });
  };

  const presetNames = presets.map((p) => p.name);
  const activeProgram = draft[openIdx];

  return (
    <Section title="Bewasserungs-Programme">
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <SmartEtGuide
          programName={activeProgram?.name || "offenes Programm"}
          step={wizardStep}
          value={wizard}
          presets={presetNames}
          recommendation={wizardRec}
          summary={wizardSummary}
          busy={wizardBusy}
          onStep={setWizardStep}
          onChange={(next) => {
            setWizard(next);
            setWizardRec(null);
            setWizardSummary("");
          }}
          onCalculate={calculateWizard}
          onApply={applyWizard}
        />

        <div className="flex flex-col gap-3">
          {draft.map((p, i) => {
            const isOpen = openIdx === i;
            const maxDeficit = Math.max(0, ...p.zones.map((z) => z.deficit_mm ?? 0));
            return (
              <motion.div
                key={p.id || i}
                className="overflow-hidden rounded-lg border border-white/70 bg-white/80 shadow-[0_14px_36px_rgba(15,23,42,0.08)] backdrop-blur"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.22 }}
              >
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
                  <motion.div
                    className="border-t border-white/70 bg-gradient-to-br from-slate-50/80 to-primary/5 p-4"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={{ duration: 0.2 }}
                  >
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
                      <NumField label="Saisonfaktor" value={p.seasonal_factor} step={0.05} hint="Multipliziert ET0: 1.0 normal, >1 mehr Wasser, <1 weniger. Der Guide berechnet ihn aus Pflanze und Sonne." onChange={(v) => updateProg(i, { seasonal_factor: v })} />
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
                  </motion.div>
                )}
              </motion.div>
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

function SmartEtGuide({
  programName,
  step,
  value,
  presets,
  recommendation,
  summary,
  busy,
  onStep,
  onChange,
  onCalculate,
  onApply,
}: {
  programName: string;
  step: number;
  value: SmartEtWizard;
  presets: string[];
  recommendation: SmartEtRecommendation | null;
  summary: string;
  busy: boolean;
  onStep: (step: number) => void;
  onChange: (value: SmartEtWizard) => void;
  onCalculate: () => void;
  onApply: () => void;
}) {
  const nextStep = Math.min(step + 1, GUIDE_STEPS.length - 1);
  const prevStep = Math.max(step - 1, 0);

  return (
    <motion.aside
      className="overflow-hidden rounded-lg border border-white/70 bg-gradient-to-br from-white/90 via-white/75 to-cyan-50/80 p-4 shadow-[0_18px_45px_rgba(37,136,235,0.14)] backdrop-blur"
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-inner">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-widest text-primary">Smart-ET Guide</div>
          <div className="mt-1 text-sm text-slate-600">
            Fuehrt die Empfehlung fuer <span className="font-semibold text-slate-900">{programName}</span>.
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-2">
        {GUIDE_STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => onStep(index)}
            className={`h-2 rounded-full transition ${index <= step ? "bg-primary shadow-[0_0_16px_rgba(37,136,235,0.35)]" : "bg-slate-200"}`}
            aria-label={label}
          />
        ))}
      </div>

      <div className="min-h-[250px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-lg border border-white/70 bg-white/70 p-3 shadow-sm"
          >
            {step === 0 && (
              <GuideStep icon={<Droplets className="h-4 w-4" />} title="Nutzung festlegen">
                <div className="grid gap-3">
                  <Select label="Nutzung" value={value.plant_type} options={PLANTS} onChange={(v) => onChange({ ...value, plant_type: v })} />
                  <Select label="Preset" value={value.preset} options={[...presets, "Benutzerdefiniert"]} onChange={(v) => onChange({ ...value, preset: v })} />
                </div>
              </GuideStep>
            )}

            {step === 1 && (
              <GuideStep icon={<SunMedium className="h-4 w-4" />} title="Standort einordnen">
                <div className="grid gap-3">
                  <Select label="Boden" value={value.soil_type} options={SOILS} onChange={(v) => onChange({ ...value, soil_type: v })} />
                  <Select label="Sonne" value={value.sun_exposure} options={SUN} onChange={(v) => onChange({ ...value, sun_exposure: v })} />
                </div>
              </GuideStep>
            )}

            {step === 2 && (
              <GuideStep icon={<Ruler className="h-4 w-4" />} title="Testlauf messen">
                <div className="grid gap-3">
                  <NumField label="Gemessene Regenhoehe mm" value={value.measured_mm} step={0.5} hint="Wasserhoehe im Regenmesser nach dem Testlauf. 1 mm entspricht 1 Liter pro m²." onChange={(v) => onChange({ ...value, measured_mm: v })} />
                  <NumField label="Testdauer min" value={value.test_minutes} step={1} hint="So lange laeuft die Zone fuer die Messung, z. B. 10 Minuten." onChange={(v) => onChange({ ...value, test_minutes: v })} />
                  <NumField label="Max/Woche" value={value.max_runs_per_week} step={1} onChange={(v) => onChange({ ...value, max_runs_per_week: v })} />
                </div>
              </GuideStep>
            )}

            {step === 3 && (
              <GuideStep icon={<Gauge className="h-4 w-4" />} title="Empfehlung pruefen">
                <div className="rounded-lg border border-primary/15 bg-gradient-to-br from-primary/10 to-ok/10 p-3 text-sm text-slate-700">
                  {summary || "Berechne eine Empfehlung aus Nutzung, Standort und Testlauf."}
                </div>
                {recommendation && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <GuideMetric label="Wasser" value={`${formatMaybe(recommendation.zone_patch.water_mm)} mm`} />
                    <GuideMetric label="Laufzeit" value={`${recommendation.zone_patch.duration_min ?? "--"} min`} />
                    <GuideMetric label="Start ab" value={`${formatMaybe(recommendation.zone_patch.min_deficit_mm)} mm`} />
                    <GuideMetric label="Rate" value={`${recommendation.precip_mm_h.toFixed(1)} mm/h`} />
                    <GuideMetric label="Sickerphase" value={recommendation.zone_patch.cycle_min ? `${recommendation.zone_patch.cycle_min} / ${recommendation.zone_patch.soak_min} min` : "aus"} />
                  </div>
                )}
              </GuideStep>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onStep(prevStep)}
          disabled={step === 0}
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-white/75 px-3 text-sm font-semibold text-slate-700 shadow-sm disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Zurueck
        </button>
        {step < 2 && (
          <button
            type="button"
            onClick={() => onStep(nextStep)}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white shadow-[0_10px_24px_rgba(37,136,235,0.25)]"
          >
            Weiter
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
        {step === 2 && (
          <button
            type="button"
            onClick={onCalculate}
            disabled={busy}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white shadow-[0_10px_24px_rgba(37,136,235,0.25)] disabled:opacity-50"
          >
            {busy ? "Berechne..." : "Empfehlung berechnen"}
            <Sparkles className="h-4 w-4" />
          </button>
        )}
        {step === 3 && (
          <button
            type="button"
            onClick={recommendation ? onApply : onCalculate}
            disabled={busy}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white shadow-[0_10px_24px_rgba(37,136,235,0.25)] disabled:opacity-50"
          >
            {recommendation ? "In Programm uebernehmen" : busy ? "Berechne..." : "Empfehlung berechnen"}
            <Check className="h-4 w-4" />
          </button>
        )}
      </div>
    </motion.aside>
  );
}

function GuideStep({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function GuideMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/80 bg-white/80 p-2 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="num mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function formatMaybe(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "--";
}

function ZoneRow({ zone, onEdit, onDelete }: { zone: IrrigationZone; onEdit: () => void; onDelete: () => void }) {
  const pct = Math.min(100, Math.round((zone.deficit_mm / Math.max(zone.target_mm, 1)) * 100));
  return (
    <div className="rounded-lg border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
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
    <motion.div
      className="rounded-lg border border-primary/20 bg-gradient-to-br from-white/90 to-primary/10 p-4 shadow-[0_14px_34px_rgba(37,136,235,0.12)] backdrop-blur"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="mb-3 text-sm font-bold text-slate-800">Zone bearbeiten</div>
      <div className="grid gap-3 md:grid-cols-3">
        <TextField label="Name" value={value.name} hint="Anzeigename, z. B. Garten, Hecke oder Schlauchtrommel." onChange={(v) => onChange({ ...value, name: v })} />
        <Select label="Preset" value={value.preset} options={[...presets, "Benutzerdefiniert"]} hint="Wird vor dem Zonenstart aktiviert, z. B. Beregnung mit Druckregelung." onChange={(v) => onChange({ ...value, preset: v })} />
        <Select label="Pflanzentyp" value={value.plant_type || "Rasen"} options={PLANTS} onChange={(v) => onChange({ ...value, plant_type: v })} />
        <NumField label="Laufzeit min" value={value.duration_min} step={1} hint="Basislaufzeit fuer diese Zone." onChange={(v) => onChange({ ...value, duration_min: v })} />
        <NumField label="Wasser mm" value={value.water_mm} step={0.5} hint="Wassermenge, die diese Basislaufzeit ungefaehr ausbringt." onChange={(v) => onChange({ ...value, water_mm: v })} />
        <NumField label="Ziel mm" value={value.target_mm} step={0.5} hint="Maximale Wassermenge, die Smart-ET je Lauf auffuellen will." onChange={(v) => onChange({ ...value, target_mm: v })} />
        <NumField label="Start ab mm" value={value.min_deficit_mm} step={0.5} hint="Smart-ET startet diese Zone erst ab diesem Wasserdefizit." onChange={(v) => onChange({ ...value, min_deficit_mm: v })} />
        <NumField label="Akt. Defizit mm" value={value.deficit_mm} step={0.5} hint="Aktueller Wasserbedarf. Wird taeglich aus ET0, Saisonfaktor und Regen fortgeschrieben." onChange={(v) => onChange({ ...value, deficit_mm: v })} />
        <NumField label="Beregnungsblock min" value={value.cycle_min} step={1} hint="0 = ohne Pause. Fuer Rasen z. B. 10-15 min laufen lassen." onChange={(v) => onChange({ ...value, cycle_min: v })} />
        <NumField label="Sickerpause min" value={value.soak_min} step={1} hint="Pause zwischen Bloecken, damit Wasser tiefer einsickert." onChange={(v) => onChange({ ...value, soak_min: v })} />
      </div>
      <HelpText>
        Die Zone ist die logische Ventil-ID fuer Home Assistant/MQTT. Beim Start sendet die Steuerung einen Befehl an <code>pumpensteuerung/irrigation/zone/&lt;zone_id&gt;/command</code>; HA schaltet dazu das passende Ventil.
      </HelpText>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-border bg-white px-4 py-2 text-sm">Abbrechen</button>
        <button type="button" onClick={onSave} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">Zone speichern</button>
      </div>
    </motion.div>
  );
}

const EMPTY_PRESET: Preset = {
  name: "",
  mode: 3,
  setpoint: 3,
  kp: 8,
  ki: 1,
  p_on: 2.2,
  p_off: 3.7,
  freq_min: 35,
  freq_max: 52,
  setpoint_hz: 45,
  expected_pressure: 3,
};

const MODE_LABEL: Record<number, string> = {
  0: "Druckregelung",
  1: "Durchflussregelung",
  2: "Fixe Frequenz",
  3: "Hahnmodus",
};
const MODE_OPTIONS = [
  { value: "0", label: "Druckregelung" },
  { value: "1", label: "Durchflussregelung" },
  { value: "2", label: "Fixe Frequenz" },
  { value: "3", label: "Hahnmodus" },
];

function PresetsSection({ active, data, onReload }: { active: string; data: { active: string; presets: Preset[] } | null; onReload: () => void }) {
  const [editing, setEditing] = useState<Preset | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [err, setErr] = useState("");
  if (!data) return <Section title="Presets"><div className="p-4 text-sm text-slate-400">Lade...</div></Section>;

  const save = async () => {
    if (!editing) return;
    setErr("");
    try {
      await api.savePreset(editing);
      onReload();
      setEditing(null);
      setIsNew(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  };
  const mode = editing?.mode ?? 0;
  const setpointLabel = mode === 1 ? "Soll-Durchfluss L/min" : "Solldruck bar";
  const setpointHint = mode === 1
    ? "Ziel-Durchfluss fuer die PI-Regelung."
    : mode === 0
      ? "Zieldruck, den der PI-Regler waehrend des Laufens halten soll."
      : "Nur fuer Druck-/Durchflussregelung relevant.";

  return (
    <Section title="Pumpen-Presets">
      <div className="rounded-lg border border-white/70 bg-white/80 shadow-[0_14px_36px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="divide-y divide-border">
          {data.presets.map((p) => (
            <div key={p.name} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-48 flex-1">
                <span className="font-semibold text-slate-900">{p.name}</span>
                <span className="ml-2 text-xs text-slate-500">{MODE_LABEL[p.mode]}</span>
                {(data.active === p.name || active === p.name) && <span className="ml-2 rounded bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">aktiv</span>}
              </div>
              <button type="button" onClick={() => api.applyPreset(p.name).then(onReload)} className="rounded border border-border px-3 py-1 text-xs font-semibold">Anwenden</button>
              <button type="button" onClick={() => { setEditing({ ...p }); setIsNew(false); }} className="rounded border border-border px-3 py-1 text-xs font-semibold">Bearbeiten</button>
              <button type="button" onClick={() => api.deletePreset(p.name).then(onReload).catch((e) => setErr(e.message))} className="rounded border border-danger/40 px-3 py-1 text-xs font-semibold text-danger">Loschen</button>
            </div>
          ))}
        </div>
        {editing && (
          <div className="border-t border-border bg-slate-50 p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <TextField label="Name" value={editing.name} disabled={!isNew} onChange={(v) => setEditing({ ...editing, name: v })} />
              <Select
                label="Modus"
                value={String(editing.mode)}
                options={MODE_OPTIONS.map((o) => o.value)}
                optionLabels={Object.fromEntries(MODE_OPTIONS.map((o) => [o.value, o.label]))}
                hint="Druck: PI auf bar. Durchfluss: PI auf L/min. FixHz: sofort feste Drehzahl. Hahn: Ein/Aus ueber Druck, feste Drehzahl."
                onChange={(v) => setEditing({ ...editing, mode: Number(v) as 0 | 1 | 2 | 3 })}
              />
              {mode !== 2 && mode !== 3 && (
                <NumField label={setpointLabel} value={editing.setpoint} step={0.1} hint={setpointHint} onChange={(v) => setEditing({ ...editing, setpoint: v })} />
              )}
              {(mode === 2 || mode === 3) && (
                <NumField label="Feste Drehzahl Hz" value={editing.setpoint_hz} step={1} hint={mode === 3 ? "Hahnmodus: diese Hz laufen zwischen Ein- und Ausschaltdruck." : "FixHz: Pumpe laeuft direkt mit dieser Frequenz."} onChange={(v) => setEditing({ ...editing, setpoint_hz: v })} />
              )}
              {mode === 3 && (
                <>
                  <NumField label="Einschaltdruck bar" value={editing.p_on} step={0.1} hint="Unter diesem Druck startet die Pumpe im Hahnmodus." onChange={(v) => setEditing({ ...editing, p_on: v })} />
                  <NumField label="Ausschaltdruck bar" value={editing.p_off} step={0.1} hint="Ab diesem Druck stoppt die Pumpe im Hahnmodus." onChange={(v) => setEditing({ ...editing, p_off: v })} />
                </>
              )}
              {mode === 2 && (
                <NumField label="Schutzdruck bar" value={editing.expected_pressure} step={0.1} hint="FixHz-Schutz: oberhalb dieses Drucks plus Hysterese wird gestoppt." onChange={(v) => setEditing({ ...editing, expected_pressure: v })} />
              )}
              {(mode === 0 || mode === 1) && (
                <>
                  <NumField label="Kp Reaktion" value={editing.kp} step={0.5} hint="Direkte Reaktion auf Abweichung. Hoeher = schneller, kann unruhiger werden." onChange={(v) => setEditing({ ...editing, kp: v })} />
                  <NumField label="Ki Nachregelung" value={editing.ki} step={0.1} hint="Korrigiert bleibende Abweichung ueber Zeit. Zu hoch kann Schwingen erzeugen." onChange={(v) => setEditing({ ...editing, ki: v })} />
                  <NumField label="Hz min" value={editing.freq_min} step={1} hint="Untergrenze der automatischen Frequenzregelung." onChange={(v) => setEditing({ ...editing, freq_min: v })} />
                  <NumField label="Hz max" value={editing.freq_max} step={1} hint="Obergrenze der automatischen Frequenzregelung." onChange={(v) => setEditing({ ...editing, freq_max: v })} />
                </>
              )}
            </div>
            {mode === 3 && (
              <HelpText>
                Hahnmodus ist fuer Hahn, Schlauchtrommel und Giesskanne gedacht: unter Einschaltdruck startet die Pumpe mit fester Hz, ab Ausschaltdruck stoppt sie wieder. PI-Regelung bleibt dabei aus.
              </HelpText>
            )}
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
      <div className="rounded-lg border border-white/70 bg-gradient-to-br from-white/90 to-sky-50/70 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Regler aktiv</span>
          <Toggle checked={enabled} onChange={(v) => api.setPressure({ enabled: v })} />
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <NumField label="Solldruck bar" value={draft.setpoint} step={0.1} hint="Zieldruck fuer Druckregelung. Dient auch als Mitte fuer Ein-/Ausschaltdruck." onChange={(v) => setDraft({ ...draft, setpoint: v })} />
          <NumField label="Einschaltdruck bar" value={draft.p_on} step={0.1} hint="Hahn-/Druckbetrieb: darunter startet die Pumpe." onChange={(v) => setDraft({ ...draft, p_on: v })} />
          <NumField label="Ausschaltdruck bar" value={draft.p_off} step={0.1} hint="Hahn-/Druckbetrieb: ab hier stoppt die Pumpe." onChange={(v) => setDraft({ ...draft, p_off: v })} />
          <NumField label="Hz min" value={draft.freq_min} step={1} hint="Untergrenze fuer automatische PI-Regelung." onChange={(v) => setDraft({ ...draft, freq_min: v })} />
          <NumField label="Hz max" value={draft.freq_max} step={1} hint="Obergrenze fuer automatische PI-Regelung und Fallback fuer Hahnmodus." onChange={(v) => setDraft({ ...draft, freq_max: v })} />
          <NumField label="Kp Reaktion" value={draft.kp} step={0.5} hint="Direkter Regelanteil. Hoeher = schneller, aber unruhiger." onChange={(v) => setDraft({ ...draft, kp: v })} />
          <NumField label="Ki Nachregelung" value={draft.ki} step={0.1} hint="Korrigiert bleibende Abweichung. Zu hoch kann Schwingen erzeugen." onChange={(v) => setDraft({ ...draft, ki: v })} />
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
      <div className="rounded-lg border border-white/70 bg-gradient-to-br from-white/90 to-cyan-50/60 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.08)] backdrop-blur">
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
  const [tokenDraft, setTokenDraft] = useState("");
  const [tokenBusy, setTokenBusy] = useState(false);
  const [tokenMessage, setTokenMessage] = useState("");
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

  const saveToken = async () => {
    setTokenBusy(true);
    setTokenMessage("");
    try {
      const res = await api.otaTokenSet(tokenDraft);
      setTokenDraft("");
      setTokenMessage(res.message || "Token gespeichert");
      const next = await api.otaStatus();
      setOta(next);
    } catch (e) {
      setTokenMessage(e instanceof Error ? e.message : "Token konnte nicht gespeichert werden");
      api.otaStatus().then(setOta).catch(() => {});
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
      setTokenMessage("Token entfernt");
      const next = await api.otaStatus();
      setOta(next);
    } catch (e) {
      setTokenMessage(e instanceof Error ? e.message : "Token konnte nicht entfernt werden");
    } finally {
      setTokenBusy(false);
    }
  };

  const tokenTone =
    !ota?.token_configured ? "text-slate-500 bg-slate-100 border-slate-200"
    : ota.token_ok === true ? "text-ok bg-ok/10 border-ok/20"
    : ota.token_ok === false ? "text-danger bg-danger/10 border-danger/20"
    : "text-warn bg-warn/10 border-warn/20";
  const tokenLabel =
    !ota?.token_configured ? "Kein Token"
    : ota.token_ok === true ? "Token OK"
    : ota.token_ok === false ? "Token fehlerhaft"
    : "Token hinterlegt";

  return (
    <Section title="System-Update">
      <div className="rounded-lg border border-white/70 bg-white/80 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="grid gap-3 md:grid-cols-3">
          <Info label="Installiert" value={ota?.current_version ?? fw} />
          <Info label="Neueste Version" value={ota?.latest_version ?? "-"} />
          <Info label="Commit" value={ota?.latest_commit?.slice(0, 12) ?? "-"} />
        </div>
        <div className="mt-4 rounded-lg border border-white/70 bg-gradient-to-br from-white/90 to-sky-50/70 p-3 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-slate-900">GitHub Token</div>
              <div className="text-xs text-slate-500">Wird fuer private Repositories benoetigt. Der Token wird nicht angezeigt.</div>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${tokenTone}`}>
              {tokenLabel}
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
            <input
              type="password"
              value={tokenDraft}
              autoComplete="off"
              placeholder={ota?.token_configured ? "Neuen Token eintragen zum Ersetzen" : "GitHub Fine-Grained Token"}
              onChange={(e) => setTokenDraft(e.target.value)}
              className="h-11 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-slate-900 outline-none ring-primary/20 focus:ring-4"
            />
            <button
              type="button"
              onClick={saveToken}
              disabled={tokenBusy || tokenDraft.trim().length < 20}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              Speichern & pruefen
            </button>
            {ota?.token_configured && (
              <button
                type="button"
                onClick={deleteToken}
                disabled={tokenBusy}
                className="rounded-lg border border-danger/30 px-4 py-2 text-sm font-bold text-danger disabled:opacity-40"
              >
                Entfernen
              </button>
            )}
          </div>
          {(tokenMessage || ota?.token_message) && (
            <div className="mt-2 text-xs text-slate-500">{tokenMessage || ota?.token_message}</div>
          )}
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
      <div className="flex items-center justify-between rounded-lg border border-white/70 bg-gradient-to-br from-white/90 to-sky-50/70 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.08)] backdrop-blur">
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

function NumField({ label, value, step, hint, onChange }: { label: string; value: number; step: number; hint?: string; onChange: (v: number) => void }) {
  const [text, setText] = useState(() => String(Number.isFinite(value) ? value : 0));

  useEffect(() => {
    setText(String(Number.isFinite(value) ? value : 0));
  }, [value]);

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type="number"
        value={text}
        step={step}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (next === "" || next === "-" || next === "." || next === ",") return;
          const parsed = Number.parseFloat(next.replace(",", "."));
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        onBlur={() => {
          const parsed = Number.parseFloat(text.replace(",", "."));
          if (Number.isFinite(parsed)) {
            const normalized = String(parsed);
            setText(normalized);
            onChange(parsed);
          } else {
            setText(String(Number.isFinite(value) ? value : 0));
          }
        }}
        className="h-11 rounded-lg border border-border bg-white px-3 text-base font-semibold tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {hint && <span className="text-[11px] leading-snug text-slate-500">{hint}</span>}
    </label>
  );
}

function TextField({ label, value, disabled, hint, onChange }: { label: string; value: string; disabled?: boolean; hint?: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <input type="text" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-11 rounded-lg border border-border bg-white px-3 text-sm disabled:bg-slate-100" />
      {hint && <span className="text-[11px] leading-snug text-slate-500">{hint}</span>}
    </label>
  );
}

function Select({ label, value, options, optionLabels, hint, onChange }: { label: string; value: string; options: string[]; optionLabels?: Record<string, string>; hint?: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 rounded-lg border border-border bg-white px-3 text-sm font-semibold">
        {options.map((o) => <option key={o} value={o}>{optionLabels?.[o] ?? o}</option>)}
      </select>
      {hint && <span className="text-[11px] leading-snug text-slate-500">{hint}</span>}
    </label>
  );
}

function HelpText({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-primary/15 bg-primary/5 p-3 text-xs leading-relaxed text-slate-600">
      {children}
    </div>
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
    <div className="rounded-lg border border-white/70 bg-white/80 p-3 shadow-sm backdrop-blur">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="truncate text-sm font-medium text-slate-700">{value}</div>
    </div>
  );
}

function timeLabel(p: IrrigationProgram) {
  return `${String(p.start_hour).padStart(2, "0")}:${String(p.start_min).padStart(2, "0")}`;
}
