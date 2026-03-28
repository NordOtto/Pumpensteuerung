'use strict';

// ============================================================
//  state.js – Gemeinsamer Anwendungszustand im Backend
//  Entspricht AppState in config.h + PI/Timeguard/Preset-State
// ============================================================

const state = {
  // ── V20 Ist-Werte (von ESP32 raw Topics) ──
  v20: {
    frequency:    0,
    current:      0,
    voltage:      0,
    power:        0,        // Watt
    running:      false,
    connected:    false,
    fault:        false,
    fault_code:   0,
    status:       'OFFLINE',
    freq_setpoint: 0,
  },

  // ── Sensoren (von LOGO via ESP32 raw Topics) ──
  pressure_bar:    0,
  flow_rate:       0,
  flow_estimated:  false,
  water_temp:      null,

  // ── DS18B20 ──
  temperature:     null,

  // ── Lüfter ──
  fan: {
    rpm:  0,
    pwm:  0,
    mode: 'Auto',
  },

  // ── PI-Druckregelung (Backend-State) ──
  pi: {
    enabled:        true,
    setpoint:       3.0,    // bar (PI-Sollwert)
    p_on:           2.2,    // bar (Einschaltdruck)
    p_off:          4.0,    // bar (Ausschaltdruck)
    kp:             8.0,
    ki:             1.0,
    freq_min:       35.0,
    freq_max:       50.0,
    active:         false,
    pump_state:     0,      // 0=AUS, 1=STARTET, 2=LÄUFT
    dry_run_locked: false,
    flow_setpoint:  0,      // L/min (nur CTRL_FLOW Modus)
    ctrl_mode:      0,      // 0=Druck, 1=Durchfluss
  },

  // ── Zeitsperre (Backend-State) ──
  timeguard: {
    enabled:    true,
    start_hour: 7,
    start_min:  0,
    end_hour:   22,
    end_min:    0,
    days:       [true, true, true, true, true, true, true],
    allowed:    true,
    synced:     true,
    time:       '--:--',
  },

  // ── Presets (Backend-State) ──
  active_preset: 'Normal',
  ctrl_mode:     0,           // 0=Druck, 1=Durchfluss

  // ── System ──
  sys: {
    uptime:        0,
    mqtt:          false,
    fw:            'backend-1.0.0',
    rtu_connected: false,
    tcp_clients:   0,
    ip:            '',
  },

  // ── Log-Puffer (für WebSocket) ──
  logBuffer: [],
  logSeq:    0,
};

module.exports = state;
