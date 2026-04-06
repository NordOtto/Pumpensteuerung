'use strict';

// ============================================================
//  presets.js – Betriebsmodi / Preset-Verwaltung
// ============================================================

const fs    = require('fs').promises;
const path  = require('path');
const state = require('./state');
const pi    = require('./pressureCtrl');

const DATA_FILE = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'presets.json')
  : '/data/presets.json';

const DEFAULT_PRESET = {
  name:     'Normal',
  mode:     0,      // 0=Druck, 1=Durchfluss
  setpoint: 3.0,
  kp:       8.0,
  ki:       1.0,
  freq_min: 35.0,
  freq_max: 50.0,
};

let presets = [{ ...DEFAULT_PRESET }];

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
  const entry = {
    name:     preset.name,
    mode:     parseInt(preset.mode)     || 0,
    setpoint: parseFloat(preset.setpoint) || 3.0,
    kp:       parseFloat(preset.kp)       || 8.0,
    ki:       parseFloat(preset.ki)       || 1.0,
    freq_min: parseFloat(preset.freq_min) || 35.0,
    freq_max: parseFloat(preset.freq_max) || 50.0,
  };
  if (idx >= 0) {
    presets[idx] = entry;
  } else {
    if (presets.length >= 20) return false;
    presets.push(entry);
  }
  saveToDisk().catch(e => console.error('[Presets] save error:', e.message));
  return true;
}

function deletePreset(name) {
  if (state.active_preset === name) return false;
  const idx = presets.findIndex(p => p.name === name);
  if (idx < 0) return false;
  presets.splice(idx, 1);
  saveToDisk().catch(e => console.error('[Presets] save error:', e.message));
  return true;
}

function apply(name) {
  const preset = presets.find(p => p.name === name);
  if (!preset) return false;

  // PI zurücksetzen und neu konfigurieren
  pi.resetIntegral();
  pi.setConfig({
    setpoint: preset.setpoint,
    kp:       preset.kp,
    ki:       preset.ki,
    freq_min: preset.freq_min,
    freq_max: preset.freq_max,
  });

  state.pi.ctrl_mode    = preset.mode;
  state.pi.flow_setpoint = preset.mode === 1 ? preset.setpoint : 0;
  state.active_preset   = name;
  state.ctrl_mode       = preset.mode;

  console.log('[Presets] Aktiviert:', name);
  return true;
}

module.exports = { load, list, addOrUpdate, deletePreset, apply };
