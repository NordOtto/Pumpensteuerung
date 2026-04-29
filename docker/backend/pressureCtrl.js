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
const tg     = require('./timeguard');

const DATA_FILE = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'pressure_ctrl.json')
  : '/data/pressure_ctrl.json';

// ── Interne Regelungs-State ──
let integral    = 0;
let pumpState   = 0;   // 0=AUS, 1=STARTET, 2=LÄUFT
let startSentAt = 0;

// ── No-demand / Dry-run Timer ──
let noFlowSince      = 0;
let dryRunNoFlowSince = 0;   // separater Timer für Dry-run
let dryRunLockUntil  = 0;
let dryRunGraceUntil = 0;    // Grace-Period nach Reset/Start
let dryRunRetryCount = 0;    // Auto-Retry-Zähler nach Trockenlauf
let dryRunRetryWindowEnd = 0; // Fenster für Retry-Zähler (1h)
let dryRunHardLocked = false; // nach max retries: nur manueller Reset

// ── Min-Freq-Timeout (Stop wenn PI auf freq_min hängt + Druck nicht erreicht) ──
let minFreqSince = 0;

// ── Fix-Frequenz Refresh ──
let lastFixedFreqSent = 0;

// ── Druckspitzen-Erkennung: Ring-Buffer (max 10s bei 500ms Takt = 20 Slots) ──
const SPIKE_SLOTS = 22;
const spikeBuf    = new Array(SPIKE_SLOTS).fill(0);
let spikeBufIdx   = 0;
let spikeBufFilled = false;

// ── Letzter Druckwert-Zeitstempel (Druck-Timeout) ──
let lastPressureTs   = 0;
let lastKnownPressure = 0;

const DT             = 0.5;          // Regelzyklus 500 ms
const NO_DEMAND_S    = 5;
const DRY_RUN_S      = 60;
const DRY_RUN_LOCK_S = 120;          // 2 Minuten – danach Auto-Retry
const DRY_RUN_GRACE_S = 90;          // 90s Grace-Period nach Reset/Start
const DRY_RUN_MAX_RETRIES = 3;       // max Auto-Retries pro Stunde
const DRY_RUN_RETRY_WINDOW_MS = 60 * 60 * 1000;
const MIN_FREQ_TIMEOUT_S = 60;       // PI freq_min + Druck unter Sollwert
const OVERPRESSURE_HYSTERESIS = 0.3; // bar über Sollwert → sofort Stop
const PRESSURE_TIMEOUT_MS = 5000;
const FIXED_FREQ_REFRESH_MS = 2000;

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
    if (cfg.vacation_enabled !== undefined) {
      state.vacation.enabled = !!cfg.vacation_enabled;
    }
    console.log('[PI] Konfiguration geladen aus', DATA_FILE);
  } catch {
    console.log('[PI] Keine Konfigurationsdatei gefunden – Standardwerte genutzt');
  }
}

async function save() {
  const cfg = {
    enabled:          state.pi.enabled,
    setpoint:         state.pi.setpoint,
    p_on:             state.pi.p_on,
    p_off:            state.pi.p_off,
    kp:               state.pi.kp,
    ki:               state.pi.ki,
    freq_min:         state.pi.freq_min,
    freq_max:         state.pi.freq_max,
    spike_enabled:    state.pi.spike_enabled,
    spike_threshold:  state.pi.spike_threshold,
    spike_window_s:   state.pi.spike_window_s,
    vacation_enabled: state.vacation.enabled,
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
  if (cfg.freq_min !== undefined) state.pi.freq_min = clamp(parseFloat(cfg.freq_min), 10, 60);
  if (cfg.freq_max !== undefined) state.pi.freq_max = clamp(parseFloat(cfg.freq_max), 10, 60);
  if (state.pi.freq_min > state.pi.freq_max) state.pi.freq_min = state.pi.freq_max;
  if (cfg.spike_enabled   !== undefined) state.pi.spike_enabled   = !!cfg.spike_enabled;
  if (cfg.spike_threshold !== undefined) state.pi.spike_threshold = clamp(parseFloat(cfg.spike_threshold), 0.05, 5.0);
  if (cfg.spike_window_s  !== undefined) state.pi.spike_window_s  = clamp(parseFloat(cfg.spike_window_s), 1, 10);
  webLog(`[PI] Config: SP=${state.pi.setpoint} p_on=${state.pi.p_on} p_off=${state.pi.p_off} fMin=${state.pi.freq_min} fMax=${state.pi.freq_max} kp=${state.pi.kp} ki=${state.pi.ki} spike=${state.pi.spike_enabled}(${state.pi.spike_threshold}bar/${state.pi.spike_window_s}s)`);
  save().catch(e => console.error('[PI] save error:', e.message));
  // Fallback-Config auf ESP32 aktualisieren (mit retain, überlebt Neustart)
  mqtt.publishFallbackConfig(state.pi.p_on, state.pi.p_off, state.pi.freq_max);
}

function setVacation(enabled) {
  state.vacation.enabled = !!enabled;
  if (enabled) {
    webLog('[PI] Urlaubsmodus aktiviert – Pumpe gesperrt');
  } else {
    webLog('[PI] Urlaubsmodus deaktiviert');
  }
  save().catch(e => console.error('[PI] save error:', e.message));
}

function resetDryrun(reason = 'manuell') {
  dryRunLockUntil     = 0;
  dryRunNoFlowSince   = 0;
  noFlowSince         = 0;
  minFreqSince        = 0;
  dryRunGraceUntil    = Date.now() + DRY_RUN_GRACE_S * 1000;
  dryRunHardLocked    = false;
  if (reason === 'manuell' || reason === 'lock') {
    dryRunRetryCount  = 0;
    dryRunRetryWindowEnd = 0;
  }
  state.pi.dry_run_locked = false;
  webLog(`[PI] Trockenlauf-Sperre aufgehoben (${reason}) – ${DRY_RUN_GRACE_S}s Grace-Period`);
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

  // ── Urlaubsmodus (Pumpen-Sperre) ──
  if (state.vacation.enabled) {
    if (state.v20.running) {
      mqtt.sendCmd('v20/stop', '1');
      webLog('[PI] Urlaubsmodus – Pumpe gestoppt');
    }
    resetIntegral();
    return;
  }

  // ── Zeitsperre ──
  if (!tg.isAllowed()) {
    if (state.v20.running) {
      mqtt.sendCmd('v20/stop', '1');
      webLog('[PI] Zeitsperre aktiv – Pumpe gestoppt');
    }
    resetIntegral();
    return;
  }

  // Druckwert-Tracking für Timeout-Erkennung
  if (state.pressure_bar !== lastKnownPressure && state.pressure_bar > 0) {
    lastKnownPressure = state.pressure_bar;
    lastPressureTs    = now;
  }

  // ── Trockenlauf-Sperre aktiv? ──
  if (dryRunHardLocked) {
    pi.dry_run_locked = true;
    if (state.v20.running) {
      mqtt.sendCmd('v20/stop', '1');
      webLog('[PI] Trockenlauf HARD-LOCK – V20 gestoppt (manueller Reset nötig)');
    }
    resetIntegral();
    return;
  }
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
    // Auto-Retry: Counter im 1h-Fenster
    if (dryRunRetryWindowEnd === 0 || now > dryRunRetryWindowEnd) {
      dryRunRetryCount = 0;
      dryRunRetryWindowEnd = now + DRY_RUN_RETRY_WINDOW_MS;
    }
    dryRunRetryCount++;
    if (dryRunRetryCount > DRY_RUN_MAX_RETRIES) {
      dryRunHardLocked  = true;
      pi.dry_run_locked = true;
      webLog(`[PI] Max Auto-Retries (${DRY_RUN_MAX_RETRIES}/h) erreicht – HARD-LOCK, manueller Reset nötig`);
      resetIntegral();
      return;
    }
    dryRunGraceUntil = now + DRY_RUN_GRACE_S * 1000;
    dryRunNoFlowSince = 0;
    minFreqSince      = 0;
    webLog(`[PI] Trockenlauf-Sperre abgelaufen – Auto-Retry ${dryRunRetryCount}/${DRY_RUN_MAX_RETRIES} – ${DRY_RUN_GRACE_S}s Grace`);
  }

  pi.dry_run_locked = false;

  // ── Fix-Frequenz-Modus (mode=2) ──
  if (state.ctrl_mode === 2) {
    const hz = state.preset_setpoint_hz || 0;
    const expected = state.preset_expected_pressure || 0;
    if (hz <= 0) return; // ungültig konfiguriert

    // Druckwert vorhanden?
    if (lastPressureTs > 0 && (now - lastPressureTs) > PRESSURE_TIMEOUT_MS) {
      if (state.v20.running) {
        webLog('[PI] Druck-Timeout (Fix-Hz) – V20 gestoppt');
        mqtt.sendCmd('v20/stop', '1');
      }
      lastPressureTs = 0;
      return;
    }

    // Überdruck-Stop bei Fix-Hz
    if (expected > 0 && state.v20.running &&
        state.pressure_bar > expected + OVERPRESSURE_HYSTERESIS && state.flow_rate < 1.0) {
      webLog(`[PI] Überdruck-Stop (Fix-Hz): ${state.pressure_bar.toFixed(2)} > ${expected}+${OVERPRESSURE_HYSTERESIS} bar – Stop`);
      mqtt.sendCmd('v20/stop', '1');
      return;
    }

    // Trockenlauf bei Fix-Hz: kein Fluss + Druck weit unter Erwartung
    if (expected > 0 && dryRunGraceUntil === 0 &&
        state.flow_rate < 1.0 && state.v20.running && state.pressure_bar < expected * 0.5) {
      if (dryRunNoFlowSince === 0) dryRunNoFlowSince = now;
      if ((now - dryRunNoFlowSince) > DRY_RUN_S * 1000) {
        webLog(`[PI] TROCKENLAUF (Fix-Hz)! ${DRY_RUN_S}s kein Fluss + p<${expected*0.5} – Stop + Sperre ${DRY_RUN_LOCK_S}s`);
        mqtt.sendCmd('v20/stop', '1');
        dryRunLockUntil = now + DRY_RUN_LOCK_S * 1000;
        pi.dry_run_locked = true;
        return;
      }
    } else {
      dryRunNoFlowSince = 0;
    }
    if (dryRunGraceUntil > 0 && now >= dryRunGraceUntil) {
      dryRunGraceUntil = 0;
    }

    // Frequenz periodisch refreshen + Pumpe ggf. starten
    if (!state.v20.running) {
      mqtt.sendCmd('v20/start', '1');
      lastFixedFreqSent = 0;
      dryRunGraceUntil = now + DRY_RUN_GRACE_S * 1000;
    }
    if (now - lastFixedFreqSent > FIXED_FREQ_REFRESH_MS) {
      mqtt.sendCmd('v20/freq', hz.toFixed(1));
      state.v20.freq_setpoint = hz;
      lastFixedFreqSent = now;
    }
    return;
  }

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

  // ── Druckspitzen-Erkennung (Hahn zu) – Ring-Buffer aktualisieren ──
  spikeBuf[spikeBufIdx] = pressure;
  spikeBufIdx = (spikeBufIdx + 1) % SPIKE_SLOTS;
  if (spikeBufIdx === 0) spikeBufFilled = true;

  if (running && pumpState === 2 && pi.spike_enabled && (spikeBufFilled || spikeBufIdx > 0)) {
    const windowSlots = Math.min(Math.round(pi.spike_window_s / DT), SPIKE_SLOTS - 1);
    // Ältester Wert im Fenster: SPIKE_SLOTS Slots zurück vom aktuellen Schreibzeiger
    const oldIdx = (spikeBufIdx - 1 - windowSlots + SPIKE_SLOTS * 2) % SPIKE_SLOTS;
    const oldPressure = spikeBuf[oldIdx];
    const rise = pressure - oldPressure;
    if (rise >= pi.spike_threshold) {
      webLog(`[PI] Hahn-zu erkannt: +${rise.toFixed(2)} bar in ${pi.spike_window_s}s (Schwelle ${pi.spike_threshold} bar) – sauberer Stop`);
      mqtt.sendCmd('v20/stop', '1');
      resetIntegral();
      spikeBufFilled = false;
      spikeBufIdx    = 0;
      spikeBuf.fill(0);
      return;
    }
  }

  // ── Überdruck-Stop (sofort) ──
  if (running && pumpState === 2 &&
      pressure > pi.setpoint + OVERPRESSURE_HYSTERESIS && flow < 1.0) {
    webLog(`[PI] Überdruck-Stop: ${pressure.toFixed(2)} > ${pi.setpoint}+${OVERPRESSURE_HYSTERESIS} bar bei flow<1 – V20 STOP`);
    mqtt.sendCmd('v20/stop', '1');
    resetIntegral();
    return;
  }

  // ── Flow-Schätzung im Totbereich ──
  let effectiveFlow = flow;
  if (flow < 1.0 && running && freq > 0) {
    effectiveFlow = (freq / 50.0) * 4.0;
    state.flow_estimated = true;
  } else {
    state.flow_estimated = false;
  }

  // ── No-demand Shutdown ──
  // Echten Sensorwert nutzen – effectiveFlow wäre hier immer >= 1.0 (Schätzung)
  if (flow < 1.0 && pressure >= pi.setpoint) {
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
  } else if (flow >= 1.0) {
    noFlowSince = 0;
  }

  // ── Dry-run Protection ──
  // Echten Sensorwert nutzen – effectiveFlow würde Trockenlauf verdecken
  // Grace-Period nach Start/Reset überspringen
  if (dryRunGraceUntil > 0 && now >= dryRunGraceUntil) {
    dryRunGraceUntil = 0;
    webLog('[PI] Trockenlauf Grace-Period abgelaufen');
  }
  if (dryRunGraceUntil === 0 && flow < 1.0 && running && pressure < pi.setpoint) {
    if (dryRunNoFlowSince === 0) dryRunNoFlowSince = now;
    if ((now - dryRunNoFlowSince) > DRY_RUN_S * 1000) {
      webLog(`[PI] TROCKENLAUF! ${DRY_RUN_S}s kein Durchfluss → Pumpe STOP + Sperre ${DRY_RUN_LOCK_S/60} min`);
      mqtt.sendCmd('v20/stop', '1');
      dryRunLockUntil     = now + DRY_RUN_LOCK_S * 1000;
      pi.dry_run_locked   = true;
      resetIntegral();
      return;
    }
  } else {
    dryRunNoFlowSince = 0;
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
        dryRunGraceUntil = now + DRY_RUN_GRACE_S * 1000;
        dryRunNoFlowSince = 0;
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

  // Debug-Log alle 30s
  if (!tick._lastDebug || now - tick._lastDebug > 30000) {
    tick._lastDebug = now;
    webLog(`[PI] SP=${setpoint} PV=${measured.toFixed(2)} err=${error.toFixed(2)} I=${integral.toFixed(1)} fMin=${pi.freq_min} fMax=${pi.freq_max} fMid=${freqMid.toFixed(1)} → ${freq_out.toFixed(1)} Hz`);
  }

  mqtt.sendCmd('v20/freq', freq_out.toFixed(1));
  state.v20.freq_setpoint = freq_out;

  // ── Min-Freq-Timeout (nur Druck-Modus): PI hängt auf freq_min, Druck wird nicht erreicht ──
  if (pi.ctrl_mode === 0 && dryRunGraceUntil === 0 &&
      freq_out <= pi.freq_min + 0.5 && pressure < pi.setpoint - 0.2) {
    if (minFreqSince === 0) minFreqSince = now;
    if ((now - minFreqSince) > MIN_FREQ_TIMEOUT_S * 1000) {
      webLog(`[PI] Min-Freq-Timeout: ${MIN_FREQ_TIMEOUT_S}s auf ${pi.freq_min} Hz, Druck ${pressure.toFixed(2)} < SP – Stop + Sperre ${DRY_RUN_LOCK_S}s`);
      mqtt.sendCmd('v20/stop', '1');
      dryRunLockUntil   = now + DRY_RUN_LOCK_S * 1000;
      pi.dry_run_locked = true;
      minFreqSince      = 0;
      resetIntegral();
      return;
    }
  } else {
    minFreqSince = 0;
  }

  pi.active     = true;
  pi.pump_state = pumpState;
  state.pi.active     = true;
  state.pi.pump_state = pumpState;
}

module.exports = { load, save, setConfig, resetDryrun, setVacation, tick, resetIntegral };
