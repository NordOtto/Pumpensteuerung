/** Minimaler REST-Client zum Backend. */

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? ` – ${text}` : ""}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  v20Start: () => request<{ ok: true }>("/api/v20/start", { method: "POST" }),
  v20Stop: () => request<{ ok: true }>("/api/v20/stop", { method: "POST" }),
  v20Reset: () => request<{ ok: true }>("/api/v20/reset", { method: "POST" }),
  v20Freq: (hz: number) =>
    request("/api/v20/freq", { method: "POST", body: JSON.stringify({ hz }) }),

  setPressure: (cfg: Record<string, unknown>) =>
    request("/api/pressure", { method: "POST", body: JSON.stringify(cfg) }),
  resetDryrun: () => request("/api/pressure/reset_dryrun", { method: "POST" }),

  setTimeguard: (cfg: Record<string, unknown>) =>
    request("/api/timeguard", { method: "POST", body: JSON.stringify(cfg) }),

  setVacation: (enabled: boolean) =>
    request("/api/vacation/set", { method: "POST", body: JSON.stringify({ enabled }) }),

  applyPreset: (name: string) =>
    request("/api/preset/apply", { method: "POST", body: JSON.stringify({ name }) }),

  runProgram: (program_id: string, force_weather = true) =>
    request("/api/irrigation/run", {
      method: "POST",
      body: JSON.stringify({ program_id, force_weather }),
    }),
  stopProgram: (program_id?: string) =>
    request("/api/irrigation/stop", {
      method: "POST",
      body: JSON.stringify({ program_id: program_id ?? "" }),
    }),

  pressureHistory: (seconds = 3600, maxPoints = 360) =>
    request<{
      samples: Array<{
        ts: number;
        pressure: number;
        flow: number;
        frequency: number;
        running: boolean;
      }>;
    }>(`/api/history/pressure?seconds=${seconds}&max_points=${maxPoints}`),
};
