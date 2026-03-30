'use strict';

// ============================================================
//  websocketServer.js – WebSocket Server für Browser-Clients
//  Sendet dieselbe JSON-Struktur wie der ESP32-Webserver
// ============================================================

const { WebSocketServer, WebSocket } = require('ws');
const state = require('./state');

let wss = null;

function buildStatusJson() {
  const pi  = state.pi;
  const tg  = state.timeguard;

  const h = String(Math.floor(state.sys.uptime / 3600) % 24).padStart(2,'0');
  const m = String(Math.floor(state.sys.uptime / 60) % 60).padStart(2,'0');
  const s = String(state.sys.uptime % 60).padStart(2,'0');

  return JSON.stringify({
    v20: {
      status:        state.v20.status,
      frequency:     Math.round(state.v20.frequency * 100) / 100,
      freq_setpoint: Math.round(state.v20.freq_setpoint * 10) / 10,
      voltage:       Math.round(state.v20.voltage * 10) / 10,
      current:       Math.round(state.v20.current * 100) / 100,
      dc_bus:        0,
      power:         Math.round(state.v20.power) / 1000,  // W → kW für UI
      fault:         state.v20.fault ? 1 : 0,
      fault_code:    state.v20.fault_code,
      running:       state.v20.running,
      connected:     state.v20.connected,
    },
    temp: state.temperature !== null ? Math.round(state.temperature * 10) / 10 : -127,
    fan: {
      rpm:  state.fan.rpm,
      pwm:  state.fan.pwm,
      mode: state.fan.mode,
    },
    timeguard: {
      enabled: tg.enabled,
      allowed: tg.allowed,
      synced:  tg.synced,
      time:    tg.time,
      start:   `${String(tg.start_hour).padStart(2,'0')}:${String(tg.start_min).padStart(2,'0')}`,
      end:     `${String(tg.end_hour).padStart(2,'0')}:${String(tg.end_min).padStart(2,'0')}`,
      days:    tg.days,
    },
    pi: {
      pressure:       Math.round(state.pressure_bar * 100) / 100,
      flow:           Math.round(state.flow_rate * 100) / 100,
      flow_est:       state.flow_estimated,
      water_temp:     state.water_temp !== null ? Math.round(state.water_temp * 10) / 10 : -127,
      setpoint:       pi.setpoint,
      p_on:           pi.p_on,
      p_off:          pi.p_off,
      active:         pi.active,
      enabled:        pi.enabled,
      pump_state:     pi.pump_state,
      kp:             pi.kp,
      ki:             pi.ki,
      freq_min:       pi.freq_min,
      freq_max:       pi.freq_max,
      dry_run_locked: pi.dry_run_locked,
      flow_setpoint:  Math.round(pi.flow_setpoint * 10) / 10,
      ctrl_mode:      pi.ctrl_mode,
    },
    active_preset: state.active_preset,
    ctrl_mode:     state.ctrl_mode,
    vacation:      { enabled: state.vacation.enabled },
    sys: {
      ip:            state.sys.ip || 'backend',
      uptime:        state.sys.uptime,
      fw:            state.sys.fw,
      rtu_connected: state.v20.connected,
      tcp_clients:   state.sys.tcp_clients,
      mqtt:          state.sys.mqtt,
    },
  });
}

function buildLogJson() {
  return JSON.stringify({
    log:    state.logBuffer.slice(-200),
    logSeq: state.logSeq,
  });
}

// ── Broadcast Status an alle Browser-Clients ──
function broadcast() {
  if (!wss) return;
  const json = buildStatusJson();
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

// ── Log sofort an alle Clients senden ──
function broadcastLog() {
  if (!wss) return;
  const json = buildLogJson();
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

// ── Server initialisieren ──
function init(httpServer) {
  wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    if (request.url === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    console.log('[WS] Browser verbunden');
    state.sys.tcp_clients = wss.clients.size;

    // Sofort aktuellen Status senden
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(buildStatusJson());
    }

    ws.on('close', () => {
      state.sys.tcp_clients = wss.clients.size;
      console.log('[WS] Browser getrennt');
    });

    ws.on('error', () => {});
  });
}

module.exports = { init, broadcast, broadcastLog };
