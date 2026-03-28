'use strict';

// ============================================================
//  pressureCtrl.js – PI-Druckregelung (Port von pressure_ctrl.cpp)
//
//  Betriebslogik:
//    Druck < p_on  → Pumpe START
//    Druck > p_off → Pumpe STOP
//    Dazwischen:     PI-Regler hält Sollwert
//
//  Sicherheit:
//    - No-demand shutdown (5s kein Durchfluss + Druck >= Sollwert)
//    - Dry-run protection (30s kein Durchfluss + Druck < Sollwert → 5min Sperre)
//    - Druck-Timeout (5s kein Druckwert → Stop)
//    - Flow-Schätzung im Totbereich (<1 L/min Sensor)
// ============================================================

const fs     = require('fs').promises;
const path   = require('path');
const state  = require('./state');
const mqtt   = require('./mqttClient');

const DATA_FILE = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'pressure_ctrl.json')
  : '/data/pressure_ctrl.json';

// ── Interne Regelungs-State ──
let integral    = 0;
let pumpState   = 0;   // 0=AUS, 1=STARTET, 2=LÄUFT
let startSentAt = 0;

// ── No-demand / Dry-run Timer ──
let noFlowSince      = 0;
let dryRunLockUntil  = 0;

// ── Letzter Druckwert-Zeitstempel (Druck-Timeout) ──
let lastPressureTs   = 0;
let lastKnownPressure = 0;

const DT             = 0.5;          // Regelzyklus 500 ms
const NO_DEMAND_S    = 5;
const DRY_RUN_S      = 30;
const DRY_RUN_LOCK_S = 300;          // 5 Minuten
const PRESSURE_TIMEOUT_MS = 5000;

function webLog(msg) {
  const now = new Date();
  const h = now.getHours().toString().padStart(2,'0');
  const m = now.getMinutes().toString().padStart(2,'0');
  const s = now.getSeconds().toString().padStart(2,'0');
  const line = `${h}:${m}:${s} ${msg}`;
  state.logBuffer.push(line);
  if (state.logBuffer.length > 500) state.logBuffer.shift();
  state.logSeq++;
  console.log('[PI]', msg);
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ── Konfiguration lesen/schreiben ──
async function load() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    const cfg = JSON.parse(data);
    Object.assign(state.pi, cfg);
    console.log('[PI] Konfiguration geladen aus', DATA_FILE);
  } catch {
    console.log('[PI] Keine Konfigurationsdatei gefunden – Standardwerte genutzt');
  }
}

async function save() {
  const cfg = {
    enabled:  state.pi.enabled,
    setpoint: state.pi.setpoint,
    p_on:     state.pi.p_on,
    p_off:    state.pi.p_off,
    kp:       state.pi.kp,
    ki:       state.pi.ki,
    freq_min: state.pi.freq_min,
    freq_max: state.pi.freq_max,
  };
  await fs.writeFile(DATA_FILE, JSON.stringify(cfg, null, 2));
}

function setConfig(cfg) {
  if (cfg.enabled  !== undefined) state.pi.enabled  = !!cfg.enabled;
  if (cfg.setpoint !== undefined) state.pi.setpoint = clamp(parseFloat(cfg.setpoint), 0.1, 6.0);
  if (cfg.p_on     !== undefined) state.pi.p_on     = clamp(parseFloat(cfg.p_on),     0.1, state.pi.setpoint);
  if (cfg.p_off    !== undefined) state.pi.p_off    = clamp(parseFloat(cfg.p_off),     state.pi.setpoint, 8.0);
  if (cfg.kp       !== undefined) state.pi.kp       = parseFloat(cfg.kp);
  if (cfg.ki       !== undefined) state.pi.ki       = parseFloat(cfg.ki);
  if (cfg.freq_min !== undefined) state.pi.freq_min = clamp(parseFloat(cfg.freq_min), 10, 50);
  if (cfg.freq_max !== undefined) state.pi.freq_max = clamp(parseFloat(cfg.freq_max), 10, 50);
  if (state.pi.freq_min > state.pi.freq_max) state.pi.freq_min = state.pi.freq_max;
  save().catch(e => console.error('[PI] save error:', e.message));
}

function resetDryrun() {
  dryRunLockUntil     = 0;
  state.pi.dry_run_locked = false;
  webLog('[PI] Trockenlauf-Sperre manuell aufgehoben');
}

function resetIntegral() {
  integral  = 0;
  pumpState = 0;
  state.pi.active     = false;
  state.pi.pump_state = 0;
  noFlowSince         = 0;
}

// ── Haupt-Regelzyklus (500 ms) ──
function tick() {
  const now = Date.now();
  const pi  = state.pi;

  // Druckwert-Tracking für Timeout-Erkennung
  if (state.pressure_bar !== lastKnownPressure && state.pressure_bar > 0) {
    lastKnownPressure = state.pressure_bar;
    lastPressureTs    = now;
  }

  // ── Trockenlauf-Sperre aktiv? ──
  if (dryRunLockUntil > 0 && now < dryRunLockUntil) {
    pi.dry_run_locked = true;
    if (state.v20.running) {
      mqtt.sendCmd('v20/stop', '1');
      webLog('[PI] Trockenlauf-Sperre – V20 gestoppt');
    }
    resetIntegral();
    return;
  } else if (dryRunLockUntil > 0 && now >= dryRunLockUntil) {
    dryRunLockUntil     = 0;
    pi.dry_run_locked   = false;
    webLog('[PI] Trockenlauf-Sperre abgelaufen');
  }

  pi.dry_run_locked = false;

  // ── PI deaktiviert ──
  if (!pi.enabled) {
    resetIntegral();
    return;
  }

  // ── Druck-Timeout ──
  if (lastPressureTs > 0 && (now - lastPressureTs) > PRESSURE_TIMEOUT_MS) {
    if (pumpState !== 0) {
      webLog('[PI] Druck-Timeout! Kein Wert – V20 gestoppt');
      mqtt.sendCmd('v20/stop', '1');
      resetIntegral();
      lastPressureTs = 0;
    }
    return;
  }

  const pressure  = state.pressure_bar;
  const flow      = state.flow_rate;
  const running   = state.v20.running;
  const freq      = state.v20.frequency;

  // ── Flow-Schätzung im Totbereich ──
  let effectiveFlow = flow;
  if (flow < 1.0 && running && freq > 0) {
    effectiveFlow = (freq / 50.0) * 4.0;
    state.flow_estimated = true;
  } else {
    state.flow_estimated = false;
  }

  // ── No-demand Shutdown ──
  if (effectiveFlow < 1.0 && pressure >= pi.setpoint) {
    if (noFlowSince === 0) noFlowSince = now;
    if ((now - noFlowSince) > NO_DEMAND_S * 1000) {
      if (running) {
        webLog(`[PI] No-demand: flow=${flow.toFixed(1)} + Druck ${pressure.toFixed(2)} bar ≥ SP → Pumpe STOP`);
        mqtt.sendCmd('v20/stop', '1');
      }
      resetIntegral();
      noFlowSince = 0;
      return;
    }
  } else if (effectiveFlow >= 1.0) {
    noFlowSince = 0;
  }

  // ── Dry-run Protection ──
  if (effectiveFlow < 1.0 && running && pressure < pi.setpoint) {
    if (noFlowSince === 0) noFlowSince = now;
    if ((now - noFlowSince) > DRY_RUN_S * 1000) {
      webLog(`[PI] TROCKENLAUF! ${DRY_RUN_S}s kein Durchfluss → Pumpe STOP + Sperre ${DRY_RUN_LOCK_S/60} min`);
      mqtt.sendCmd('v20/stop', '1');
      dryRunLockUntil     = now + DRY_RUN_LOCK_S * 1000;
      pi.dry_run_locked   = true;
      resetIntegral();
      return;
    }
  }

  // ── Pumpenlogik (Druck-Modus) ──
  if (pi.ctrl_mode === 0) {
    if (pumpState === 0) {
      // Warte auf Einschaltdruck
      if (pressure > 0 && pressure < pi.p_on) {
        webLog(`[PI] Einschaltdruck unterschritten (${pressure.toFixed(2)} bar < ${pi.p_on} bar) – START`);
        mqtt.sendCmd('v20/start', '1');
        pumpState   = 1;
        startSentAt = now;
      }
      pi.active     = false;
      pi.pump_state = 0;
      return;
    }

    if (pumpState === 1) {
      // Warte auf V20-Bestätigung
      if (running) {
        pumpState = 2;
        webLog('[PI] Pumpe läuft – PI aktiv');
      } else if (now - startSentAt > 10000) {
        webLog('[PI] START Timeout – V20 nicht gestartet');
        pumpState = 0;
      }
      pi.pump_state = pumpState;
      pi.active     = false;
      return;
    }

    // pumpState === 2: PI läuft
    if (pressure >= pi.p_off) {
      webLog(`[PI] Ausschaltdruck überschritten (${pressure.toFixed(2)} bar > ${pi.p_off} bar) – STOP`);
      mqtt.sendCmd('v20/stop', '1');
      resetIntegral();
      return;
    }

    if (!running) {
      webLog('[PI] V20 nicht mehr aktiv – PI zurückgesetzt');
      resetIntegral();
      return;
    }
  }

  // ── Durchfluss-Modus ──
  if (pi.ctrl_mode === 1) {
    if (!running && pumpState === 0) {
      mqtt.sendCmd('v20/start', '1');
      pumpState   = 1;
      startSentAt = now;
      pi.pump_state = 1;
      pi.active     = false;
      return;
    }
    if (pumpState === 1) {
      if (running) { pumpState = 2; }
      else if (now - startSentAt > 10000) { pumpState = 0; }
      pi.pump_state = pumpState;
      pi.active     = false;
      return;
    }
  }

  // ── PI-Algorithmus ──
  const setpoint = pi.ctrl_mode === 1 ? pi.flow_setpoint : pi.setpoint;
  const measured = pi.ctrl_mode === 1 ? effectiveFlow : pressure;

  const error    = setpoint - measured;
  integral      += error * DT;

  // Anti-windup
  const maxIntegral = (pi.freq_max - pi.freq_min) / (pi.ki || 0.001);
  integral = clamp(integral, -maxIntegral, maxIntegral);

  const freqMid = (pi.freq_min + pi.freq_max) / 2;
  let freq_out  = pi.kp * error + pi.ki * integral + freqMid;
  freq_out      = clamp(freq_out, pi.freq_min, pi.freq_max);

  mqtt.sendCmd('v20/freq', freq_out.toFixed(1));
  state.v20.freq_setpoint = freq_out;

  pi.active     = true;
  pi.pump_state = pumpState;
  state.pi.active     = true;
  state.pi.pump_state = pumpState;
}

module.exports = { load, save, setConfig, resetDryrun, tick, resetIntegral };
