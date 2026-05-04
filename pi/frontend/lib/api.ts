/** Minimaler REST-Client zum Backend. */
import type { IrrigationProgram, OtaStatus, Preset, WeatherConfig } from "./types";

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

  // ── Presets ────────────────────────────────────────────
  fetchPresets: () =>
    request<{ active: string; presets: Preset[] }>("/api/presets"),
  savePreset: (preset: Partial<Preset>) =>
    request("/api/presets", { method: "POST", body: JSON.stringify(preset) }),
  deletePreset: (name: string) =>
    request(`/api/presets/${encodeURIComponent(name)}`, { method: "DELETE" }),
  applyPreset: (name: string) =>
    request("/api/preset/apply", { method: "POST", body: JSON.stringify({ name }) }),

  // ── Bewässerung ────────────────────────────────────────
  fetchPrograms: () =>
    request<{ programs: IrrigationProgram[] }>("/api/irrigation/programs"),
  savePrograms: (programs: IrrigationProgram[]) =>
    request("/api/irrigation/programs", {
      method: "POST",
      body: JSON.stringify({ programs }),
    }),
  runProgram: (program_id: string, force_weather = true, duration_min?: number) =>
    request("/api/irrigation/run", {
      method: "POST",
      body: JSON.stringify({ program_id, force_weather, duration_min }),
    }),
  stopProgram: (program_id?: string) =>
    request("/api/irrigation/stop", {
      method: "POST",
      body: JSON.stringify({ program_id: program_id ?? "" }),
    }),
  resumeProgram: () =>
    request("/api/irrigation/resume", {
      method: "POST",
    }),
  recommendSmartEt: (payload: Record<string, unknown>) =>
    request<{
      zone_patch: Partial<import("./types").IrrigationZone>;
      program_patch: Partial<import("./types").IrrigationProgram>;
      precip_mm_h: number;
      summary: string;
    }>("/api/irrigation/wizard/recommend", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ── History ────────────────────────────────────────────
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

  weatherConfig: () => request<WeatherConfig>("/api/irrigation/weather/config"),
  saveWeatherConfig: (payload: Record<string, unknown>) =>
    request<WeatherConfig>("/api/irrigation/weather/config", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  refreshWeather: () =>
    request<{ ok: boolean; message: string }>("/api/irrigation/weather/refresh", { method: "POST" }),

  // ── OTA ─────────────────────────────────────────────────
  otaStatus: () => request<OtaStatus>("/api/ota/status"),
  otaCheck: () => request<{ ok: true }>("/api/ota/check", { method: "POST" }),
  otaInstall: (tag?: string) =>
    request<{ ok: true }>("/api/ota/install", {
      method: "POST",
      body: JSON.stringify({ tag: tag ?? "" }),
    }),
  otaRollback: () => request<{ ok: true }>("/api/ota/rollback", { method: "POST" }),
  otaTokenSet: (token: string) =>
    request<{ ok: true; configured: boolean; token_ok: boolean; message: string }>("/api/ota/token", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  otaTokenDelete: () => request<{ ok: true; configured: boolean }>("/api/ota/token", { method: "DELETE" }),
  otaLog: () =>
    request<{ lines: string[]; running: boolean; exit_code: number | null }>("/api/ota/log"),
};
