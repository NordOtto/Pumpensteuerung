'use strict';

// ============================================================
//  timeguard.js – Zeitfenster-Sperre (Port von timeguard.cpp)
//  Nutzt System-Zeit des Containers (TZ=Europe/Berlin via ENV)
// ============================================================

const fs    = require('fs').promises;
const path  = require('path');
const state = require('./state');
const mqtt  = require('./mqttClient');

const DATA_FILE = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'timeguard.json')
  : '/data/timeguard.json';

function webLog(msg) {
  const now = new Date();
  const h = now.getHours().toString().padStart(2,'0');
  const m = now.getMinutes().toString().padStart(2,'0');
  const s = now.getSeconds().toString().padStart(2,'0');
  const line = `${h}:${m}:${s} ${msg}`;
  state.logBuffer.push(line);
  if (state.logBuffer.length > 500) state.logBuffer.shift();
  state.logSeq++;
  console.log('[TG]', msg);
}

async function load() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    const cfg  = JSON.parse(data);
    Object.assign(state.timeguard, cfg);
    console.log('[TG] Konfiguration geladen aus', DATA_FILE);
  } catch {
    console.log('[TG] Keine Konfigurationsdatei – Standardwerte genutzt');
  }
}

async function save() {
  const tg = state.timeguard;
  const cfg = {
    enabled:    tg.enabled,
    start_hour: tg.start_hour,
    start_min:  tg.start_min,
    end_hour:   tg.end_hour,
    end_min:    tg.end_min,
    days:       tg.days,
  };
  await fs.writeFile(DATA_FILE, JSON.stringify(cfg, null, 2));
}

function setConfig(cfg) {
  const tg = state.timeguard;
  if (cfg.enabled    !== undefined) tg.enabled    = !!cfg.enabled;
  if (cfg.start_hour !== undefined) tg.start_hour = parseInt(cfg.start_hour);
  if (cfg.start_min  !== undefined) tg.start_min  = parseInt(cfg.start_min);
  if (cfg.end_hour   !== undefined) tg.end_hour   = parseInt(cfg.end_hour);
  if (cfg.end_min    !== undefined) tg.end_min    = parseInt(cfg.end_min);
  if (Array.isArray(cfg.days) && cfg.days.length === 7) {
    tg.days = cfg.days.map(d => !!d);
  }
  save().catch(e => console.error('[TG] save error:', e.message));
}

// ── Prüft ob Betrieb aktuell erlaubt ist ──
function isAllowed() {
  const tg = state.timeguard;
  if (!tg.enabled) return true;

  const now     = new Date();
  const weekday = now.getDay(); // 0=So, 1=Mo, … 6=Sa
  // days[] ist Mo-So (Index 0=Mo), JavaScript ist 0=So
  const dayIdx  = weekday === 0 ? 6 : weekday - 1;

  if (!tg.days[dayIdx]) return false;

  const nowMin   = now.getHours() * 60 + now.getMinutes();
  const startMin = tg.start_hour * 60 + tg.start_min;
  const endMin   = tg.end_hour   * 60 + tg.end_min;

  if (startMin <= endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  // Über Mitternacht
  return nowMin >= startMin || nowMin < endMin;
}

// ── Update-Loop (alle 10s vom server.js aufgerufen) ──
function tick() {
  const tg  = state.timeguard;
  const now = new Date();

  // Zeit-String für Dashboard
  const h   = now.getHours().toString().padStart(2,'0');
  const m   = now.getMinutes().toString().padStart(2,'0');
  tg.time   = `${h}:${m}`;
  tg.synced = true;  // Container hat NTP via Host-Kernel

  const allowed = isAllowed();

  // Fenster-Ende: V20 stoppen falls er läuft
  if (tg.allowed && !allowed && state.v20.running) {
    webLog('[TIME] Zeitsperre aktiv – V20 wird gestoppt');
    mqtt.sendCmd('v20/stop', '1');
  }

  tg.allowed      = allowed;
  state.timeguard = tg;
}

module.exports = { load, setConfig, tick, isAllowed };
