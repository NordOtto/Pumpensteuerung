// ============================================================
//  web_index.h – Dashboard HTML + CSS + JS als PROGMEM
//  Tailwind CSS + GSAP via CDN (Browser lädt vom Internet)
//  Deutsch mit englischen Fachbegriffen
// ============================================================
#pragma once

const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0a0f1a">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Pumpe">
<link rel="manifest" href="/manifest.json">
<script>document.documentElement.setAttribute('data-theme',localStorage.getItem('theme')||'dark');</script>
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon.svg">
<title>Pumpensteuerung</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<style>
/* ── CSS Custom Properties ── */
:root {
  --accent:#00b4ff;--accent2:#0ea5e9;
  --ok:#22c55e;--warn:#f59e0b;--danger:#ef4444;--info:#3b82f6;
  --card-bg:#1a1a2e;--card-border:#2a2a44;
  --surface:#1e1e34;--surface2:#24243c;
}

/* ── Base ── */
body{font-family:system-ui,-apple-system,sans-serif;background:#0d0d1a;color:#e2e8f0}

/* ── Gauge ── */
.gauge-wrap{position:relative;width:190px;height:190px;flex-shrink:0}
.gauge-svg{width:100%;height:100%;overflow:visible}
.gauge-track{fill:none;stroke:#12122a;stroke-width:12;stroke-linecap:butt}
.gauge-arc{fill:none;stroke-width:12;stroke-linecap:butt;transition:stroke-dasharray .6s ease,stroke .4s ease}
.gauge-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
.gauge-val{font-size:2rem;font-weight:700;line-height:1;letter-spacing:-0.03em}
.gauge-unit{font-size:.65rem;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:.06em}
.gauge-label{font-size:.6rem;color:#475569;margin-top:1px}

/* ── Sparkline ── */
.spark-svg{width:100%;height:64px;overflow:visible}
.spark-line{fill:none;stroke:var(--accent2);stroke-width:1.5;opacity:.9}
.spark-grid{stroke:#1e1e34;stroke-width:0.5}

/* ── KPI Bar ── */
.kpi-bar{position:sticky;top:0;z-index:50;background:#0d0d1a;border-bottom:2px solid #2a2a44}
.kpi-item{display:flex;flex-direction:column;align-items:center;padding:.35rem .9rem;min-width:80px}
.kpi-val{font-size:1.25rem;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums;letter-spacing:-0.02em}
.kpi-lbl{font-size:.6rem;text-transform:uppercase;letter-spacing:.07em;color:#475569}

/* ── Cards ── */
.card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:4px;padding:1.25rem;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}
.card-hdr{cursor:pointer;user-select:none;padding-bottom:.6rem;border-bottom:1px solid var(--card-border);margin-bottom:1rem}
.card.dragging{opacity:.35;border:2px dashed #3b82f6!important}
.card.drag-over{border-top:3px solid #3b82f6!important}
.drag-handle{cursor:grab;touch-action:none;opacity:.25;transition:opacity .2s}
.drag-handle:hover,.drag-handle:active{opacity:.8}

/* ── KPI Mini-Box ── */
.kpi-box{background:var(--surface);border:1px solid var(--card-border);border-radius:3px;padding:.65rem .8rem;text-align:center;box-shadow:inset 0 1px 3px rgba(0,0,0,.3)}
.kpi-box-val{font-size:1.2rem;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums}
.kpi-box-lbl{font-size:.6rem;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-top:2px}

/* ── Segmented Control ── */
.seg-ctrl{display:flex;background:var(--surface);border:1px solid var(--card-border);border-radius:3px;padding:2px;gap:2px}
.seg-btn{flex:1;padding:.35rem .25rem;border-radius:2px;font-size:.7rem;font-weight:600;text-align:center;cursor:pointer;transition:background .15s,color .15s;background:transparent;color:#64748b;border:none}
.seg-btn.active{background:var(--accent2);color:#fff}

/* ── Day Pills ── */
.day-pill{flex:1;padding:.4rem .25rem;border-radius:3px;font-size:.7rem;font-weight:600;text-align:center;cursor:pointer;transition:background .15s,color .15s;border:none;background:var(--surface);color:#64748b}
.day-pill.active{background:#d97706;color:#fff}

/* ── Status Dot ── */
.dot{width:12px;height:12px;border-radius:3px;display:inline-block;flex-shrink:0}
.dot-green{background:#22c55e}.dot-red{background:#ef4444}
.dot-yellow{background:#eab308}.dot-gray{background:#475569}
@keyframes pulse-green{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.4)}50%{box-shadow:0 0 0 5px rgba(34,197,94,0)}}
.dot-pulse{animation:pulse-green 1.8s infinite}

/* ── Buttons ── */
.btn-start{background:#16a34a;border-radius:3px;padding:.5rem 0;font-weight:600;font-size:.75rem;transition:background .15s;display:flex;align-items:center;justify-content:center;gap:.35rem;border:none;color:#fff;cursor:pointer;text-transform:uppercase;letter-spacing:.04em;box-shadow:inset 0 -1px 0 rgba(0,0,0,.2)}
.btn-start:hover{background:#15803d}
.btn-stop{background:#dc2626;border-radius:3px;padding:.5rem 0;font-weight:600;font-size:.75rem;transition:background .15s;display:flex;align-items:center;justify-content:center;gap:.35rem;border:none;color:#fff;cursor:pointer;text-transform:uppercase;letter-spacing:.04em;box-shadow:inset 0 -1px 0 rgba(0,0,0,.2)}
.btn-stop:hover{background:#b91c1c}
.btn-reset{background:#d97706;border-radius:3px;padding:.5rem 0;font-weight:600;font-size:.75rem;transition:background .15s;display:flex;align-items:center;justify-content:center;gap:.35rem;border:none;color:#fff;cursor:pointer;text-transform:uppercase;letter-spacing:.04em;box-shadow:inset 0 -1px 0 rgba(0,0,0,.2)}
.btn-reset:hover{background:#b45309}
.btn-save{width:100%;border-radius:3px;padding:.55rem 0;font-weight:600;font-size:.75rem;transition:background .15s,opacity .15s;border:none;cursor:pointer;text-transform:uppercase;letter-spacing:.04em}
.btn-save:disabled{opacity:.4;cursor:not-allowed}

/* ── Fan ── */
@keyframes fan-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
.fan-spin{animation:fan-spin linear infinite}

/* ── Toggle ── */
.toggle-wrap{position:relative;display:inline-flex;align-items:center;cursor:pointer}
.toggle-wrap input{position:absolute;opacity:0;width:0;height:0}
.toggle-track{width:42px;height:24px;border-radius:12px;background:#334155;transition:background .2s;display:block}
.toggle-thumb{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .2s;pointer-events:none}
.toggle-wrap input:checked~.toggle-track{background:var(--accent2)}
.toggle-wrap input:checked~.toggle-thumb{transform:translateX(18px)}

/* ── Toast ── */
#toast-container{position:fixed;bottom:1.25rem;right:1.25rem;z-index:9999;display:flex;flex-direction:column;gap:.5rem;pointer-events:none}
.toast{background:#1e293b;border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:.6rem 1rem;font-size:.8rem;color:#e2e8f0;box-shadow:0 4px 20px rgba(0,0,0,.5);pointer-events:auto;animation:toast-in .25s ease}
.toast.success{border-left:3px solid #22c55e}
.toast.error{border-left:3px solid #ef4444}
.toast.info{border-left:3px solid #3b82f6}
@keyframes toast-in{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}

/* ── Status Mini-Cards ── */
.stat-card{background:var(--surface);border:1px solid var(--card-border);border-radius:3px;padding:.7rem 1rem;display:flex;align-items:center;justify-content:space-between;gap:.5rem;box-shadow:inset 0 1px 3px rgba(0,0,0,.2)}

/* ── Range Input ── */
input[type=range]{accent-color:#3b82f6;width:100%}
input[type=number],input[type=text],input[type=time],select{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:3px;padding:.4rem .65rem;font-size:.8rem;color:#e2e8f0;outline:none;width:100%}
input[type=number]:focus,input[type=text]:focus,input[type=time]:focus,select:focus{border-color:var(--accent2);box-shadow:0 0 0 2px rgba(14,165,233,.25)}
select option{background:#1e293b}

/* ── Chip Buttons ── */
.chip{padding:.3rem .75rem;border-radius:3px;font-size:.7rem;font-weight:600;background:var(--surface2);border:1px solid var(--card-border);color:#94a3b8;cursor:pointer;transition:background .15s,color .15s;white-space:nowrap}
.chip:hover{background:rgba(14,165,233,.2);color:var(--accent)}

/* ── Chevron ── */
.chev{transition:transform .25s}
.chev.collapsed{transform:rotate(-90deg)}

/* ── Light Theme ── */
html[data-theme="light"] body{background:#e8ecf0!important;color:#0f172a!important}
html[data-theme="light"] .kpi-bar{background:#dde3ea!important;border-color:#c0c8d4!important}
html[data-theme="light"] .card{background:#f0f2f6!important;border-color:#c8cdd6!important}
html[data-theme="light"] :root{--surface:rgba(0,0,0,.04);--surface2:rgba(0,0,0,.06);--card-border:rgba(0,0,0,.08)}
html[data-theme="light"] .kpi-lbl,html[data-theme="light"] .gauge-unit,html[data-theme="light"] .kpi-box-lbl{color:#64748b!important}
html[data-theme="light"] .gauge-track{stroke:#e2e8f0}
html[data-theme="light"] #logBox{background:#1e293b!important;color:#4ade80!important}
html[data-theme="light"] input[type=number],html[data-theme="light"] input[type=text],html[data-theme="light"] input[type=time],html[data-theme="light"] select{background:#fff!important;border-color:#cbd5e1!important;color:#0f172a!important}
html[data-theme="light"] .toggle-track{background:#cbd5e1}
html[data-theme="light"] .seg-ctrl{background:#e2e8f0}
html[data-theme="light"] .seg-btn{color:#64748b}
html[data-theme="light"] .stat-card{background:rgba(0,0,0,.04);border-color:#e2e8f0}
html[data-theme="light"] .kpi-box{background:rgba(0,0,0,.04);border-color:#e2e8f0}
</style>
<script>tailwind.config={darkMode:'class',theme:{extend:{}}}</script>
</head>
<body class="min-h-screen">

<!-- ========== KPI BAR ========== -->
<div class="kpi-bar">
 <div class="flex items-center justify-between px-4 py-1 max-w-6xl mx-auto">
  <!-- Title -->
  <div class="flex items-center gap-2 min-w-0">
   <img src="/icon.svg" class="w-6 h-6 rounded" alt="">
   <div>
    <div class="text-sm font-bold leading-tight">Pumpensteuerung</div>
    <div id="hdrIP" class="text-xs" style="color:#475569"></div>
   </div>
  </div>
  <!-- KPI Values -->
  <div class="flex items-center divide-x" style="divide-color:rgba(255,255,255,.06)">
   <div class="kpi-item">
    <span id="kpiPressure" class="kpi-val" style="color:#60a5fa">-.--</span>
    <span class="kpi-lbl">bar</span>
   </div>
   <div class="kpi-item">
    <span id="kpiFreq" class="kpi-val" style="color:#34d399">0.0</span>
    <span class="kpi-lbl">Hz</span>
   </div>
   <div class="kpi-item hidden sm:flex">
    <span id="kpiPower" class="kpi-val" style="color:#f59e0b">0</span>
    <span class="kpi-lbl">W</span>
   </div>
   <div class="kpi-item">
    <span id="kpiDot" class="dot dot-gray"></span>
   </div>
  </div>
  <!-- Theme toggle -->
  <button onclick="toggleTheme()" id="themeToggle" class="p-2 rounded transition" style="background:var(--surface)" title="Theme wechseln">
   <svg id="themeIconMoon" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>
   <svg id="themeIconSun" class="w-4 h-4 hidden" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"/></svg>
  </button>
 </div>
</div>

<!-- ========== MAIN GRID ========== -->
<main class="grid grid-cols-1 md:grid-cols-2 gap-2 p-3 max-w-6xl mx-auto">

 <!-- CARD 1: V20 Frequenzumrichter -->
 <div id="card-v20" class="card">
  <div class="card-hdr flex items-center justify-between mb-4" onclick="toggleCard('v20')">
   <h2 class="text-sm font-semibold flex items-center gap-2" style="color:#94a3b8">
    <svg class="drag-handle w-4 h-4" fill="currentColor" viewBox="0 0 24 24" onmousedown="startDrag(event,'card-v20')" ontouchstart="startTouchDrag(event,'card-v20')"><path d="M3 8h18v2H3zm0 6h18v2H3z"/></svg>
    <svg class="w-4 h-4" fill="none" stroke="#60a5fa" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
    Frequenzumrichter V20
   </h2>
   <svg id="ccv20" class="chev w-4 h-4" style="color:#475569" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
  </div>
  <!-- Status row -->
  <div class="flex items-center gap-2 mb-4">
   <span id="v20dot" class="dot dot-gray"></span>
   <span id="v20status" class="text-sm font-medium">OFFLINE</span>
   <span id="v20fault" class="hidden ml-auto text-xs font-bold px-2 py-0.5 rounded" style="color:#f87171;background:rgba(239,68,68,.15)">STÖRUNG</span>
  </div>
  <!-- Gauge + KPI boxes -->
  <div class="flex items-center gap-4 mb-4">
   <div class="gauge-wrap">
    <svg class="gauge-svg" viewBox="0 0 100 100">
     <circle class="gauge-track" cx="50" cy="50" r="38" stroke-dasharray="179 239" transform="rotate(-225 50 50)"/>
     <circle id="gaugeFreqArc" class="gauge-arc" cx="50" cy="50" r="38" stroke="#3b82f6" stroke-dasharray="0 239" transform="rotate(-225 50 50)"/>
    </svg>
    <div class="gauge-center">
     <span id="gaugeFreqVal" class="gauge-val" style="color:#60a5fa">0.0</span>
     <span class="gauge-unit">Hz</span>
     <span id="gaugeFreqSpark" class="gauge-label">Frequenz</span>
    </div>
   </div>
   <div class="flex-1 grid grid-cols-1 gap-2">
    <div class="kpi-box">
     <div id="v20power" class="kpi-box-val" style="color:#fbbf24">0 W</div>
     <div class="kpi-box-lbl">Leistung</div>
    </div>
    <div class="kpi-box">
     <div id="v20cur" class="kpi-box-val" style="color:#34d399">0.00 A</div>
     <div class="kpi-box-lbl">Strom</div>
    </div>
    <div class="kpi-box">
     <div id="v20volt" class="kpi-box-val" style="color:#a78bfa">0 V</div>
     <div class="kpi-box-lbl">Spannung</div>
    </div>
   </div>
  </div>
  <!-- Hidden compat elements -->
  <span id="v20freq" class="hidden">0.00 Hz</span>
  <div id="v20bar" class="hidden" style="width:0%"></div>
  <!-- Sparkline -->
  <div class="mb-3" style="height:64px">
   <svg id="sparkFreq" class="spark-svg" preserveAspectRatio="none" viewBox="0 0 120 64">
    <line class="spark-grid" x1="0" y1="16" x2="120" y2="16"/><line class="spark-grid" x1="0" y1="32" x2="120" y2="32"/><line class="spark-grid" x1="0" y1="48" x2="120" y2="48"/>
    <line class="spark-grid" x1="30" y1="0" x2="30" y2="64"/><line class="spark-grid" x1="60" y1="0" x2="60" y2="64"/><line class="spark-grid" x1="90" y1="0" x2="90" y2="64"/>
    <polyline id="sparkFreqLine" class="spark-line" points="0,64"/>
   </svg>
  </div>
  <!-- Controls -->
  <div class="grid grid-cols-3 gap-2 mb-4">
   <button class="btn-start" onclick="api('v20/start','POST').then(()=>showToast('V20 gestartet','success'))">
    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
    Start
   </button>
   <button class="btn-stop" onclick="api('v20/stop','POST').then(()=>showToast('V20 gestoppt','info'))">
    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"/></svg>
    Stop
   </button>
   <button class="btn-reset" onclick="api('v20/reset','POST').then(()=>showToast('V20 Reset','info'))">
    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
    Reset
   </button>
  </div>
  <!-- Freq Slider -->
  <div>
   <div class="flex justify-between text-xs mb-1" style="color:#64748b">
    <span>Frequency Soll</span><span id="freqVal" class="font-mono" style="color:#94a3b8">0.0 Hz</span>
   </div>
   <input id="freqSlider" type="range" min="35" max="50" step="0.5" value="35"
          oninput="freqVal.textContent=this.value+' Hz'"
          onchange="api('v20/freq','POST',{hz:parseFloat(this.value)})">
   <div class="flex gap-2 mt-2">
    <button class="chip" onclick="setFreq(35)">Langsam 35</button>
    <button class="chip" onclick="setFreq(42)">Mittel 42</button>
    <button class="chip" onclick="setFreq(50)">Schnell 50</button>
   </div>
  </div>
 </div>

 <!-- CARD 2: Temperatur -->
 <div id="card-temp" class="card">
  <div class="card-hdr flex items-center justify-between mb-4" onclick="toggleCard('temp')">
   <h2 class="text-sm font-semibold flex items-center gap-2" style="color:#94a3b8">
    <svg class="drag-handle w-4 h-4" fill="currentColor" viewBox="0 0 24 24" onmousedown="startDrag(event,'card-temp')" ontouchstart="startTouchDrag(event,'card-temp')"><path d="M3 8h18v2H3zm0 6h18v2H3z"/></svg>
    <svg class="w-4 h-4" fill="none" stroke="#fb923c" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9V3m0 0a3 3 0 100 6 3 3 0 000-6zM6.343 17.657A8 8 0 1117.657 6.343"/></svg>
    Temperatur
   </h2>
   <svg id="cctemp" class="chev w-4 h-4" style="color:#475569" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
  </div>
  <!-- Gauge centered -->
  <div class="flex justify-center mb-4">
   <div class="gauge-wrap" style="width:200px;height:200px">
    <svg class="gauge-svg" viewBox="0 0 100 100">
     <circle class="gauge-track" cx="50" cy="50" r="38" stroke-dasharray="179 239" transform="rotate(-225 50 50)"/>
     <circle id="gaugeTempArc" class="gauge-arc" cx="50" cy="50" r="38" stroke="#3b82f6" stroke-dasharray="0 239" transform="rotate(-225 50 50)"/>
    </svg>
    <div class="gauge-center">
     <span id="tempVal" class="gauge-val" style="font-size:2rem;color:#fb923c">--.-</span>
     <span class="gauge-unit">°C</span>
    </div>
   </div>
  </div>
  <!-- Hidden compat -->
  <div id="tempBar" class="hidden bg-green-500" style="width:25%"></div>
  <!-- Sparkline -->
  <div style="height:64px">
   <svg id="sparkTemp" class="spark-svg" preserveAspectRatio="none" viewBox="0 0 120 64">
    <line class="spark-grid" x1="0" y1="16" x2="120" y2="16"/><line class="spark-grid" x1="0" y1="32" x2="120" y2="32"/><line class="spark-grid" x1="0" y1="48" x2="120" y2="48"/>
    <line class="spark-grid" x1="30" y1="0" x2="30" y2="64"/><line class="spark-grid" x1="60" y1="0" x2="60" y2="64"/><line class="spark-grid" x1="90" y1="0" x2="90" y2="64"/>
    <polyline id="sparkTempLine" class="spark-line" points="0,64" style="stroke:#fb923c"/>
   </svg>
  </div>
 </div>

 <!-- CARD 3: Lüfter -->
 <div id="card-fan" class="card">
  <div class="card-hdr flex items-center justify-between mb-4" onclick="toggleCard('fan')">
   <h2 class="text-sm font-semibold flex items-center gap-2" style="color:#94a3b8">
    <svg class="drag-handle w-4 h-4" fill="currentColor" viewBox="0 0 24 24" onmousedown="startDrag(event,'card-fan')" ontouchstart="startTouchDrag(event,'card-fan')"><path d="M3 8h18v2H3zm0 6h18v2H3z"/></svg>
    <svg class="w-4 h-4" fill="none" stroke="#22d3ee" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
    Lüfter
   </h2>
   <svg id="ccfan" class="chev w-4 h-4" style="color:#475569" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
  </div>
  <div class="flex items-center gap-6 mb-4">
   <svg id="fanSvg" viewBox="0 0 100 100" class="w-20 h-20 flex-shrink-0" style="color:#22d3ee">
    <g fill="currentColor" transform="translate(50,50)">
     <ellipse rx="11" ry="32" transform="rotate(0)" opacity="0.85"/>
     <ellipse rx="11" ry="32" transform="rotate(120)" opacity="0.85"/>
     <ellipse rx="11" ry="32" transform="rotate(240)" opacity="0.85"/>
     <circle r="7"/>
    </g>
   </svg>
   <div class="flex-1">
    <div class="text-4xl font-bold leading-tight" style="color:#22d3ee"><span id="fanRPM">0</span></div>
    <div class="text-xs mt-0.5" style="color:#64748b">RPM</div>
    <div class="mt-2 kpi-box" style="text-align:left">
     <span class="text-xs" style="color:#64748b">PWM: </span>
     <span id="fanPWM" class="text-sm font-mono font-bold">0</span>
     <span class="text-xs" style="color:#64748b">/255</span>
    </div>
   </div>
  </div>
  <!-- Mode Segmented Control -->
  <div class="mb-4">
   <label class="text-xs mb-2 block" style="color:#64748b">Modus</label>
   <div class="seg-ctrl">
    <button id="fm0" class="seg-btn active" onclick="setFanMode('Auto')">Auto</button>
    <button id="fm1" class="seg-btn" onclick="setFanMode('LOGO')">LOGO</button>
    <button id="fm2" class="seg-btn" onclick="setFanMode('MQTT')">MQTT</button>
    <button id="fm3" class="seg-btn" onclick="setFanMode('Web')">Web</button>
   </div>
  </div>
  <!-- PWM Slider -->
  <div>
   <div class="flex justify-between text-xs mb-1" style="color:#64748b">
    <span>PWM Override</span><span id="fanPWMVal" class="font-mono" style="color:#94a3b8">0</span>
   </div>
   <input id="fanPWMSlider" type="range" min="0" max="255" step="1" value="0"
          oninput="fanPWMVal.textContent=this.value"
          onchange="api('fan/pwm','POST',{pwm:parseInt(this.value)})">
  </div>
 </div>

 <!-- CARD 4: System -->
 <div id="card-sys" class="card">
  <div class="card-hdr flex items-center justify-between mb-4" onclick="toggleCard('sys')">
   <h2 class="text-sm font-semibold flex items-center gap-2" style="color:#94a3b8">
    <svg class="drag-handle w-4 h-4" fill="currentColor" viewBox="0 0 24 24" onmousedown="startDrag(event,'card-sys')" ontouchstart="startTouchDrag(event,'card-sys')"><path d="M3 8h18v2H3zm0 6h18v2H3z"/></svg>
    <svg class="w-4 h-4" fill="none" stroke="#a78bfa" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
    System
   </h2>
   <svg id="ccsys" class="chev w-4 h-4" style="color:#475569" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
  </div>
  <div class="space-y-2">
   <div class="stat-card">
    <span class="text-xs" style="color:#64748b">Modbus RTU (V20)</span>
    <span class="flex items-center gap-1.5">
     <span id="rtuDot" class="dot dot-gray"></span>
     <span id="rtuSt" class="text-xs font-medium">Offline</span>
    </span>
   </div>
   <div class="stat-card">
    <span class="text-xs" style="color:#64748b">Modbus TCP (LOGO)</span>
    <span id="tcpSt" class="text-xs font-medium">0 Clients</span>
   </div>
   <div class="stat-card">
    <span class="text-xs" style="color:#64748b">MQTT Broker</span>
    <span class="flex items-center gap-1.5">
     <span id="mqttDot" class="dot dot-gray"></span>
     <span id="mqttSt" class="text-xs font-medium">Offline</span>
    </span>
   </div>
   <div class="stat-card">
    <span class="text-xs" style="color:#64748b">IP-Adresse</span>
    <span id="sysIP" class="text-xs font-mono font-bold">0.0.0.0</span>
   </div>
   <div class="stat-card">
    <span class="text-xs" style="color:#64748b">Uptime</span>
    <span id="sysUp" class="text-xs font-semibold">0s</span>
   </div>
   <div class="stat-card">
    <span class="text-xs" style="color:#64748b">Firmware</span>
    <span id="sysFW" class="text-xs font-mono">-</span>
   </div>
  </div>
 </div>

 <!-- CARD 5: Zeitsperre -->
 <div id="card-time" class="card">
  <div class="card-hdr flex items-center justify-between mb-4" onclick="toggleCard('time')">
   <h2 class="text-sm font-semibold flex items-center gap-2" style="color:#94a3b8">
    <svg class="drag-handle w-4 h-4" fill="currentColor" viewBox="0 0 24 24" onmousedown="startDrag(event,'card-time')" ontouchstart="startTouchDrag(event,'card-time')"><path d="M3 8h18v2H3zm0 6h18v2H3z"/></svg>
    <svg class="w-4 h-4" fill="none" stroke="#fbbf24" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
    Zeitsperre
   </h2>
   <svg id="cctime" class="chev w-4 h-4" style="color:#475569" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
  </div>
  <!-- Status + Clock -->
  <div class="flex items-center justify-between mb-4">
   <div class="flex items-center gap-2">
    <span id="tgDot" class="dot dot-gray"></span>
    <span id="tgStatus" class="text-sm font-semibold">--</span>
   </div>
   <span id="tgClock" class="text-sm font-mono" style="color:#64748b">kein NTP</span>
  </div>
  <!-- Enabled Toggle -->
  <div class="flex items-center justify-between mb-4 p-3" style="border-radius:4px;background:var(--surface)">
   <span class="text-sm">Zeitsperre aktiv</span>
   <label class="toggle-wrap">
    <input type="checkbox" id="tgEnabled" onchange="tgDirty()">
    <span class="toggle-track"></span>
    <span class="toggle-thumb"></span>
   </label>
  </div>
  <!-- Time Range -->
  <div class="grid grid-cols-2 gap-3 mb-4">
   <div>
    <label class="text-xs mb-1 block" style="color:#64748b">Startzeit</label>
    <input type="time" id="tgStart" oninput="tgDirty()">
   </div>
   <div>
    <label class="text-xs mb-1 block" style="color:#64748b">Endzeit</label>
    <input type="time" id="tgEnd" oninput="tgDirty()">
   </div>
  </div>
  <!-- Days (Toggle Pills) -->
  <div class="mb-4">
   <label class="text-xs mb-2 block" style="color:#64748b">Wochentage</label>
   <div class="flex gap-1" id="tgDaysRow">
    <button class="day-pill active" id="tgD0" onclick="tgToggleDay(0)">Mo</button>
    <button class="day-pill active" id="tgD1" onclick="tgToggleDay(1)">Di</button>
    <button class="day-pill active" id="tgD2" onclick="tgToggleDay(2)">Mi</button>
    <button class="day-pill active" id="tgD3" onclick="tgToggleDay(3)">Do</button>
    <button class="day-pill active" id="tgD4" onclick="tgToggleDay(4)">Fr</button>
    <button class="day-pill active" id="tgD5" onclick="tgToggleDay(5)">Sa</button>
    <button class="day-pill active" id="tgD6" onclick="tgToggleDay(6)">So</button>
   </div>
  </div>
  <button id="tgSaveBtn" class="btn-save" style="background:#d97706;color:#fff" onclick="tgSave()" disabled>Gespeichert</button>
 </div>

 <!-- CARD 6: PI-Druckregelung -->
 <div id="card-pi" class="card">
  <div class="card-hdr flex items-center justify-between mb-4" onclick="toggleCard('pi')">
   <h2 class="text-sm font-semibold flex items-center gap-2" style="color:#94a3b8">
    <svg class="drag-handle w-4 h-4" fill="currentColor" viewBox="0 0 24 24" onmousedown="startDrag(event,'card-pi')" ontouchstart="startTouchDrag(event,'card-pi')"><path d="M3 8h18v2H3zm0 6h18v2H3z"/></svg>
    <svg class="w-4 h-4" fill="none" stroke="#60a5fa" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
    Druckregelung (PI)
   </h2>
   <svg id="ccpi" class="chev w-4 h-4" style="color:#475569" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
  </div>
  <!-- Dry-run alert -->
  <div id="piDryRunBox" class="hidden mb-3 p-3 flex items-center justify-between gap-2" style="border-radius:4px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3)">
   <span class="text-sm font-medium" style="color:#fca5a5">&#9888; Trockenlauf-Sperre aktiv (Auto-Reset 5 Min)</span>
   <button onclick="resetDryRun()" class="px-3 py-1 text-xs font-bold text-white flex-shrink-0" style="border-radius:3px;" style="background:#dc2626">Quittieren</button>
  </div>
  <!-- Gauge + Mini-KPIs -->
  <div class="flex items-center gap-4 mb-4">
   <div class="gauge-wrap">
    <svg class="gauge-svg" viewBox="0 0 100 100">
     <circle class="gauge-track" cx="50" cy="50" r="38" stroke-dasharray="179 239" transform="rotate(-225 50 50)"/>
     <circle id="gaugePiArc" class="gauge-arc" cx="50" cy="50" r="38" stroke="#3b82f6" stroke-dasharray="0 239" transform="rotate(-225 50 50)"/>
     <!-- Setpoint marker (line from center outward) -->
     <line id="gaugePiMarker" x1="50" y1="50" x2="50" y2="14" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" transform="rotate(-225 50 50)" opacity="0.7"/>
    </svg>
    <div class="gauge-center">
     <span id="piPressureVal" class="gauge-val" style="color:#60a5fa">-.--</span>
     <span class="gauge-unit">bar</span>
     <div class="flex items-center gap-1 mt-0.5">
      <span id="piDot" class="dot dot-gray" style="width:6px;height:6px"></span>
      <span id="piStatus" class="gauge-label">--</span>
     </div>
    </div>
   </div>
   <div class="flex-1 grid grid-cols-1 gap-2">
    <div class="kpi-box">
     <div id="piFlowVal" class="kpi-box-val font-mono" style="color:#22d3ee">-- L/min</div>
     <div class="kpi-box-lbl">Durchfluss</div>
    </div>
    <div class="kpi-box">
     <div id="piWaterTemp" class="kpi-box-val font-mono" style="color:#22d3ee">-- °C</div>
     <div class="kpi-box-lbl">Wassertemp.</div>
    </div>
   </div>
  </div>
  <!-- Hidden compat -->
  <div id="piBar" class="hidden" style="width:0%"></div>
  <!-- Sparkline -->
  <div class="mb-3" style="height:64px">
   <svg id="sparkPi" class="spark-svg" preserveAspectRatio="none" viewBox="0 0 120 64">
    <line class="spark-grid" x1="0" y1="16" x2="120" y2="16"/><line class="spark-grid" x1="0" y1="32" x2="120" y2="32"/><line class="spark-grid" x1="0" y1="48" x2="120" y2="48"/>
    <line class="spark-grid" x1="30" y1="0" x2="30" y2="64"/><line class="spark-grid" x1="60" y1="0" x2="60" y2="64"/><line class="spark-grid" x1="90" y1="0" x2="90" y2="64"/>
    <polyline id="sparkPiLine" class="spark-line" points="0,64"/>
   </svg>
  </div>
  <!-- PI Enabled Toggle -->
  <div class="flex items-center justify-between mb-4 p-3" style="border-radius:4px;background:var(--surface)">
   <span class="text-sm">PI-Regelung aktiv</span>
   <label class="toggle-wrap">
    <input type="checkbox" id="piEnabled" onchange="piDirty()">
    <span class="toggle-track"></span>
    <span class="toggle-thumb"></span>
   </label>
  </div>
  <!-- PI Settings Toggle -->
  <div class="mb-3">
   <button onclick="togglePiSettings()" class="flex items-center gap-2 text-xs transition" style="color:#64748b;background:none;border:none;cursor:pointer" onmouseover="this.style.color='#94a3b8'" onmouseout="this.style.color='#64748b'">
    <svg id="piSettingsChev" class="w-4 h-4 chev collapsed" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
    PI-Parameter anzeigen
   </button>
  </div>
  <div id="piSettingsPanel" class="hidden">
   <div class="grid grid-cols-3 gap-2 mb-2">
    <div><label class="text-xs mb-1 block" style="color:#64748b">EIN (bar)</label>
     <input type="number" id="piPon" value="2.2" step="0.1" min="0.1" max="6" oninput="piDirty()"></div>
    <div><label class="text-xs mb-1 block" style="color:#64748b">Sollwert (bar)</label>
     <input type="number" id="piSpNum" value="3.0" step="0.1" min="0.5" max="6" oninput="piDirty()"></div>
    <div><label class="text-xs mb-1 block" style="color:#64748b">AUS (bar)</label>
     <input type="number" id="piPoff" value="4.0" step="0.1" min="1" max="8" oninput="piDirty()"></div>
   </div>
   <div class="grid grid-cols-2 gap-2 mb-2">
    <div><label class="text-xs mb-1 block" style="color:#64748b">Kp (Hz/bar)</label>
     <input type="number" id="piKp" value="3.0" step="0.1" min="0.1" max="20" oninput="piDirty()"></div>
    <div><label class="text-xs mb-1 block" style="color:#64748b">Ki (Hz/bar·s)</label>
     <input type="number" id="piKi" value="0.3" step="0.01" min="0" max="5" oninput="piDirty()"></div>
   </div>
   <div class="grid grid-cols-2 gap-2 mb-3">
    <div><label class="text-xs mb-1 block" style="color:#64748b">Min-Freq (Hz)</label>
     <input type="number" id="piFreqMin" value="35" step="1" min="10" max="50" oninput="piDirty()"></div>
    <div><label class="text-xs mb-1 block" style="color:#64748b">Max-Freq (Hz)</label>
     <input type="number" id="piFreqMax" value="50" step="1" min="10" max="50" oninput="piDirty()"></div>
   </div>
  </div>
  <button id="piSaveBtn" class="btn-save" style="background:#2563eb;color:#fff" onclick="piSave()" disabled>Gespeichert</button>
 </div>

 <!-- CARD 7: Betriebsmodi -->
 <div id="card-preset" class="card">
  <div class="card-hdr flex items-center justify-between mb-4" onclick="toggleCard('preset')">
   <h2 class="text-sm font-semibold flex items-center gap-2" style="color:#94a3b8">
    <svg class="drag-handle w-4 h-4" fill="currentColor" viewBox="0 0 24 24" onmousedown="startDrag(event,'card-preset')" ontouchstart="startTouchDrag(event,'card-preset')"><path d="M3 8h18v2H3zm0 6h18v2H3z"/></svg>
    <svg class="w-4 h-4" fill="none" stroke="#2dd4bf" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
    Betriebsmodi
   </h2>
   <svg id="ccpreset" class="chev w-4 h-4" style="color:#475569" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
  </div>
  <!-- Aktiver Modus -->
  <div class="flex items-center gap-3 mb-4 p-3" style="border-radius:4px;background:rgba(45,212,191,.08);border:1px solid rgba(45,212,191,.15)">
   <span id="presetDot" class="dot" style="background:#14b8a6"></span>
   <div class="flex-1 min-w-0">
    <div class="text-xs" style="color:#64748b">Aktiver Modus</div>
    <div id="presetActiveName" class="text-sm font-bold truncate" style="color:#2dd4bf">--</div>
   </div>
   <div class="text-right flex-shrink-0">
    <div id="presetModeLabel" class="text-xs" style="color:#64748b">--</div>
    <div id="presetSetpointVal" class="text-sm font-mono font-bold">--</div>
   </div>
  </div>
  <!-- Preset Grid -->
  <div id="presetButtons" class="grid grid-cols-2 gap-2 mb-4"></div>
  <!-- Editor Toggle -->
  <div class="mb-3">
   <button onclick="togglePresetEditor()" class="flex items-center gap-2 text-xs transition" style="color:#64748b;background:none;border:none;cursor:pointer" onmouseover="this.style.color='#94a3b8'" onmouseout="this.style.color='#64748b'">
    <svg id="presetEditorChev" class="w-4 h-4 chev collapsed" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
    Presets bearbeiten
   </button>
  </div>
  <div id="presetEditorPanel" class="hidden space-y-3">
   <div id="presetEditList" class="space-y-2"></div>
   <div class="p-3" style="border-radius:4px;background:var(--surface)">
    <div id="npFormTitle" class="text-xs font-bold mb-2 uppercase tracking-wide" style="color:#2dd4bf">Neuer Preset</div>
    <div class="grid grid-cols-2 gap-2 mb-2">
     <div><label class="text-xs mb-1 block" style="color:#64748b">Name</label>
      <input type="text" id="npName" maxlength="31" placeholder="z.B. Garten vorn"></div>
     <div><label class="text-xs mb-1 block" style="color:#64748b">Modus</label>
      <select id="npMode" onchange="npModeChange()">
       <option value="0">Druck (bar)</option>
       <option value="1" selected>Durchfluss (L/min)</option>
      </select></div>
    </div>
    <div class="grid grid-cols-2 gap-2 mb-2">
     <div><label class="text-xs mb-1 block" style="color:#64748b">Sollwert (<span id="npUnit">L/min</span>)</label>
      <input type="number" id="npSP" value="30" step="0.5" min="0.1" max="85"></div>
     <div><label class="text-xs mb-1 block" style="color:#64748b">Kp</label>
      <input type="number" id="npKp" value="0.3" step="0.01" min="0.01" max="20"></div>
    </div>
    <div class="grid grid-cols-3 gap-2 mb-3">
     <div><label class="text-xs mb-1 block" style="color:#64748b">Ki</label>
      <input type="number" id="npKi" value="0.05" step="0.01" min="0" max="5"></div>
     <div><label class="text-xs mb-1 block" style="color:#64748b">f-min Hz</label>
      <input type="number" id="npFmin" value="35" step="1" min="10" max="50"></div>
     <div><label class="text-xs mb-1 block" style="color:#64748b">f-max Hz</label>
      <input type="number" id="npFmax" value="50" step="1" min="10" max="50"></div>
    </div>
    <button id="npSaveBtn" onclick="saveNewPreset()" class="btn-save" style="background:#0d9488;color:#fff">Preset hinzufügen</button>
   </div>
  </div>
 </div>

 <!-- CARD 8: Log (full-width) -->
 <div class="md:col-span-2 overflow-hidden" style="background:var(--card-bg);border:1px solid var(--card-border);border-radius:4px;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)">
  <button onclick="toggleLog()" class="w-full flex items-center justify-between p-4 transition" style="background:none;border:none;cursor:pointer;color:inherit" onmouseover="this.style.background='var(--surface)'" onmouseout="this.style.background='none'">
   <h2 class="text-sm font-semibold flex items-center gap-2" style="color:#94a3b8">
    <svg class="w-4 h-4" fill="none" stroke="#4ade80" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
    Diagnose Log
   </h2>
   <svg id="logChevron" class="chev w-4 h-4" style="color:#475569" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
  </button>
  <div id="logPanel" class="hidden px-4 pb-4">
   <div class="flex gap-2 mb-2">
    <button onclick="clearLog()" class="text-xs rounded px-3 py-1 transition" style="background:var(--surface2);color:#94a3b8;border:none;cursor:pointer">Löschen</button>
    <label class="text-xs flex items-center gap-1" style="color:#64748b;cursor:pointer"><input type="checkbox" id="logAuto" checked style="accent-color:#22c55e"> Auto-Scroll</label>
   </div>
   <div id="logBox" class="p-3 font-mono text-xs h-64 overflow-y-auto whitespace-pre-wrap" style="background:#030712;color:#4ade80;border:1px solid #1e293b"></div>
  </div>
 </div>

</main>

<!-- ========== TOAST CONTAINER ========== -->
<div id="toast-container"></div>

<!-- ========== JAVASCRIPT ========== -->
<script>
// ── Sparkline Data ──
const sparklineData={pressure:[],frequency:[],power:[],temp:[]};

// ── Gauge Renderer ──
// R=38, C=2πR≈238.76, ARC=C×0.75≈179.07
const GAUGE_C=238.76,GAUGE_ARC=179.07;
function drawGauge(arcId,value,max,warn,danger){
 const el=document.getElementById(arcId);
 if(!el)return;
 const pct=Math.max(0,Math.min(1,value/max));
 const fill=GAUGE_ARC*pct;
 el.style.strokeDasharray=fill+' '+GAUGE_C;
 let color='#3b82f6';
 if(danger!==undefined&&value>=danger)color='#ef4444';
 else if(warn!==undefined&&value>=warn)color='#f59e0b';
 else if(pct>0.6)color='#22c55e';
 el.style.stroke=color;
}

// ── Sparkline Renderer ──
function pushSparkline(key,value,lineId,minV,maxV){
 const d=sparklineData[key];
 d.push(value);
 if(d.length>60)d.shift();
 const line=document.getElementById(lineId);
 if(!line||d.length<2)return;
 const W=120,H=64;
 const lo=minV!==undefined?minV:Math.min(...d);
 const hi=maxV!==undefined?maxV:Math.max(...d);
 const range=hi-lo||1;
 const pts=d.map((v,i)=>{
  const x=i/(d.length-1)*W;
  const y=H-(v-lo)/range*H;
  return x+','+y;
 }).join(' ');
 line.setAttribute('points',pts);
}

// ── Toast ──
function showToast(msg,type='info'){
 const c=document.getElementById('toast-container');
 const t=document.createElement('div');
 t.className='toast '+type;
 t.textContent=msg;
 c.appendChild(t);
 setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(()=>t.remove(),300);},2700);
}

// ── WebSocket ──
let ws=null;
function connectWS(){
 const proto=location.protocol==='https:'?'wss:':'ws:';
 ws=new WebSocket(proto+'//'+location.host+'/ws');
 ws.onmessage=e=>{try{const d=JSON.parse(e.data);if(d.log){appendLog(d.log,d.logSeq);}else{updateUI(d);}}catch(x){}};
 ws.onclose=()=>{setTimeout(connectWS,2000);};
 ws.onerror=()=>{ws.close();};
}

// ── Dashboard Init ──
function initDash(){
 connectWS();
 loadPresets();
 setInterval(async()=>{if(!ws||ws.readyState!==1){const r=await fetch('/api/status');if(r.ok)updateUI(await r.json());}},3000);
}

// ── UI Update ──
function updateUI(d){
 if(!d)return;
 // V20
 if(d.v20){
  const v=d.v20;
  const hz=v.frequency;
  const pw=Math.round((v.power||0)*1000);
  // Hidden compat
  document.getElementById('v20freq').textContent=hz.toFixed(2)+' Hz';
  document.getElementById('v20bar').style.width=(hz/50*100)+'%';
  // Gauge
  drawGauge('gaugeFreqArc',hz,50,35,48);
  document.getElementById('gaugeFreqVal').textContent=hz.toFixed(1);
  // KPI boxes
  document.getElementById('v20cur').textContent=v.current.toFixed(2)+' A';
  document.getElementById('v20volt').textContent=(v.voltage||0).toFixed(0)+' V';
  document.getElementById('v20power').textContent=pw+' W';
  // KPI Bar
  document.getElementById('kpiFreq').textContent=hz.toFixed(1);
  document.getElementById('kpiPower').textContent=pw;
  // Fault badge
  const fe=document.getElementById('v20fault');
  if(v.fault>0){fe.textContent='STÖRUNG';fe.classList.remove('hidden');}
  else{fe.textContent='';fe.classList.add('hidden');}
  // Status
  const dot=document.getElementById('v20dot'),st=document.getElementById('v20status');
  const kd=document.getElementById('kpiDot');
  if(!v.connected){dot.className='dot dot-gray';st.textContent='OFFLINE';kd.className='dot dot-gray';}
  else if(v.fault>0){dot.className='dot dot-red';st.textContent='STÖRUNG';kd.className='dot dot-red';}
  else if(v.running){dot.className='dot dot-green dot-pulse';st.textContent='LÄUFT';kd.className='dot dot-green dot-pulse';}
  else{dot.className='dot dot-yellow';st.textContent='BEREIT';kd.className='dot dot-yellow';}
  document.getElementById('freqSlider').value=v.freq_setpoint;
  document.getElementById('freqVal').textContent=v.freq_setpoint.toFixed(1)+' Hz';
  // Sparklines
  pushSparkline('frequency',hz,'sparkFreqLine',0,50);
  pushSparkline('power',pw,'',0,5000);
 }
 // Temp
 if(d.temp!==undefined){
  const t=d.temp;
  document.getElementById('tempVal').textContent=t>-100?t.toFixed(1):'--.-';
  // Hidden compat
  const pct=Math.max(0,Math.min(100,(t+10)/90*100));
  document.getElementById('tempBar').style.width=pct+'%';
  // Gauge (0-80°C range, warn at 35, danger at 50)
  drawGauge('gaugeTempArc',Math.max(0,t),80,35,50);
  // Sparkline
  if(t>-100)pushSparkline('temp',t,'sparkTempLine',-10,80);
 }
 // Fan
 if(d.fan){
  const f=d.fan;
  document.getElementById('fanRPM').textContent=f.rpm;
  document.getElementById('fanPWM').textContent=f.pwm;
  document.getElementById('fanPWMSlider').value=f.pwm;
  document.getElementById('fanPWMVal').textContent=f.pwm;
  const svg=document.getElementById('fanSvg');
  if(f.rpm>0){svg.style.animationDuration=(60/Math.max(f.rpm,1))+'s';svg.classList.add('fan-spin');}
  else{svg.classList.remove('fan-spin');}
  // Segmented control
  const modes=['Auto','LOGO','MQTT','Web'];
  const mIdx=modes.indexOf(f.mode);
  for(let i=0;i<4;i++){
   const b=document.getElementById('fm'+i);
   if(b){b.classList.toggle('active',i===mIdx);}
  }
 }
 // Zeitsperre
 if(d.timeguard)updateTimeguard(d.timeguard);
 // PI
 if(d.pi)updatePI(d.pi);
 // Presets
 if(d.active_preset!==undefined)updatePresetStatus(d);
 // System
 if(d.sys){
  const s=d.sys;
  document.getElementById('sysIP').textContent=s.ip;
  document.getElementById('hdrIP').textContent=s.ip;
  document.getElementById('sysFW').textContent=s.fw;
  let u=s.uptime,str='';
  if(u>=86400){str+=Math.floor(u/86400)+'d ';u%=86400;}
  if(u>=3600){str+=Math.floor(u/3600)+'h ';u%=3600;}
  if(u>=60){str+=Math.floor(u/60)+'m ';u%=60;}
  str+=u+'s';
  document.getElementById('sysUp').textContent=str;
  const rd=document.getElementById('rtuDot'),rs=document.getElementById('rtuSt');
  if(s.rtu_connected){rd.className='dot dot-green';rs.textContent='Verbunden';}
  else{rd.className='dot dot-red';rs.textContent='Offline';}
  document.getElementById('tcpSt').textContent=s.tcp_clients+' Client'+(s.tcp_clients!==1?'s':'');
  const md=document.getElementById('mqttDot'),ms2=document.getElementById('mqttSt');
  if(s.mqtt){md.className='dot dot-green';ms2.textContent='Verbunden';}
  else{md.className='dot dot-red';ms2.textContent='Offline';}
 }
}

// ── API Calls ──
async function api(ep,method,body){
 const opts={method:method||'POST',headers:{'Content-Type':'application/json'}};
 if(body)opts.body=JSON.stringify(body);
 return fetch('/api/'+ep,opts);
}
function setFreq(hz){
 document.getElementById('freqSlider').value=hz;
 document.getElementById('freqVal').textContent=hz+' Hz';
 api('v20/freq','POST',{hz:hz});
}
function setFanMode(m){api('fan/mode','POST',{mode:m});}

// ── Card Drag & Drop (Desktop + Touch, localStorage persistent) ──
let dragEl=null;
const CARD_IDS=['card-v20','card-temp','card-fan','card-sys','card-time','card-pi','card-preset'];
function getCardOrder(){const grid=document.querySelector('main');return Array.from(grid.children).filter(el=>el.classList.contains('card')).map(el=>el.id);}
function saveCardOrder(){localStorage.setItem('cardOrder',JSON.stringify(getCardOrder()));}
function loadCardOrder(){try{return JSON.parse(localStorage.getItem('cardOrder'))||null;}catch(e){return null;}}
function applyCardOrder(){
 const order=loadCardOrder();if(!order)return;
 const grid=document.querySelector('main');
 const logCard=grid.lastElementChild;
 order.forEach(id=>{const el=document.getElementById(id);if(el)grid.insertBefore(el,logCard);});
}
function startDrag(e,id){
 e.stopPropagation();
 dragEl=document.getElementById(id);if(!dragEl)return;
 dragEl.draggable=true;
 dragEl.addEventListener('dragstart',onDragStart);
 dragEl.addEventListener('dragend',onDragEnd);
}
function onDragStart(e){e.dataTransfer.effectAllowed='move';dragEl.classList.add('dragging');}
function onDragEnd(){
 if(dragEl){dragEl.classList.remove('dragging');dragEl.draggable=false;}
 document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
 saveCardOrder();dragEl=null;
}
document.addEventListener('dragover',e=>{
 e.preventDefault();if(!dragEl)return;
 const target=e.target.closest('.card');
 if(!target||target===dragEl)return;
 document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
 target.classList.add('drag-over');
 const grid=target.parentNode;
 const rect=target.getBoundingClientRect();
 if(e.clientY<rect.top+rect.height/2)grid.insertBefore(dragEl,target);
 else grid.insertBefore(dragEl,target.nextSibling);
});
document.addEventListener('drop',e=>{e.preventDefault();});

// Touch Drag
let touchDragEl=null,touchClone=null,touchMoved=false;
function startTouchDrag(e,id){
 e.stopPropagation();e.preventDefault();
 touchDragEl=document.getElementById(id);if(!touchDragEl)return;
 touchMoved=false;
 touchDragEl.classList.add('dragging');
 touchClone=touchDragEl.cloneNode(true);
 touchClone.style.cssText='position:fixed;pointer-events:none;z-index:9999;opacity:0.7;width:'+touchDragEl.offsetWidth+'px;left:'+touchDragEl.getBoundingClientRect().left+'px;top:'+e.touches[0].clientY+'px;transform:translateY(-50%)';
 document.body.appendChild(touchClone);
 document.addEventListener('touchmove',onTouchMove,{passive:false});
 document.addEventListener('touchend',onTouchEnd);
}
function onTouchMove(e){
 if(!touchDragEl)return;e.preventDefault();touchMoved=true;
 const y=e.touches[0].clientY;
 if(touchClone)touchClone.style.top=y+'px';
 const target=document.elementFromPoint(e.touches[0].clientX,y);if(!target)return;
 const card=target.closest('.card');
 document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
 if(card&&card!==touchDragEl){
  card.classList.add('drag-over');
  const grid=card.parentNode;const rect=card.getBoundingClientRect();
  if(y<rect.top+rect.height/2)grid.insertBefore(touchDragEl,card);
  else grid.insertBefore(touchDragEl,card.nextSibling);
 }
}
function onTouchEnd(){
 if(touchDragEl){touchDragEl.classList.remove('dragging');saveCardOrder();}
 if(touchClone){touchClone.remove();touchClone=null;}
 document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
 document.removeEventListener('touchmove',onTouchMove);
 document.removeEventListener('touchend',onTouchEnd);
 if(!touchMoved&&touchDragEl){const k=touchDragEl.id.replace('card-','');toggleCard(k);}
 touchDragEl=null;touchMoved=false;
}

// ── Card Collapse (localStorage persistent) ──
function loadCardState(){try{return JSON.parse(localStorage.getItem('cardState'))||{};}catch(e){return {};}}
function saveCardState(s){localStorage.setItem('cardState',JSON.stringify(s));}
function collapseCard(k){
 const c=document.getElementById('card-'+k);if(!c)return;
 const ch=document.getElementById('cc'+k);
 c.classList.add('collapsed');
 c.style.padding='0.75rem 1rem';c.style.alignSelf='start';
 Array.from(c.children).forEach(el=>{if(!el.classList.contains('card-hdr'))el.style.display='none';});
 const hdr=c.querySelector('.card-hdr');if(hdr)hdr.style.marginBottom='0';
 if(ch)ch.classList.add('collapsed');
}
function expandCard(k){
 const c=document.getElementById('card-'+k);if(!c)return;
 const ch=document.getElementById('cc'+k);
 c.classList.remove('collapsed');
 c.style.padding='1.25rem';c.style.alignSelf='';
 Array.from(c.children).forEach(el=>{if(!el.classList.contains('card-hdr'))el.style.display='';});
 const hdr=c.querySelector('.card-hdr');if(hdr)hdr.style.marginBottom='1rem';
 if(ch)ch.classList.remove('collapsed');
}
function toggleCard(k){
 const c=document.getElementById('card-'+k);if(!c)return;
 const isCollapsed=c.classList.contains('collapsed');
 if(isCollapsed)expandCard(k);else collapseCard(k);
 const s=loadCardState();s[k]=isCollapsed;saveCardState(s);
}
function initCards(){
 applyCardOrder();
 const s=loadCardState();
 ['v20','temp','fan','sys','time','pi','preset'].forEach(k=>{if(s[k]===false)collapseCard(k);});
 if(s['log']===true){
  const p=document.getElementById('logPanel');const c=document.getElementById('logChevron');
  if(p){p.classList.remove('hidden');if(c)c.classList.add('collapsed');}
 }
}

// ── Zeitsperre UI ──
let tgDays=[true,true,true,true,true,true,true];
let tgChanged=false;
function tgDirty(){
 tgChanged=true;
 const btn=document.getElementById('tgSaveBtn');
 btn.disabled=false;btn.textContent='Speichern';
}
function tgToggleDay(i){
 tgDays[i]=!tgDays[i];
 const btn=document.getElementById('tgD'+i);
 if(btn){btn.classList.toggle('active',tgDays[i]);}
 tgDirty();
}
async function tgSave(){
 const startVal=document.getElementById('tgStart').value||'07:00';
 const endVal=document.getElementById('tgEnd').value||'22:00';
 const [sh,sm]=startVal.split(':').map(Number);
 const [eh,em]=endVal.split(':').map(Number);
 const body={enabled:document.getElementById('tgEnabled').checked,start_hour:sh,start_min:sm,end_hour:eh,end_min:em,days:tgDays};
 await api('timeguard','POST',body);
 showToast('Zeitsperre gespeichert','success');
 tgChanged=false;
 const btn=document.getElementById('tgSaveBtn');
 btn.disabled=true;btn.textContent='Gespeichert';
}
function updateTimeguard(tg){
 if(!tg)return;
 document.getElementById('tgClock').textContent=tg.time||'--';
 const dot=document.getElementById('tgDot'),st=document.getElementById('tgStatus');
 if(!tg.synced){dot.className='dot dot-yellow';st.textContent='KEIN NTP';st.style.color='#fbbf24';}
 else if(!tg.enabled){dot.className='dot dot-gray';st.textContent='DEAKTIVIERT';st.style.color='#64748b';}
 else if(tg.allowed){dot.className='dot dot-green';st.textContent='FREI';st.style.color='#22c55e';}
 else{dot.className='dot dot-red';st.textContent='GESPERRT';st.style.color='#ef4444';}
 if(!tgChanged){
  document.getElementById('tgEnabled').checked=tg.enabled;
  document.getElementById('tgStart').value=tg.start||'07:00';
  document.getElementById('tgEnd').value=tg.end||'22:00';
  if(tg.days&&tg.days.length===7){
   tgDays=tg.days.slice();
   for(let i=0;i<7;i++){const b=document.getElementById('tgD'+i);if(b)b.classList.toggle('active',tgDays[i]);}
  }
 }
}

// ── PI-Druckregelung UI ──
let piChanged=false;
async function resetDryRun(){await api('pressure/reset_dryrun','POST');showToast('Trockenlauf quittiert','info');}
function togglePiSettings(){
 const p=document.getElementById('piSettingsPanel');
 const c=document.getElementById('piSettingsChev');
 const vis=p.classList.toggle('hidden');
 c.classList.toggle('collapsed',vis);
 localStorage.setItem('piSettingsOpen',vis?'0':'1');
}
(function(){if(localStorage.getItem('piSettingsOpen')==='1'){
 document.getElementById('piSettingsPanel').classList.remove('hidden');
 document.getElementById('piSettingsChev').classList.remove('collapsed');
}})();
function piDirty(){
 piChanged=true;
 const btn=document.getElementById('piSaveBtn');
 btn.disabled=false;btn.textContent='Speichern';
}
async function piSave(){
 const body={
  enabled:document.getElementById('piEnabled').checked,
  setpoint:parseFloat(document.getElementById('piSpNum').value),
  p_on:parseFloat(document.getElementById('piPon').value),
  p_off:parseFloat(document.getElementById('piPoff').value),
  kp:parseFloat(document.getElementById('piKp').value),
  ki:parseFloat(document.getElementById('piKi').value),
  freq_min:parseFloat(document.getElementById('piFreqMin').value),
  freq_max:parseFloat(document.getElementById('piFreqMax').value)
 };
 await api('pressure','POST',body);
 showToast('PI-Parameter gespeichert','success');
 piChanged=false;
 const btn=document.getElementById('piSaveBtn');
 btn.disabled=true;btn.textContent='Gespeichert';
}
function updatePI(pi){
 if(!pi)return;
 const bar=pi.pressure||0;
 // KPI bar
 document.getElementById('kpiPressure').textContent=bar.toFixed(2);
 // Hidden compat
 const pct=Math.max(0,Math.min(100,bar/6*100));
 document.getElementById('piBar').style.width=pct+'%';
 // Gauge (0-6 bar, warn at p_on, danger when dry_run or bar<1)
 const pOn=pi.p_on||2.2;
 const pOff=pi.p_off||4.0;
 drawGauge('gaugePiArc',bar,6,pOn,pOff+0.5);
 document.getElementById('piPressureVal').textContent=bar.toFixed(2);
 // Setpoint marker on gauge
 const marker=document.getElementById('gaugePiMarker');
 if(marker&&pi.setpoint!=null){
  const sp=Math.max(0,Math.min(1,pi.setpoint/6));
  const angleDeg=-225+sp*270;
  marker.setAttribute('transform','rotate('+angleDeg+' 50 50)');
 }
 // Sparkline
 pushSparkline('pressure',bar,'sparkPiLine',0,6);
 // Durchfluss + Wassertemp
 const flow=pi.flow||0;const fe=pi.flow_est||false;
 document.getElementById('piFlowVal').textContent=flow>0?(fe?'~':'')+flow.toFixed(1)+' L/min':'0';
 const wt=pi.water_temp;
 document.getElementById('piWaterTemp').textContent=(wt!=null&&wt>-100)?wt.toFixed(1)+' °C':'--';
 // Status
 const dot=document.getElementById('piDot'),st=document.getElementById('piStatus');
 const ps=pi.pump_state||0;
 const drb=document.getElementById('piDryRunBox');
 if(pi.dry_run_locked){
  dot.className='dot dot-red';st.textContent='TROCKENLAUF-SPERRE';
  if(drb)drb.classList.remove('hidden');
 }else{
  if(drb)drb.classList.add('hidden');
  if(!pi.enabled){dot.className='dot dot-gray';st.textContent='DEAKTIVIERT';}
  else if(ps===2){dot.className='dot dot-green';st.textContent='LÄUFT';}
  else if(ps===1){dot.className='dot dot-yellow';st.textContent='STARTET...';}
  else if(bar<=0){dot.className='dot dot-red';st.textContent='KEIN DRUCK';}
  else{dot.className='dot dot-gray';st.textContent='AUS';}
 }
 if(!piChanged){
  document.getElementById('piEnabled').checked=pi.enabled;
  document.getElementById('piSpNum').value=(pi.setpoint||3.0).toFixed(1);
  document.getElementById('piPon').value=(pi.p_on||2.2).toFixed(1);
  document.getElementById('piPoff').value=(pi.p_off||4.0).toFixed(1);
  document.getElementById('piKp').value=(pi.kp||8.0).toFixed(1);
  document.getElementById('piKi').value=(pi.ki||1.0).toFixed(2);
  document.getElementById('piFreqMin').value=(pi.freq_min||35).toFixed(0);
  document.getElementById('piFreqMax').value=(pi.freq_max||50).toFixed(0);
 }
}

// ── Betriebsmodi (Presets) ──
let _presets=[],_activePreset='';
async function loadPresets(){
 try{
  const r=await fetch('/api/presets');if(!r.ok)return;
  const d=await r.json();_presets=d.presets||[];_activePreset=d.active||'';
  renderPresetButtons();renderPresetEditor();
 }catch(e){}
}
function renderPresetButtons(){
 const c=document.getElementById('presetButtons');if(!c)return;
 c.innerHTML='';
 _presets.forEach(p=>{
  const active=(p.name===_activePreset);
  const btn=document.createElement('button');
  btn.textContent=p.name;
  btn.style.cssText='padding:.5rem .75rem;border-radius:3px;font-size:.75rem;font-weight:600;cursor:pointer;transition:background .15s,color .15s;border:1px solid;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;'+(active?'background:rgba(45,212,191,.2);border-color:rgba(45,212,191,.4);color:#2dd4bf;':'background:var(--surface);border-color:var(--card-border);color:#94a3b8;');
  btn.onclick=()=>applyPreset(p.name);
  c.appendChild(btn);
 });
}
async function applyPreset(name){
 await api('preset/apply','POST',{name});
 showToast('Preset "'+name+'" aktiv','success');
 await loadPresets();
}
function updatePresetStatus(d){
 if(!d)return;
 const name=d.active_preset||'';const mode=d.ctrl_mode;
 if(name!==_activePreset){_activePreset=name;renderPresetButtons();}
 const ne=document.getElementById('presetActiveName');if(ne)ne.textContent=name||'--';
 const ml=document.getElementById('presetModeLabel');if(ml)ml.textContent=mode===1?'Durchfluss':'Druck';
 const sv=document.getElementById('presetSetpointVal');
 if(sv){
  const p=_presets.find(x=>x.name===name);
  if(p){
   if(mode===1){const fs=d.pi&&d.pi.flow_setpoint!=null?d.pi.flow_setpoint:p.setpoint;sv.textContent=fs.toFixed(0)+' L/min';}
   else{sv.textContent=p.setpoint.toFixed(1)+' bar';}
  }else{sv.textContent='--';}
 }
}
function renderPresetEditor(){
 const list=document.getElementById('presetEditList');if(!list)return;
 list.innerHTML='';
 _presets.forEach(p=>{
  const row=document.createElement('div');
  row.style.cssText='display:flex;align-items:center;justify-content:space-between;background:var(--surface);border-radius:3px;padding:.4rem .65rem;font-size:.75rem;gap:.5rem';
  const esc=p.name.replace(/'/g,"\\'");
  const editBtn=`<button onclick="editPreset('${esc}')" style="color:#2dd4bf;font-size:.65rem;padding:.2rem .5rem;border-radius:2px;border:1px solid rgba(45,212,191,.3);background:none;cursor:pointer;flex-shrink:0">Bearb.</button>`;
  const delBtn=p.name!=='Normal'?`<button onclick="deletePreset('${esc}')" style="color:#f87171;font-size:.65rem;padding:.2rem .5rem;border-radius:2px;border:1px solid rgba(239,68,68,.3);background:none;cursor:pointer;flex-shrink:0">Löschen</button>`:'';
  row.innerHTML=`<span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</span>`+`<span style="color:#64748b;font-size:.65rem;flex-shrink:0">${p.mode===1?'Durchfluss':'Druck'} · ${p.setpoint}${p.mode===1?' L/min':' bar'}</span>`+`<span style="display:flex;gap:4px;flex-shrink:0">${editBtn}${delBtn}</span>`;
  list.appendChild(row);
 });
}
function editPreset(name){
 const p=_presets.find(x=>x.name===name);if(!p)return;
 document.getElementById('npName').value=p.name;
 document.getElementById('npMode').value=p.mode;
 document.getElementById('npSP').value=p.setpoint;
 document.getElementById('npKp').value=p.kp;
 document.getElementById('npKi').value=p.ki;
 document.getElementById('npFmin').value=p.freq_min;
 document.getElementById('npFmax').value=p.freq_max;
 document.getElementById('npUnit').textContent=p.mode===1?'L/min':'bar';
 const panel=document.getElementById('presetEditorPanel');
 if(panel.classList.contains('hidden'))togglePresetEditor();
 document.getElementById('npFormTitle').textContent='Preset bearbeiten';
 document.getElementById('npSaveBtn').textContent='Änderungen speichern';
 document.getElementById('npName').focus();
}
async function deletePreset(name){
 if(!confirm(`Preset "${name}" wirklich löschen?`))return;
 await fetch('/api/presets/'+encodeURIComponent(name),{method:'DELETE'});
 showToast('Preset gelöscht','info');
 await loadPresets();
}
async function saveNewPreset(){
 const name=document.getElementById('npName').value.trim();
 if(!name){showToast('Name erforderlich','error');return;}
 const body={name,mode:parseInt(document.getElementById('npMode').value),setpoint:parseFloat(document.getElementById('npSP').value),kp:parseFloat(document.getElementById('npKp').value),ki:parseFloat(document.getElementById('npKi').value),freq_min:parseFloat(document.getElementById('npFmin').value),freq_max:parseFloat(document.getElementById('npFmax').value)};
 const r=await fetch('/api/presets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(r.ok){
  showToast('Preset gespeichert','success');
  document.getElementById('npName').value='';
  document.getElementById('npFormTitle').textContent='Neuer Preset';
  document.getElementById('npSaveBtn').textContent='Preset hinzufügen';
  await loadPresets();
 }
}
function npModeChange(){
 const m=parseInt(document.getElementById('npMode').value);
 document.getElementById('npUnit').textContent=m===1?'L/min':'bar';
 document.getElementById('npKp').value=m===1?'0.30':'8.0';
 document.getElementById('npKi').value=m===1?'0.05':'1.0';
 document.getElementById('npSP').value=m===1?'30':'3.0';
}
function togglePresetEditor(){
 const p=document.getElementById('presetEditorPanel');
 const c=document.getElementById('presetEditorChev');
 const vis=p.classList.toggle('hidden');
 c.classList.toggle('collapsed',vis);
}

// ── Log Panel ──
function toggleLog(){
 const p=document.getElementById('logPanel');const c=document.getElementById('logChevron');
 p.classList.toggle('hidden');
 const hidden=p.classList.contains('hidden');
 c.classList.toggle('collapsed',!hidden);
 const s=loadCardState();s['log']=!hidden;saveCardState(s);
}
let _logBuf=[],_logSeq=0;
function clearLog(){_logBuf=[];document.getElementById('logBox').textContent='';}
function appendLog(lines,seq){
 const box=document.getElementById('logBox');if(!box||!lines)return;
 if(seq===undefined){_logBuf=lines.slice();}
 else if(_logSeq===0){_logBuf=lines.slice();}
 else{
  const newCount=seq-_logSeq;
  if(newCount>0&&newCount<=lines.length){_logBuf.push(...lines.slice(-newCount));}
  else if(newCount<0||newCount>lines.length){_logBuf=lines.slice();}
 }
 _logSeq=seq||0;
 if(_logBuf.length>500)_logBuf=_logBuf.slice(-500);
 box.textContent=_logBuf.join('\n');
 if(document.getElementById('logAuto').checked)box.scrollTop=box.scrollHeight;
}

// ── Theme Toggle ──
function toggleTheme(){
 const html=document.documentElement;
 const light=html.getAttribute('data-theme')==='light';
 const next=light?'dark':'light';
 html.setAttribute('data-theme',next);
 localStorage.setItem('theme',next);
 updateThemeIcons(next);
 document.querySelector('meta[name="theme-color"]').content=next==='light'?'#f1f5f9':'#0a0f1a';
}
function updateThemeIcons(theme){
 const light=theme==='light';
 document.getElementById('themeIconMoon').classList.toggle('hidden',light);
 document.getElementById('themeIconSun').classList.toggle('hidden',!light);
}

// ── Init ──
document.addEventListener('DOMContentLoaded',()=>{
 initCards();
 initDash();
 gsap.from('.card',{y:30,opacity:0,stagger:0.08,duration:0.5,ease:'power2.out'});
 updateThemeIcons(localStorage.getItem('theme')||'dark');
 if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{});}
});
</script>
</body>
</html>

)rawliteral";
