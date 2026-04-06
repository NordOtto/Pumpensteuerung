// ─── Theme Toggle ───
(function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'light') document.documentElement.classList.remove('dark');
  else document.documentElement.classList.add('dark');
  updateThemeIcon();
})();

function updateThemeIcon() {
  const icon = document.getElementById('themeIcon');
  if (!icon) return;
  icon.textContent = document.documentElement.classList.contains('dark') ? 'light_mode' : 'dark_mode';
}

document.getElementById('btnTheme').onclick = () => {
  document.documentElement.classList.toggle('dark');
  const isDark = document.documentElement.classList.contains('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeIcon();
  updateChartTheme();
};

// ─── Clock ───
setInterval(() => {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}, 1000);

// ─── Element References ───
let ws;
const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProto}//${location.host}/ws`;
const $ = (id) => document.getElementById(id);

const els = {
  freq:        $('vFreq'),
  freqCard:    $('vFreqCard'),
  freqSet:     $('vFreqSet'),
  pressure:    $('vPressure'),
  pressureSet: $('vPressureSet'),
  flow:        $('vFlow'),
  flowSub:     $('vFlowSub'),
  voltage:     $('dVoltage'),
  current:     $('dCurrent'),
  power:       $('dPower'),
  waterTemp:   $('dWaterTemp'),
  airTemp:     $('dAirTemp'),
  fan:         $('dFan'),
  statusText:  $('statusText'),
  statusSub:   $('vStatusSubMini'),
  statusBadge: $('statusBadge'),
  badgeText:   $('statusBadgeText'),
  badgeDot:    $('statusBadgeDot'),
  dotMqtt:     $('dotMqtt'),
  dotModbus:   $('dotModbus'),
  dotPump:     $('dotPump'),
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

// ─── WebSocket ───
function connectWS() {
  ws = new WebSocket(wsUrl);
  ws.onopen = () => log('WebSocket verbunden');
  ws.onclose = () => {
    log('WS getrennt, reconnect...');
    setTimeout(connectWS, 3000);
    setDot('dotMqtt', false);
    setDot('dotModbus', false);
    setDot('dotPump', false);
    setStatusBadge('offline', 'Offline');
  };
  ws.onerror = () => { log('WS Error'); ws.close(); };
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      // Backend sends flat state object (no wrapper type)
      if (msg.v20 !== undefined) {
        updateUI(msg);
      }
    } catch (err) {
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
  if (state === 'running') cls = 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]';
  else if (state === 'fault') cls = 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]';
  else if (state === 'ready') cls = 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.4)]';
  else if (state === 'offline') cls = 'bg-slate-500';

  els.statusBadge.className = `${cls} text-white text-[10px] sm:text-xs font-bold px-2.5 sm:px-3 py-1 rounded-full flex items-center gap-1.5 shadow-md transition-all`;
  els.badgeText.textContent = text;
  els.badgeDot.className = `w-2 h-2 bg-white rounded-full ${state === 'running' ? 'animate-pulse' : ''}`;
}

// ─── Main UI update ───
let lastPiState = {};

function updateUI(st) {
  // V20 Pump
  if (st.v20) {
    const freq = (st.v20.frequency || 0).toFixed(1);
    els.freq.textContent = freq;
    els.freqCard.textContent = freq;
    els.freqSet.textContent = (st.v20.freq_setpoint || 0).toFixed(1);
    els.voltage.textContent = (st.v20.voltage || 0).toFixed(1);
    els.current.textContent = (st.v20.current || 0).toFixed(2);
    els.power.textContent = (st.v20.power || 0).toFixed(2);

    // Status badge + text
    let badgeState = 'ready', badgeLabel = 'Bereit', statusColor = 'text-blue-500 dark:text-blue-400';
    if (st.v20.fault) {
      badgeState = 'fault'; badgeLabel = `Störung ${st.v20.fault_code || ''}`;
      statusColor = 'text-red-500';
    } else if (st.v20.running) {
      badgeState = 'running'; badgeLabel = 'Läuft';
      statusColor = 'text-green-500 dark:text-green-400';
    } else if (!st.v20.connected) {
      badgeState = 'offline'; badgeLabel = 'Offline';
      statusColor = 'text-slate-400';
    }
    setStatusBadge(badgeState, badgeLabel);
    els.statusText.className = `text-xl sm:text-3xl font-bold ${statusColor}`;
    els.statusText.textContent = badgeLabel;
    els.statusSub.textContent = st.v20.running ? 'Motor Aktiv' : st.v20.fault ? 'Fehler prüfen' : st.v20.connected ? 'Standby' : 'Keine Verbindung';

    // Pump dot
    setDot('dotPump', st.v20.running);

    // Modbus dot
    setDot('dotModbus', st.v20.connected);
    els.statusModbus.textContent = st.v20.connected ? 'Verbunden' : 'Fehler';
    els.statusModbus.className = `text-[10px] font-bold px-2 py-0.5 rounded-md ${st.v20.connected ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`;
  }

  // Sensors (inside pi object from backend)
  if (st.pi) {
    els.pressure.textContent = (st.pi.pressure || 0).toFixed(2);
    els.flow.textContent = (st.pi.flow || 0).toFixed(1);
    els.waterTemp.textContent = st.pi.water_temp !== -127 ? (st.pi.water_temp || 0).toFixed(1) : '--';
    pushChart(st.pi.pressure);

    // Flow sub-status
    if (st.pi.flow > 0.5) {
      els.flowSub.textContent = 'Strömung Ok';
      els.flowSub.className = 'text-xs text-green-600 dark:text-green-400 font-medium mt-1';
    } else {
      els.flowSub.textContent = 'Kein Fluss';
      els.flowSub.className = 'text-xs text-slate-400 font-medium mt-1';
    }
  }

  // Air temp
  if (st.temp !== undefined) els.airTemp.textContent = st.temp !== -127 ? st.temp : '--';

  // Fan
  if (st.fan) els.fan.textContent = st.fan.rpm;

  // MQTT dot
  if (st.sys) {
    setDot('dotMqtt', st.sys.mqtt);
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

  // Timeguard live status (only update when drawer closed or tab not focused)
  if (st.timeguard) {
    updateTgStatus(st.timeguard);
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
        min: 0, max: 10,
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
$('btnStart').onclick = () => fetch('/api/v20/start', { method: 'POST' }).then(() => $toast.show('Start gesendet'));
$('btnStop').onclick = () => fetch('/api/v20/stop', { method: 'POST' }).then(() => $toast.show('Stop gesendet'));
$('btnReset').onclick = () => fetch('/api/v20/reset', { method: 'POST' }).then(() => $toast.show('Reset gesendet'));

// ─── Freq Slider ───
let slTimer;
els.slider.addEventListener('input', (e) => {
  // Show current slider value somewhere? We just update freq display transiently
});
els.slider.addEventListener('change', (e) => {
  clearTimeout(slTimer);
  slTimer = setTimeout(() => {
    fetch('/api/v20/freq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hz: parseFloat(e.target.value) })
    }).then(r => r.json()).then(o => {
      if (o.ok) $toast.show(`Frequenz auf ${e.target.value} Hz gesetzt`);
    });
  }, 500);
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
  ['tabSettings', 'tabFan', 'tabPresets', 'tabTimeguard', 'tabLogs'].forEach(t => $(t).classList.add('hidden'));

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
    const res = await fetch('/api/presets');
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
      lst.innerHTML += `
      <div class="flex items-center justify-between p-4 ${isActive ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600/50' : 'bg-slate-50 dark:bg-slate-700/30 border-slate-200 dark:border-slate-600/50'} border rounded-xl">
        <div>
          <div class="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            ${p.name}
            ${isActive ? '<span class="text-[9px] bg-blue-500 text-white px-2 py-0.5 rounded-full font-bold uppercase">Aktiv</span>' : ''}
          </div>
          <div class="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold mt-0.5">
            ${p.mode == 1 ? 'Flow' : 'Druck'} | Soll: ${p.setpoint} | Kp: ${p.kp} Ki: ${p.ki} | ${p.freq_min}–${p.freq_max} Hz
          </div>
        </div>
        <div class="flex gap-2 shrink-0 ml-3">
          <button onclick="applyP('${safeName}')" class="px-3 py-1.5 ${isActive ? 'bg-blue-500 text-white' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/40'} rounded-lg font-bold text-xs">${isActive ? 'Aktiv' : 'Aktivieren'}</button>
          <button onclick="delP('${safeName}')" class="px-2.5 py-1.5 bg-rose-50 dark:bg-rose-900/20 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-800/30 rounded-lg font-bold">
            <span class="material-symbols-outlined text-base">delete</span>
          </button>
        </div>
      </div>`;
    });
  } catch (err) {
    log('Presets laden fehlgeschlagen: ' + err);
  }
}

window.applyP = async (name) => {
  const res = await fetch('/api/preset/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  const d = await res.json();
  if (d.success || d.ok) { $toast.show(`Preset "${name}" geladen`); $('closeDrawer').click(); }
  else $toast.show(d.error || 'Fehler', 'error');
};

window.delP = async (name) => {
  if (!confirm(`Preset "${name}" löschen?`)) return;
  const res = await fetch(`/api/presets/${encodeURIComponent(name)}`, { method: 'DELETE' });
  if (res.ok) loadPresets();
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

  const res = await fetch('/api/presets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json();
  if (d.success || d.ok) {
    $toast.show('Preset angelegt');
    $('presetNewName').value = '';
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
  const res = await fetch('/api/pressure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json();
  if (d.success || d.ok) $toast.show('Parameter gespeichert');
  else $toast.show('Fehler beim Speichern', 'error');
};

// ─── Save Fan ───
$('saveFan').onclick = async () => {
  const mode = $('fanMode').value;
  const pwm = parseInt($('fanPwm').value);
  await fetch('/api/fan/mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
  await fetch('/api/fan/pwm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pwm }) });
  $toast.show('Lüfter aktualisiert');
};

$('fanPwm').addEventListener('input', (e) => {
  $('fanPwmVal').textContent = Math.round(e.target.value / 255 * 100) + '%';
});

// ─── Timeguard ───
async function loadTimeguard() {
  try {
    const res = await fetch('/api/timeguard');
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
  const res = await fetch('/api/timeguard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json();
  if (d.ok) $toast.show('Zeitsperre gespeichert');
  else $toast.show(d.error || 'Fehler', 'error');
};

// ─── Start ───
connectWS();
