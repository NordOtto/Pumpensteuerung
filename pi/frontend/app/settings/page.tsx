"use client";

import { useState, useEffect, useRef } from "react";
import { Section } from "@/components/section";
import { useStatus } from "@/lib/ws";
import { api } from "@/lib/api";
import type { Preset, IrrigationProgram, IrrigationZone, OtaStatus } from "@/lib/types";

export default function SettingsPage() {
  const { status } = useStatus();
  if (!status) return <div className="flex h-64 items-center justify-center text-slate-400">Lade…</div>;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
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
      <PresetsSection active={status.active_preset} />
      <ProgramsSection programs={status.irrigation.programs as IrrigationProgram[]} />
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

function PiSection({
  setpoint, pOn, pOff, kp, ki, freqMin, freqMax, enabled, spike,
}: {
  setpoint: number; pOn: number; pOff: number; kp: number; ki: number;
  freqMin: number; freqMax: number; enabled: boolean; spike: boolean;
}) {
  const [draft, setDraft] = useState({ setpoint, p_on: pOn, p_off: pOff, kp, ki, freq_min: freqMin, freq_max: freqMax });
  return (
    <Section title="PI-Druckregelung">
      <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Regler aktiv</span>
          <Toggle checked={enabled} onChange={(v) => api.setPressure({ enabled: v })} />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <NumField label="Sollwert (bar)" value={draft.setpoint} step={0.1} onChange={(v) => setDraft({ ...draft, setpoint: v })} />
          <NumField label="p_on (bar)" value={draft.p_on} step={0.1} onChange={(v) => setDraft({ ...draft, p_on: v })} />
          <NumField label="p_off (bar)" value={draft.p_off} step={0.1} onChange={(v) => setDraft({ ...draft, p_off: v })} />
          <NumField label="Kp" value={draft.kp} step={0.5} onChange={(v) => setDraft({ ...draft, kp: v })} />
          <NumField label="Ki" value={draft.ki} step={0.1} onChange={(v) => setDraft({ ...draft, ki: v })} />
          <NumField label="Hz min" value={draft.freq_min} step={1} onChange={(v) => setDraft({ ...draft, freq_min: v })} />
          <NumField label="Hz max" value={draft.freq_max} step={1} onChange={(v) => setDraft({ ...draft, freq_max: v })} />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-slate-600">
            Hahn-zu-Erkennung: {spike ? "an" : "aus"}
          </span>
          <button
            type="button"
            onClick={() => api.setPressure(draft)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            Speichern
          </button>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => api.resetDryrun()}
            className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-2 text-sm font-semibold text-warn"
          >
            Trockenlauf-Sperre zurücksetzen
          </button>
        </div>
      </div>
    </Section>
  );
}

function TimeguardSection({ tg }: { tg: { enabled: boolean; start_hour: number; start_min: number; end_hour: number; end_min: number; days: boolean[]; allowed: boolean } }) {
  const [d, setD] = useState({ start_hour: tg.start_hour, start_min: tg.start_min, end_hour: tg.end_hour, end_min: tg.end_min, days: [...tg.days] });
  const dayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  return (
    <Section title="Zeitfenster">
      <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">
            Aktiv {tg.allowed ? "(im Fenster)" : "(gesperrt)"}
          </span>
          <Toggle checked={tg.enabled} onChange={(v) => api.setTimeguard({ enabled: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TimeField label="Start" h={d.start_hour} m={d.start_min} onChange={(h, m) => setD({ ...d, start_hour: h, start_min: m })} />
          <TimeField label="Ende" h={d.end_hour} m={d.end_min} onChange={(h, m) => setD({ ...d, end_hour: h, end_min: m })} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {dayNames.map((name, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                const days = [...d.days];
                days[i] = !days[i];
                setD({ ...d, days });
              }}
              className={
                "h-10 w-10 rounded-lg text-sm font-semibold uppercase transition " +
                (d.days[i] ? "bg-primary text-white" : "bg-slate-100 text-slate-500")
              }
            >
              {name}
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => api.setTimeguard(d)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            Speichern
          </button>
        </div>
      </div>
    </Section>
  );
}

const EMPTY_PRESET: Preset = {
  name: "",
  mode: 0,
  setpoint: 3.0,
  kp: 8.0,
  ki: 1.0,
  freq_min: 35,
  freq_max: 52,
  setpoint_hz: 40,
  expected_pressure: 3.0,
};

const MODE_LABEL: Record<number, string> = { 0: "Druck", 1: "Durchfluss", 2: "FixHz" };

function PresetsSection({ active }: { active: string }) {
  const [data, setData] = useState<{ active: string; presets: Preset[] } | null>(null);
  const [editing, setEditing] = useState<Preset | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [err, setErr] = useState("");

  const load = () => api.fetchPresets().then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  if (!data) return (
    <Section title="Presets">
      <div className="text-sm text-slate-400 p-4">Lade…</div>
    </Section>
  );

  const handleSave = async () => {
    if (!editing) return;
    setErr("");
    try {
      await api.savePreset(editing as unknown as Partial<Preset>);
      await load();
      setEditing(null);
      setIsNew(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Fehler beim Speichern");
    }
  };

  const handleDelete = async (name: string) => {
    setErr("");
    try {
      await api.deletePreset(name);
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
    }
  };

  const handleApply = async (name: string) => {
    await api.applyPreset(name);
    await load();
  };

  const startNew = () => {
    setEditing({ ...EMPTY_PRESET });
    setIsNew(true);
  };

  return (
    <Section title="Presets">
      <div className="rounded-lg border border-border bg-white shadow-sm">
        {/* Preset-Liste */}
        <div className="divide-y divide-border">
          {data.presets.map((p) => (
            <div key={p.name} className="flex items-center gap-3 px-5 py-3">
              <div className="flex-1">
                <span className="font-semibold text-slate-900">{p.name}</span>
                <span className="ml-2 text-xs text-slate-400">{MODE_LABEL[p.mode]}</span>
                {(data.active === p.name || active === p.name) && (
                  <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">aktiv</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleApply(p.name)}
                className="rounded-lg border border-border px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Anwenden
              </button>
              <button
                type="button"
                onClick={() => { setEditing({ ...p }); setIsNew(false); }}
                className="rounded-lg border border-border px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Bearbeiten
              </button>
              <button
                type="button"
                onClick={() => handleDelete(p.name)}
                className="rounded-lg border border-danger/40 px-3 py-1 text-xs font-semibold text-danger hover:bg-danger/5"
              >
                Löschen
              </button>
            </div>
          ))}
          {data.presets.length === 0 && (
            <div className="px-5 py-4 text-sm text-slate-400">Noch keine Presets angelegt.</div>
          )}
        </div>

        {/* Inline-Editor */}
        {editing && (
          <div className="border-t border-border bg-slate-50 p-5">
            <div className="mb-3 text-sm font-bold text-slate-700">{isNew ? "Neuer Preset" : `Bearbeiten: ${editing.name}`}</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                <span className="text-xs uppercase tracking-wider text-slate-500">Name</span>
                <input
                  type="text"
                  value={editing.name}
                  disabled={!isNew}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="h-10 rounded-lg border border-border bg-white px-3 text-sm disabled:bg-slate-100"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wider text-slate-500">Modus</span>
                <select
                  value={editing.mode}
                  onChange={(e) => setEditing({ ...editing, mode: Number(e.target.value) as 0 | 1 | 2 })}
                  className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
                >
                  <option value={0}>Druck</option>
                  <option value={1}>Durchfluss</option>
                  <option value={2}>FixHz</option>
                </select>
              </label>
              <NumField label="Setpoint" value={editing.setpoint} step={0.1} onChange={(v) => setEditing({ ...editing, setpoint: v })} />
              <NumField label="Kp" value={editing.kp} step={0.5} onChange={(v) => setEditing({ ...editing, kp: v })} />
              <NumField label="Ki" value={editing.ki} step={0.1} onChange={(v) => setEditing({ ...editing, ki: v })} />
              <NumField label="Hz min" value={editing.freq_min} step={1} onChange={(v) => setEditing({ ...editing, freq_min: v })} />
              <NumField label="Hz max" value={editing.freq_max} step={1} onChange={(v) => setEditing({ ...editing, freq_max: v })} />
              {editing.mode === 2 && (
                <NumField label="Soll-Hz" value={editing.setpoint_hz} step={1} onChange={(v) => setEditing({ ...editing, setpoint_hz: v })} />
              )}
              <NumField label="Erw. Druck (bar)" value={editing.expected_pressure} step={0.1} onChange={(v) => setEditing({ ...editing, expected_pressure: v })} />
            </div>
            {err && <div className="mt-2 text-sm text-danger">{err}</div>}
            <div className="mt-4 flex gap-2 justify-end">
              <button type="button" onClick={() => { setEditing(null); setErr(""); }} className="rounded-lg border border-border px-4 py-2 text-sm text-slate-700">Abbrechen</button>
              <button type="button" onClick={handleSave} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">Speichern</button>
            </div>
          </div>
        )}

        <div className="border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={startNew}
            disabled={!!editing}
            className="rounded-lg border border-dashed border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-40"
          >
            + Neuer Preset
          </button>
        </div>
      </div>
    </Section>
  );
}

// ── Programm/Zonen-Editor ─────────────────────────────────────

const EMPTY_ZONE: IrrigationZone = {
  id: "",
  name: "",
  enabled: true,
  duration_min: 15,
  water_mm: 5,
  deficit_mm: 0,
  target_mm: 20,
  preset: "Normal",
  plant_type: "",
};

const EMPTY_PROGRAM: IrrigationProgram = {
  id: "",
  name: "",
  enabled: true,
  mode: "fixed",
  start_hour: 6,
  start_min: 0,
  zones: [],
  last_run_at: null,
  last_skip_reason: "",
};

const DAY_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function ProgramsSection({ programs }: { programs: IrrigationProgram[] }) {
  const [draft, setDraft] = useState<IrrigationProgram[]>(() =>
    programs.map((p) => ({ ...p, zones: p.zones.map((z) => ({ ...z })) }))
  );
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [editingZone, setEditingZone] = useState<{ pIdx: number; zIdx: number | null; z: IrrigationZone } | null>(null);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    setErr("");
    try {
      await api.savePrograms(draft);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Fehler beim Speichern");
    }
  };

  const updateProg = (i: number, patch: Partial<IrrigationProgram>) => {
    setDraft((d) => d.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  };

  const addProgram = () => {
    const id = `prog_${Date.now()}`;
    setDraft((d) => [...d, { ...EMPTY_PROGRAM, id, name: `Programm ${d.length + 1}` }]);
    setOpenIdx(draft.length);
  };

  const removeProgram = (i: number) => {
    setDraft((d) => d.filter((_, idx) => idx !== i));
    setOpenIdx(null);
  };

  const saveZone = () => {
    if (!editingZone) return;
    const { pIdx, zIdx, z } = editingZone;
    const id = z.id || `zone_${Date.now()}`;
    setDraft((d) =>
      d.map((p, i) => {
        if (i !== pIdx) return p;
        const zones =
          zIdx === null
            ? [...p.zones, { ...z, id }]
            : p.zones.map((zz, j) => (j === zIdx ? { ...z, id: zz.id } : zz));
        return { ...p, zones };
      })
    );
    setEditingZone(null);
  };

  const removeZone = (pIdx: number, zIdx: number) => {
    setDraft((d) =>
      d.map((p, i) =>
        i === pIdx ? { ...p, zones: p.zones.filter((_, j) => j !== zIdx) } : p
      )
    );
  };

  return (
    <Section title="Bewässerungs-Programme">
      <div className="flex flex-col gap-3">
        {draft.map((p, i) => (
          <div key={p.id || i} className="rounded-lg border border-border bg-white shadow-sm">
            {/* Programm-Header */}
            <div
              className="flex cursor-pointer items-center gap-3 px-5 py-3"
              onClick={() => setOpenIdx(openIdx === i ? null : i)}
            >
              <Toggle checked={p.enabled} onChange={(v) => updateProg(i, { enabled: v })} />
              <div className="flex-1">
                <span className="font-semibold text-slate-900">{p.name || "Unbenannt"}</span>
                <span className="ml-2 text-xs text-slate-400">
                  {p.mode === "smart_et" ? "Smart ET" : "Fest"} · {String(p.start_hour).padStart(2, "0")}:{String(p.start_min).padStart(2, "0")} Uhr · {p.zones.length} Zone(n)
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeProgram(i); }}
                className="rounded-lg border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/5"
              >
                Löschen
              </button>
              <span className="text-slate-400">{openIdx === i ? "▲" : "▼"}</span>
            </div>

            {/* Programm-Details */}
            {openIdx === i && (
              <div className="border-t border-border bg-slate-50 p-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <label className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                    <span className="text-xs uppercase tracking-wider text-slate-500">Name</span>
                    <input
                      type="text"
                      value={p.name}
                      onChange={(e) => updateProg(i, { name: e.target.value })}
                      className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-slate-500">Modus</span>
                    <select
                      value={p.mode}
                      onChange={(e) => updateProg(i, { mode: e.target.value as "fixed" | "smart_et" })}
                      className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
                    >
                      <option value="fixed">Fest</option>
                      <option value="smart_et">Smart ET</option>
                    </select>
                  </label>
                  <TimeField
                    label="Startzeit"
                    h={p.start_hour}
                    m={p.start_min}
                    onChange={(h, m) => updateProg(i, { start_hour: h, start_min: m })}
                  />
                </div>

                {/* Tage */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {DAY_NAMES.map((name, d) => {
                    const days = (p as unknown as Record<string, unknown>).days as boolean[] | undefined;
                    const active = days ? days[d] : true;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          const cur = (p as unknown as Record<string, unknown>).days as boolean[] | undefined ?? Array(7).fill(true);
                          const next = [...cur];
                          next[d] = !next[d];
                          updateProg(i, { days: next } as unknown as Partial<IrrigationProgram>);
                        }}
                        className={"h-9 w-9 rounded-lg text-sm font-semibold uppercase transition " + (active ? "bg-primary text-white" : "bg-slate-100 text-slate-500")}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>

                {/* Zonen */}
                <div className="mt-4">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Zonen</div>
                  <div className="flex flex-col gap-2">
                    {p.zones.map((z, j) => (
                      <div key={z.id || j} className="flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm">
                        <div className="flex-1">
                          <span className="font-semibold text-slate-800">{z.name || "Zone"}</span>
                          <span className="ml-2 text-slate-400">{z.duration_min} min · {z.preset || "Normal"} · {z.plant_type || "—"}</span>
                        </div>
                        <button type="button" onClick={() => setEditingZone({ pIdx: i, zIdx: j, z: { ...z } })} className="rounded border border-border px-2 py-0.5 text-xs hover:bg-slate-50">Bearbeiten</button>
                        <button type="button" onClick={() => removeZone(i, j)} className="rounded border border-danger/40 px-2 py-0.5 text-xs text-danger hover:bg-danger/5">✕</button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setEditingZone({ pIdx: i, zIdx: null, z: { ...EMPTY_ZONE } })}
                      className="rounded-lg border border-dashed border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5"
                    >
                      + Zone hinzufügen
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Zonen-Editor Modal (inline) */}
        {editingZone && (
          <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-5">
            <div className="mb-3 text-sm font-bold text-slate-700">
              {editingZone.zIdx === null ? "Neue Zone" : `Zone bearbeiten: ${editingZone.z.name}`}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                <span className="text-xs uppercase tracking-wider text-slate-500">Name</span>
                <input
                  type="text"
                  value={editingZone.z.name}
                  onChange={(e) => setEditingZone({ ...editingZone, z: { ...editingZone.z, name: e.target.value } })}
                  className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
                />
              </label>
              <NumField label="Laufzeit (min)" value={editingZone.z.duration_min} step={1} onChange={(v) => setEditingZone({ ...editingZone, z: { ...editingZone.z, duration_min: v } })} />
              <NumField label="Wasser (mm)" value={editingZone.z.water_mm} step={0.5} onChange={(v) => setEditingZone({ ...editingZone, z: { ...editingZone.z, water_mm: v } })} />
              <NumField label="Ziel (mm)" value={editingZone.z.target_mm} step={0.5} onChange={(v) => setEditingZone({ ...editingZone, z: { ...editingZone.z, target_mm: v } })} />
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wider text-slate-500">Preset</span>
                <input
                  type="text"
                  value={editingZone.z.preset}
                  onChange={(e) => setEditingZone({ ...editingZone, z: { ...editingZone.z, preset: e.target.value } })}
                  className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wider text-slate-500">Pflanzentyp</span>
                <input
                  type="text"
                  value={editingZone.z.plant_type}
                  onChange={(e) => setEditingZone({ ...editingZone, z: { ...editingZone.z, plant_type: e.target.value } })}
                  className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <button type="button" onClick={() => setEditingZone(null)} className="rounded-lg border border-border px-4 py-2 text-sm text-slate-700">Abbrechen</button>
              <button type="button" onClick={saveZone} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">Zone speichern</button>
            </div>
          </div>
        )}

        {err && <div className="text-sm text-danger px-1">{err}</div>}

        <div className="flex gap-3">
          <button type="button" onClick={addProgram} className="rounded-lg border border-dashed border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5">
            + Neues Programm
          </button>
          <button type="button" onClick={handleSave} className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white">
            Alle Programme speichern
          </button>
        </div>
      </div>
    </Section>
  );
}

// ── OTA-Sektion ───────────────────────────────────────────────

function OtaSection({ fw }: { fw: string }) {
  const [ota, setOta] = useState<OtaStatus | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [polling, setPolling] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.otaStatus().then(setOta).catch(() => {});
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const handleCheck = async () => {
    setLog([]);
    setPolling(true);
    try {
      await api.otaCheck();
    } catch {
      setPolling(false);
      return;
    }
    pollTimer.current = setInterval(async () => {
      const r = await api.otaLog().catch(() => null);
      if (!r) return;
      setLog(r.lines);
      if (!r.running) {
        clearInterval(pollTimer.current!);
        setPolling(false);
        api.otaStatus().then(setOta).catch(() => {});
      }
    }, 2000);
  };

  return (
    <Section title="System-Update">
      <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-800">
              Version: <span className="font-mono">{ota?.current_version ?? fw}</span>
            </div>
            {ota?.last_check && (
              <div className="text-xs text-slate-500">
                Zuletzt geprüft: {new Date(ota.last_check).toLocaleString("de-DE")}
              </div>
            )}
            {ota?.update_available && (
              <div className="mt-1 text-xs font-semibold text-ok">Update verfügbar!</div>
            )}
          </div>
          <button
            type="button"
            onClick={handleCheck}
            disabled={polling || (ota?.running ?? false)}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {polling || ota?.running ? "Prüft…" : "Auf Updates prüfen"}
          </button>
        </div>
        {log.length > 0 && (
          <pre
            ref={logRef}
            className="mt-4 max-h-48 overflow-y-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-300"
          >
            {log.join("\n")}
          </pre>
        )}
      </div>
    </Section>
  );
}

function VacationSection({ enabled }: { enabled: boolean }) {
  return (
    <Section title="Urlaubsmodus">
      <div className="flex items-center justify-between rounded-lg border border-border bg-white p-5 shadow-sm">
        <div>
          <div className="font-semibold text-slate-700">Pumpe gesperrt</div>
          <div className="text-xs text-slate-500">Alle Bewässerungen pausiert.</div>
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Info label="Firmware" value={fw} />
        <Info label="IP" value={ip || "—"} />
        <Info label="Uptime" value={`${days}d ${hrs}h ${min}m`} />
        <Info label="Verbindungen" value={`${mqtt ? "MQTT ✓" : "MQTT ✗"} · ${rtu ? "RTU ✓" : "RTU ✗"}`} />
      </div>
    </Section>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={
        "relative h-7 w-12 rounded-full transition " + (checked ? "bg-primary" : "bg-slate-300")
      }
    >
      <span
        className={
          "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition " +
          (checked ? "left-6" : "left-1")
        }
      />
    </button>
  );
}

function NumField({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-12 rounded-lg border border-border bg-white px-3 text-lg font-semibold tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </label>
  );
}

function TimeField({ label, h, m, onChange }: { label: string; h: number; m: number; onChange: (h: number, m: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type="time"
        value={`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`}
        onChange={(e) => {
          const [hh, mm] = e.target.value.split(":").map(Number);
          onChange(hh, mm);
        }}
        className="h-12 rounded-lg border border-border bg-white px-3 text-lg font-semibold tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-3 shadow-sm">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm font-medium text-slate-700">{value}</div>
    </div>
  );
}
