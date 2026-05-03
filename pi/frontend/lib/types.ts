/** Spiegel des Backend-State (siehe pi/backend/app/state.py).
 *  Nur die Felder, die im UI gebraucht werden — bewusst kein 1:1-Mapping.
 */

export interface V20State {
  frequency: number;
  current: number;
  voltage: number;
  power: number;
  running: boolean;
  connected: boolean;
  fault: boolean;
  fault_code: number;
  status: string;
  freq_setpoint: number;
}

export interface PIState {
  enabled: boolean;
  setpoint: number;
  p_on: number;
  p_off: number;
  kp: number;
  ki: number;
  freq_min: number;
  freq_max: number;
  active: boolean;
  pump_state: 0 | 1 | 2;
  dry_run_locked: boolean;
  ctrl_mode: 0 | 1 | 2 | 3;
  spike_enabled: boolean;
}

export interface TimeguardState {
  enabled: boolean;
  start_hour: number;
  start_min: number;
  end_hour: number;
  end_min: number;
  days: boolean[];
  allowed: boolean;
  time: string;
}

export interface IrrigationZone {
  id: string;
  name: string;
  enabled: boolean;
  duration_min: number;
  water_mm: number;
  min_deficit_mm: number;
  deficit_mm: number;
  target_mm: number;
  cycle_min: number;
  soak_min: number;
  preset: string;
  plant_type: string;
}

export interface IrrigationProgram {
  id: string;
  name: string;
  enabled: boolean;
  mode: "fixed" | "smart_et";
  start_hour: number;
  start_min: number;
  days: boolean[];
  seasonal_factor: number;
  weather_enabled: boolean;
  max_runs_per_week: number;
  min_runtime_factor: number;
  max_runtime_factor: number;
  thresholds?: {
    skip_rain_mm: number;
    reduce_rain_mm: number;
    wind_max_kmh: number;
    soil_moisture_skip_pct: number;
    et0_default_mm: number;
  };
  zones: IrrigationZone[];
  last_run_at: string | null;
  last_skip_reason: string;
}

export interface IrrigationDecision {
  allowed: boolean;
  reason: string;
  program_id: string;
  next_start: string | null;
  active_zone: string;
  active_program: string;
  running: boolean;
  active_zone_name: string;
  active_program_name: string;
  active_preset: string;
  phase: "idle" | "run" | "soak";
  started_by: "" | "manual" | "auto";
  remaining_s: number;
  zone_remaining_s: number;
  ends_at: string | null;
  water_budget_mm: number;
  runtime_factor: number;
}

export interface WeatherState {
  forecast_rain_mm: number;
  rain_24h_mm: number;
  temp_c: number | null;
  humidity_pct: number | null;
  wind_kmh: number;
  wind_gust_kmh?: number | null;
  solar_w_m2?: number | null;
  uv_index?: number | null;
  et0_mm: number | null;
  soil_moisture_pct: number | null;
  updated_at: string | null;
}

export interface SysState {
  uptime: number;
  mqtt: boolean;
  fw: string;
  rtu_connected: boolean;
  ip: string;
}

export interface Preset {
  name: string;
  mode: 0 | 1 | 2 | 3;
  setpoint: number;
  kp: number;
  ki: number;
  p_on: number;
  p_off: number;
  freq_min: number;
  freq_max: number;
  setpoint_hz: number;
  expected_pressure: number;
}

export interface OtaStatus {
  running: boolean;
  exit_code: number | null;
  update_available: boolean;
  current_version: string;
  latest_version: string | null;
  latest_commit: string | null;
  latest_date: string | null;
  changelog: string | null;
  last_check: string | null;
  phase: string;
}

export interface AppStatus {
  v20: V20State;
  pressure_bar: number;
  flow_rate: number;
  flow_estimated: boolean;
  water_temp: number | null;
  temperature: number | null;
  pi: PIState;
  timeguard: TimeguardState;
  active_preset: string;
  ctrl_mode: 0 | 1 | 2 | 3;
  vacation: { enabled: boolean };
  irrigation: {
    programs: IrrigationProgram[];
    weather: WeatherState;
    decision: IrrigationDecision;
    zones: Record<string, { state?: string; ends_at?: string | null }>;
    history: Array<Record<string, unknown>>;
  };
  sys: SysState;
}

export type SystemMode = "AUTO" | "MANUELL" | "FEHLER";

export interface Warning {
  id: string;
  level: "warn" | "danger";
  message: string;
}
