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
