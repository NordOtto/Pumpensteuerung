'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const state = require('./state');
const irrigation = require('./irrigation');

function resetState() {
  state.sys.mqtt = true;
  state.vacation.enabled = false;
  state.v20.fault = false;
  state.pi.dry_run_locked = false;
  state.timeguard.enabled = false;
  Object.assign(state.irrigation.weather, {
    forecast_rain_mm: 0,
    rain_24h_mm: 0,
    temp_c: 20,
    humidity_pct: 50,
    wind_kmh: 5,
    et0_mm: 3,
    soil_moisture_pct: null,
  });
  state.irrigation.history = [];
}

function program(overrides = {}) {
  return Object.assign({
    id: 'test',
    name: 'Test',
    enabled: true,
    seasonal_factor: 1,
    weather_enabled: true,
    min_runtime_factor: 0.25,
    max_runtime_factor: 1.5,
    thresholds: {
      skip_rain_mm: 6,
      reduce_rain_mm: 2,
      wind_max_kmh: 35,
      soil_moisture_skip_pct: 70,
      et0_default_mm: 3,
    },
    zones: [],
  }, overrides);
}

function smartProgram(overrides = {}) {
  return program(Object.assign({
    mode: 'smart_et',
    max_runs_per_week: 3,
    last_balance_date: new Date().toISOString().slice(0, 10),
    zones: [{
      id: 'garten',
      name: 'Garten',
      enabled: true,
      duration_min: 30,
      water_mm: 10,
      min_deficit_mm: 8,
      target_mm: 12,
      deficit_mm: 9,
      preset: 'Rasen',
    }],
  }, overrides));
}

test('skips when rain forecast and measured rain exceed threshold', () => {
  resetState();
  state.irrigation.weather.forecast_rain_mm = 5;
  state.irrigation.weather.rain_24h_mm = 1.5;

  const decision = irrigation.evaluateProgram(program());

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'Regenprognose');
});

test('skips when wind is above program limit', () => {
  resetState();
  state.irrigation.weather.wind_kmh = 42;

  const decision = irrigation.evaluateProgram(program());

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'Wind zu hoch');
});

test('reduces runtime when rain is useful but below skip threshold', () => {
  resetState();
  state.irrigation.weather.forecast_rain_mm = 2.5;

  const decision = irrigation.evaluateProgram(program());

  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, 'ET Freigabe');
  assert.ok(decision.runtime_factor < 1);
  assert.ok(decision.runtime_factor >= 0.25);
});

test('blocks when safety layer reports vacation mode', () => {
  resetState();
  state.vacation.enabled = true;

  const decision = irrigation.evaluateProgram(program(), { manual: true, forceWeather: true });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'Urlaubsmodus');
});

test('smart ET waits until zone deficit reaches minimum threshold', () => {
  resetState();

  const decision = irrigation.evaluateProgram(smartProgram({
    zones: [{
      id: 'garten',
      name: 'Garten',
      enabled: true,
      duration_min: 30,
      water_mm: 10,
      min_deficit_mm: 8,
      target_mm: 12,
      deficit_mm: 6,
      preset: 'Rasen',
    }],
  }));

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'Defizit zu gering');
});

test('smart ET allows deep watering and returns zone runtime', () => {
  resetState();

  const decision = irrigation.evaluateProgram(smartProgram());

  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, 'Smart ET Freigabe');
  assert.deepEqual(decision.zone_ids, ['garten']);
  assert.ok(decision.zone_runtimes.garten.runtime_s > 0);
});

test('smart ET blocks when weekly run limit is reached', () => {
  resetState();
  const p = smartProgram({ max_runs_per_week: 2 });
  const thisWeek = new Date();
  state.irrigation.history = [
    { type: 'run', result: 'completed', program_id: p.id, at: thisWeek.toISOString() },
    { type: 'run', result: 'completed', program_id: p.id, at: thisWeek.toISOString() },
  ];

  const decision = irrigation.evaluateProgram(p);

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'Wochenlimit erreicht');
});
