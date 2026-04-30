// ─── Theme ───
(function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'light') document.documentElement.classList.remove('dark');
  else document.documentElement.classList.add('dark');
  updateThemeColor();
})();

function updateThemeColor() {
  const isDark = document.documentElement.classList.contains('dark');
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = isDark ? '#0f1417' : '#f0f9ff';
  document.head.appendChild(meta);
  // Sync toggle in Display tab
  const toggle = document.getElementById('themeToggle');
  if (toggle) toggle.checked = isDark;
}

function setTheme(dark) {
  if (dark) document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
  localStorage.setItem('theme', dark ? 'dark' : 'light');
  updateThemeColor();
  if (typeof updateChartTheme === 'function') updateChartTheme();
}

// ─── Auth ───
let authToken = localStorage.getItem('authToken');

// ─── Element References ───
let ws;
const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProto}//${location.host}/ws`;
const $ = (id) => document.getElementById(id);

function authFetch(url, opts = {}) {
  opts.headers = Object.assign({ 'Authorization': 'Bearer ' + authToken }, opts.headers || {});
  return fetch(url, opts).then(r => { if (r.status === 401) { doLogout(); } return r; });
}

async function tryAutoLogin() {
  if (new URLSearchParams(location.search).get('preview') === '1') {
    authToken = 'preview';
    showApp();
    updateUI(buildPreviewState());
    irrigationState = buildPreviewState().irrigation;
    renderIrrigation();
    return;
  }
  if (!authToken) {
    try {
      const probe = await fetch('/api/status');
      if (probe.ok) {
        authToken = 'auth-disabled';
        localStorage.setItem('authToken', authToken);
        showApp();
        connectWS();
        return;
      }
    } catch { /* normal login flow */ }
    return showLogin();
  }
  try {
    const r = await fetch('/api/presets', { headers: { 'Authorization': 'Bearer ' + authToken } });
    if (r.ok) { showApp(); connectWS(); }
    else { showLogin(); }
  } catch { showLogin(); }
}

function showLogin() {
  $('loginOverlay').classList.remove('hidden');
  $('changePwOverlay').classList.add('hidden');
  $('mainApp').classList.add('hidden');
  $('mobileNav').classList.add('hidden');
  $('loginUser').focus();
}

function showChangePw() {
  $('loginOverlay').classList.add('hidden');
  $('changePwOverlay').classList.remove('hidden');
  $('mainApp').classList.add('hidden');
  $('mobileNav').classList.add('hidden');
  $('cpOldPass').focus();
}

function showApp() {
  $('loginOverlay').classList.add('hidden');
  $('changePwOverlay').classList.add('hidden');
  $('mainApp').classList.remove('hidden');
  $('mobileNav').classList.remove('hidden');
}

async function doLogin() {
  const user = $('loginUser').value.trim();
  const pass = $('loginPass').value;
  const errEl = $('loginError');
  if (!user || !pass) { errEl.textContent = 'Bitte ausfüllen'; errEl.classList.remove('hidden'); return; }
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, pass })
    });
    if (r.ok) {
      const data = await r.json();
      authToken = data.token;
      localStorage.setItem('authToken', authToken);
      errEl.classList.add('hidden');
      if (data.mustChangePass) {
        $('cpOldPass').value = pass;
        showChangePw();
      } else {
        showApp();
        connectWS();
      }
    } else {
      errEl.textContent = 'Falscher Benutzer oder Passwort';
      errEl.classList.remove('hidden');
    }
  } catch {
    errEl.textContent = 'Verbindungsfehler';
    errEl.classList.remove('hidden');
  }
}

async function doChangePw() {
  const oldPass = $('cpOldPass').value;
  const newPass = $('cpNewPass').value;
  const newPass2 = $('cpNewPass2').value;
  const errEl = $('cpError');
  if (!oldPass || !newPass) { errEl.textContent = 'Bitte ausfüllen'; errEl.classList.remove('hidden'); return; }
  if (newPass !== newPass2) { errEl.textContent = 'Passwörter stimmen nicht überein'; errEl.classList.remove('hidden'); return; }
  if (newPass.length < 4) { errEl.textContent = 'Min. 4 Zeichen'; errEl.classList.remove('hidden'); return; }
  try {
    const r = await authFetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPass, newPass })
    });
    if (r.ok) {
      errEl.classList.add('hidden');
      $('cpOldPass').value = ''; $('cpNewPass').value = ''; $('cpNewPass2').value = '';
      showApp();
      connectWS();
      $toast.show('Passwort geändert');
    } else {
      const data = await r.json();
      errEl.textContent = data.error || 'Fehler';
      errEl.classList.remove('hidden');
    }
  } catch {
    errEl.textContent = 'Verbindungsfehler';
    errEl.classList.remove('hidden');
  }
}

function doLogout() {
  authToken = null;
  localStorage.removeItem('authToken');
  if (ws) { ws.close(); ws = null; }
  showLogin();
}

$('btnLogin').onclick = doLogin;
$('loginPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
$('loginUser').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('loginPass').focus(); });
$('btnChangePw').onclick = doChangePw;
$('cpNewPass2').addEventListener('keydown', (e) => { if (e.key === 'Enter') doChangePw(); });
$('btnLogout').onclick = doLogout;

const els = {
  freq:        $('vFreq'),
  freqSet:     $('vFreqSet'),
  pressure:    $('vPressure'),
  pressureSet: $('vPressureSet'),
  flow:        $('vFlow'),
  flowSub:     $('vFlowSub'),
  waterTemp:   $('vWaterTemp'),
  waterTempSub:$('vWaterTempSub'),
  motorTemp:   $('vMotorTemp'),
  motorTempSub:$('vMotorTempSub'),
  fanRpm:      $('vFanRpm'),
  fanSub:      $('vFanSub'),
  voltage:     $('dVoltage'),
  current:     $('dCurrent'),
  power:       $('dPower'),
  dcBus:       $('dDcBus'),
  statusBadge: $('statusBadge'),
  badgeText:   $('statusBadgeText'),
  badgeDot:    $('statusBadgeDot'),
  statusMqtt:  $('statusMqtt'),
  statusModbus:$('statusModbus'),
  uptime:      $('statusUptime'),
  slider:      $('freqSlider'),
  presetPill:  $('activePresetPill'),
  piPon:       $('piPon'),
  piSetpoint:  $('piSetpoint'),
  piPoff:      $('piPoff'),
  piKp:        $('piKp'),
  piKi:        $('piKi'),
  piFmin:      $('piFmin'),
  piFmax:      $('piFmax'),
  piEnabled:   $('piEnabled'),
};

// ─── Logger ───
function log(msg) {
  const ts = new Date().toISOString().split('T')[1].substring(0, 8);
  const m = `[${ts}] ${msg}`;
  const box = $('logBox');
  const full = $('logBoxFull');
  if (box) { box.textContent = m + '\n' + box.textContent; }
  if (full) { full.textContent = m + '\n' + full.textContent; }
  console.log(m);
}

// ─── Toast ───
window.$toast = {
  el: $('toast'),
  msg: $('toastMsg'),
  timer: null,
  show(text, type = 'info') {
    this.msg.textContent = text;
    this.el.className = `fixed top-6 left-1/2 -translate-x-1/2 z-[100] transition-all duration-300 max-w-sm w-[90%] px-5 py-4 rounded-2xl shadow-xl flex items-center justify-between text-sm font-semibold text-white pointer-events-none ${type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'}`;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hide(), 4000);
  },
  hide() {
    this.el.classList.add('-translate-y-[200%]', 'opacity-0');
  }
};
$('toastClose').onclick = () => $toast.hide();

// ─── Force dot decimal in all number inputs ───
document.addEventListener('keydown', (e) => {
  if (e.target.type === 'number' && e.key === ',') {
    e.preventDefault();
    const inp = e.target;
    const start = inp.selectionStart;
    const val = inp.value;
    inp.value = val.slice(0, start) + '.' + val.slice(inp.selectionEnd);
    inp.setSelectionRange(start + 1, start + 1);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }
});

// ─── WebSocket ───
function connectWS() {
  ws = new WebSocket(`${wsUrl}?token=${authToken}`);
  ws.onopen = () => log('WebSocket verbunden');
  ws.onclose = () => {
    log('WS getrennt, reconnect...');
    setTimeout(connectWS, 3000);
    setStatusBadge('offline', 'Offline');
  };
  ws.onerror = () => { log('WS Error'); ws.close(); };
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      // Backend sends flat state object (no wrapper type)
      if (msg.v20 !== undefined) {
        updateUI(msg);
        log(`V20: ${msg.v20.frequency?.toFixed(1)}Hz ${msg.v20.running ? 'RUN' : 'STOP'}${msg.v20.fault ? ' FAULT' : ''} | P:${msg.pi?.pressure?.toFixed(2)}bar | MQTT:${msg.sys?.mqtt ? 'OK' : 'ERR'}`);
      }
    } catch (err) {
      log('WS Parse Error: ' + err.message);
      console.error('Parse Error', err);
    }
  };
}

// ─── Status Dots ───
function setDot(id, connected) {
  const el = $(id);
  if (!el) return;
  el.className = `w-3 h-3 rounded-full transition-all ${connected ? 'dot-ok' : 'dot-off'}`;
}

function setStatusBadge(state, text) {
  let cls = 'bg-slate-500';
  if (state === 'running') cls = 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)] badge-pulse';
  else if (state === 'fault') cls = 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]';
  else if (state === 'ready') cls = 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.4)]';
  else if (state === 'offline') cls = 'bg-slate-500';

  els.statusBadge.className = `${cls} text-white text-[10px] sm:text-xs font-bold px-2.5 sm:px-3 py-1 rounded-full flex items-center gap-1.5 shadow-md transition-all`;
  els.badgeText.textContent = text;
  els.badgeDot.className = `w-2 h-2 bg-white rounded-full ${state === 'running' ? 'animate-pulse' : ''}`;
}

// ─── Main UI update ───
let lastPiState = {};
const _prevValues = {};

function animateValue(el, newVal, decimals) {
  const key = el.id || el;
  const prev = _prevValues[key];
  const target = parseFloat(newVal);
  if (isNaN(target)) { el.textContent = newVal; return; }
  if (prev === undefined || Math.abs(prev - target) < 0.001) {
    _prevValues[key] = target;
    el.textContent = target.toFixed(decimals);
    return;
  }
  _prevValues[key] = target;
  const start = prev;
  const duration = 250;
  const t0 = performance.now();
  function tick(now) {
    const p = Math.min((now - t0) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3); // easeOutCubic
    el.textContent = (start + (target - start) * ease).toFixed(decimals);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function updateUI(st) {
  // V20 Pump
  if (st.v20) {
    animateValue(els.freq, st.v20.frequency || 0, 1);
    if ($('deckPumpBadge')) {
      const label = st.v20.fault ? 'Störung' : st.v20.running ? 'Läuft' : !st.v20.connected ? 'Offline' : 'Bereit';
      $('deckPumpBadge').textContent = label;
      $('deckPumpBadge').className = `px-3 py-1 rounded-full text-xs font-bold ${st.v20.fault ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-300' : st.v20.running ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200'}`;
    }
    if ($('topSystemState')) $('topSystemState').textContent = st.v20.fault ? 'Störung' : st.v20.running ? 'Läuft' : st.v20.connected ? 'Bereit' : 'Offline';
    if ($('topFreq')) $('topFreq').textContent = Number(st.v20.frequency || 0).toFixed(1);
    // Sync slider + Sollfrequenz (unless user is dragging)
    if (!sliderDragging) {
      els.freqSet.textContent = (st.v20.freq_setpoint || 0).toFixed(0);
      els.slider.value = st.v20.freq_setpoint || els.slider.min;
    }
    animateValue(els.voltage, st.v20.voltage || 0, 1);
    animateValue(els.current, st.v20.current || 0, 2);
    animateValue(els.power, (st.v20.power || 0) * 1000, 0);
    els.dcBus.textContent = (st.v20.dc_bus || 0).toFixed(0);

    // Status badge
    let badgeState = 'ready', badgeLabel = 'Bereit';
    if (st.v20.fault) {
      badgeState = 'fault'; badgeLabel = `Störung ${st.v20.fault_code || ''}`;
    } else if (st.v20.running) {
      badgeState = 'running'; badgeLabel = 'Läuft';
    } else if (!st.v20.connected) {
      badgeState = 'offline'; badgeLabel = 'Offline';
    }
    setStatusBadge(badgeState, badgeLabel);

    // Modbus status
    els.statusModbus.textContent = st.v20.connected ? 'Verbunden' : 'Fehler';
    els.statusModbus.className = `text-[10px] font-bold px-2 py-0.5 rounded-md ${st.v20.connected ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`;
  }

  // Sensors (inside pi object from backend)
  if (st.pi) {
    animateValue(els.pressure, st.pi.pressure || 0, 2);
    animateValue(els.flow, st.pi.flow || 0, 1);
    if ($('topPressure')) $('topPressure').textContent = Number(st.pi.pressure || 0).toFixed(2);
    if ($('topFlow')) $('topFlow').textContent = Number(st.pi.flow || 0).toFixed(1);
    pushChart(st.pi.pressure);

    // Water temp KPI card
    if (st.pi.water_temp !== -127 && st.pi.water_temp !== undefined) {
      els.waterTemp.textContent = (st.pi.water_temp).toFixed(1);
      const wt = st.pi.water_temp;
      els.waterTempSub.textContent = wt < 10 ? 'Kalt' : wt < 18 ? 'Normal' : 'Warm';
      els.waterTempSub.className = `text-xs font-medium mt-1 ${wt < 10 ? 'text-cyan-500' : wt < 18 ? 'text-green-500' : 'text-orange-500'}`;
    } else {
      els.waterTemp.textContent = '--';
      els.waterTempSub.textContent = 'Kein Sensor';
      els.waterTempSub.className = 'text-xs text-slate-400 font-medium mt-1';
    }

    // Flow sub-status
    if (st.pi.flow > 0.5) {
      els.flowSub.textContent = 'Strömung Ok';
      els.flowSub.className = 'text-xs text-green-600 dark:text-green-400 font-medium mt-1';
    } else {
      els.flowSub.textContent = 'Kein Durchfluss';
      els.flowSub.className = 'text-xs text-slate-400 font-medium mt-1';
    }
  }

  // Enclosure / motor temp KPI card
  if (st.temp !== undefined) {
    if (st.temp !== -127) {
      els.motorTemp.textContent = st.temp;
      const mt = st.temp;
      els.motorTempSub.textContent = mt < 30 ? 'Normal' : mt < 50 ? 'Warm' : 'Heiß!';
      els.motorTempSub.className = `text-xs font-medium mt-1 ${mt < 30 ? 'text-green-500' : mt < 50 ? 'text-orange-500' : 'text-red-500'}`;
    } else {
      els.motorTemp.textContent = '--';
      els.motorTempSub.textContent = 'Kein Sensor';
      els.motorTempSub.className = 'text-xs text-slate-400 font-medium mt-1';
    }
  }

  // Fan RPM KPI card
  if (st.fan) {
    els.fanRpm.textContent = st.fan.rpm;
    const mode = st.fan.mode === 'Auto' ? 'Automatik' : 'Manuell';
    const pct = Math.round(st.fan.pwm / 255 * 100);
    els.fanSub.textContent = `${mode} · ${pct}%`;
    els.fanSub.className = `text-xs font-medium mt-1 ${st.fan.rpm > 0 ? 'text-sky-500' : 'text-slate-400'}`;
  }

  // MQTT status
  if (st.sys) {
    els.statusMqtt.textContent = st.sys.mqtt ? 'Verbunden' : 'Getrennt';
    els.statusMqtt.className = `text-[10px] font-bold px-2 py-0.5 rounded-md ${st.sys.mqtt ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`;

    // Uptime
    if (st.sys.uptime !== undefined) {
      const h = String(Math.floor(st.sys.uptime / 3600)).padStart(2, '0');
      const m = String(Math.floor((st.sys.uptime % 3600) / 60)).padStart(2, '0');
      const s = String(Math.floor(st.sys.uptime % 60)).padStart(2, '0');
      els.uptime.textContent = `${h}:${m}:${s}`;
    }
  }

  // Active preset pill
  if (st.active_preset) {
    els.presetPill.textContent = st.active_preset;
    els.presetPill.classList.remove('hidden');
  } else {
    els.presetPill.classList.add('hidden');
  }

  if (st.irrigation) {
    updateIrrigationStatus(st.irrigation);
  }

  // Timeguard live status
  if (st.timeguard) {
    updateTgStatus(st.timeguard);
    // Timeguard pill on main display
    const tgPill = $('pillTimeguard');
    if (st.timeguard.enabled) {
      tgPill.classList.remove('hidden');
      if (st.timeguard.allowed) {
        tgPill.className = 'text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-md bg-green-500/20 text-green-300 border border-green-500/30';
        tgPill.innerHTML = '<span class="material-symbols-outlined text-xs">schedule</span> Erlaubt';
      } else {
        tgPill.className = 'text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-md bg-red-500/20 text-red-300 border border-red-500/30';
        tgPill.innerHTML = '<span class="material-symbols-outlined text-xs">schedule</span> Gesperrt';
      }
    } else {
      tgPill.classList.add('hidden');
    }
  }

  // PI controller pill on main display
  if (st.pi) {
    const piPill = $('pillPI');
    if (st.pi.enabled) {
      piPill.classList.remove('hidden');
      piPill.className = 'text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-md bg-blue-500/20 text-blue-300 border border-blue-500/30';
      piPill.innerHTML = `<span class="material-symbols-outlined text-xs">swap_vert</span> PI ${st.pi.setpoint} bar`;
    } else {
      piPill.classList.remove('hidden');
      piPill.className = 'text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-md bg-slate-500/20 text-slate-400 border border-slate-500/30';
      piPill.innerHTML = '<span class="material-symbols-outlined text-xs">swap_vert</span> PI Aus';
    }
  }

  // PI controller form (only update when drawer is closed)
  if (st.pi && $('drawer').classList.contains('hidden')) {
    lastPiState = st.pi;
    if (document.activeElement.tagName !== 'INPUT') {
      els.piPon.value = st.pi.p_on;
      els.piPoff.value = st.pi.p_off;
      els.piSetpoint.value = st.pi.setpoint;
      els.piKp.value = st.pi.kp;
      els.piKi.value = st.pi.ki;
      els.piFmin.value = st.pi.freq_min || 30;
      els.piFmax.value = st.pi.freq_max || 50;
      els.piEnabled.checked = st.pi.enabled;

      // Prefill preset form (nur PI-Modus, nicht wenn Fix-Hz gewählt oder Nutzer gerade tippt)
      const pMode = parseInt($('presetNewMode').value);
      if (pMode !== 2 && document.activeElement.id !== 'presetNewSet' && document.activeElement.id !== 'presetNewMode') {
        $('presetNewSet').value  = st.pi.setpoint;
        $('presetNewKp').value   = st.pi.kp;
        $('presetNewKi').value   = st.pi.ki;
        $('presetNewFmin').value = st.pi.freq_min || 30;
        $('presetNewFmax').value = st.pi.freq_max || 50;
      }

      els.pressureSet.textContent = st.pi.ctrl_mode === 0 ? st.pi.setpoint + ' bar' : 'auto';
    }
  }
}

// ─── Chart ───
const chartCtx = $('pressureChart').getContext('2d');
const chart = new Chart(chartCtx, {
  type: 'line',
  data: {
    labels: Array(30).fill(''),
    datasets: [{
      label: 'Druck (bar)',
      data: Array(30).fill(null),
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59,130,246,0.1)',
      fill: true,
      tension: 0.4,
      borderWidth: 2.5,
      pointRadius: 0,
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { display: false },
      y: {
        min: 0, max: 6,
        grid: { color: isDark() ? '#1e293b' : '#f1f5f9' },
        ticks: { color: isDark() ? '#64748b' : '#94a3b8', font: { size: 10 } }
      }
    }
  }
});

function isDark() { return document.documentElement.classList.contains('dark'); }

function updateChartTheme() {
  chart.options.scales.y.grid.color = isDark() ? '#1e293b' : '#f1f5f9';
  chart.options.scales.y.ticks.color = isDark() ? '#64748b' : '#94a3b8';
  chart.update('none');
}

function pushChart(val) {
  if (val === undefined) return;
  const data = chart.data.datasets[0].data;
  data.push(val);
  data.shift();
  chart.update('none');
}

// ─── Buttons ───
$('btnStart').onclick = () => authFetch('/api/v20/start', { method: 'POST' }).then(() => $toast.show('Start gesendet'));
$('btnStop').onclick = () => authFetch('/api/v20/stop', { method: 'POST' }).then(() => $toast.show('Stop gesendet'));
$('btnReset').onclick = () => authFetch('/api/v20/reset', { method: 'POST' }).then(() => $toast.show('Reset gesendet'));
if ($('deckStart')) $('deckStart').onclick = () => $('btnStart').click();
if ($('deckStop')) $('deckStop').onclick = () => $('btnStop').click();
if ($('deckIrrigation')) $('deckIrrigation').onclick = () => window.showTab('irrigation');

// ─── Freq Slider ───
let slTimer;
let sliderDragging = false;

function updateSliderTip() {
  els.freqSet.textContent = parseInt(els.slider.value);
}

function sendFreq() {
  const hz = parseFloat(els.slider.value);
  clearTimeout(slTimer);
  slTimer = setTimeout(() => {
    sliderDragging = false;
    authFetch('/api/v20/freq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hz })
    }).then(r => r.json()).then(o => {
      if (o.ok) {
        if (o.mode === 'pi_max') $toast.show(`PI freq_max → ${hz.toFixed(0)} Hz`);
        else $toast.show(`Frequenz → ${hz.toFixed(0)} Hz`);
      }
    });
  }, 300);
}

// Desktop + Mobile: input fires on every value change
els.slider.addEventListener('input', () => {
  sliderDragging = true;
  updateSliderTip();
});

// change fires when user releases
els.slider.addEventListener('change', () => {
  sendFreq();
});

// Touch fallback: some mobile browsers don't fire change reliably
els.slider.addEventListener('touchstart', () => {
  sliderDragging = true;
  updateSliderTip();
}, { passive: true });

els.slider.addEventListener('touchend', () => {
  updateSliderTip();
  sendFreq();
}, { passive: true });

// ─── Gear Button → Settings ───
$('btnGear').onclick = () => window.showTab('settings');

// ─── Sidebar / Tabs ───
const tabMeta = {
  settings:  { title: 'Regelung (PI)', sub: 'Parameter' },
  fan:       { title: 'Gehäuse Lüfter', sub: 'Modus & PWM' },
  presets:   { title: 'Presets', sub: 'Betriebsmodi verwalten' },
  timeguard: { title: 'Zeitsperre', sub: 'Betriebszeitfenster' },
  irrigation:{ title: 'Bewässerung', sub: 'Programme & Wetterlogik' },
  logs:      { title: 'System Logs', sub: 'Debug-Ausgabe' },
  display:   { title: 'Anzeige', sub: 'Zoom & Darstellung' },
};

window.showTab = (tab) => {
  const drawer = $('drawer');
  const content = $('drawerContent');
  drawer.classList.remove('hidden');
  setTimeout(() => {
    drawer.classList.remove('opacity-0');
    content.classList.remove('translate-x-full');
  }, 10);

  // Hide all tabs
  ['tabSettings', 'tabFan', 'tabPresets', 'tabTimeguard', 'tabIrrigation', 'tabLogs', 'tabDisplay'].forEach(t => $(t).classList.add('hidden'));

  // Show selected
  const tabId = tab === 'fan' ? 'tabFan' : `tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`;
  $(tabId).classList.remove('hidden');

  // Update header
  const meta = tabMeta[tab] || { title: tab, sub: '' };
  $('drawerTitle').textContent = meta.title;
  $('drawerSub').textContent = meta.sub;

  // Update nav active state
  document.querySelectorAll('.sidebar-nav-btn').forEach(b => {
    b.classList.remove('sidebar-nav-active');
    if (b.dataset.tab === tab) b.classList.add('sidebar-nav-active');
  });

  // Load data
  if (tab === 'presets') loadPresets();
  if (tab === 'timeguard') loadTimeguard();
  if (tab === 'irrigation') loadIrrigation();
};

$('closeDrawer').onclick = () => {
  const drawer = $('drawer');
  const content = $('drawerContent');
  drawer.classList.add('opacity-0');
  content.classList.add('translate-x-full');
  setTimeout(() => drawer.classList.add('hidden'), 300);
};

// ─── Presets ───
async function loadPresets() {
  try {
    const res = await authFetch('/api/presets');
    const data = await res.json();
    const activePreset = data.active || '';
    const presets = data.presets || data;
    const lst = $('presetList');
    lst.innerHTML = '';
    if (!presets.length) {
      lst.innerHTML = '<div class="text-sm text-slate-400 text-center py-4">Keine Presets vorhanden</div>';
      return;
    }
    presets.forEach(p => {
      const isActive = p.name === activePreset;
      const safeName = p.name.replace(/'/g, "\\'");
      const safeJson = JSON.stringify(p).replace(/'/g, "&#39;").replace(/"/g, '&quot;');
      const modeLabel = p.mode === 2
        ? `<span class="text-[9px] bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 px-1.5 py-0.5 rounded font-bold uppercase">Fix-Hz</span>`
        : `<span class="text-[9px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase">${p.mode === 1 ? 'Flow' : 'Druck'}</span>`;
      const paramLine = p.mode === 2
        ? `${p.setpoint_hz || '?'} Hz | Erw. ${p.expected_pressure || '?'} bar`
        : `SP:${p.setpoint} | Kp:${p.kp} Ki:${p.ki} | ${p.freq_min}–${p.freq_max}Hz`;
      lst.innerHTML += `
      <div class="flex items-center justify-between p-3 ${isActive ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600/50' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50'} border rounded-xl gap-2">
        <div class="min-w-0 flex-1">
          <div class="font-bold text-slate-800 dark:text-white flex items-center gap-2 text-sm">
            ${p.name} ${modeLabel}
            ${isActive ? '<span class="text-[8px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full font-bold uppercase shrink-0">Aktiv</span>' : ''}
          </div>
          <div class="text-[9px] text-slate-400 uppercase tracking-wider font-bold mt-0.5 truncate">
            ${paramLine}
          </div>
        </div>
        <div class="flex gap-1 shrink-0">
          ${!isActive ? `<button onclick="applyP('${safeName}')" class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/40 flex items-center justify-center" title="Aktivieren"><span class="material-symbols-outlined text-base">play_arrow</span></button>` : ''}
          <button onclick="editP('${safeJson}')" class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600/50 flex items-center justify-center" title="Bearbeiten"><span class="material-symbols-outlined text-base">edit</span></button>
          ${!isActive ? `<button onclick="delP('${safeName}')" class="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-800/30 flex items-center justify-center" title="Löschen"><span class="material-symbols-outlined text-base">delete</span></button>` : ''}
        </div>
      </div>`;
    });
  } catch (err) {
    log('Presets laden fehlgeschlagen: ' + err);
  }
}

window.applyP = async (name) => {
  const res = await authFetch('/api/preset/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  const d = await res.json();
  if (d.success || d.ok) { $toast.show(`Preset "${name}" geladen`); $('closeDrawer').click(); }
  else $toast.show(d.error || 'Fehler', 'error');
};

window.delP = async (name) => {
  if (!confirm(`Preset "${name}" löschen?`)) return;
  const res = await authFetch(`/api/presets/${encodeURIComponent(name)}`, { method: 'DELETE' });
  const d = await res.json();
  if (d.ok) { $toast.show(`"${name}" gelöscht`); loadPresets(); }
  else $toast.show(d.error || 'Kann nicht gelöscht werden', 'error');
};

window.editP = (jsonStr) => {
  const p = JSON.parse(jsonStr);
  $('presetNewName').value = p.name;
  $('presetNewMode').value = p.mode;
  const isFixed = p.mode === 2;
  $('presetPiFields').classList.toggle('hidden', isFixed);
  $('presetFixFields').classList.toggle('hidden', !isFixed);
  if (isFixed) {
    $('presetNewHz').value   = p.setpoint_hz || '';
    $('presetNewExpP').value = p.expected_pressure || '';
  } else {
    $('presetNewSet').value  = p.setpoint;
    $('presetNewKp').value   = p.kp;
    $('presetNewKi').value   = p.ki;
    $('presetNewFmin').value = p.freq_min;
    $('presetNewFmax').value = p.freq_max;
  }
  $('btnCreatePreset').querySelector('span:last-child')?.remove();
  $('btnCreatePreset').innerHTML = '<span class="material-symbols-outlined text-base">save</span> Speichern';
  // Scroll to form
  $('presetNewName').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

$('btnCreatePreset').onclick = async () => {
  const name = $('presetNewName').value.trim();
  if (!name) return $toast.show('Name erforderlich', 'error');
  const mode = parseInt($('presetNewMode').value);

  let body;
  if (mode === 2) {
    const hz   = parseFloat($('presetNewHz').value);
    const expP = parseFloat($('presetNewExpP').value);
    if (!hz || hz < 10 || hz > 60) return $toast.show('Frequenz 10–60 Hz erforderlich', 'error');
    body = { name, mode, setpoint_hz: hz, expected_pressure: expP || 0,
             setpoint: 0, kp: 0, ki: 0, freq_min: hz, freq_max: hz };
  } else {
    body = {
      name, mode,
      setpoint: parseFloat($('presetNewSet').value),
      kp:       parseFloat($('presetNewKp').value),
      ki:       parseFloat($('presetNewKi').value),
      freq_min: parseInt($('presetNewFmin').value),
      freq_max: parseInt($('presetNewFmax').value),
    };
  }

  const res = await authFetch('/api/presets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json();
  if (d.success || d.ok) {
    $toast.show('Preset gespeichert');
    $('presetNewName').value = '';
    $('presetNewHz').value   = '';
    $('presetNewExpP').value = '';
    $('presetNewMode').value = '0';
    $('presetPiFields').classList.remove('hidden');
    $('presetFixFields').classList.add('hidden');
    $('btnCreatePreset').innerHTML = '<span class="material-symbols-outlined text-base">add</span> Erstellen';
    loadPresets();
  } else {
    $toast.show(d.error || 'Fehler', 'error');
  }
};

$('presetNewMode').onchange = (e) => {
  const mode = parseInt(e.target.value);
  $('presetPiFields').classList.toggle('hidden', mode === 2);
  $('presetFixFields').classList.toggle('hidden', mode !== 2);
  $('lblPresetSet').textContent = mode === 1 ? 'Soll (L/min)' : 'Soll (bar)';
};

// ─── Save PI Form ───
$('savePI').onclick = async () => {
  const body = {
    p_on: parseFloat(els.piPon.value),
    p_off: parseFloat(els.piPoff.value),
    setpoint: parseFloat(els.piSetpoint.value),
    kp: parseFloat(els.piKp.value),
    ki: parseFloat(els.piKi.value),
    freq_min: parseInt(els.piFmin.value),
    freq_max: parseInt(els.piFmax.value),
    enabled: els.piEnabled.checked,
    ctrl_mode: lastPiState.ctrl_mode || 0
  };
  const res = await authFetch('/api/pressure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json();
  if (d.success || d.ok) $toast.show('Parameter gespeichert');
  else $toast.show('Fehler beim Speichern', 'error');
};

// ─── Save Fan ───
$('saveFan').onclick = async () => {
  const mode = $('fanMode').value;
  const pwm = parseInt($('fanPwm').value);
  await authFetch('/api/fan/mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
  await authFetch('/api/fan/pwm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pwm }) });
  $toast.show('Lüfter aktualisiert');
};

$('fanPwm').addEventListener('input', (e) => {
  $('fanPwmVal').textContent = Math.round(e.target.value / 255 * 100) + '%';
});

// ─── Irrigation ───
let irrigationState = null;
let irrigationPresetNames = ['Normal'];

function fmtDateTime(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function updateIrrigationStatus(irr) {
  irrigationState = irr;
  const d = irr.decision || {};
  const w = irr.weather || {};
  const running = !!d.running;
  if ($('irrDecisionLine')) $('irrDecisionLine').textContent = `${d.reason || 'Bereit'} · ${d.program_id || 'kein Programm'}`;
  if ($('irrRunState')) {
    $('irrRunState').textContent = running ? 'Aktiv' : (d.allowed ? 'Bereit' : 'Gesperrt');
    $('irrRunState').className = `text-lg font-bold mt-1 ${running ? 'text-emerald-500' : d.allowed ? 'text-slate-800 dark:text-white' : 'text-amber-500'}`;
  }
  if ($('irrActiveZone')) $('irrActiveZone').textContent = d.active_zone || '--';
  if ($('irrBudget')) $('irrBudget').textContent = Number(d.water_budget_mm || 0).toFixed(1);
  if ($('irrFactor')) $('irrFactor').textContent = Number(d.runtime_factor || 0).toFixed(2);
  if ($('irrNextStart')) $('irrNextStart').textContent = fmtDateTime(d.next_start);
  if ($('irrDrawerDecision')) $('irrDrawerDecision').textContent = `${running ? 'Läuft' : d.allowed ? 'Freigegeben' : 'Wird übersprungen'} · ${d.reason || '--'}`;
  if ($('irrRain')) $('irrRain').textContent = (Number(w.forecast_rain_mm || 0) + Number(w.rain_24h_mm || 0)).toFixed(1);
  if ($('irrWind')) $('irrWind').textContent = Number(w.wind_kmh || 0).toFixed(0);
  if ($('irrEt')) $('irrEt').textContent = w.et0_mm == null ? '--' : Number(w.et0_mm).toFixed(1);
  if ($('deckIrrTitle')) $('deckIrrTitle').textContent = running ? 'Bewässert jetzt' : (d.allowed ? 'Automatik bereit' : 'Lauf gesperrt');
  if ($('deckIrrReason')) $('deckIrrReason').textContent = d.reason || '--';
  if ($('deckIrrState')) {
    $('deckIrrState').textContent = running ? 'Aktiv' : d.allowed ? 'Freigegeben' : 'Skip';
    $('deckIrrState').className = `px-3 py-1 rounded-full text-xs font-bold ${running ? 'bg-emerald-500 text-white' : d.allowed ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'}`;
  }
  if ($('deckProgram')) $('deckProgram').textContent = d.active_program || d.program_id || '--';
  if ($('deckZone')) $('deckZone').textContent = d.active_zone || '--';
  if ($('deckNext')) $('deckNext').textContent = fmtDateTime(d.next_start);
  if ($('deckRain')) $('deckRain').textContent = (Number(w.forecast_rain_mm || 0) + Number(w.rain_24h_mm || 0)).toFixed(1);
  if ($('deckWind')) $('deckWind').textContent = Number(w.wind_kmh || 0).toFixed(0);
  if ($('deckBudget')) $('deckBudget').textContent = Number(d.water_budget_mm || 0).toFixed(1);
  if ($('deckFactor')) $('deckFactor').textContent = Number(d.runtime_factor || 0).toFixed(2);
  if ($('topIrrigation')) $('topIrrigation').textContent = running ? `Aktiv ${d.active_zone || ''}`.trim() : (d.reason || '--');
  if ($('topEt')) $('topEt').textContent = w.et0_mm == null ? '--' : Number(w.et0_mm).toFixed(1);
  if ($('topBudget')) $('topBudget').textContent = Number(d.water_budget_mm || 0).toFixed(1);
  if ($('topRain')) $('topRain').textContent = (Number(w.forecast_rain_mm || 0) + Number(w.rain_24h_mm || 0)).toFixed(1);
  if ($('topWind')) $('topWind').textContent = Number(w.wind_kmh || 0).toFixed(0);
}

async function loadIrrigation() {
  try {
    const [programRes, weatherRes, historyRes, presetsRes] = await Promise.all([
      authFetch('/api/irrigation/programs'),
      authFetch('/api/irrigation/weather'),
      authFetch('/api/irrigation/history'),
      authFetch('/api/presets'),
    ]);
    const programs = await programRes.json();
    const weather = await weatherRes.json();
    const history = await historyRes.json();
    const presets = await presetsRes.json();
    irrigationPresetNames = (presets.presets || presets || [])
      .map(p => p.name || p)
      .filter(Boolean);
    if (!irrigationPresetNames.length) irrigationPresetNames = ['Normal'];
    renderIrrigationPresetOptions();
    irrigationState = Object.assign({}, irrigationState || {}, {
      programs: programs.programs || [],
      weather,
      decision: weather.decision || irrigationState?.decision || {},
      history: history.history || [],
    });
    renderIrrigation();
    updateIrrigationStatus(irrigationState);
    updateIrrigationRuntimePreview();
  } catch (err) {
    log('Bewässerung laden fehlgeschlagen: ' + err.message);
  }
}

function renderIrrigationPresetOptions(selected) {
  const el = $('irrZonePreset');
  if (!el) return;
  const current = selected || el.value || 'Normal';
  el.innerHTML = irrigationPresetNames
    .map(name => `<option value="${name.replace(/"/g, '&quot;')}">${name}</option>`)
    .join('');
  if (irrigationPresetNames.includes(current)) el.value = current;
}

function buildPreviewState() {
  return {
    v20: {
      frequency: 42.5, freq_setpoint: 43, voltage: 231, current: 4.2, power: 0.92,
      fault: 0, fault_code: 0, running: true, connected: true,
    },
    pi: {
      pressure: 3.1, flow: 24.5, water_temp: 11.8, setpoint: 3.0, p_on: 2.2, p_off: 4.0,
      active: true, enabled: true, pump_state: 2, kp: 8, ki: 1, freq_min: 35, freq_max: 52,
      dry_run_locked: false, flow_setpoint: 0, ctrl_mode: 0,
    },
    temp: 28.4,
    fan: { rpm: 920, pwm: 120, mode: 'Auto' },
    active_preset: 'Rasen',
    ctrl_mode: 0,
    timeguard: {
      enabled: true, allowed: true, synced: true, time: '14:30',
      start: '06:00', end: '22:00', days: [true, true, true, true, true, true, true],
    },
    irrigation: {
      weather: { forecast_rain_mm: 1.2, rain_24h_mm: 0.4, wind_kmh: 12, et0_mm: 3.4 },
      decision: {
        allowed: true, reason: 'ET Freigabe', program_id: 'garten',
        water_budget_mm: 1.8, runtime_factor: 0.72,
        next_start: new Date(Date.now() + 18 * 3600 * 1000).toISOString(),
        active_zone: 'rasen_sued', active_program: 'garten', running: true,
      },
      programs: [{
        id: 'garten', name: 'Garten', enabled: true,
        days: [true, true, true, true, true, false, false],
        start_hour: 6, start_min: 0, seasonal_factor: 1,
        thresholds: { skip_rain_mm: 6, wind_max_kmh: 35 },
        zones: [
          { id: 'rasen_sued', name: 'Rasen Süd', duration_min: 18, preset: 'Rasen' },
          { id: 'beete', name: 'Beete', duration_min: 12, preset: 'Tropfschlauch' },
        ],
        last_run_at: new Date(Date.now() - 86400000).toISOString(),
      }],
      history: [
        { at: new Date().toISOString(), type: 'run', result: 'running', program_name: 'Garten' },
        { at: new Date(Date.now() - 86400000).toISOString(), type: 'run', result: 'completed', program_name: 'Garten' },
      ],
    },
    sys: { mqtt: true, uptime: 3600 },
  };
}

function renderIrrigation() {
  const list = $('irrProgramList');
  if (!list || !irrigationState) return;
  const programs = irrigationState.programs || [];
  renderQuickPrograms(programs);
  if (!programs.length) {
    list.innerHTML = '<div class="text-sm text-slate-400 text-center py-4">Noch keine Programme</div>';
  } else {
    list.innerHTML = programs.map(p => {
      const zones = (p.zones || []).map(z => `${z.name} · ${z.duration_min} min · ${z.preset || 'Normal'}`).join('<br>');
      const days = ['Mo','Di','Mi','Do','Fr','Sa','So'].filter((_, i) => p.days?.[i]).join(' ');
      const modeLabel = p.mode === 'smart_et' ? `Smart ET · max ${p.max_runs_per_week || 3}x/Woche` : 'Festprogramm';
      const maxDeficit = Math.max(0, ...(p.zones || []).map(z => Number(z.deficit_mm || 0)));
      return `
        <div class="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 p-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <span class="material-symbols-outlined text-emerald-500 text-lg">sprinkler</span>${p.name}
              </div>
              <div class="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-1">${modeLabel} · ${days || 'keine Tage'} · ${String(p.start_hour).padStart(2,'0')}:${String(p.start_min).padStart(2,'0')}</div>
              <div class="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">${zones || 'Keine Zone'}</div>
            </div>
            <div class="flex gap-1 shrink-0">
              <button onclick="runIrrigation('${p.id}')" class="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 flex items-center justify-center" title="Start"><span class="material-symbols-outlined text-base">play_arrow</span></button>
              <button onclick="stopIrrigation('${p.id}')" class="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 flex items-center justify-center" title="Stop"><span class="material-symbols-outlined text-base">stop</span></button>
              <button onclick="editIrrigation('${p.id}')" class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 flex items-center justify-center" title="Bearbeiten"><span class="material-symbols-outlined text-base">edit</span></button>
            </div>
          </div>
          <div class="mt-3 flex items-center justify-between text-[10px] text-slate-400">
            <span>${p.enabled ? 'Automatik aktiv' : 'Automatik aus'}</span>
            <span>${p.mode === 'smart_et' ? `${maxDeficit.toFixed(1)} mm Defizit` : (p.last_skip_reason || p.last_run_at ? fmtDateTime(p.last_run_at) : 'Noch kein Lauf')}</span>
          </div>
        </div>`;
    }).join('');
  }

  const history = $('irrHistory');
  if (history) {
    const rows = (irrigationState.history || []).slice(-8).reverse();
    history.innerHTML = rows.length ? rows.map(h => `
      <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 px-3 py-2 flex justify-between gap-3 text-xs">
        <span class="font-bold text-slate-700 dark:text-slate-200">${h.program_name || h.program_id || h.type}</span>
        <span class="text-slate-400 text-right">${h.result || h.type} · ${h.reason || fmtDateTime(h.at)}</span>
      </div>`).join('') : '<div class="text-xs text-slate-400">Noch keine Historie</div>';
  }
}

function renderQuickPrograms(programs) {
  const box = $('deckQuickPrograms');
  if (!box) return;
  const quick = programs.slice(0, 3).map(p => ({
    id: p.id,
    label: p.name,
    icon: 'sprinkler',
    cls: 'bg-emerald-600 hover:bg-emerald-500',
  }));
  quick.push({ id: '__normal__', label: 'Normal', icon: 'water_pump', cls: 'bg-blue-600 hover:bg-blue-500' });
  box.innerHTML = quick.map(item => `
    <button onclick="${item.id === '__normal__' ? 'applyNormalPreset()' : `runIrrigation('${item.id}')`}"
      class="h-11 rounded-xl ${item.cls} text-white flex items-center justify-center gap-1.5 text-xs font-bold min-w-0"
      title="${item.label}">
      <span class="material-symbols-outlined text-base">${item.icon}</span>
      <span class="truncate">${item.label}</span>
    </button>
  `).join('');
}

window.runIrrigation = async (id) => {
  const r = await authFetch(`/api/irrigation/programs/${encodeURIComponent(id)}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ forceWeather: false })
  });
  const d = await r.json();
  $toast.show(d.ok ? 'Bewässerung gestartet' : (d.error || 'Start gesperrt'), d.ok ? 'info' : 'error');
  loadIrrigation();
};

window.stopIrrigation = async (id) => {
  const r = await authFetch(`/api/irrigation/programs/${encodeURIComponent(id)}/stop`, { method: 'POST' });
  const d = await r.json();
  $toast.show(d.ok ? 'Bewässerung gestoppt' : (d.error || 'Stop fehlgeschlagen'), d.ok ? 'info' : 'error');
  loadIrrigation();
};

window.applyNormalPreset = async () => {
  const res = await authFetch('/api/preset/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Normal' })
  });
  const d = await res.json();
  $toast.show(d.ok || d.success ? 'Normal geladen' : (d.error || 'Preset nicht verfügbar'), d.ok || d.success ? 'info' : 'error');
};

window.editIrrigation = (id) => {
  const p = irrigationState?.programs?.find(x => x.id === id);
  if (!p) return;
  $('irrName').value = p.name;
  $('irrStart').value = `${String(p.start_hour).padStart(2,'0')}:${String(p.start_min).padStart(2,'0')}`;
  $('irrMode').value = p.mode || 'fixed';
  $('irrMaxRuns').value = p.max_runs_per_week || 3;
  (p.days || []).forEach((d, i) => { if ($('irrDay' + i)) $('irrDay' + i).checked = !!d; });
  $('irrSeason').value = p.seasonal_factor || 1;
  $('irrSkipRain').value = p.thresholds?.skip_rain_mm ?? 6;
  $('irrMaxWind').value = p.thresholds?.wind_max_kmh ?? 35;
  const z = p.zones?.[0] || {};
  $('irrZoneName').value = z.name || '';
  $('irrZoneMin').value = z.duration_min || 10;
  renderIrrigationPresetOptions(z.preset || 'Normal');
  $('irrZoneWater').value = z.water_mm || 6;
  $('irrMinDeficit').value = z.min_deficit_mm || 8;
  $('irrTargetMm').value = z.target_mm || 12;
  updateIrrigationRuntimePreview();
};

function updateIrrigationRuntimePreview() {
  const el = $('irrRuntimePreview');
  if (!el) return;
  const mode = $('irrMode')?.value || 'smart_et';
  const baseMin = parseFloat($('irrZoneMin')?.value) || 10;
  const baseMm = parseFloat($('irrZoneWater')?.value) || 6;
  const minDef = parseFloat($('irrMinDeficit')?.value) || 8;
  const target = parseFloat($('irrTargetMm')?.value) || 12;
  const calcMin = Math.max(1, Math.round(baseMin * Math.min(target, Math.max(target, minDef)) / Math.max(baseMm, 0.1)));
  if (mode === 'smart_et') {
    el.textContent = `Smart ET: ${baseMin} min liefern ca. ${baseMm} mm. Start ab ${minDef} mm Defizit, Ziel ${target} mm => typischer Lauf ca. ${calcMin} min.`;
  } else {
    el.textContent = `Festprogramm: läuft an den gewählten Tagen mit ${baseMin} min Basisdauer.`;
  }
}

async function saveIrrigationProgram() {
  const current = irrigationState?.programs || [];
  const name = $('irrName').value.trim() || 'Garten';
  const [h, m] = ($('irrStart').value || '06:00').split(':').map(v => parseInt(v));
  const id = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'garten';
  const program = {
    id,
    name,
    enabled: true,
    mode: $('irrMode').value || 'smart_et',
    days: Array.from({ length: 7 }, (_, i) => $('irrDay' + i).checked),
    start_hour: h || 0,
    start_min: m || 0,
    seasonal_factor: parseFloat($('irrSeason').value) || 1,
    weather_enabled: true,
    max_runs_per_week: parseInt($('irrMaxRuns').value) || 3,
    thresholds: {
      skip_rain_mm: parseFloat($('irrSkipRain').value) || 6,
      reduce_rain_mm: 2,
      wind_max_kmh: parseFloat($('irrMaxWind').value) || 35,
      soil_moisture_skip_pct: 70,
      et0_default_mm: 3,
    },
    zones: [{
      id: ($('irrZoneName').value || 'Zone 1').toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || 'zone_1',
      name: $('irrZoneName').value.trim() || 'Zone 1',
      enabled: true,
      duration_min: parseFloat($('irrZoneMin').value) || 10,
      water_mm: parseFloat($('irrZoneWater').value) || 6,
      min_deficit_mm: parseFloat($('irrMinDeficit').value) || 8,
      target_mm: parseFloat($('irrTargetMm').value) || 12,
      preset: $('irrZonePreset').value.trim() || 'Normal',
    }]
  };
  const next = current.filter(p => p.id !== id).concat(program);
  const r = await authFetch('/api/irrigation/programs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ programs: next })
  });
  const d = await r.json();
  if (r.ok) {
    $toast.show('Bewässerungsprogramm gespeichert');
    irrigationState.programs = d.programs || next;
    renderIrrigation();
  } else {
    $toast.show(d.error || 'Speichern fehlgeschlagen', 'error');
  }
}

$('btnIrrRefresh').onclick = loadIrrigation;
$('btnIrrSave').onclick = saveIrrigationProgram;
['irrMode', 'irrZoneMin', 'irrZoneWater', 'irrMinDeficit', 'irrTargetMm'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('input', updateIrrigationRuntimePreview);
  if (el) el.addEventListener('change', updateIrrigationRuntimePreview);
});

// ─── Timeguard ───
async function loadTimeguard() {
  try {
    const res = await authFetch('/api/timeguard');
    const tg = await res.json();
    $('tgEnabled').checked = tg.enabled;
    $('tgStartH').value = tg.start_hour;
    $('tgStartM').value = tg.start_min;
    $('tgEndH').value = tg.end_hour;
    $('tgEndM').value = tg.end_min;
    if (tg.days) {
      tg.days.forEach((d, i) => { $('tgDay' + i).checked = d; });
    }
    updateTgStatus(tg);
  } catch (err) {
    log('Timeguard laden fehlgeschlagen: ' + err);
  }
}

function updateTgStatus(tg) {
  const dot = $('tgStatusDot');
  const txt = $('tgStatusText');
  const time = $('tgTime');
  if (!dot) return;
  if (tg.time) time.textContent = tg.time;
  if (!tg.enabled) {
    dot.className = 'w-3 h-3 rounded-full bg-slate-400 transition-all';
    txt.textContent = 'Deaktiviert';
    txt.className = 'text-sm font-bold text-slate-400';
  } else if (tg.allowed) {
    dot.className = 'w-3 h-3 rounded-full dot-ok transition-all';
    txt.textContent = 'Betrieb erlaubt';
    txt.className = 'text-sm font-bold text-green-600 dark:text-green-400';
  } else {
    dot.className = 'w-3 h-3 rounded-full dot-err transition-all';
    txt.textContent = 'Gesperrt';
    txt.className = 'text-sm font-bold text-red-500';
  }
}

$('saveTG').onclick = async () => {
  const days = [];
  for (let i = 0; i < 7; i++) days.push($('tgDay' + i).checked);
  const body = {
    enabled: $('tgEnabled').checked,
    start_hour: parseInt($('tgStartH').value) || 0,
    start_min: parseInt($('tgStartM').value) || 0,
    end_hour: parseInt($('tgEndH').value) || 0,
    end_min: parseInt($('tgEndM').value) || 0,
    days
  };
  const res = await authFetch('/api/timeguard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json();
  if (d.ok) $toast.show('Zeitsperre gespeichert');
  else $toast.show(d.error || 'Fehler', 'error');
};

// ─── Sidebar Nav Reorder (drag & drop + localStorage) ───
(function initNavReorder() {
  const nav = document.querySelector('#drawerContent > nav');
  if (!nav) return;
  const STORAGE_KEY = 'sidebarNavOrder';

  // Get draggable buttons (those with data-tab, except logs which stays at bottom)
  function getDraggables() {
    return [...nav.querySelectorAll('.sidebar-nav-btn[data-tab]')].filter(b => b.dataset.tab !== 'logs');
  }

  // Apply saved order
  function applySavedOrder() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const order = JSON.parse(saved);
      const btns = getDraggables();
      const map = {};
      btns.forEach(b => map[b.dataset.tab] = b);
      const spacer = nav.querySelector('.flex-1');
      order.forEach(tab => {
        if (map[tab]) nav.insertBefore(map[tab], spacer);
      });
    } catch(e) { /* ignore */ }
  }

  function saveOrder() {
    const order = getDraggables().map(b => b.dataset.tab);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  }

  // Make buttons draggable
  let dragEl = null;
  getDraggables().forEach(btn => {
    btn.draggable = true;
    btn.addEventListener('dragstart', (e) => {
      dragEl = btn;
      btn.classList.add('opacity-40');
      e.dataTransfer.effectAllowed = 'move';
    });
    btn.addEventListener('dragend', () => {
      btn.classList.remove('opacity-40');
      nav.querySelectorAll('.sidebar-nav-btn').forEach(b => b.classList.remove('border-t-2', 'border-blue-400'));
      dragEl = null;
    });
    btn.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (btn !== dragEl && btn.dataset.tab !== 'logs') {
        btn.classList.add('border-t-2', 'border-blue-400');
      }
    });
    btn.addEventListener('dragleave', () => {
      btn.classList.remove('border-t-2', 'border-blue-400');
    });
    btn.addEventListener('drop', (e) => {
      e.preventDefault();
      btn.classList.remove('border-t-2', 'border-blue-400');
      if (!dragEl || dragEl === btn || btn.dataset.tab === 'logs') return;
      const spacer = nav.querySelector('.flex-1');
      const rect = btn.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      if (after && btn.nextElementSibling && btn.nextElementSibling !== spacer) {
        nav.insertBefore(dragEl, btn.nextElementSibling);
      } else {
        nav.insertBefore(dragEl, btn);
      }
      saveOrder();
    });
  });

  // Touch drag support for mobile (long-press to start)
  let touchDragEl = null, touchClone = null, touchStartY = 0;
  getDraggables().forEach(btn => {
    let longPressTimer = null;
    btn.addEventListener('touchstart', (e) => {
      longPressTimer = setTimeout(() => {
        touchDragEl = btn;
        touchStartY = e.touches[0].clientY;
        btn.classList.add('opacity-40');
        touchClone = btn.cloneNode(true);
        touchClone.style.cssText = 'position:fixed;pointer-events:none;z-index:999;opacity:0.8;';
        document.body.appendChild(touchClone);
      }, 400);
    }, { passive: true });
    btn.addEventListener('touchmove', (e) => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      if (!touchDragEl) return;
      e.preventDefault();
      const y = e.touches[0].clientY;
      if (touchClone) {
        touchClone.style.top = y - 20 + 'px';
        touchClone.style.left = btn.getBoundingClientRect().left + 'px';
      }
      const target = document.elementFromPoint(e.touches[0].clientX, y);
      const navBtn = target?.closest?.('.sidebar-nav-btn[data-tab]');
      nav.querySelectorAll('.sidebar-nav-btn').forEach(b => b.classList.remove('border-t-2', 'border-blue-400'));
      if (navBtn && navBtn !== touchDragEl && navBtn.dataset.tab !== 'logs') {
        navBtn.classList.add('border-t-2', 'border-blue-400');
      }
    }, { passive: false });
    btn.addEventListener('touchend', () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      if (!touchDragEl) return;
      touchDragEl.classList.remove('opacity-40');
      if (touchClone) { touchClone.remove(); touchClone = null; }
      // Find drop target
      nav.querySelectorAll('.sidebar-nav-btn').forEach(b => {
        if (b.classList.contains('border-t-2')) {
          b.classList.remove('border-t-2', 'border-blue-400');
          const spacer = nav.querySelector('.flex-1');
          nav.insertBefore(touchDragEl, b);
          saveOrder();
        }
      });
      touchDragEl = null;
    }, { passive: true });
  });

  applySavedOrder();
})();

// ─── Zoom ───
(function initZoom() {
  const slider = $('zoomSlider');
  const label = $('zoomValue');
  const saved = localStorage.getItem('pageZoom') || '100';
  function applyZoom(val) {
    document.documentElement.style.zoom = val / 100;
    label.textContent = val + '%';
    slider.value = val;
  }
  applyZoom(saved);
  slider.oninput = () => {
    const v = slider.value;
    applyZoom(v);
    localStorage.setItem('pageZoom', v);
  };
  $('btnZoomReset').onclick = () => {
    applyZoom(100);
    localStorage.setItem('pageZoom', '100');
  };
})();

// ─── Display: Theme Toggle ───
(function initDisplayTheme() {
  const toggle = $('themeToggle');
  toggle.checked = document.documentElement.classList.contains('dark');
  toggle.onchange = () => setTheme(toggle.checked);
})();

// ─── Start ───
tryAutoLogin();
