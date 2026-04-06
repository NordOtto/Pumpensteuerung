/* Pumpensteuerung Dashboard – Tailwind/Apple Edition
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
window.$toast = {
  timer: null,
  show: (msg, type = '') => {
    const t = $('toast');
    if (!t) return;
    t.querySelector('.msg').textContent = msg;
    t.className = 'fixed top-safe left-1/2 -translate-x-1/2 z-[100] transition-all transform max-w-sm w-[90%] px-5 py-4 rounded-2xl shadow-xl flex items-center justify-between text-sm font-semibold text-white mt-4 ' + (type==='err' ? 'bg-rose-500' : 'bg-emerald-500');
    clearTimeout(window.$toast.timer);
    window.$toast.timer = setTimeout(() => { window.$toast.hide(); }, 3000);
  },
  hide: () => {
    const t = $('toast');
    if (t) t.classList.add('-translate-y-[150%]');
  }
};
const toast = window.$toast.show;

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

// ---------------- WebSocket ----------------
let ws = null;
let wsBackoff = 1000;
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(proto + '//' + location.host + '/ws');

  ws.onopen = () => {
    wsBackoff = 1000;
    setDot('dotBackend', 'ok');
  };
  ws.onclose = () => {
    setDot('dotBackend', 'err');
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
  el.className = 'sicon ' + state;
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
  else                     { pillCls += ' ready'; pillTxt = 'Standby'; }
  setClass($('statusPill'), pillCls);
  setText($('statusText'), pillTxt);

  // KPI: Druck
  const pi = s.pi || {};
  const p   = pi.pressure;
  const psp = pi.setpoint;
  setText($('vPressure'), fmt(p, 2));
  setText($('vPressureSet'), fmt(psp, 1));
  let pCls = 'kpi-card group';
  if (p != null && psp) {
    const dev = Math.abs(p - psp) / psp;
    if (dev <= 0.05)      pCls += ' ok';
    else if (dev <= 0.15) pCls += ' warn';
    else                  pCls += ' err';
  } else pCls += ' idle';
  setClass($('cardPressure'), pCls);

  // KPI: Durchfluss
  setText($('vFlow'), fmt(pi.flow, 1));
  let fCls = 'kpi-card group';
  if (pi.dry_run_locked)   { fCls += ' err';  setText($('vFlowSub'), 'Trockenlauf-Sperre'); }
  else if (pi.flow > 0)    { fCls += ' ok';   setText($('vFlowSub'), 'Strömung ok'); }
  else                     { fCls += ' idle'; setText($('vFlowSub'), 'Kein Durchfluss'); }
  setClass($('cardFlow'), fCls);

  // KPI: Frequenz
  setText($('vFreq'), fmt(v20.frequency, 1));
  setClass($('cardFreq'), 'kpi-card group ' + (v20.running ? 'ok' : 'idle'));

  // KPI: Pumpenstatus
  let sCls = 'kpi-card group', sub = '';
  if (!v20.connected)      { sCls += ' idle'; }
  else if (v20.fault)      { sCls += ' err';  sub = 'Fehlercode ' + (v20.fault_code || 0); }
  else if (v20.running)    { sCls += ' ok'; }
  else                     { sCls += ' idle'; }
  setClass($('cardStatus'), sCls);
  setText($('vStatusSubMini'), sub || pillTxt);
  
  // Status dot sync in main loop
  const cdot = $('vStatusIcon');
  if (cdot) { cdot.className = 'leading-none flex items-center ' + (v20.running?'text-teal-500':(v20.fault?'text-rose-500':'text-slate-300')); }

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
  
  sl.style.opacity = sl.disabled ? '0.5' : '1.0';

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

// ---------------- Chart.js ----------------
let pressureChart;
function initChart() {
  const ctx = document.getElementById('pressureChart');
  if (!ctx || typeof Chart === 'undefined') return;
  pressureChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Druck (bar)',
        data: [],
        borderColor: '#2563eb', // blue-600
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHitRadius: 15
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: true, mode: 'index', intersect: false, backgroundColor: 'rgba(15, 23, 42, 0.9)' } },
      scales: {
        x: { display: false },
        y: { 
          beginAtZero: true, max: 5,
          border: { display:false },
          grid: { color: '#f1f5f9', drawBorder: false }
        }
      },
      interaction: { mode: 'nearest', axis: 'x', intersect: false }
    }
  });
}

function drawChart() {
  if (!pressureChart) return;
  pressureChart.data.labels = chartBuf.map(d => new Date(d.t).toLocaleTimeString('de-DE', {minute:'2-digit', second:'2-digit'}));
  pressureChart.data.datasets[0].data = chartBuf.map(d => d.p);
  pressureChart.update('none');
}

// ---------------- Logs ----------------
function renderLog(lines) {
  const el = $('logBox');
  if (!el) return;
  el.innerHTML = (lines || []).join('<br>');
  el.parentElement.scrollTop = el.parentElement.scrollHeight;
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

// ---------------- Settings & Drawer ----------------
window.showTab = function(tabName) {
  ['settings', 'presets', 'logs'].forEach(t => {
    const el = $('tab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (el) el.classList.add('hidden');
    const tb = $('tb' + t.charAt(0).toUpperCase() + t.slice(1));
    if (tb) tb.classList.remove('active', 'text-blue-600', 'bg-white', 'shadow-sm', 'border-slate-200');
  });
  
  const pane = $('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
  if (pane) pane.classList.remove('hidden');
  const btn = $('tb' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
  if (btn) btn.classList.add('active', 'text-blue-600', 'bg-white', 'shadow-sm', 'border-slate-200');
  
  if (tabName !== 'logs') loadSettings();
};

const drawer = $('drawer');
if($('closeDrawer')) $('closeDrawer').addEventListener('click', () => { drawer.classList.add('hidden'); });
if($('menuSettings')) $('menuSettings').addEventListener('click', () => { drawer.classList.remove('hidden'); showTab('settings'); });
if($('menuPresets')) $('menuPresets').addEventListener('click', () => { drawer.classList.remove('hidden'); showTab('presets'); });


async function loadSettings() {
  const pi = await apiGet('/pressure');
  if (pi) {
    if($('piEnabled')) $('piEnabled').checked = !!pi.enabled;
    setVal('piSetpoint', pi.setpoint);
    setVal('piKp',       pi.kp);
    setVal('piKi',       pi.ki);
  }
  
  if (lastState?.fan) {
    if($('fanMode')) $('fanMode').value = (lastState.fan.mode === "Manual" ? 1 : 0); // simplification
    if($('fanPwm')) $('fanPwm').value  = lastState.fan.pwm || 0;
    setText($('fanPwmVal'), String(lastState.fan.pwm || 0) + '%');
  }
  await renderPresets();
}

if($('savePI')) $('savePI').addEventListener('click', async () => {
  const ok = await api('/pressure', {
    enabled: $('piEnabled').checked,
    setpoint: parseFloat($('piSetpoint').value),
    // Fallback required default fields mapped internally
    p_on: 3.5, p_off: 4.5, freq_min: 30, freq_max: 50,
    kp: parseFloat($('piKp').value),
    ki: parseFloat($('piKi').value),
  });
  if (ok) toast('PI gespeichert', 'ok');
});

if($('fanPwm')) $('fanPwm').addEventListener('input', () => setText($('fanPwmVal'), $('fanPwm').value + '%'));
if($('saveFan')) $('saveFan').addEventListener('click', async () => {
  const m = await api('/fan/mode', { mode: $('fanMode').value });
  const p = await api('/fan/pwm', { pwm: parseInt($('fanPwm').value, 10) });
  if (m && p) toast('Lüfter gespeichert', 'ok');
});

async function renderPresets() {
  const data = await apiGet('/presets');
  const list = $('presetList');
  if(!list) return;
  list.innerHTML = '';
  if (!data?.presets) return;
  data.presets.forEach(p => {
    const isActive = p.name === data.active;
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-4 rounded-2xl border transition-all ' + (isActive ? 'bg-blue-50 border-blue-200 shadow-inner' : 'bg-white border-slate-100 hover:shadow-sm');
    
    div.innerHTML = `<div class="flex-1">
        <div class="flex items-center gap-2 mb-1">
          <i data-lucide="bookmark" class="w-4 h-4 ${isActive ? 'text-blue-500' : 'text-slate-400'}"></i>
          <b class="${isActive ? 'text-blue-700' : 'text-slate-700'}">${p.name}</b>
        </div>
        <div class="text-[10px] font-bold uppercase tracking-widest text-slate-400 pl-6">${fmt(p.setpoint,1)} bar · PI limits: ${fmt(p.freq_min,0)}–${fmt(p.freq_max,0)} Hz</div>
      </div>`;
      
    const btn = document.createElement('button');
    btn.className = 'ml-4 px-4 py-2 text-xs font-bold rounded-xl transition-colors shrink-0 ' + (isActive ? 'bg-blue-600/10 text-blue-600 cursor-default' : 'bg-slate-100 text-slate-600 hover:bg-blue-600 hover:text-white');
    btn.textContent = isActive ? 'Aktiviert' : 'Anwenden';
    btn.disabled = isActive;
    btn.addEventListener('click', async () => {
      const ok = await api('/preset/apply', { name: p.name });
      if (ok) { toast('Preset: ' + p.name, 'ok'); renderPresets(); }
    });
    div.appendChild(btn);
    list.appendChild(div);
  });
  lucide.createIcons();
}

// ---------------- Service Worker (Cleanup) ----------------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister().catch(() => {}));
  }).catch(() => {});
}

// ---------------- Boot ----------------
document.addEventListener("DOMContentLoaded", () => {
  initChart();
  connectWS();
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
});