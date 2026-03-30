'use strict';

// ============================================================
//  server.js – Haupteinstieg Backend v2
// ============================================================

const http         = require('http');
const express      = require('express');
const state        = require('./state');
const mqttClient   = require('./mqttClient');
const pi           = require('./pressureCtrl');
const tg           = require('./timeguard');
const presets      = require('./presets');
const ha           = require('./haDiscovery');
const ws           = require('./websocketServer');
const apiRouter    = require('./restApi');

// ── Uptime-Zähler ──
let startTime = Date.now();
setInterval(() => {
  state.sys.uptime = Math.floor((Date.now() - startTime) / 1000);
}, 1000);

// ── MQTT Befehle verarbeiten (HA Set-Topics) ──
mqttClient.onCommand((topic, value) => {
  const BASE = 'pumpensteuerung';
  if (topic === `${BASE}/v20/running/set`) {
    if (value === 'ON') mqttClient.sendCmd('v20/start', '1');
    else                mqttClient.sendCmd('v20/stop', '1');
  }
  else if (topic === `${BASE}/v20/freq_set/set`) {
    const hz = parseFloat(value);
    if (!isNaN(hz)) mqttClient.sendCmd('v20/freq', hz.toFixed(1));
  }
  else if (topic === `${BASE}/v20/fault_reset`) {
    mqttClient.sendCmd('v20/reset', '1');
  }
  else if (topic === `${BASE}/pressure/setpoint/set`) {
    const sp = parseFloat(value);
    if (!isNaN(sp)) pi.setConfig({ setpoint: sp });
  }
  else if (topic === `${BASE}/pi/enabled/set`) {
    pi.setConfig({ enabled: value === 'ON' });
  }
  else if (topic === `${BASE}/pi/freq_min/set`) {
    const f = parseFloat(value);
    if (!isNaN(f)) pi.setConfig({ freq_min: f });
  }
  else if (topic === `${BASE}/pi/freq_max/set`) {
    const f = parseFloat(value);
    if (!isNaN(f)) pi.setConfig({ freq_max: f });
  }
  else if (topic === `${BASE}/timeguard/enabled/set`) {
    tg.setConfig({ enabled: value === 'ON' });
  }
  else if (topic === `${BASE}/preset/set`) {
    presets.apply(value);
  }
  else if (topic === `${BASE}/fan/pwm/set`) {
    mqttClient.sendCmd('fan/pwm', value);
  }
  else if (topic === `${BASE}/fan/mode/set`) {
    mqttClient.sendCmd('fan/mode', value);
  }
  else if (topic === `${BASE}/dryrun/reset`) {
    pi.resetDryrun();
  }
  else if (topic === `${BASE}/vacation/set`) {
    pi.setVacation(value === 'ON');
  }
});

async function main() {
  // ── Konfiguration laden ──
  await presets.load();
  await tg.load();
  await pi.load();

  // ── MQTT verbinden ──
  mqttClient.connect();

  // ── Express App ──
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);

  // ── HTTP Server ──
  const server = http.createServer(app);

  // ── WebSocket Server initialisieren ──
  ws.init(server);

  // ── Server starten ──
  const PORT = parseInt(process.env.PORT || '3000');
  server.listen(PORT, () => {
    console.log(`[Server] Lauscht auf Port ${PORT}`);
  });

  // ── HA Discovery nach kurzer Wartezeit (MQTT-Verbindung abwarten) ──
  setTimeout(() => {
    const mqtt = require('mqtt');
    // Direkten MQTT-Client für Discovery nutzen
    const broker = process.env.MQTT_BROKER || 'localhost';
    const port   = parseInt(process.env.MQTT_PORT || '1883');
    const user   = process.env.MQTT_USER || '';
    const pass   = process.env.MQTT_PASS || '';
    const client = mqtt.connect(`mqtt://${broker}:${port}`, {
      clientId: 'pumpensteuerung-discovery',
      username: user || undefined,
      password: pass || undefined,
      clean: true,
    });
    client.on('connect', () => {
      ha.sendDiscovery(client);
      setTimeout(() => client.end(), 3000);
    });
    client.on('error', e => console.error('[HA] Discovery MQTT Fehler:', e.message));
  }, 5000);

  // ── Intervall-Tasks ──
  setInterval(() => pi.tick(),         500);   // PI-Regelung
  setInterval(() => tg.tick(),         10000); // Zeitsperre prüfen
  setInterval(() => ws.broadcast(),    1000);  // Browser WS
  setInterval(() => mqttClient.publishHA(), 2000); // HA Topics

  console.log('[Server] Gestartet. TZ:', process.env.TZ || '(nicht gesetzt)');
}

main().catch(e => {
  console.error('[Server] Startfehler:', e);
  process.exit(1);
});
