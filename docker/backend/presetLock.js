'use strict';

// ============================================================
//  presetLock.js – HA Heartbeat/TTL Preset-Lock
//
//  Verwendung in HA-Automation:
//    Loop while bewässerung an: alle 30s publish auf
//    pumpensteuerung/preset/lock/heartbeat
//    Payload: '{"preset":"Tropfschlauch","ttl":90000}' oder Name als String
//
//  Wenn Heartbeat ausbleibt (TTL abgelaufen) → Auto-Rollback.
//  Beim ersten Heartbeat wird zusätzlich ein evtl. aktiver
//  Trockenlauf-Lock aufgehoben (User-Anforderung: Frau startet
//  Bewässerung, Pumpe muss laufen).
// ============================================================

const state   = require('./state');
const presets = require('./presets');
const pi      = require('./pressureCtrl');

const DEFAULT_TTL_MS = 90000;
const FALLBACK_PRESET = 'Normal';

let lockedPreset    = '';
let lockUntil       = 0;
let previousPreset  = '';

function _publishState() {
  state.preset_lock.active        = lockUntil > 0;
  state.preset_lock.locked_preset = lockedPreset;
  state.preset_lock.remaining_s   = lockUntil > 0
    ? Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000))
    : 0;
}

function heartbeat(presetName, ttlMs) {
  if (!presetName || typeof presetName !== 'string') return false;
  const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS;
  const now = Date.now();

  if (lockUntil === 0) {
    // Erster Heartbeat: aktuelles Preset merken, neues aktivieren
    previousPreset = state.active_preset || FALLBACK_PRESET;
    lockedPreset   = presetName;
    // Trockenlauf auto-resetten (Bewässerung soll laufen können)
    pi.resetDryrun('lock');
    if (state.active_preset !== presetName) {
      const ok = presets.apply(presetName);
      if (!ok) {
        console.warn('[PresetLock] Preset nicht gefunden:', presetName);
        lockedPreset = '';
        previousPreset = '';
        return false;
      }
    }
    console.log(`[PresetLock] Lock aktiviert: ${presetName} (TTL ${ttl}ms, vorher: ${previousPreset})`);
  } else if (lockedPreset !== presetName) {
    // Anderes Preset gewünscht während Lock aktiv → wechseln, previousPreset bleibt
    presets.apply(presetName);
    lockedPreset = presetName;
    pi.resetDryrun('lock');
    console.log('[PresetLock] Lock-Preset gewechselt:', presetName);
  }

  lockUntil = now + ttl;
  _publishState();
  return true;
}

function clear() {
  if (lockUntil === 0) return;
  console.log('[PresetLock] Lock manuell gelöscht – Rollback zu', previousPreset || FALLBACK_PRESET);
  const target = previousPreset || FALLBACK_PRESET;
  lockedPreset   = '';
  lockUntil      = 0;
  previousPreset = '';
  presets.apply(target);
  _publishState();
}

function tick() {
  if (lockUntil === 0) {
    _publishState();
    return;
  }
  const now = Date.now();
  if (now >= lockUntil) {
    const target = previousPreset || FALLBACK_PRESET;
    console.log(`[PresetLock] TTL abgelaufen – Auto-Rollback zu ${target}`);
    lockedPreset   = '';
    lockUntil      = 0;
    previousPreset = '';
    presets.apply(target);
  }
  _publishState();
}

function isActive() {
  return lockUntil > 0;
}

function getStatus() {
  return {
    active:        lockUntil > 0,
    locked_preset: lockedPreset,
    previous:      previousPreset,
    remaining_s:   lockUntil > 0 ? Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000)) : 0,
  };
}

module.exports = { heartbeat, clear, tick, isActive, getStatus };
