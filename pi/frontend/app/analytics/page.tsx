"use client";

import { useEffect, useRef, useState } from "react";
import { useStatus } from "@/lib/ws";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Sample = { ts: number; pressure: number; flow: number; frequency: number; running: boolean };
type Range = { label: string; seconds: number };

const RANGES: Range[] = [
  { label: "1 h",  seconds: 3600 },
  { label: "6 h",  seconds: 21600 },
  { label: "24 h", seconds: 86400 },
  { label: "7 T",  seconds: 604800 },
];

export default function AnalyticsPage() {
  const { status } = useStatus();
  const [range, setRange] = useState<Range>(RANGES[0]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await api.pressureHistory(range.seconds, 360);
        if (!cancelled) setSamples(data.samples);
      } catch {
        if (!cancelled) setSamples([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 5_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [range]);

  const liveSample = status ? {
    ts: Math.floor(Date.now() / 1000),
    pressure: status.pressure_bar,
    flow: status.flow_rate,
    frequency: status.v20.frequency,
    running: status.v20.running,
  } : null;

  const chartSamples = liveSample && samples.length
    ? [...samples.filter((s) => Math.abs(s.ts - liveSample.ts) > 2), liveSample]
    : samples;

  const history = status?.irrigation.history ?? [];

  return (
    <div className="flex flex-col gap-2.5">

      {/* Charts section */}
      <div className="rounded-card border border-border bg-bg1 p-4">
        <div className="mb-3.5 flex items-center justify-between">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-tx3">Verlauf</div>
          <div className="flex gap-1 rounded-tile border border-border bg-bg2 p-1">
            {RANGES.map((r) => (
              <button key={r.label} type="button" onClick={() => setRange(r)}
                className={cn(
                  "rounded-md px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition",
                  r.seconds === range.seconds ? "bg-primary text-white" : "text-tx3 hover:text-tx"
                )}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {loading && chartSamples.length === 0 ? (
          <div className="py-8 text-center text-sm text-tx3">Lade Verlauf...</div>
        ) : chartSamples.length < 2 ? (
          <div className="py-8 text-center text-sm text-tx3">Noch nicht genug Daten. Backend sammelt alle 5 s einen Sample.</div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-3">
            <HistoryChart samples={chartSamples} accessor={(s) => s.pressure} color="var(--color-blue)"  unit="bar"   label="Druck" />
            <HistoryChart samples={chartSamples} accessor={(s) => s.flow}     color="var(--color-green)" unit="L/min" label="Durchfluss" />
            <HistoryChart samples={chartSamples} accessor={(s) => s.frequency} color="var(--color-amber)" unit="Hz"   label="Pumpenfrequenz" />
          </div>
        )}
      </div>

      {/* History list */}
      <div className="rounded-card border border-border bg-bg1 p-4">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-tx3">Bewässerungs-Historie</div>
        {history.length === 0 ? (
          <div className="text-sm text-tx3">Noch keine Läufe protokolliert.</div>
        ) : (
          <div className="flex flex-col gap-0">
            {history.slice(0, 30).map((h, i) => {
              const reason = String(h.reason ?? h.result ?? "");
              const accentColor = reason === "Regen-Skip" || reason === "Regen Skip"
                ? "var(--color-blue)"
                : reason === "Manuell"
                  ? "var(--color-amber)"
                  : "var(--color-green)";
              return (
                <div key={i} className={cn(
                  "flex items-center gap-3 py-2",
                  i < history.length - 1 ? "border-b border-border2" : ""
                )}>
                  <div className="h-8 w-0.5 shrink-0 rounded-full" style={{ background: accentColor }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-tx">{String(h.program_name ?? h.program_id ?? "-")}</div>
                    <div className="text-[10px] text-tx3">{reason}</div>
                  </div>
                  <span className="num shrink-0 text-xs text-tx2">
                    {h.runtime_s ? `${Math.round(Number(h.runtime_s) / 60)} min` : "—"}
                  </span>
                  <span className="shrink-0 text-[10px] text-tx3">
                    {h.at ? new Date(String(h.at)).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryChart({ samples, accessor, color, unit, label }: {
  samples: Sample[];
  accessor: (s: Sample) => number;
  color: string;
  unit: string;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c || samples.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const values = samples.map(accessor);
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;
    const tMin = samples[0].ts, tMax = samples[samples.length - 1].ts;
    const tRange = tMax - tMin || 1;

    const borderColor = getComputedStyle(document.documentElement).getPropertyValue("--color-border").trim() || "#dde2ea";
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = (h * i) / 3;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const lineColor = color.startsWith("var(")
      ? getComputedStyle(document.documentElement).getPropertyValue(color.slice(4, -1)).trim()
      : color;

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    samples.forEach((s, i) => {
      const x = ((s.ts - tMin) / tRange) * w;
      const y = h - ((accessor(s) - min) / range) * (h - 16) - 8;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = lineColor + "18";
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-text3").trim() || "#9aa5b4";
    ctx.font = `10px "Inter", ui-sans-serif, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(`${max.toFixed(1)} ${unit}`, 4, 12);
    ctx.fillText(`${min.toFixed(1)} ${unit}`, 4, h - 4);
  }, [samples, accessor, color, unit]);

  const last = samples[samples.length - 1];
  return (
    <div className="rounded-tile border border-border bg-bg2 p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-tx3">{label}</span>
        <span className="num text-xs font-medium text-tx2">
          {last ? `${accessor(last).toFixed(2)} ${unit}` : "—"}
        </span>
      </div>
      <canvas ref={ref} style={{ height: 160, width: "100%", display: "block" }} />
    </div>
  );
}
