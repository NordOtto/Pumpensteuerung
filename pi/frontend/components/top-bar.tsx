"use client";

import { Activity, Droplet, Gauge, Radio, Sprout, Wifi, WifiOff } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { useStatus } from "@/lib/ws";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const MODE_STYLES: Record<string, string> = {
  AUTO: "ok",
  MANUELL: "blue",
  FEHLER: "danger",
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
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-bg1 shadow-card">
      <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-2 px-3 py-2 md:px-5 lg:pl-28 lg:pr-8">
        <div className="flex items-center gap-2.5 text-primary">
          <div className="flex h-10 w-10 items-center justify-center rounded-tile border border-border bg-bg2 text-primary">
            <Droplet className="h-5 w-5" />
          </div>
          <div>
            <span className="block text-sm font-bold uppercase tracking-tight text-tx">Pumpensteuerung</span>
            <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-tx3 sm:block">Brunnenpumpe + Bewaesserung</span>
          </div>
        </div>
        {status && (
          <div className="hidden items-center gap-1.5 md:flex">
            <Metric icon={<Gauge className="h-3.5 w-3.5" />} label="bar" value={status.pressure_bar.toFixed(2)} />
            <Metric icon={<Activity className="h-3.5 w-3.5" />} label="L/min" value={status.flow_rate.toFixed(1)} />
            <Metric icon={<Sprout className="h-3.5 w-3.5" />} label="ET" value={status.irrigation.weather.et0_mm?.toFixed(1) ?? "--"} />
          </div>
        )}
        <div className="flex items-center gap-3">
          <Badge tone={MODE_STYLES[mode] as "ok" | "blue" | "danger"}>{mode}</Badge>
          <span className="num text-sm font-medium text-tx2">{time}</span>
          <div className="flex items-center gap-1.5 text-tx3">
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
    <div className="flex min-w-[70px] items-center gap-2 rounded-tile border border-border bg-bg2 px-2.5 py-1.5">
      <span className="text-primary">{icon}</span>
      <span>
        <span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-tx3">{label}</span>
        <span className="num block text-[13px] font-semibold text-tx">{value}</span>
      </span>
    </div>
  );
}
