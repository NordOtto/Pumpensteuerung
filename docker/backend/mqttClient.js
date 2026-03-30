'use strict';

// ============================================================
//  mqttClient.js – MQTT Brücke zwischen ESP32 und Backend
//
//  Subscribt:
//    pumpensteuerung/raw/#  → updateState()
//    pumpensteuerung/<HA-set-topics>  → Befehle ausführen
//
//  Publisht:
//    pumpensteuerung/cmd/*  → Befehle an ESP32
//    pumpensteuerung/*      → HA-Topics (alle 2s via publishHA())
// ============================================================

const mqtt    = require('mqtt');
const state   = require('./state');

const BROKER  = process.env.MQTT_BROKER || 'localhost';
const PORT    = parseInt(process.env.MQTT_PORT  || '1883');
const USER    = process.env.MQTT_USER   || '';
const PASS    = process.env.MQTT_PASS   || '';

const BASE    = 'pumpensteuerung';
const RAW     = BASE + '/raw';
const CMD     = BASE + '/cmd';

let client = null;
let _onCommandCallbacks = [];

// Externe Module registrieren sich für Befehle
function onCommand(cb) {
  _onCommandCallbacks.push(cb);
}

function fireCommand(topic, value) {
  _onCommandCallbacks.forEach(cb => {
    try { cb(topic, value); } catch (e) { console.error('[MQTT] onCommand error:', e.message); }
  });
}

// ── Rohe Sensordaten von ESP32 → state updaten ──
function handleRaw(suffix, msg) {
  const val = msg.toString();

  switch (suffix) {
    case 'v20/frequency':  state.v20.frequency  = parseFloat(val); break;
    case 'v20/current':    state.v20.current    = parseFloat(val); break;
    case 'v20/voltage':    state.v20.voltage    = parseFloat(val); break;
    case 'v20/power':      state.v20.power      = parseFloat(val); break;
    case 'v20/running':    state.v20.running    = val === 'ON'; break;
    case 'v20/connected':
      state.v20.connected    = val === 'ON';
      state.sys.rtu_connected = val === 'ON';
      break;
    case 'v20/fault':      state.v20.fault      = val === 'ON'; break;
    case 'v20/fault_code': state.v20.fault_code = parseInt(val); break;
    case 'v20/status':     state.v20.status     = val; break;
    case 'pressure':       state.pressure_bar   = parseFloat(val); break;
    case 'flow':           state.flow_rate      = parseFloat(val); break;
    case 'water_temp':     state.water_temp     = parseFloat(val); break;
    case 'temperature':    state.temperature    = parseFloat(val); break;
    case 'fan/rpm':        state.fan.rpm        = parseInt(val);   break;
    case 'fan/pwm':        state.fan.pwm        = parseInt(val);   break;
    case 'fan/mode':       state.fan.mode       = val;             break;
  }
}

// ── HA Set-Topics → Befehle an Steuerlogik weiterleiten ──
function handleHASet(topic, msg) {
  const val = msg.toString();
  fireCommand(topic, val);
}

// ── Befehl an ESP32 senden ──
function sendCmd(suffix, value) {
  if (!client || !client.connected) {
    console.warn('[MQTT] sendCmd: nicht verbunden, Befehl verworfen:', suffix, value);
    return;
  }
  const topic = CMD + '/' + suffix;
  client.publish(topic, String(value), { retain: false });
}

// ── HA Topics publishen (alle 2s vom server.js aufgerufen) ──
function publishHA() {
  if (!client || !client.connected) return;

  const pub = (suffix, val, retain = false) =>
    client.publish(BASE + '/' + suffix, String(val), { retain });

  // V20
  pub('v20/frequency',      state.v20.frequency.toFixed(2));
  pub('v20/current',        state.v20.current.toFixed(2));
  pub('v20/voltage',        state.v20.voltage.toFixed(1));
  pub('v20/power',          Math.round(state.v20.power));
  pub('v20/fault',          state.v20.fault ? 'ON' : 'OFF');
  pub('v20/fault_code',     state.v20.fault_code);
  pub('v20/connected',      state.v20.connected ? 'ON' : 'OFF');
  pub('v20/status',         state.v20.status);
  pub('v20/running/state',  state.v20.running ? 'ON' : 'OFF');
  pub('v20/freq_set/state', state.v20.freq_setpoint.toFixed(1));

  // Sensoren
  pub('pressure/state',      state.pressure_bar.toFixed(2),  true);
  pub('pressure/setpoint/state', state.pi.setpoint.toFixed(2), true);
  pub('flow/state',          state.flow_rate.toFixed(1));
  if (state.water_temp !== null) pub('water_temp', state.water_temp.toFixed(1));
  if (state.temperature !== null) pub('temperature', state.temperature.toFixed(1));

  // Lüfter
  pub('fan/rpm',        state.fan.rpm);
  pub('fan/pwm/state',  state.fan.pwm);
  pub('fan/mode/state', state.fan.mode);

  // PI
  pub('pi/enabled/state',    state.pi.enabled  ? 'ON' : 'OFF', true);
  pub('pi/active/state',     state.pi.active   ? 'AKTIV' : 'INAKTIV', true);
  pub('pi/freq_min/state',   state.pi.freq_min.toFixed(1), true);
  pub('pi/freq_max/state',   state.pi.freq_max.toFixed(1), true);
  pub('dryrun/locked',       state.pi.dry_run_locked ? 'ON' : 'OFF', true);

  // Zeitsperre
  pub('timeguard/enabled/state', state.timeguard.enabled ? 'ON' : 'OFF', true);
  pub('timeguard/allowed',       state.timeguard.allowed ? 'ON' : 'OFF', true);

  // Urlaubsmodus
  pub('vacation/state', state.vacation.enabled ? 'ON' : 'OFF', true);

  // Preset
  pub('preset/state',    state.active_preset, true);
  pub('ctrl_mode/state', state.ctrl_mode === 1 ? 'Durchfluss' : 'Druck', true);

  // System
  pub('sys/uptime', state.sys.uptime);
}

// ── Verbindung aufbauen ──
function connect() {
  const url = `mqtt://${BROKER}:${PORT}`;
  console.log(`[MQTT] Verbinde mit ${url} …`);

  client = mqtt.connect(url, {
    clientId:  'pumpensteuerung-backend',
    username:  USER || undefined,
    password:  PASS || undefined,
    clean:     true,
    reconnectPeriod: 5000,
  });

  client.on('connect', () => {
    console.log('[MQTT] Verbunden!');
    state.sys.mqtt = true;

    // raw Sensordaten vom ESP32
    client.subscribe(RAW + '/#', { qos: 0 });

    // HA Set-Topics (Befehle von HA oder Browser via alten Topics)
    const haSetTopics = [
      BASE + '/v20/running/set',
      BASE + '/v20/freq_set/set',
      BASE + '/v20/fault_reset',
      BASE + '/pressure/setpoint/set',
      BASE + '/pi/enabled/set',
      BASE + '/pi/freq_min/set',
      BASE + '/pi/freq_max/set',
      BASE + '/timeguard/enabled/set',
      BASE + '/preset/set',
      BASE + '/fan/pwm/set',
      BASE + '/fan/mode/set',
      BASE + '/dryrun/reset',
      BASE + '/vacation/set',
    ];
    haSetTopics.forEach(t => client.subscribe(t, { qos: 0 }));
    console.log('[MQTT] Topics abonniert');
  });

  client.on('message', (topic, msg) => {
    if (topic.startsWith(RAW + '/')) {
      handleRaw(topic.slice(RAW.length + 1), msg);
    } else {
      handleHASet(topic, msg);
    }
  });

  client.on('disconnect', () => {
    state.sys.mqtt = false;
    console.log('[MQTT] Verbindung getrennt');
  });

  client.on('error', (err) => {
    state.sys.mqtt = false;
    console.error('[MQTT] Fehler:', err.message);
  });
}

function isConnected() {
  return client && client.connected;
}

module.exports = { connect, sendCmd, publishHA, onCommand, isConnected };
