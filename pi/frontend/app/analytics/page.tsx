"use client";

import { useEffect, useRef, useState } from "react";
import { Section } from "@/components/section";
import { useStatus } from "@/lib/ws";
import { api } from "@/lib/api";

type Sample = { ts: number; pressure: number; flow: number; frequency: number; running: boolean };
type Range = { label: string; seconds: number };

const RANGES: Range[] = [
  { label: "1 h", seconds: 3600 },
  { label: "6 h", seconds: 21600 },
  { label: "24 h", seconds: 86400 },
  { label: "7 T", seconds: 604800 },
];

function HistoryChart({
  samples, accessor, color, unit, label,
}: {
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
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const values = samples.map(accessor);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const tMin = samples[0].ts;
    const tMax = samples[samples.length - 1].ts;
    const tRange = tMax - tMin || 1;

    // Achsen / Grid
    ctx.strokeStyle = "#e5eaf0";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = (h * i) / 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Linie
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    samples.forEach((s, i) => {
      const x = ((s.ts - tMin) / tRange) * w;
      const y = h - ((accessor(s) - min) / range) * (h - 12) - 6;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill
    ctx.fillStyle = color + "1a";
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // Y-Achse Labels
    ctx.fillStyle = "#5b6b7a";
    ctx.font = "10px ui-sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${max.toFixed(1)} ${unit}`, 4, 12);
    ctx.fillText(`${min.toFixed(1)} ${unit}`, 4, h - 4);
  }, [samples, accessor, color, unit]);

  const last = samples[samples.length - 1];
  return (
    <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>
        <span className="num text-sm font-medium text-slate-700">
          {last ? `${accessor(last).toFixed(2)} ${unit}` : "—"}
        </span>
      </div>
      <canvas ref={ref} className="h-48 w-full" />
    </div>
  );
}

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
    // Live-Refresh alle 30 s solange Tab offen
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [range]);

  const history = status?.irrigation.history ?? [];

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <Section
        title="Verlauf"
        action={
          <div className="flex gap-1 rounded-lg border border-border bg-white p-1">
            {RANGES.map((r) => (
              <button
                key={r.label}
                onClick={() => setRange(r)}
                className={
                  "rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-wider transition " +
                  (r.seconds === range.seconds ? "bg-primary text-white" : "text-slate-500")
                }
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      >
        {loading && samples.length === 0 ? (
          <div className="rounded-lg border border-border bg-white p-8 text-center text-sm text-slate-400">
            Lade Verlauf…
          </div>
        ) : samples.length < 2 ? (
          <div className="rounded-lg border border-border bg-white p-8 text-center text-sm text-slate-400">
            Noch nicht genug Daten — Backend sammelt alle 5 s einen Sample.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <HistoryChart
              samples={samples}
              accessor={(s) => s.pressure}
              color="#2588eb"
              unit="bar"
              label="Druck"
            />
            <HistoryChart
              samples={samples}
              accessor={(s) => s.flow}
              color="#14c957"
              unit="L/min"
              label="Durchfluss"
            />
            <HistoryChart
              samples={samples}
              accessor={(s) => s.frequency}
              color="#ffa000"
              unit="Hz"
              label="Pumpenfrequenz"
            />
          </div>
        )}
      </Section>

      <Section title="Bewässerungs-Historie">
        <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
          {history.length === 0 ? (
            <div className="text-sm text-slate-500">Noch keine Läufe protokolliert.</div>
          ) : (
            <ul className="divide-y divide-border">
              {history.slice(0, 30).map((h, i) => (
                <li key={i} className="flex items-baseline justify-between gap-2 py-2 text-sm">
                  <span className="font-medium text-slate-700">
                    {String(h.program_name ?? h.program_id ?? "—")}
                  </span>
                  <span className="text-xs text-slate-500">
                    {String(h.reason ?? h.result ?? "")}
                  </span>
                  <span className="num text-slate-700">
                    {h.runtime_s ? `${Math.round(Number(h.runtime_s) / 60)} min` : "—"}
                  </span>
                  <span className="text-xs text-slate-400">
                    {h.at ? new Date(String(h.at)).toLocaleString("de-DE") : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </div>
  );
}
