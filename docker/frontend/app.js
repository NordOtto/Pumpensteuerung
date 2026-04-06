/* Pumpensteuerung Dashboard – vanilla JS
   - WebSocket /ws (Status-Push, read-only)
   - REST /api/* (Steuerung)
*/
'use strict';

// ---------------- helpers ----------------
const $ = (id) => document.getElementById(id);
const fmt = (v, d = 1) => (v == null || Number.isNaN(v) ? '–' : Number(v).toFixed(d));
const setText = (el, txt) => { if (el && el.textContent !== txt) el.textContent = txt; };
const setClass = (el, cls) => { if (el && el.className !== cls) el.className = cls; };

let lastState = null;
let chartBuf = []; // {t, p}
const CHART_MAX = 360; // 30 min @ 5s

// ---------------- toast ----------------
let toastTimer;
function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3000);
}

// ---------------- REST ----------------
async function api(path, body) {
  try {
    const opts = body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { method: 'POST' };
    const r = await fetch('/api' + path, opts);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) {
      toast(j.error || ('Fehler ' + r.status), 'err');
      return null;
    }
    return j;
  } catch (e) {
    toast('Netzwerkfehler', 'err');
    return null;
  }
}

async function apiGet(path) {
  try {
    const r = await fetch('/api' + path);
    if (!r.ok) { console.warn('GET', path, r.status); return null; }
    return await r.json();
  } catch (e) { console.warn('GET', path, e); return null; }
}

function setVal(id, v) {
  const el = $(id); if (!el) return;
  el.value = (v == null || Number.isNaN(v)) ? '' : v;
}

// ---------------- Theme ----------------
function applyTheme() {
  const choice = localStorage.getItem('theme') || 'light';
  let theme = choice;
  if (choice === 'auto') {
    const h = new Date().getHours();
    theme = (h >= 7 && h < 19) ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name=theme-color]').setAttribute('content', theme === 'dark' ? '#0a0f1a' : '#ffffff');
}
$('themeBtn').addEventListener('click', () => {
  const cur = localStorage.getItem('theme') || 'light';
  const next = cur === 'light' ? 'dark' : cur === 'dark' ? 'auto' : 'light';
  localStorage.setItem('theme', next);
  applyTheme();
  toast('Theme: ' + next);
});
applyTheme();
setInterval(applyTheme, 60_000);

// ---------------- WebSocket ----------------
let ws = null;
let wsBackoff = 1000;
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(proto + '//' + location.host + '/ws');

  ws.onopen = () => {
    wsBackoff = 1000;
    document.body.classList.remove('offline');
    setDot('dotBackend', 'ok');
  };
  ws.onclose = () => {
    setDot('dotBackend', 'err');
    document.body.classList.add('offline');
    setTimeout(connectWS, wsBackoff);
    wsBackoff = Math.min(wsBackoff * 2, 10_000);
  };
  ws.onerror = () => { try { ws.close(); } catch {} };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.log) { renderLog(msg.log); return; }
    handleStatus(msg);
  };
}

function setDot(id, state) {
  const el = $(id); if (!el) return;
  el.classList.remove('ok', 'warn', 'err');
  if (state) el.classList.add(state);
}

// ---------------- State Render ----------------
function handleStatus(s) {
  lastState = s;

  // Connection dots
  setDot('dotMqtt', s.sys?.mqtt ? 'ok' : 'err');
  setDot('dotRtu',  s.sys?.rtu_connected ? 'ok' : 'err');

  // Clock
  if (s.timeguard?.time) setText($('clock'), s.timeguard.time);

  // Status pill
  const v20 = s.v20 || {};
  let pillCls = 'status-pill', pillTxt = 'Bereit';
  if (!v20.connected)      { pillCls += ' err';   pillTxt = 'Offline'; }
  else if (v20.fault)      { pillCls += ' err';   pillTxt = 'Störung'; }
  else if (v20.running)    { pillCls += ' run';   pillTxt = 'Läuft'; }
  else                     { pillCls += ' ready'; pillTxt = 'Bereit'; }
  setClass($('statusPill'), pillCls);
  setText($('statusText'), pillTxt);

  // KPI: Druck
  const pi = s.pi || {};
  const p   = pi.pressure;
  const psp = pi.setpoint;
  setText($('vPressure'), fmt(p, 2));
  setText($('vPressureSet'), fmt(psp, 1));
  let pCls = 'card';
  if (p != null && psp) {
    const dev = Math.abs(p - psp) / psp;
    if (dev <= 0.05)      pCls += ' ok';
    else if (dev <= 0.15) pCls += ' warn';
    else                  pCls += ' err';
  } else pCls += ' idle';
  setClass($('cardPressure'), pCls);

  // KPI: Durchfluss
  setText($('vFlow'), fmt(pi.flow, 1));
  let fCls = 'card';
  if (pi.dry_run_locked)   { fCls += ' warn'; setText($('vFlowSub'), 'Trockenlauf-Sperre'); }
  else if (pi.flow > 0)    { fCls += ' ok';   setText($('vFlowSub'), ''); }
  else                     { fCls += ' idle'; setText($('vFlowSub'), 'Kein Durchfluss'); }
  setClass($('cardFlow'), fCls);

  // KPI: Frequenz
  setText($('vFreq'), fmt(v20.frequency, 1));
  setText($('vFreqSet'), fmt(v20.freq_setpoint, 1));
  setClass($('cardFreq'), 'card ' + (v20.running ? 'info' : 'idle'));

  // KPI: Pumpenstatus
  let sCls = 'card', sub = '';
  if (!v20.connected)      { sCls += ' idle'; }
  else if (v20.fault)      { sCls += ' err';  sub = 'Fehlercode ' + (v20.fault_code || 0); }
  else if (v20.running)    { sCls += ' ok'; }
  else                     { sCls += ' info'; }
  setClass($('cardStatus'), sCls);
  setText($('vStatusText'), pillTxt);
  setText($('vStatusSub'), sub);

  // Details
  setText($('dVoltage'),  fmt(v20.voltage, 0));
  setText($('dCurrent'),  fmt(v20.current, 2));
  setText($('dPower'),    fmt(v20.power, 2));
  setText($('dWaterTemp'),pi.water_temp != null && pi.water_temp > -100 ? fmt(pi.water_temp, 1) : '–');
  setText($('dAirTemp'),  s.temp != null && s.temp > -100 ? fmt(s.temp, 1) : '–');
  setText($('dFan'),      s.fan?.rpm ?? '–');

  // Slider sync (only if user not currently dragging)
  const sl = $('freqSlider');
  if (!sl.dataset.dragging && v20.freq_setpoint != null) {
    sl.value = v20.freq_setpoint;
    setText($('freqSliderVal'), fmt(v20.freq_setpoint, 1));
  }
  sl.disabled = !v20.connected;
  $('btnStart').disabled = !v20.connected || v20.running;
  $('btnStop').disabled  = !v20.connected || !v20.running;
  $('btnReset').disabled = !v20.connected || !v20.fault;

  // Chart buffer
  if (p != null) {
    const now = Date.now();
    if (chartBuf.length === 0 || now - chartBuf[chartBuf.length - 1].t > 4500) {
      chartBuf.push({ t: now, p });
      if (chartBuf.length > CHART_MAX) chartBuf.shift();
      drawChart();
    }
  }
}

// ---------------- Chart ----------------
function drawChart() {
  const svg = $('chart');
  if (!svg || chartBuf.length < 2) return;
  const W = 600, H = 200, pad = 20;
  const ps = chartBuf.map(d => d.p);
  const min = Math.min(...ps, 0);
  const max = Math.max(...ps, 5);
  const range = (max - min) || 1;
  const n = chartBuf.length;
  let path = '';
  chartBuf.forEach((d, i) => {
    const x = pad + (i / (n - 1)) * (W - 2 * pad);
    const y = H - pad - ((d.p - min) / range) * (H - 2 * pad);
    path += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
  });
  svg.innerHTML =
    `<line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="rgba(127,127,127,.25)" stroke-width="1"/>` +
    `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H - pad}" stroke="rgba(127,127,127,.25)" stroke-width="1"/>` +
    `<path d="${path}" fill="none" stroke="#2588eb" stroke-width="2"/>` +
    `<text x="${W - pad}" y="${pad - 4}" text-anchor="end" font-size="10" fill="#888">${max.toFixed(1)} bar</text>` +
    `<text x="${W - pad}" y="${H - pad + 12}" text-anchor="end" font-size="10" fill="#888">${min.toFixed(1)} bar</text>`;
}

// ---------------- Logs ----------------
function renderLog(lines) {
  const el = $('logBox');
  if (!el) return;
  el.textContent = (lines || []).join('\n');
  el.scrollTop = el.scrollHeight;
}

// ---------------- Controls ----------------
$('btnStart').addEventListener('click', () => api('/v20/start'));
$('btnStop').addEventListener('click',  () => api('/v20/stop'));
$('btnReset').addEventListener('click', () => api('/v20/reset'));

const sl = $('freqSlider');
sl.addEventListener('input', () => {
  sl.dataset.dragging = '1';
  setText($('freqSliderVal'), fmt(parseFloat(sl.value), 1));
});
sl.addEventListener('change', async () => {
  const hz = parseFloat(sl.value);
  await api('/v20/freq', { hz });
  toast('Frequenz: ' + fmt(hz, 1) + ' Hz', 'ok');
  delete sl.dataset.dragging;
});

// ---------------- Drawer ----------------
const drawer = $('drawer');
$('openSettings').addEventListener('click', async () => {
  drawer.hidden = false;
  await loadSettings();
});
$('closeDrawer').addEventListener('click', () => { drawer.hidden = true; });

document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.querySelector(`.tab-pane[data-pane="${t.dataset.tab}"]`).classList.add('active');
  });
});

async function loadSettings() {
  const pi = await apiGet('/pressure');
  if (pi) {
    $('piEnabled').checked = !!pi.enabled;
    setVal('piSetpoint', pi.setpoint);
    setVal('piPon',      pi.p_on);
    setVal('piPoff',     pi.p_off);
    setVal('piKp',       pi.kp);
    setVal('piKi',       pi.ki);
    setVal('piFmin',     pi.freq_min);
    setVal('piFmax',     pi.freq_max);
  } else if (lastState?.pi) {
    const p = lastState.pi;
    $('piEnabled').checked = !!p.enabled;
    setVal('piSetpoint', p.setpoint);
    setVal('piPon',      p.p_on);
    setVal('piPoff',     p.p_off);
    setVal('piKp',       p.kp);
    setVal('piKi',       p.ki);
    setVal('piFmin',     p.freq_min);
    setVal('piFmax',     p.freq_max);
  }
  const tg = await apiGet('/timeguard');
  if (tg) {
    $('tgEnabled').checked = !!tg.enabled;
    $('tgStart').value = pad2(tg.start_hour) + ':' + pad2(tg.start_min);
    $('tgEnd').value   = pad2(tg.end_hour)   + ':' + pad2(tg.end_min);
    renderDays(tg.days || [false,false,false,false,false,false,false]);
  }
  const vac = await apiGet('/vacation');
  if (vac) $('vacEnabled').checked = !!vac.enabled;
  if (lastState?.fan) {
    $('fanMode').value = lastState.fan.mode || 'Auto';
    $('fanPwm').value  = lastState.fan.pwm || 0;
    setText($('fanPwmVal'), String(lastState.fan.pwm || 0));
  }
  await renderPresets();
}

function pad2(n) { return String(n ?? 0).padStart(2, '0'); }

let _days = [false,false,false,false,false,false,false];
function renderDays(days) {
  _days = days.slice();
  const labels = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  const c = $('tgDays');
  c.innerHTML = '';
  labels.forEach((lbl, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = lbl;
    if (_days[i]) b.classList.add('on');
    b.addEventListener('click', () => {
      _days[i] = !_days[i];
      b.classList.toggle('on');
    });
    c.appendChild(b);
  });
}

$('savePI').addEventListener('click', async () => {
  const ok = await api('/pressure', {
    enabled: $('piEnabled').checked,
    setpoint: parseFloat($('piSetpoint').value),
    p_on: parseFloat($('piPon').value),
    p_off: parseFloat($('piPoff').value),
    kp: parseFloat($('piKp').value),
    ki: parseFloat($('piKi').value),
    freq_min: parseFloat($('piFmin').value),
    freq_max: parseFloat($('piFmax').value),
  });
  if (ok) toast('PI gespeichert', 'ok');
});
$('resetDryrun').addEventListener('click', async () => {
  const ok = await api('/pressure/reset_dryrun');
  if (ok) toast('Trockenlauf quittiert', 'ok');
});

$('saveTG').addEventListener('click', async () => {
  const [sh, sm] = $('tgStart').value.split(':').map(Number);
  const [eh, em] = $('tgEnd').value.split(':').map(Number);
  const ok = await api('/timeguard', {
    enabled: $('tgEnabled').checked,
    start_hour: sh, start_min: sm,
    end_hour: eh, end_min: em,
    days: _days,
  });
  if (ok) toast('Zeitsperre gespeichert', 'ok');
});

$('fanPwm').addEventListener('input', () => setText($('fanPwmVal'), $('fanPwm').value));
$('saveFan').addEventListener('click', async () => {
  const m = await api('/fan/mode', { mode: $('fanMode').value });
  const p = await api('/fan/pwm', { pwm: parseInt($('fanPwm').value, 10) });
  if (m && p) toast('Lüfter gespeichert', 'ok');
});

$('saveVac').addEventListener('click', async () => {
  const ok = await api('/vacation', { enabled: $('vacEnabled').checked });
  if (ok) toast('Urlaubsmodus gespeichert', 'ok');
});

async function renderPresets() {
  const data = await apiGet('/presets');
  const list = $('presetList');
  list.innerHTML = '';
  if (!data?.presets) return;
  data.presets.forEach(p => {
    const div = document.createElement('div');
    div.className = 'preset-item' + (p.name === data.active ? ' active' : '');
    div.innerHTML = `<div><b>${p.name}</b><br><small>${fmt(p.setpoint,1)} bar · ${fmt(p.freq_min,0)}–${fmt(p.freq_max,0)} Hz</small></div>`;
    const btn = document.createElement('button');
    btn.textContent = p.name === data.active ? 'Aktiv' : 'Anwenden';
    btn.disabled = p.name === data.active;
    btn.addEventListener('click', async () => {
      const ok = await api('/preset/apply', { name: p.name });
      if (ok) { toast('Preset: ' + p.name, 'ok'); renderPresets(); }
    });
    div.appendChild(btn);
    list.appendChild(div);
  });
}

// ---------------- Service Worker ----------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ---------------- Boot ----------------
connectWS();
