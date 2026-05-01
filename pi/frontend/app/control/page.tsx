"use client";

import { useState, useEffect } from "react";
import { Section } from "@/components/section";
import { HoldButton } from "@/components/hold-button";
import { StatusBadge } from "@/components/status-badge";
import { useStatus } from "@/lib/ws";
import { api } from "@/lib/api";
import { formatBar, formatHz, cn } from "@/lib/utils";
import type { Preset } from "@/lib/types";

export default function ControlPage() {
  const { status } = useStatus();
  const [hzDraft, setHzDraft] = useState<number | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [activePreset, setActivePreset] = useState<string>("");

  useEffect(() => {
    api.fetchPresets().then((r) => {
      setPresets(r.presets);
      setActivePreset(r.active);
    }).catch(() => {});
  }, []);

  if (!status) return <div className="flex h-64 items-center justify-center text-slate-400">Lade…</div>;

  const v = status.v20;
  const hzMin = Math.round(status.pi.freq_min || 35);
  const hzMax = Math.round(status.pi.freq_max || 60);
  const hz = hzDraft ?? Math.max(hzMin, Math.round(v.freq_setpoint || v.frequency || hzMin));
  const fixedMode = status.ctrl_mode === 2;

  const MODE_LABEL: Record<number, string> = { 0: "Druck", 1: "Durchfluss", 2: "FixHz" };

  const handleApplyPreset = async (name: string) => {
    await api.applyPreset(name);
    setActivePreset(name);
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Preset-Selector */}
      <Section title="Preset">
        <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
            Aktiv: <span className="font-semibold text-slate-900">{activePreset || status.active_preset || "Normal"}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => handleApplyPreset(p.name)}
                className={cn(
                  "rounded-xl border px-5 py-3 text-sm font-semibold transition active:scale-[0.97]",
                  (activePreset || status.active_preset) === p.name
                    ? "border-primary bg-primary text-white shadow-sm"
                    : "border-border bg-white text-slate-700 hover:bg-slate-50"
                )}
              >
                <div>{p.name}</div>
                <div className="text-[10px] font-normal opacity-70">{MODE_LABEL[p.mode] ?? "—"}</div>
              </button>
            ))}
            {presets.length === 0 && (
              <span className="text-sm text-slate-400">Keine Presets konfiguriert — in Einstellungen anlegen.</span>
            )}
          </div>
        </div>
      </Section>

      <Section title="Manuelle Pumpensteuerung">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <StatusBadge tone={v.fault ? "danger" : v.running ? "ok" : "muted"} pulse={v.running}>
              {v.fault ? "Fehler" : v.running ? "Läuft" : "Aus"}
            </StatusBadge>
            <span className="text-sm text-slate-500">
              {formatHz(v.frequency)} Hz · {formatBar(status.pressure_bar)} bar
            </span>
          </div>

          <div className="flex flex-wrap gap-3">
            <HoldButton
              label="Start (halten)"
              tone="ok"
              onTrigger={() => api.v20Start()}
              disabled={v.fault || status.vacation.enabled}
            />
            <button
              type="button"
              onClick={() => api.v20Stop()}
              className="h-20 min-w-32 rounded-xl border border-border bg-white px-6 text-lg font-semibold uppercase text-slate-700 transition active:scale-[0.98] hover:bg-slate-50"
            >
              Stop
            </button>
            <button
              type="button"
              onClick={() => api.v20Reset()}
              disabled={!v.fault}
              className="h-20 min-w-32 rounded-xl border border-warn/40 bg-warn/10 px-6 text-lg font-semibold uppercase text-warn transition active:scale-[0.98] disabled:opacity-40"
            >
              Fault Reset
            </button>
          </div>

          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Sollfrequenz
              </span>
              <span className="num-xl text-primary">{hz} Hz</span>
            </div>
            <input
              type="range"
              min={hzMin}
              max={hzMax}
              step={1}
              value={hz}
              onChange={(e) => setHzDraft(parseInt(e.target.value))}
              className="h-3 w-full cursor-pointer appearance-none rounded-full bg-slate-100 accent-primary"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => api.v20Freq(hz)}
                disabled={!fixedMode && status.pi.enabled}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {fixedMode ? "Senden" : "Nur in FixHz-Preset änderbar"}
              </button>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Manuelle Zonen-Bewässerung">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {status.irrigation.programs.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">{p.name}</span>
                <span className="text-xs text-slate-500">
                  {p.zones.length} Zone{p.zones.length === 1 ? "" : "n"}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => api.runProgram(p.id, true)}
                  className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-white"
                >
                  Start
                </button>
                <button
                  type="button"
                  onClick={() => api.stopProgram(p.id)}
                  className="flex-1 rounded-lg border border-border bg-white py-2 text-sm font-semibold text-slate-700"
                >
                  Stop
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
