"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AppStatus, SystemMode, Warning } from "./types";

interface StatusCtx {
  status: AppStatus | null;
  connected: boolean;
  mode: SystemMode;
  warnings: Warning[];
}

const Ctx = createContext<StatusCtx>({
  status: null,
  connected: false,
  mode: "AUTO",
  warnings: [],
});

function deriveMode(s: AppStatus | null): SystemMode {
  if (!s) return "AUTO";
  if (s.v20.fault) return "FEHLER";
  if (s.pi.dry_run_locked) return "FEHLER";
  if (!s.pi.enabled || s.ctrl_mode === 2) return "MANUELL";
  return "AUTO";
}

function deriveWarnings(s: AppStatus | null): Warning[] {
  if (!s) return [];
  const out: Warning[] = [];
  if (s.v20.fault) {
    out.push({
      id: "v20-fault",
      level: "danger",
      message: `V20 Störung (Code ${s.v20.fault_code})`,
    });
  }
  if (s.pi.dry_run_locked) {
    out.push({ id: "dry-run", level: "danger", message: "Trockenlauf-Sperre aktiv" });
  }
  if (s.v20.running && s.flow_rate < 1 && s.pressure_bar < s.pi.setpoint) {
    out.push({ id: "no-flow", level: "warn", message: "Pumpe läuft, kein Durchfluss" });
  }
  if (!s.sys.mqtt) {
    out.push({ id: "mqtt-off", level: "warn", message: "MQTT-Broker nicht verbunden" });
  }
  if (!s.sys.rtu_connected) {
    out.push({ id: "rtu-off", level: "warn", message: "Modbus-RTU zum V20 nicht verbunden" });
  }
  if (!s.timeguard.allowed && s.timeguard.enabled) {
    out.push({ id: "timeguard", level: "warn", message: "Zeitfenster gesperrt" });
  }
  return out;
}

export function StatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${proto}//${location.host}/ws`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) {
          reconnectTimer.current = setTimeout(connect, 2000);
        }
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg?.type === "status" && msg?.state) {
            setStatus((prev) => ({ ...(prev ?? {}), ...(msg.state as AppStatus) } as AppStatus));
          }
        } catch {
          /* ignore malformed */
        }
      };
    }

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  return (
    <Ctx.Provider
      value={{
        status,
        connected,
        mode: deriveMode(status),
        warnings: deriveWarnings(status),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useStatus = () => useContext(Ctx);
