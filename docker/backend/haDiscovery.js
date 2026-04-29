'use strict';

// ============================================================
//  haDiscovery.js – Home Assistant MQTT Auto-Discovery
//  Identische Entities wie bisher von der ESP32-Firmware
// ============================================================

const mqttClient = require('./mqttClient');
const presets    = require('./presets');

// Wird nach Preset-CRUD aufgerufen – aktualisiert nur die Select-Optionen in HA
function refreshPresetSelect() {
  const presetList = presets.list();
  const topic = `homeassistant/select/pumpensteuerung/preset/config`;
  const payload = JSON.stringify({
    name: 'Betriebsmodus',
    stat_t: `${BASE}/preset/state`,
    cmd_t:  `${BASE}/preset/set`,
    options: presetList.presets.map(p => p.name),
    uniq_id: 'pumpensteuerung_preset',
    ic: 'mdi:water-pump',
    dev: DEV,
  });
  mqttClient.publish(topic, payload, { retain: true });
  console.log('[HA] Preset-Select aktualisiert:', presetList.presets.map(p => p.name).join(', '));
}

const BASE   = 'pumpensteuerung';
const DEV    = {
  ids:  'pumpensteuerung',
  name: 'Pumpensteuerung',
  mf:   'DIY',
  mdl:  'ESP32 + Docker Backend',
  sw:   'backend-1.0.0',
};

let mqttRef = null;

function pub(component, objectId, payload) {
  const topic = `homeassistant/${component}/pumpensteuerung/${objectId}/config`;
  payload.dev = DEV;
  const json  = JSON.stringify(payload);
  mqttRef.publish(topic, json, { retain: true });
}

function sendDiscovery(client) {
  mqttRef = client;
  console.log('[HA] Sende Auto-Discovery …');

  // ── Sensoren V20 ──
  pub('sensor', 'v20_freq', {
    name: 'V20 Frequenz', stat_t: `${BASE}/v20/frequency`,
    unit_of_meas: 'Hz', dev_cla: 'frequency',
    uniq_id: 'pumpensteuerung_v20_freq', ic: 'mdi:sine-wave',
  });
  pub('sensor', 'v20_current', {
    name: 'V20 Motorstrom', stat_t: `${BASE}/v20/current`,
    unit_of_meas: 'A', dev_cla: 'current',
    uniq_id: 'pumpensteuerung_v20_current',
  });
  pub('sensor', 'v20_voltage', {
    name: 'V20 Spannung', stat_t: `${BASE}/v20/voltage`,
    unit_of_meas: 'V', dev_cla: 'voltage',
    uniq_id: 'pumpensteuerung_v20_voltage',
  });
  pub('sensor', 'v20_power', {
    name: 'V20 Leistung', stat_t: `${BASE}/v20/power`,
    unit_of_meas: 'W', dev_cla: 'power', ic: 'mdi:flash',
    uniq_id: 'pumpensteuerung_v20_power',
  });
  pub('sensor', 'v20_fault_code', {
    name: 'V20 Fehlercode', stat_t: `${BASE}/v20/fault_code`,
    uniq_id: 'pumpensteuerung_v20_fault_code', ic: 'mdi:alert-circle',
  });
  pub('sensor', 'v20_status', {
    name: 'V20 Status', stat_t: `${BASE}/v20/status`,
    uniq_id: 'pumpensteuerung_v20_status', ic: 'mdi:state-machine',
  });
  pub('sensor', 'v20_temperature', {
    name: 'V20 Temperatur', stat_t: `${BASE}/v20/temperature`,
    unit_of_meas: '°C', dev_cla: 'temperature',
    uniq_id: 'pumpensteuerung_v20_temperature',
  });

  // ── Binary Sensors ──
  pub('binary_sensor', 'v20_connected', {
    name: 'V20 Verbunden', stat_t: `${BASE}/v20/connected`,
    dev_cla: 'connectivity', payload_on: 'ON', payload_off: 'OFF',
    uniq_id: 'pumpensteuerung_v20_connected',
  });
  pub('binary_sensor', 'v20_fault', {
    name: 'V20 Störung', stat_t: `${BASE}/v20/fault`,
    dev_cla: 'problem', payload_on: 'ON', payload_off: 'OFF',
    uniq_id: 'pumpensteuerung_v20_fault',
  });
  pub('binary_sensor', 'timeguard_allowed', {
    name: 'Zeitfenster', stat_t: `${BASE}/timeguard/allowed`,
    payload_on: 'ON', payload_off: 'OFF',
    uniq_id: 'pumpensteuerung_timeguard_allowed', ic: 'mdi:clock',
  });
  pub('binary_sensor', 'dryrun_locked', {
    name: 'Trockenlauf-Sperre', stat_t: `${BASE}/dryrun/locked`,
    dev_cla: 'problem', payload_on: 'ON', payload_off: 'OFF',
    uniq_id: 'pumpensteuerung_dryrun_locked', ic: 'mdi:water-off',
  });

  // ── Switches ──
  pub('switch', 'v20_running', {
    name: 'V20 Start/Stop',
    stat_t: `${BASE}/v20/running/state`,
    cmd_t:  `${BASE}/v20/running/set`,
    payload_on: 'ON', payload_off: 'OFF',
    uniq_id: 'pumpensteuerung_v20_running', ic: 'mdi:pump',
  });
  pub('switch', 'pi_enabled', {
    name: 'PI Druckregelung',
    stat_t: `${BASE}/pi/enabled/state`,
    cmd_t:  `${BASE}/pi/enabled/set`,
    payload_on: 'ON', payload_off: 'OFF',
    uniq_id: 'pumpensteuerung_pi_enabled', ic: 'mdi:gauge',
  });
  pub('switch', 'timeguard_enabled', {
    name: 'Zeitsperre',
    stat_t: `${BASE}/timeguard/enabled/state`,
    cmd_t:  `${BASE}/timeguard/enabled/set`,
    payload_on: 'ON', payload_off: 'OFF',
    uniq_id: 'pumpensteuerung_timeguard_enabled', ic: 'mdi:clock-outline',
  });

  // ── Numbers ──
  pub('number', 'v20_freq_set', {
    name: 'V20 Frequenz Soll',
    stat_t: `${BASE}/v20/freq_set/state`,
    cmd_t:  `${BASE}/v20/freq_set/set`,
    min: 0, max: 60, step: 0.5, unit_of_meas: 'Hz',
    uniq_id: 'pumpensteuerung_v20_freq_set', ic: 'mdi:sine-wave',
  });
  pub('number', 'pi_setpoint', {
    name: 'Druck Sollwert',
    stat_t: `${BASE}/pressure/setpoint/state`,
    cmd_t:  `${BASE}/pressure/setpoint/set`,
    min: 0.1, max: 6.0, step: 0.1, unit_of_meas: 'bar',
    uniq_id: 'pumpensteuerung_pi_setpoint', ic: 'mdi:gauge',
  });
  pub('number', 'pi_freq_min', {
    name: 'PI Freq Min',
    stat_t: `${BASE}/pi/freq_min/state`,
    cmd_t:  `${BASE}/pi/freq_min/set`,
    min: 10, max: 60, step: 1, unit_of_meas: 'Hz',
    uniq_id: 'pumpensteuerung_pi_freq_min',
  });
  pub('number', 'pi_freq_max', {
    name: 'PI Freq Max',
    stat_t: `${BASE}/pi/freq_max/state`,
    cmd_t:  `${BASE}/pi/freq_max/set`,
    min: 10, max: 60, step: 1, unit_of_meas: 'Hz',
    uniq_id: 'pumpensteuerung_pi_freq_max',
  });
  pub('number', 'fan_pwm', {
    name: 'Lüfter PWM',
    stat_t: `${BASE}/fan/pwm/state`,
    cmd_t:  `${BASE}/fan/pwm/set`,
    min: 0, max: 255, step: 1,
    uniq_id: 'pumpensteuerung_fan_pwm', ic: 'mdi:fan',
  });

  // ── Buttons ──
  pub('button', 'v20_fault_reset', {
    name: 'V20 Fehler quittieren',
    cmd_t: `${BASE}/v20/fault_reset`,
    uniq_id: 'pumpensteuerung_v20_fault_reset', ic: 'mdi:alert-circle-check',
  });
  pub('button', 'dryrun_reset', {
    name: 'Trockenlauf-Sperre aufheben',
    cmd_t: `${BASE}/dryrun/reset`,
    uniq_id: 'pumpensteuerung_dryrun_reset', ic: 'mdi:water-check',
  });

  // ── Sensoren: Druck / Durchfluss / Temperatur ──
  pub('sensor', 'pressure', {
    name: 'Druck', stat_t: `${BASE}/pressure/state`,
    unit_of_meas: 'bar', dev_cla: 'pressure',
    uniq_id: 'pumpensteuerung_pressure', ic: 'mdi:gauge',
  });
  pub('sensor', 'flow', {
    name: 'Durchfluss', stat_t: `${BASE}/flow/state`,
    unit_of_meas: 'L/min',
    uniq_id: 'pumpensteuerung_flow', ic: 'mdi:waves',
  });
  pub('sensor', 'water_temp', {
    name: 'Wassertemperatur', stat_t: `${BASE}/water_temp`,
    unit_of_meas: '°C', dev_cla: 'temperature',
    uniq_id: 'pumpensteuerung_water_temp',
  });
  pub('sensor', 'temperature', {
    name: 'Gateway Temperatur', stat_t: `${BASE}/temperature`,
    unit_of_meas: '°C', dev_cla: 'temperature',
    uniq_id: 'pumpensteuerung_temperature',
  });

  // ── Sensoren: PI / Lüfter / System ──
  pub('sensor', 'pi_active', {
    name: 'PI Status', stat_t: `${BASE}/pi/active/state`,
    uniq_id: 'pumpensteuerung_pi_active', ic: 'mdi:gauge-full',
  });
  pub('sensor', 'fan_rpm', {
    name: 'Lüfter RPM', stat_t: `${BASE}/fan/rpm`,
    unit_of_meas: 'rpm',
    uniq_id: 'pumpensteuerung_fan_rpm', ic: 'mdi:fan',
  });
  pub('sensor', 'uptime', {
    name: 'Uptime', stat_t: `${BASE}/sys/uptime`,
    unit_of_meas: 's', dev_cla: 'duration', ent_cat: 'diagnostic',
    uniq_id: 'pumpensteuerung_uptime', ic: 'mdi:timer-outline',
  });

  // ── Spike-Konfiguration ──
  pub('switch', 'pi_spike_enabled', {
    name: 'Hahn-zu Erkennung',
    stat_t: `${BASE}/pi/spike/enabled/state`,
    cmd_t:  `${BASE}/pi/spike/enabled/set`,
    payload_on: 'ON', payload_off: 'OFF',
    uniq_id: 'pumpensteuerung_pi_spike_enabled', ic: 'mdi:water-alert',
  });
  pub('number', 'pi_spike_threshold', {
    name: 'Hahn-zu Druckanstieg',
    stat_t: `${BASE}/pi/spike/threshold/state`,
    cmd_t:  `${BASE}/pi/spike/threshold/set`,
    min: 0.05, max: 5.0, step: 0.05, unit_of_meas: 'bar',
    uniq_id: 'pumpensteuerung_pi_spike_threshold', ic: 'mdi:gauge-full',
  });
  pub('number', 'pi_spike_window', {
    name: 'Hahn-zu Zeitfenster',
    stat_t: `${BASE}/pi/spike/window/state`,
    cmd_t:  `${BASE}/pi/spike/window/set`,
    min: 1, max: 10, step: 0.5, unit_of_meas: 's',
    uniq_id: 'pumpensteuerung_pi_spike_window', ic: 'mdi:timer',
  });

  // ── Selects: Fan Mode / Preset ──
  pub('select', 'fan_mode', {
    name: 'Lüfter Modus',
    stat_t: `${BASE}/fan/mode/state`,
    cmd_t:  `${BASE}/fan/mode/set`,
    options: ['Auto', 'LOGO', 'MQTT', 'Web'],
    uniq_id: 'pumpensteuerung_fan_mode', ic: 'mdi:cog',
  });

  const presetList = presets.list();
  pub('select', 'preset', {
    name: 'Betriebsmodus',
    stat_t: `${BASE}/preset/state`,
    cmd_t:  `${BASE}/preset/set`,
    options: presetList.presets.map(p => p.name),
    uniq_id: 'pumpensteuerung_preset', ic: 'mdi:water-pump',
  });

  pub('sensor', 'ctrl_mode', {
    name: 'Regelungsmodus', stat_t: `${BASE}/ctrl_mode/state`,
    uniq_id: 'pumpensteuerung_ctrl_mode', ic: 'mdi:tune',
  });

  // ── HA Preset-Lock ──
  pub('binary_sensor', 'preset_lock', {
    name: 'HA Preset-Lock aktiv', stat_t: `${BASE}/preset/lock/state`,
    payload_on: 'ON', payload_off: 'OFF',
    uniq_id: 'pumpensteuerung_preset_lock', ic: 'mdi:lock-clock',
  });
  pub('sensor', 'preset_lock_remaining', {
    name: 'HA Preset-Lock Restzeit', stat_t: `${BASE}/preset/lock/remaining_s`,
    unit_of_meas: 's', dev_cla: 'duration', ent_cat: 'diagnostic',
    uniq_id: 'pumpensteuerung_preset_lock_remaining', ic: 'mdi:timer-sand',
  });
  pub('sensor', 'preset_lock_locked', {
    name: 'HA Preset-Lock Preset', stat_t: `${BASE}/preset/lock/locked`,
    ent_cat: 'diagnostic',
    uniq_id: 'pumpensteuerung_preset_lock_locked', ic: 'mdi:water-pump',
  });
  pub('button', 'preset_lock_clear', {
    name: 'HA Preset-Lock löschen',
    cmd_t: `${BASE}/preset/lock/clear`,
    uniq_id: 'pumpensteuerung_preset_lock_clear', ic: 'mdi:lock-open-variant',
  });

  console.log('[HA] Auto-Discovery gesendet');
}

module.exports = { sendDiscovery, refreshPresetSelect };
