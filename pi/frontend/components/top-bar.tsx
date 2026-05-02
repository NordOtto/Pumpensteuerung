"use client";

import { Activity, Droplet, Gauge, Radio, Sprout, Wifi, WifiOff } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { useStatus } from "@/lib/ws";
import { cn } from "@/lib/utils";

const MODE_STYLES: Record<string, string> = {
  AUTO: "bg-ok/10 text-ok",
  MANUELL: "bg-primary/10 text-primary",
  FEHLER: "bg-danger/10 text-danger",
};

function useClock() {
  const [time, setTime] = useState("--:--");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export function TopBar() {
  const { status, connected, mode } = useStatus();
  const time = useClock();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/70 bg-white/80 shadow-[0_10px_35px_rgba(15,23,42,0.07)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 md:px-6 lg:pl-28 lg:pr-8">
        <div className="flex items-center gap-3 text-primary">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/15 bg-gradient-to-br from-primary/15 to-cyan-50 text-primary shadow-inner">
            <Droplet className="h-5 w-5" />
          </div>
          <div>
            <span className="block text-sm font-bold uppercase tracking-tight text-slate-900">Pumpensteuerung</span>
            <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:block">Brunnenpumpe + Bewaesserung</span>
          </div>
        </div>
        {status && (
          <div className="hidden items-center gap-1 rounded-lg border border-white/70 bg-white/65 p-1 shadow-inner backdrop-blur md:flex">
            <Metric icon={<Gauge className="h-3.5 w-3.5" />} label="bar" value={status.pressure_bar.toFixed(2)} />
            <Metric icon={<Activity className="h-3.5 w-3.5" />} label="L/min" value={status.flow_rate.toFixed(1)} />
            <Metric icon={<Sprout className="h-3.5 w-3.5" />} label="ET" value={status.irrigation.weather.et0_mm?.toFixed(1) ?? "--"} />
          </div>
        )}
        <div className="flex items-center gap-3">
          <span className={cn("rounded-full border border-current/10 px-3 py-1 text-xs font-bold uppercase shadow-sm", MODE_STYLES[mode])}>
            {mode}
          </span>
          <span className="num text-sm font-medium text-slate-700">{time}</span>
          <div className="flex items-center gap-1.5 text-slate-500">
            {connected ? (
              <Wifi className="h-4 w-4 text-ok" />
            ) : (
              <WifiOff className="h-4 w-4 text-danger" />
            )}
            <Radio className={cn("h-4 w-4", status?.sys.mqtt ? "text-ok" : "text-warn")} />
          </div>
        </div>
      </div>
    </header>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span className="flex h-8 items-center gap-1 rounded-md px-2 text-xs text-slate-600">
      <span className="text-primary">{icon}</span>
      <span className="num font-semibold text-slate-900">{value}</span>
      <span className="uppercase text-slate-400">{label}</span>
    </span>
  );
}
