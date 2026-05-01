"use client";

import { Droplet, Wifi, WifiOff, Radio } from "lucide-react";
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
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-2 text-primary">
          <Droplet className="h-5 w-5" />
          <span className="text-sm font-semibold uppercase tracking-tight">Pumpensteuerung</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("rounded-full px-3 py-1 text-xs font-bold uppercase", MODE_STYLES[mode])}>
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
