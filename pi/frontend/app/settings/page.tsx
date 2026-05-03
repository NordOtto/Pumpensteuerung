"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useStatus } from "@/lib/ws";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { IrrigationProgram, OtaStatus, Preset } from "@/lib/types";

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
function ProgramsSettings({ programs, presets }: { programs: IrrigationProgram[]; presets: Preset[] }) {
  const [openIdx, setOpenIdx] = useState(0);
  const presetNames = presets.map((p) => p.name);

  return (
    <div className="flex flex-col gap-2">
      {programs.map((p, i) => (
        <div key={p.id} className="overflow-hidden rounded-card border border-border bg-bg1">
          <button type="button" onClick={() => setOpenIdx(openIdx === i ? -1 : i)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left">
            <Toggle checked={p.enabled} onChange={() => {}} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-tx">{p.name}</div>
              <div className="mt-0.5 text-[10px] text-tx3">
                {p.mode === "smart_et" ? "Smart ET" : "Fest"} · Start {String(p.start_hour).padStart(2, "0")}:{String(p.start_min).padStart(2, "0")} · {p.zones.length} Zone(n)
              </div>
            </div>
            <Badge tone={p.last_skip_reason ? "warn" : "ok"}>{p.last_skip_reason || "bereit"}</Badge>
          </button>

          {openIdx === i && (
            <div className="border-t border-border p-4">
              <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <SettingField label="Name" value={p.name} />
                <SettingField label="Modus" value={p.mode === "smart_et" ? "Smart ET" : "Fest"} />
                <SettingField label="Start" value={`${String(p.start_hour).padStart(2, "0")}:${String(p.start_min).padStart(2, "0")}`} />
                <SettingField label="Max/Woche" value={String(p.max_runs_per_week)} />
              </div>

              <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.08em] text-tx3">Wochentage</div>
              <div className="mb-3 flex gap-1.5">
                {DAY_NAMES.map((d, idx) => (
                  <div key={d} className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-tile border text-[10px] font-bold",
                    p.days[idx]
                      ? "border-[var(--color-blue)]/35 bg-[var(--color-blue-dim)] text-primary"
                      : "border-border bg-bg3 text-tx3"
                  )}>{d}</div>
                ))}
              </div>

              <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.08em] text-tx3">Zonen</div>
              {p.zones.map((z) => (
                <div key={z.id} className="mb-1.5 flex items-center gap-3 rounded-tile border border-border bg-bg2 px-3 py-2">
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-tx">{z.name}</div>
                    <div className="text-[10px] text-tx3">{z.plant_type} · {z.duration_min} min · {z.preset || "Normal"}</div>
                  </div>
                  <button type="button" className="rounded-tile border border-border bg-bg1 px-2.5 py-1 text-[11px] font-semibold text-tx2">
                    Bearbeiten
                  </button>
                </div>
              ))}

              <div className="mt-3 flex gap-2">
                <button type="button" className="rounded-tile bg-primary px-4 py-2 text-xs font-bold text-white">
                  Speichern
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Presets ──────────────────────────────────────────────────────────────────
const MODE_LABEL: Record<number, string> = { 0: "Druckregelung", 1: "Durchflussregelung", 2: "Fixe Frequenz", 3: "Hahnmodus" };

function PresetsSettings({ active, data, onReload }: {
  active: string;
  data: { active: string; presets: Preset[] } | null;
  onReload: () => void;
}) {
  const [editing, setEditing] = useState<Preset | null>(null);
  if (!data) return <div className="rounded-card border border-border bg-bg1 p-4 text-sm text-tx3">Lade...</div>;

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
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="border-t border-border p-4">
          <div className="mb-3 text-xs font-bold text-tx">Preset: {editing.name}</div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {[
              ["Solldruck bar", editing.setpoint.toFixed(1)],
              ["Kp Reaktion", editing.kp.toFixed(1)],
              ["Ki Nachregelung", editing.ki.toFixed(2)],
              ["Hz min", String(editing.freq_min)],
              ["Hz max", String(editing.freq_max)],
            ].map(([l, v]) => <SettingField key={l} label={l} value={v} />)}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)}
              className="rounded-tile border border-border bg-bg1 px-4 py-2 text-xs font-semibold">
              Abbrechen
            </button>
            <button type="button" onClick={() => { api.savePreset(editing).then(onReload); setEditing(null); }}
              className="rounded-tile bg-primary px-4 py-2 text-xs font-bold text-white">
              Speichern
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-border px-4 py-3">
        <button type="button"
          className="rounded-tile border border-dashed border-[var(--color-blue)] px-4 py-2 text-xs font-bold text-primary">
          + Neuer Preset
        </button>
      </div>
    </div>
  );
}

// ── PI-Regler ─────────────────────────────────────────────────────────────────
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
  const [checked, setChecked] = useState(false);

  useEffect(() => { api.otaStatus().then(setOta).catch(() => {}); }, []);

  const upH = Math.floor(sys.uptime / 3600);
  const upD = Math.floor(upH / 24);

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
        <div className="flex gap-2">
          <button type="button" disabled={checking}
            onClick={() => { setChecking(true); api.otaCheck().finally(() => { setChecking(false); setChecked(true); api.otaStatus().then(setOta).catch(() => {}); }); }}
            className="inline-flex items-center gap-2 rounded-tile border border-border bg-bg2 px-4 py-2 text-xs font-bold text-tx2 disabled:opacity-50">
            <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} />
            {checking ? "Prüfe…" : "Auf Updates prüfen"}
          </button>
          <button type="button" disabled
            className="inline-flex items-center gap-2 rounded-tile bg-primary px-4 py-2 text-xs font-bold text-white opacity-40">
            Update installieren
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
