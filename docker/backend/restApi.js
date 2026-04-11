'use strict';

// ============================================================
//  restApi.js – Express REST API für Browser-Dashboard
//  Identische Routen wie der ESP32-Webserver
// ============================================================

const express  = require('express');
const state    = require('./state');
const mqttCli  = require('./mqttClient');
const pi       = require('./pressureCtrl');
const tg       = require('./timeguard');
const presets  = require('./presets');
const auth     = require('./auth');

const router = express.Router();

// ── Auth ──
router.post('/auth/login', (req, res) => {
  const { user, pass } = req.body || {};
  const result = auth.login(user, pass);
  if (result) return res.json({ ok: true, token: result.token, mustChangePass: result.mustChangePass });
  res.status(401).json({ error: 'Benutzername oder Passwort falsch' });
});

router.post('/auth/change-password', (req, res) => {
  const token = auth.extractToken(req);
  const { oldPass, newPass } = req.body || {};
  const result = auth.changePassword(token, oldPass, newPass);
  if (result.ok) return res.json({ ok: true });
  res.status(400).json({ error: result.error });
});

// ── V20 Steuerbefehle ──
router.post('/v20/start', (_req, res) => {
  if (!tg.isAllowed()) return res.status(403).json({ ok: false, error: 'Zeitsperre aktiv' });
  if (state.vacation.enabled) return res.status(403).json({ ok: false, error: 'Urlaubsmodus aktiv' });
  mqttCli.sendCmd('v20/start', '1');
  res.json({ ok: true });
});

router.post('/v20/stop', (_req, res) => {
  mqttCli.sendCmd('v20/stop', '1');
  res.json({ ok: true });
});

router.post('/v20/reset', (_req, res) => {
  mqttCli.sendCmd('v20/reset', '1');
  res.json({ ok: true });
});

router.post('/v20/freq', (req, res) => {
  const hz = parseFloat(req.body?.hz);
  if (isNaN(hz) || hz < 0 || hz > 60) {
    return res.status(400).json({ error: 'invalid hz' });
  }
  if (state.pi.active) {
    // PI aktiv → Slider setzt freq_max
    state.pi.freq_max = hz;
    pi.save().catch(e => console.error('[PI] save error:', e.message));
    res.json({ ok: true, mode: 'pi_max', freq_max: hz });
  } else {
    // PI inaktiv → Frequenz direkt setzen
    mqttCli.sendCmd('v20/freq', hz.toFixed(1));
    state.v20.freq_setpoint = hz;
    res.json({ ok: true, mode: 'manual' });
  }
});

// ── PI-Druckregelung ──
router.get('/pressure', (_req, res) => {
  const p = state.pi;
  res.json({
    enabled:    p.enabled,
    setpoint:   p.setpoint,
    p_on:       p.p_on,
    p_off:      p.p_off,
    kp:         p.kp,
    ki:         p.ki,
    freq_min:   p.freq_min,
    freq_max:   p.freq_max,
    pressure:   state.pressure_bar,
    active:     p.active,
    pump_state: p.pump_state,
  });
});

router.post('/pressure', (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'invalid json' });
  }
  pi.setConfig(req.body);
  res.json({ ok: true });
});

router.post('/pressure/reset_dryrun', (_req, res) => {
  pi.resetDryrun();
  res.json({ ok: true });
});

// ── Zeitsperre ──
router.get('/timeguard', (_req, res) => {
  const t = state.timeguard;
  res.json({
    enabled:    t.enabled,
    start_hour: t.start_hour,
    start_min:  t.start_min,
    end_hour:   t.end_hour,
    end_min:    t.end_min,
    days:       t.days,
    allowed:    t.allowed,
    synced:     t.synced,
    time:       t.time,
  });
});

router.post('/timeguard', (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'invalid json' });
  }
  tg.setConfig(req.body);
  res.json({ ok: true });
});

// ── Presets ──
router.get('/presets', (_req, res) => {
  res.json(presets.list());
});

router.post('/presets', (req, res) => {
  if (!req.body?.name) {
    return res.status(400).json({ error: 'name required' });
  }
  if (!presets.addOrUpdate(req.body)) {
    return res.status(507).json({ error: 'preset list full' });
  }
  res.json({ ok: true });
});

router.delete('/presets/:name', (req, res) => {
  const name = req.params.name;
  if (!name) return res.status(400).json({ error: 'name required' });
  const ok = presets.deletePreset(name);
  if (!ok) {
    if (state.active_preset === name) {
      return res.status(409).json({ error: 'Aktives Preset kann nicht gelöscht werden' });
    }
    return res.status(404).json({ error: 'Preset nicht gefunden' });
  }
  res.json({ ok: true });
});

router.post('/preset/apply', (req, res) => {
  const name = req.body?.name;
  if (!name) return res.status(400).json({ error: 'name required' });
  if (!presets.apply(name)) {
    return res.status(404).json({ error: 'preset not found' });
  }
  res.json({ ok: true });
});

// ── Urlaubsmodus ──
router.get('/vacation', (_req, res) => {
  res.json({ enabled: state.vacation.enabled });
});

router.post('/vacation', (req, res) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled (boolean) required' });
  }
  pi.setVacation(enabled);
  res.json({ ok: true });
});

// ── Fan ──
router.post('/fan/pwm', (req, res) => {
  const pwm = parseInt(req.body?.pwm);
  if (isNaN(pwm) || pwm < 0 || pwm > 255) {
    return res.status(400).json({ error: 'invalid pwm' });
  }
  mqttCli.sendCmd('fan/pwm', pwm);
  res.json({ ok: true });
});

router.post('/fan/mode', (req, res) => {
  const mode = req.body?.mode;
  if (!['Auto', 'LOGO', 'MQTT', 'Web'].includes(mode)) {
    return res.status(400).json({ error: 'invalid mode' });
  }
  mqttCli.sendCmd('fan/mode', mode);
  res.json({ ok: true });
});

// ── Status (Fallback wenn WS nicht verbunden) ──
router.get('/status', (_req, res) => {
  const pi  = state.pi;
  const tg  = state.timeguard;
  res.json({
    v20: state.v20,
    temp: state.temperature,
    fan: state.fan,
    timeguard: {
      enabled: tg.enabled, allowed: tg.allowed, synced: tg.synced,
      time: tg.time,
      start: `${String(tg.start_hour).padStart(2,'0')}:${String(tg.start_min).padStart(2,'0')}`,
      end:   `${String(tg.end_hour).padStart(2,'0')}:${String(tg.end_min).padStart(2,'0')}`,
      days: tg.days,
    },
    pi: {
      pressure: state.pressure_bar, flow: state.flow_rate,
      flow_est: state.flow_estimated, water_temp: state.water_temp,
      setpoint: pi.setpoint, p_on: pi.p_on, p_off: pi.p_off,
      active: pi.active, enabled: pi.enabled, pump_state: pi.pump_state,
      kp: pi.kp, ki: pi.ki, freq_min: pi.freq_min, freq_max: pi.freq_max,
      dry_run_locked: pi.dry_run_locked, flow_setpoint: pi.flow_setpoint,
      ctrl_mode: pi.ctrl_mode,
    },
    active_preset: state.active_preset,
    ctrl_mode: state.ctrl_mode,
    vacation: { enabled: state.vacation.enabled },
    sys: state.sys,
  });
});

module.exports = router;
