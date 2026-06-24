"use client";

import { Gauge, Activity, Zap, Fan } from "lucide-react";
import { useStatus } from "@/lib/ws";
import { cn } from "@/lib/utils";

export function TopBar() {
  const { status } = useStatus();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-bg1">
      <div className="mx-auto flex h-12 max-w-7xl items-center gap-1 px-2 md:px-5 lg:pl-28 lg:pr-8">
        {status ? (
          <>
            <LiveMetric icon={<Gauge className="h-3.5 w-3.5" />} value={status.pressure_bar.toFixed(2)} unit="bar" colorClass="text-primary" />
            <div className="h-4 w-px bg-border" />
            <LiveMetric icon={<Activity className="h-3.5 w-3.5" />} value={status.flow_rate.toFixed(1)} unit="L/min" colorClass="text-ok" />
            <div className="h-4 w-px bg-border" />
            <LiveMetric icon={<Zap className="h-3.5 w-3.5" />} value={status.v20.frequency.toFixed(1)} unit="Hz" colorClass="text-warn" />
            {status.fan && (
              <>
                <div className="h-4 w-px bg-border" />
                <FanIndicator running={status.fan.running} pwm={status.fan.mode === "pwm_auto" ? status.fan.current_pwm : null} />
              </>
            )}
            {status.active_preset && (
              <span className="ml-auto truncate rounded-tile border border-border bg-bg2 px-2 py-0.5 text-[10px] font-semibold text-tx3">
                {status.active_preset}
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-tx3">Verbinde…</span>
        )}
      </div>
    </header>
  );
}

function FanIndicator({ running, pwm }: { running: boolean; pwm: number | null }) {
  return (
    <div className="flex items-center gap-1 px-1.5 py-1">
      <Fan
        className={cn("h-3.5 w-3.5", running ? "animate-spin text-ok [animation-duration:1.5s]" : "text-tx3 opacity-50")}
      />
      {running && pwm !== null && (
        <span className="num text-xs font-bold text-ok">{pwm}<span className="text-[9px] text-tx3">%</span></span>
      )}
    </div>
  );
}

function LiveMetric({ icon, value, unit, colorClass }: {
  icon: React.ReactNode; value: string; unit: string; colorClass: string;
}) {
  return (
    <div className="flex items-center gap-1 px-1.5 py-1">
      <span className={cn("opacity-70", colorClass)}>{icon}</span>
      <span className={cn("num text-xs font-bold", colorClass)}>{value}</span>
      <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-tx3">{unit}</span>
    </div>
  );
}
