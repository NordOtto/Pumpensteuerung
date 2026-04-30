'use strict';

// ============================================================
//  irrigation.js - Bewaesserungscomputer
//
//  Backend ist die zentrale Logik. Home Assistant schaltet die
//  Zonen ueber MQTT-Kommandos und liefert Wetterdaten zurueck.
// ============================================================

const fs      = require('fs').promises;
const path    = require('path');
const state   = require('./state');
const mqtt    = require('./mqttClient');
const tg      = require('./timeguard');
const presets = require('./presets');

const DATA_DIR = process.env.DATA_DIR || '/data';
const PROGRAMS_FILE = path.join(DATA_DIR, 'irrigation_programs.json');
const WEATHER_FILE  = path.join(DATA_DIR, 'irrigation_weather.json');
const HISTORY_FILE  = path.join(DATA_DIR, 'irrigation_history.json');

const BASE = 'pumpensteuerung';
const HISTORY_LIMIT = 250;
const TICK_MS = 30000;

const DEFAULT_PROGRAMS = [{
  id: 'garten',
  name: 'Garten',
  enabled: false,
  days: [true, true, true, true, true, false, false],
  start_hour: 6,
  start_min: 0,
  mode: 'fixed',
  seasonal_factor: 1,
  weather_enabled: true,
  max_runs_per_week: 3,
  min_runtime_factor: 0.25,
  max_runtime_factor: 1.5,
  thresholds: {
    skip_rain_mm: 6,
    reduce_rain_mm: 2,
    wind_max_kmh: 35,
    soil_moisture_skip_pct: 70,
    et0_default_mm: 3,
  },
  zones: [{
    id: 'zone_1',
    name: 'Zone 1',
    enabled: true,
    duration_min: 10,
    water_mm: 6,
    min_deficit_mm: 8,
    target_mm: 12,
    deficit_mm: 0,
    preset: 'Normal',
    plant_type: 'Rasen',
  }],
  last_run_at: null,
  last_skip_reason: '',
}];

let activeRun = null;
let lastTick = 0;
let lastScheduleMinute = '';

function nowIso() {
  return new Date().toISOString();
}

function webLog(msg) {
  const now = new Date();
  const line = `${now.toTimeString().slice(0, 8)} ${msg}`;
  state.logBuffer.push(line);
  if (state.logBuffer.length > 500) state.logBuffer.shift();
  state.logSeq++;
  console.log('[IRR]', msg);
}

function clamp(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function normalizeId(v, fallback) {
  const raw = String(v || fallback || '').trim().toLowerCase();
  const safe = raw.replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return safe || fallback;
}

function normalizeDays(days) {
  if (!Array.isArray(days) || days.length !== 7) return [true, true, true, true, true, true, true];
  return days.map(Boolean);
}

function normalizeProgram(input, idx = 0) {
  const id = normalizeId(input.id || input.name, `program_${idx + 1}`);
  const thresholds = Object.assign({}, DEFAULT_PROGRAMS[0].thresholds, input.thresholds || {});
  const zones = Array.isArray(input.zones) && input.zones.length ? input.zones : [];
  const mode = input.mode === 'smart_et' || input.smart_et === true ? 'smart_et' : 'fixed';
  return {
    id,
    name: String(input.name || id),
    enabled: !!input.enabled,
    days: normalizeDays(input.days),
    start_hour: clamp(input.start_hour, 0, 23),
    start_min: clamp(input.start_min, 0, 59),
    mode,
    seasonal_factor: clamp(input.seasonal_factor ?? 1, 0.1, 2),
    weather_enabled: input.weather_enabled !== false,
    max_runs_per_week: Math.round(clamp(input.max_runs_per_week ?? 3, 1, 7)),
    min_runtime_factor: clamp(input.min_runtime_factor ?? 0.25, 0.05, 2),
    max_runtime_factor: clamp(input.max_runtime_factor ?? 1.5, 0.1, 3),
    thresholds: {
      skip_rain_mm: clamp(thresholds.skip_rain_mm, 0, 100),
      reduce_rain_mm: clamp(thresholds.reduce_rain_mm, 0, 100),
      wind_max_kmh: clamp(thresholds.wind_max_kmh, 0, 150),
      soil_moisture_skip_pct: clamp(thresholds.soil_moisture_skip_pct, 0, 100),
      et0_default_mm: clamp(thresholds.et0_default_mm, 0.1, 12),
    },
    zones: zones.map((z, zidx) => ({
      id: normalizeId(z.id || z.name, `zone_${zidx + 1}`),
      name: String(z.name || z.id || `Zone ${zidx + 1}`),
      enabled: z.enabled !== false,
      duration_min: clamp(z.duration_min ?? z.duration ?? 10, 1, 240),
      water_mm: clamp(z.water_mm ?? 6, 0.1, 50),
      min_deficit_mm: clamp(z.min_deficit_mm ?? 8, 0.1, 80),
      target_mm: clamp(z.target_mm ?? 12, 0.1, 100),
      deficit_mm: clamp(z.deficit_mm ?? 0, 0, 200),
      preset: String(z.preset || 'Normal'),
      plant_type: String(z.plant_type || ''),
    })),
    last_balance_date: input.last_balance_date || null,
    last_run_at: input.last_run_at || null,
    last_skip_reason: input.last_skip_reason || '',
  };
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

async function load() {
  const programs = await readJson(PROGRAMS_FILE, DEFAULT_PROGRAMS);
  const weather = await readJson(WEATHER_FILE, state.irrigation.weather);
  const history = await readJson(HISTORY_FILE, []);

  state.irrigation.programs = (Array.isArray(programs) && programs.length ? programs : DEFAULT_PROGRAMS)
    .map((p, i) => normalizeProgram(p, i));
  Object.assign(state.irrigation.weather, weather || {});
  state.irrigation.history = Array.isArray(history) ? history.slice(-HISTORY_LIMIT) : [];
  recomputeDecision();
  console.log('[IRR] Konfiguration geladen');
}

async function savePrograms() {
  await writeJson(PROGRAMS_FILE, state.irrigation.programs);
}

async function saveWeather() {
  await writeJson(WEATHER_FILE, state.irrigation.weather);
}

async function saveHistory() {
  await writeJson(HISTORY_FILE, state.irrigation.history.slice(-HISTORY_LIMIT));
}

function addHistory(entry) {
  state.irrigation.history.push(Object.assign({ at: nowIso() }, entry));
  state.irrigation.history = state.irrigation.history.slice(-HISTORY_LIMIT);
  saveHistory().catch(e => console.error('[IRR] history save error:', e.message));
}

function getPrograms() {
  return { programs: state.irrigation.programs };
}

function setPrograms(body) {
  const list = Array.isArray(body) ? body : body?.programs;
  if (!Array.isArray(list) || !list.length) {
    const err = new Error('programs array required');
    err.statusCode = 400;
    throw err;
  }
  const normalized = list.map((p, i) => normalizeProgram(p, i));
  const ids = new Set();
  for (const p of normalized) {
    if (ids.has(p.id)) {
      const err = new Error(`duplicate program id: ${p.id}`);
      err.statusCode = 400;
      throw err;
    }
    ids.add(p.id);
  }
  state.irrigation.programs = normalized;
  recomputeDecision();
  savePrograms().catch(e => console.error('[IRR] programs save error:', e.message));
  return getPrograms();
}

function getWeather() {
  return Object.assign({}, state.irrigation.weather, { decision: state.irrigation.decision });
}

function getHistory() {
  return { history: state.irrigation.history.slice(-HISTORY_LIMIT) };
}

function getStatus() {
  return {
    programs: state.irrigation.programs,
    weather: state.irrigation.weather,
    decision: state.irrigation.decision,
    zones: state.irrigation.zones,
    history: state.irrigation.history.slice(-25),
  };
}

function ingestWeather(payload) {
  let data = payload;
  if (typeof payload === 'string') {
    try { data = JSON.parse(payload); }
    catch {
      const n = parseFloat(payload);
      data = Number.isFinite(n) ? { forecast_rain_mm: n } : {};
    }
  }
  if (!data || typeof data !== 'object') return false;

  const map = {
    forecast_rain_mm: ['forecast_rain_mm', 'forecastRainMm', 'rain_forecast_mm'],
    rain_24h_mm: ['rain_24h_mm', 'rain24hMm', 'rain_today_mm'],
    temp_c: ['temp_c', 'tempC', 'temperature'],
    humidity_pct: ['humidity_pct', 'humidityPct', 'humidity'],
    wind_kmh: ['wind_kmh', 'windKmh', 'wind_speed'],
    et0_mm: ['et0_mm', 'et0Mm', 'evapotranspiration_mm'],
    soil_moisture_pct: ['soil_moisture_pct', 'soilMoisturePct', 'soil_moisture'],
  };
  for (const [target, keys] of Object.entries(map)) {
    for (const key of keys) {
      if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
        const n = Number(data[key]);
        if (Number.isFinite(n)) state.irrigation.weather[target] = n;
        break;
      }
    }
  }
  state.irrigation.weather.updated_at = nowIso();
  saveWeather().catch(e => console.error('[IRR] weather save error:', e.message));
  recomputeDecision();
  return true;
}

function safetyBlockReason() {
  if (state.vacation.enabled) return 'Urlaubsmodus';
  if (!tg.isAllowed()) return 'Zeitfenster gesperrt';
  if (state.pi.dry_run_locked) return 'Trockenlauf-Sperre';
  if (state.v20.fault) return 'V20-Stoerung';
  if (!state.sys.mqtt) return 'MQTT getrennt';
  return '';
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function weekStart(date = new Date()) {
  const d = new Date(date);
  const weekday = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - weekday);
  return d;
}

function weeklyRunCount(program, date = new Date()) {
  const start = weekStart(date).getTime();
  return state.irrigation.history.filter(h => {
    if (h.type !== 'run' || h.result !== 'completed') return false;
    if (h.program_id !== program.id) return false;
    const ts = new Date(h.at).getTime();
    return Number.isFinite(ts) && ts >= start;
  }).length;
}

function updateWaterBalance(program, date = new Date()) {
  if (!program || program.mode !== 'smart_et') return false;
  const today = localDateKey(date);
  if (program.last_balance_date === today) return false;

  const w = state.irrigation.weather;
  const et0 = Number.isFinite(Number(w.et0_mm)) ? Number(w.et0_mm) : program.thresholds.et0_default_mm;
  const rain = Number(w.rain_24h_mm || 0);
  const delta = (et0 * program.seasonal_factor) - rain;

  program.zones.forEach(zone => {
    if (!zone.enabled) return;
    zone.deficit_mm = clamp(Number(zone.deficit_mm || 0) + delta, 0, 200);
  });
  program.last_balance_date = today;
  savePrograms().catch(e => console.error('[IRR] programs save error:', e.message));
  return true;
}

function smartZoneRuntime(zone) {
  const desiredMm = Math.min(Number(zone.deficit_mm || 0), Number(zone.target_mm || zone.water_mm || 1));
  const baseWater = Math.max(Number(zone.water_mm || 1), 0.1);
  const baseMin = Math.max(Number(zone.duration_min || 1), 1);
  const factor = clamp(desiredMm / baseWater, 0.05, 3);
  return {
    runtime_s: Math.max(30, Math.round(baseMin * 60 * factor)),
    applied_mm: Math.round(baseWater * factor * 10) / 10,
    factor: Math.round(factor * 100) / 100,
  };
}

function evaluateProgram(program, opts = {}) {
  const safety = safetyBlockReason();
  if (safety) {
    return { allowed: false, reason: safety, runtime_factor: 0, water_budget_mm: 0 };
  }
  if (!program) {
    return { allowed: false, reason: 'Programm nicht gefunden', runtime_factor: 0, water_budget_mm: 0 };
  }
  if (!opts.manual && !program.enabled) {
    return { allowed: false, reason: 'Programm deaktiviert', runtime_factor: 0, water_budget_mm: 0 };
  }
  if (!opts.forceWeather && program.mode === 'smart_et') {
    updateWaterBalance(program);
    const count = weeklyRunCount(program);
    if (count >= program.max_runs_per_week) {
      return {
        allowed: false,
        reason: 'Wochenlimit erreicht',
        runtime_factor: 0,
        water_budget_mm: Math.max(0, ...program.zones.map(z => Number(z.deficit_mm || 0))),
        weekly_runs: count,
      };
    }
  }
  if (!opts.forceWeather && program.weather_enabled) {
    const w = state.irrigation.weather;
    const t = program.thresholds;
    const rain = Number(w.forecast_rain_mm || 0) + Number(w.rain_24h_mm || 0);
    if (Number(w.wind_kmh || 0) > t.wind_max_kmh) {
      return { allowed: false, reason: 'Wind zu hoch', runtime_factor: 0, water_budget_mm: 0 };
    }
    if (w.soil_moisture_pct !== null && w.soil_moisture_pct !== undefined &&
        Number(w.soil_moisture_pct) >= t.soil_moisture_skip_pct) {
      return { allowed: false, reason: 'Bodenfeuchte ausreichend', runtime_factor: 0, water_budget_mm: 0 };
    }
    if (rain >= t.skip_rain_mm) {
      return { allowed: false, reason: 'Regenprognose', runtime_factor: 0, water_budget_mm: 0 };
    }
    const et0 = Number.isFinite(Number(w.et0_mm)) ? Number(w.et0_mm) : t.et0_default_mm;
    const budget = program.mode === 'smart_et'
      ? Math.max(0, ...program.zones.map(z => Number(z.deficit_mm || 0)))
      : Math.max(0, et0 - rain);

    if (program.mode === 'smart_et') {
      const dueZones = program.zones
        .filter(z => z.enabled && Number(z.deficit_mm || 0) >= Number(z.min_deficit_mm || 0));
      if (!dueZones.length) {
        return { allowed: false, reason: 'Defizit zu gering', runtime_factor: 0, water_budget_mm: budget };
      }
      const runtimes = {};
      let maxFactor = 0;
      dueZones.forEach(zone => {
        const r = smartZoneRuntime(zone);
        runtimes[zone.id] = r;
        maxFactor = Math.max(maxFactor, r.factor);
      });
      return {
        allowed: true,
        reason: 'Smart ET Freigabe',
        runtime_factor: maxFactor || 1,
        water_budget_mm: budget,
        zone_ids: dueZones.map(z => z.id),
        zone_runtimes: runtimes,
        weekly_runs: weeklyRunCount(program),
      };
    }

    let factor = (budget / Math.max(t.et0_default_mm, 0.1)) * program.seasonal_factor;
    if (rain >= t.reduce_rain_mm) factor *= 0.6;
    factor = clamp(factor, program.min_runtime_factor, program.max_runtime_factor);
    if (budget <= 0.2) {
      return { allowed: false, reason: 'Budget ausreichend', runtime_factor: 0, water_budget_mm: budget };
    }
    return { allowed: true, reason: 'ET Freigabe', runtime_factor: factor, water_budget_mm: budget };
  }
  return {
    allowed: true,
    reason: opts.forceWeather ? 'Manuell gestartet' : 'Wetterpruefung aus',
    runtime_factor: clamp(program.seasonal_factor, program.min_runtime_factor, program.max_runtime_factor),
    water_budget_mm: 0,
  };
}

function nextStartFor(program, from = new Date()) {
  for (let offset = 0; offset < 14; offset++) {
    const d = new Date(from);
    d.setDate(from.getDate() + offset);
    d.setHours(program.start_hour, program.start_min, 0, 0);
    const weekday = d.getDay();
    const dayIdx = weekday === 0 ? 6 : weekday - 1;
    if (program.days[dayIdx] && d > from) return d.toISOString();
  }
  return null;
}

function recomputeDecision(programId = '') {
  const programs = state.irrigation.programs;
  const program = programId
    ? programs.find(p => p.id === programId)
    : programs.find(p => p.enabled) || programs[0];
  const ev = evaluateProgram(program, { manual: false });
  state.irrigation.decision = Object.assign({}, state.irrigation.decision, {
    allowed: ev.allowed,
    reason: ev.reason,
    program_id: program?.id || '',
    water_budget_mm: Math.round((ev.water_budget_mm || 0) * 10) / 10,
    runtime_factor: Math.round((ev.runtime_factor || 0) * 100) / 100,
    mode: program?.mode || 'fixed',
    weekly_runs: ev.weekly_runs ?? (program ? weeklyRunCount(program) : 0),
    max_runs_per_week: program?.max_runs_per_week || 0,
    next_start: program ? nextStartFor(program) : null,
    running: !!activeRun,
    active_zone: activeRun?.zone?.id || '',
    active_program: activeRun?.program?.id || '',
  });
}

function publishDecision() {
  const d = state.irrigation.decision;
  mqtt.publish(`${BASE}/irrigation/decision/state`, JSON.stringify(d), { retain: true });
  mqtt.publish(`${BASE}/irrigation/active_program`, d.active_program || '', { retain: true });
  mqtt.publish(`${BASE}/irrigation/active_zone`, d.active_zone || '', { retain: true });
  mqtt.publish(`${BASE}/irrigation/skip_reason`, d.reason || '', { retain: true });
  mqtt.publish(`${BASE}/irrigation/water_budget_mm`, d.water_budget_mm || 0, { retain: true });
  mqtt.publish(`${BASE}/irrigation/runtime_factor`, d.runtime_factor || 0, { retain: true });
  mqtt.publish(`${BASE}/irrigation/running`, d.running ? 'ON' : 'OFF', { retain: true });
  mqtt.publish(`${BASE}/irrigation/next_start`, d.next_start || '', { retain: true });
}

function publishZoneCommand(zone, action, program, runtimeSec) {
  const payload = {
    action,
    zone: zone.id,
    program: program.id,
    preset: zone.preset || 'Normal',
    duration_s: Math.max(0, Math.round(runtimeSec || 0)),
    at: nowIso(),
  };
  mqtt.publish(`${BASE}/irrigation/zone/${zone.id}/command`, JSON.stringify(payload), { retain: false });
}

function startZone() {
  if (!activeRun) return;
  const zone = activeRun.zones[activeRun.zoneIndex];
  if (!zone) {
    finishRun('completed');
    return;
  }
  activeRun.zone = zone;
  const smartRuntime = activeRun.zoneRuntimes?.[zone.id];
  const runtimeSec = smartRuntime?.runtime_s ||
    Math.max(30, Math.round(zone.duration_min * 60 * activeRun.runtimeFactor));
  activeRun.zoneStartedAt = Date.now();
  activeRun.zoneEndsAt = activeRun.zoneStartedAt + runtimeSec * 1000;
  activeRun.totalRuntimeSec += runtimeSec;

  if (zone.preset) presets.apply(zone.preset);
  publishZoneCommand(zone, 'start', activeRun.program, runtimeSec);
  state.irrigation.zones[zone.id] = Object.assign({}, state.irrigation.zones[zone.id], {
    command: 'start',
    state: 'STARTING',
    program: activeRun.program.id,
    ends_at: new Date(activeRun.zoneEndsAt).toISOString(),
    updated_at: nowIso(),
  });
  webLog(`[IRR] Zone ${zone.name} gestartet (${Math.round(runtimeSec / 60)} min)`);
  recomputeDecision(activeRun.program.id);
  publishDecision();
}

function finishZone() {
  if (!activeRun?.zone) return;
  publishZoneCommand(activeRun.zone, 'stop', activeRun.program, 0);
  state.irrigation.zones[activeRun.zone.id] = Object.assign({}, state.irrigation.zones[activeRun.zone.id], {
    command: 'stop',
    state: 'STOPPING',
    ends_at: null,
    updated_at: nowIso(),
  });
  activeRun.zoneIndex++;
  activeRun.zone = null;
  startZone();
}

function finishRun(result, reason = '') {
  if (!activeRun) return;
  if (activeRun.zone) publishZoneCommand(activeRun.zone, 'stop', activeRun.program, 0);
  mqtt.sendCmd('v20/stop', '1');
  const program = activeRun.program;
  if (result === 'completed' && program.mode === 'smart_et') {
    activeRun.zones.forEach(zone => {
      const smartRuntime = activeRun.zoneRuntimes?.[zone.id];
      const appliedMm = smartRuntime?.applied_mm ||
        (Number(zone.water_mm || 0) * (activeRun.runtimeFactor || 1));
      zone.deficit_mm = clamp(Number(zone.deficit_mm || 0) - appliedMm, 0, 200);
    });
  }
  program.last_run_at = nowIso();
  program.last_skip_reason = result === 'completed' ? '' : reason;
  addHistory({
    type: 'run',
    result,
    reason,
    program_id: program.id,
    program_name: program.name,
    runtime_factor: activeRun.runtimeFactor,
    runtime_s: activeRun.totalRuntimeSec,
    water_budget_mm: Math.round((activeRun.waterBudgetMm || 0) * 10) / 10,
  });
  webLog(`[IRR] Programm ${program.name} beendet: ${result}${reason ? ` (${reason})` : ''}`);
  activeRun = null;
  savePrograms().catch(e => console.error('[IRR] programs save error:', e.message));
  recomputeDecision(program.id);
  publishDecision();
}

function runProgram(id, opts = {}) {
  const program = state.irrigation.programs.find(p => p.id === id);
  const ev = evaluateProgram(program, {
    manual: !!opts.manual,
    forceWeather: !!opts.forceWeather,
  });
  if (!ev.allowed) {
    if (program) {
      program.last_skip_reason = ev.reason;
      savePrograms().catch(e => console.error('[IRR] programs save error:', e.message));
    }
    addHistory({
      type: 'skip',
      program_id: id,
      program_name: program?.name || id,
      reason: ev.reason,
      water_budget_mm: ev.water_budget_mm || 0,
    });
    recomputeDecision(id);
    publishDecision();
    return { ok: false, error: ev.reason, decision: ev };
  }
  if (activeRun) finishRun('interrupted', 'Neues Programm gestartet');
  const allowedZoneIds = Array.isArray(ev.zone_ids) ? new Set(ev.zone_ids) : null;
  const zones = program.zones.filter(z => z.enabled && (!allowedZoneIds || allowedZoneIds.has(z.id)));
  if (!zones.length) return { ok: false, error: 'Keine aktive Zone' };
  activeRun = {
    program,
    zones,
    zoneRuntimes: ev.zone_runtimes || null,
    zoneIndex: 0,
    zone: null,
    startedAt: Date.now(),
    runtimeFactor: ev.runtime_factor || 1,
    waterBudgetMm: ev.water_budget_mm || 0,
    totalRuntimeSec: 0,
  };
  webLog(`[IRR] Programm ${program.name} gestartet (${ev.reason})`);
  startZone();
  return { ok: true, decision: ev };
}

function stopProgram(id, reason = 'Manuell gestoppt') {
  if (!activeRun) return { ok: true };
  if (id && activeRun.program.id !== id) return { ok: false, error: 'Anderes Programm aktiv' };
  finishRun('stopped', reason);
  return { ok: true };
}

function handleMqtt(topic, value) {
  if (topic === `${BASE}/irrigation/weather/input`) {
    ingestWeather(value);
    return true;
  }

  const startMatch = topic.match(/^pumpensteuerung\/irrigation\/program\/([^/]+)\/start$/);
  if (startMatch) {
    let forceWeather = true;
    try {
      const obj = JSON.parse(value);
      if (obj && typeof obj === 'object') forceWeather = obj.force !== false;
    } catch {}
    runProgram(startMatch[1], { manual: true, forceWeather });
    return true;
  }

  const stopMatch = topic.match(/^pumpensteuerung\/irrigation\/program\/([^/]+)\/stop$/);
  if (stopMatch) {
    stopProgram(stopMatch[1], 'MQTT Stop');
    return true;
  }

  const zoneStateMatch = topic.match(/^pumpensteuerung\/irrigation\/zone\/([^/]+)\/state$/);
  if (zoneStateMatch) {
    const id = zoneStateMatch[1];
    let payload = { state: String(value) };
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') payload = parsed;
    } catch {}
    state.irrigation.zones[id] = Object.assign({}, state.irrigation.zones[id], payload, {
      updated_at: nowIso(),
    });
    return true;
  }
  return false;
}

function tick() {
  const now = Date.now();
  if (now - lastTick < TICK_MS) return;
  lastTick = now;

  if (activeRun) {
    const safety = safetyBlockReason();
    if (safety) {
      finishRun('stopped', safety);
      return;
    }
    if (activeRun.zone && now >= activeRun.zoneEndsAt) {
      finishZone();
      return;
    }
    recomputeDecision(activeRun.program.id);
    publishDecision();
    return;
  }

  const d = new Date();
  const minuteKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;
  if (minuteKey === lastScheduleMinute) {
    recomputeDecision();
    publishDecision();
    return;
  }
  lastScheduleMinute = minuteKey;

  const weekday = d.getDay();
  const dayIdx = weekday === 0 ? 6 : weekday - 1;
  for (const program of state.irrigation.programs) {
    if (!program.enabled || !program.days[dayIdx]) continue;
    if (program.start_hour === d.getHours() && program.start_min === d.getMinutes()) {
      const res = runProgram(program.id, { manual: false, forceWeather: false });
      if (!res.ok) webLog(`[IRR] Programm ${program.name} uebersprungen: ${res.error}`);
      return;
    }
  }
  recomputeDecision();
  publishDecision();
}

module.exports = {
  load,
  tick,
  handleMqtt,
  getPrograms,
  setPrograms,
  runProgram,
  stopProgram,
  getWeather,
  getHistory,
  getStatus,
  ingestWeather,
  evaluateProgram,
};
