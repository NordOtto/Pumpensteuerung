"use client";

import { Droplet, Gauge, Activity, Zap, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useStatus } from "@/lib/ws";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function useClock() {
  const [time, setTime] = useState("--:--");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export function TopBar() {
  const { status, connected, mode } = useStatus();
  const time = useClock();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-bg1">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 md:px-5 lg:pl-28 lg:pr-8">

        {/* Logo */}
        <div className="flex items-center gap-2 mr-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-tile border border-[var(--color-green)]/20 bg-[var(--color-green-dim)] text-ok">
            <Droplet className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.08em] text-tx leading-tight">Pumpensteuerung</div>
            <div className="hidden text-[9px] uppercase tracking-[0.1em] text-tx3 sm:block">Brunnenpumpe + Bewässerung</div>
          </div>
        </div>

        {/* Live metrics strip */}
        {status && (
          <div className="hidden flex-1 items-center gap-1 md:flex overflow-hidden">
            <LiveMetric icon={<Gauge className="h-4 w-4" />} value={status.pressure_bar.toFixed(2)} unit="bar" colorClass="text-primary" />
            <div className="h-5 w-px bg-border" />
            <LiveMetric icon={<Activity className="h-4 w-4" />} value={status.flow_rate.toFixed(1)} unit="L/min" colorClass="text-ok" />
            <div className="h-5 w-px bg-border" />
            <LiveMetric icon={<Zap className="h-4 w-4" />} value={status.v20.frequency.toFixed(1)} unit="Hz" colorClass="text-warn" />
          </div>
        )}

        {/* Right side */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Badge tone={status?.v20.running ? "ok" : "muted"} pulse={status?.v20.running}>
            {status?.v20.running ? "PUMPE AN" : "PUMPE AUS"}
          </Badge>
          <Badge tone="blue">AUTO</Badge>
          <span className="num text-sm font-semibold text-tx2">{time}</span>
          <div className="flex items-center gap-1.5 text-tx3">
            {connected
              ? <Wifi className="h-4 w-4 text-ok" />
              : <WifiOff className="h-4 w-4 text-danger" />}
          </div>
        </div>
      </div>
    </header>
  );
}

function LiveMetric({ icon, value, unit, colorClass }: {
  icon: React.ReactNode; value: string; unit: string; colorClass: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1">
      <span className={cn("opacity-80", colorClass)}>{icon}</span>
      <span className={cn("num text-sm font-bold", colorClass)}>{value}</span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-tx3">{unit}</span>
    </div>
  );
}
