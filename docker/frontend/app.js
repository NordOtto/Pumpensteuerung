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
  if (!authToken) return showLogin();
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
  sliderTip:   $('sliderTooltip'),
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
    els.freqSet.textContent = (st.v20.freq_setpoint || 0).toFixed(1);
    // Sync slider to current setpoint (unless user is dragging)
    if (!sliderDragging) {
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

      // Prefill preset form
      if (document.activeElement.id !== 'presetNewSet' && document.activeElement.id !== 'presetNewMode') {
        $('presetNewSet').value = st.pi.setpoint;
        $('presetNewKp').value = st.pi.kp;
        $('presetNewKi').value = st.pi.ki;
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

// ─── Freq Slider ───
let slTimer;
let sliderDragging = false;

function positionTooltip() {
  const s = els.slider;
  const tip = els.sliderTip;
  const pct = (s.value - s.min) / (s.max - s.min);
  const thumbW = 18; // approx thumb width px
  const trackW = s.offsetWidth - thumbW;
  const px = thumbW / 2 + pct * trackW;
  tip.style.left = px + 'px';
  tip.textContent = parseFloat(s.value).toFixed(1) + ' Hz';
}

els.slider.addEventListener('input', () => {
  sliderDragging = true;
  els.sliderTip.classList.remove('hidden');
  positionTooltip();
  // Show value in the "Sollfrequenz" display as well
  els.freqSet.textContent = parseFloat(els.slider.value).toFixed(1);
});

els.slider.addEventListener('change', (e) => {
  els.sliderTip.classList.add('hidden');
  sliderDragging = false;
  clearTimeout(slTimer);
  slTimer = setTimeout(() => {
    authFetch('/api/v20/freq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hz: parseFloat(e.target.value) })
    }).then(r => r.json()).then(o => {
      if (o.ok) $toast.show(`Frequenz auf ${e.target.value} Hz gesetzt`);
    });
  }, 300);
});

// ─── Gear Button → Settings ───
$('btnGear').onclick = () => window.showTab('settings');

// ─── Sidebar / Tabs ───
const tabMeta = {
  settings:  { title: 'Regelung (PI)', sub: 'Parameter' },
  fan:       { title: 'Gehäuse Lüfter', sub: 'Modus & PWM' },
  presets:   { title: 'Presets', sub: 'Betriebsmodi verwalten' },
  timeguard: { title: 'Zeitsperre', sub: 'Betriebszeitfenster' },
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
  ['tabSettings', 'tabFan', 'tabPresets', 'tabTimeguard', 'tabLogs', 'tabDisplay'].forEach(t => $(t).classList.add('hidden'));

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
      lst.innerHTML += `
      <div class="flex items-center justify-between p-3 ${isActive ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600/50' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50'} border rounded-xl gap-2">
        <div class="min-w-0 flex-1">
          <div class="font-bold text-slate-800 dark:text-white flex items-center gap-2 text-sm">
            ${p.name}
            ${isActive ? '<span class="text-[8px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full font-bold uppercase shrink-0">Aktiv</span>' : ''}
          </div>
          <div class="text-[9px] text-slate-400 uppercase tracking-wider font-bold mt-0.5 truncate">
            ${p.mode == 1 ? 'Flow' : 'Druck'} ${p.setpoint} | Kp:${p.kp} Ki:${p.ki} | ${p.freq_min}–${p.freq_max}Hz
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
  $('presetNewSet').value = p.setpoint;
  $('presetNewKp').value = p.kp;
  $('presetNewKi').value = p.ki;
  $('presetNewFmin').value = p.freq_min;
  $('presetNewFmax').value = p.freq_max;
  $('btnCreatePreset').querySelector('span:last-child')?.remove();
  $('btnCreatePreset').innerHTML = '<span class="material-symbols-outlined text-base">save</span> Speichern';
  // Scroll to form
  $('presetNewName').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

$('btnCreatePreset').onclick = async () => {
  const name = $('presetNewName').value.trim();
  if (!name) return $toast.show('Name erforderlich', 'error');

  const body = {
    name,
    mode: parseInt($('presetNewMode').value),
    setpoint: parseFloat($('presetNewSet').value),
    kp: parseFloat($('presetNewKp').value),
    ki: parseFloat($('presetNewKi').value),
    freq_min: parseInt($('presetNewFmin').value),
    freq_max: parseInt($('presetNewFmax').value)
  };

  const res = await authFetch('/api/presets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json();
  if (d.success || d.ok) {
    $toast.show(name === $('presetNewName').value.trim() ? 'Preset gespeichert' : 'Preset angelegt');
    $('presetNewName').value = '';
    $('btnCreatePreset').innerHTML = '<span class="material-symbols-outlined text-base">add</span> Erstellen';
    loadPresets();
  } else {
    $toast.show(d.error || 'Fehler', 'error');
  }
};

$('presetNewMode').onchange = (e) => {
  $('lblPresetSet').textContent = e.target.value == '1' ? 'Sollwert (L/Min)' : 'Sollwert (bar)';
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
