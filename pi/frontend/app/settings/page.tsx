"use client";

import { useState } from "react";
import { Section } from "@/components/section";
import { useStatus } from "@/lib/ws";
import { api } from "@/lib/api";

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

function PresetsSection({ active }: { active: string }) {
  const { status } = useStatus();
  const presets = (status?.irrigation.programs ?? []).map((p) => p.name); // Platzhalter; echte Liste über REST
  return (
    <Section title="Aktives Preset">
      <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
        <div className="text-sm text-slate-500">Aktiv:</div>
        <div className="num-xl text-primary">{active || "Normal"}</div>
        <div className="mt-3 text-xs text-slate-500">
          Preset-Editor folgt — aktuell über REST `/api/presets` erreichbar.
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => api.applyPreset("Normal")}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm"
          >
            Normal anwenden
          </button>
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => api.applyPreset(p)}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm"
            >
              {p}
            </button>
          ))}
        </div>
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
