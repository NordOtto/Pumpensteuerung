'use strict';

// ============================================================
//  presets.js – Betriebsmodi / Preset-Verwaltung
// ============================================================

const fs    = require('fs').promises;
const path  = require('path');
const state = require('./state');
const pi    = require('./pressureCtrl');
const mqtt  = require('./mqttClient');

const DATA_FILE = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'presets.json')
  : '/data/presets.json';

const DEFAULT_PRESET = {
  name:     'Normal',
  mode:     0,      // 0=Druck, 1=Durchfluss, 2=FixFrequenz
  setpoint: 3.0,
  kp:       8.0,
  ki:       1.0,
  freq_min: 35.0,
  freq_max: 52.0,
  setpoint_hz:       0,    // nur mode=2: feste Frequenz
  expected_pressure: 0,    // nur mode=2: erwarteter Druck (für Trockenlauf-/Überdruck-Schutz)
};

let presets = [{ ...DEFAULT_PRESET }];
let _onChanged = null;
function onPresetsChanged(cb) { _onChanged = cb; }
function _notifyChanged() { if (_onChanged) try { _onChanged(); } catch {} }

function clampHz(v) {
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.max(10, Math.min(60, v));
}
function clampPressure(v) {
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.max(0.1, Math.min(8.0, v));
}

async function load() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    const saved = JSON.parse(data);
    if (Array.isArray(saved) && saved.length > 0) {
      presets = saved;
    }
    // Sicherstellen dass Normal-Preset existiert
    if (!presets.find(p => p.name === 'Normal')) {
      presets.unshift({ ...DEFAULT_PRESET });
    }
    console.log('[Presets] Geladen:', presets.map(p => p.name).join(', '));
  } catch {
    console.log('[Presets] Keine Datei gefunden – Standard-Preset genutzt');
  }
}

async function saveToDisk() {
  await fs.writeFile(DATA_FILE, JSON.stringify(presets, null, 2));
}

function list() {
  return {
    active:  state.active_preset,
    presets: presets.map(p => ({ ...p })),
  };
}

function addOrUpdate(preset) {
  if (!preset.name || preset.name.length > 32) return false;
  const idx = presets.findIndex(p => p.name === preset.name);
  const mode = parseInt(preset.mode);
  const entry = {
    name:     preset.name,
    mode:     (mode === 1 || mode === 2) ? mode : 0,
    setpoint: parseFloat(preset.setpoint) || 3.0,
    kp:       parseFloat(preset.kp)       || 8.0,
    ki:       parseFloat(preset.ki)       || 1.0,
    freq_min: parseFloat(preset.freq_min) || 35.0,
    freq_max: parseFloat(preset.freq_max) || 52.0,
    setpoint_hz:       clampHz(parseFloat(preset.setpoint_hz)),
    expected_pressure: clampPressure(parseFloat(preset.expected_pressure)),
  };
  if (idx >= 0) {
    presets[idx] = entry;
  } else {
    if (presets.length >= 20) return false;
    presets.push(entry);
  }
  saveToDisk().catch(e => console.error('[Presets] save error:', e.message));
  _notifyChanged();
  return true;
}

function deletePreset(name) {
  if (state.active_preset === name) return false;
  const idx = presets.findIndex(p => p.name === name);
  if (idx < 0) return false;
  presets.splice(idx, 1);
  saveToDisk().catch(e => console.error('[Presets] save error:', e.message));
  _notifyChanged();
  return true;
}

function apply(name) {
  const preset = presets.find(p => p.name === name);
  if (!preset) return false;

  pi.resetIntegral();

  if (preset.mode === 2) {
    // Fix-Frequenz-Preset: PI deaktivieren, Frequenz direkt setzen
    state.pi.enabled = false;
    state.pi.ctrl_mode      = 2;
    state.pi.flow_setpoint  = 0;
    state.active_preset     = name;
    state.ctrl_mode         = 2;
    state.preset_expected_pressure = preset.expected_pressure || 0;
    state.preset_setpoint_hz       = preset.setpoint_hz || 0;
    // Frequenz und Start an V20 senden — pressureCtrl.tick() refresht regelmäßig
    if (preset.setpoint_hz > 0) {
      mqtt.sendCmd('v20/start', '1');
      mqtt.sendCmd('v20/freq', preset.setpoint_hz.toFixed(1));
      state.v20.freq_setpoint = preset.setpoint_hz;
    }
    console.log('[Presets] Aktiviert (FixHz):', name, preset.setpoint_hz, 'Hz');
    return true;
  }

  // mode 0/1: PI re-konfigurieren und aktivieren
  // Wenn von Fix-Frequenz-Modus gewechselt wird: Pumpe sofort stoppen
  if (state.ctrl_mode === 2) {
    mqtt.sendCmd('v20/stop', '1');
  }
  pi.setConfig({
    enabled:  true,
    setpoint: preset.setpoint,
    kp:       preset.kp,
    ki:       preset.ki,
    freq_min: preset.freq_min,
    freq_max: preset.freq_max,
  });

  state.pi.ctrl_mode      = preset.mode;
  state.pi.flow_setpoint  = preset.mode === 1 ? preset.setpoint : 0;
  state.active_preset     = name;
  state.ctrl_mode         = preset.mode;
  state.preset_expected_pressure = 0;
  state.preset_setpoint_hz       = 0;

  console.log('[Presets] Aktiviert:', name);
  return true;
}

module.exports = { load, list, addOrUpdate, deletePreset, apply, onPresetsChanged };
