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
<meta name="theme-color" content="#111827">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Pumpe">
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon.svg">
<title>Modbus Gateway</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<style>
@keyframes fan-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
.fan-spin{animation:fan-spin linear infinite}
.dot{width:10px;height:10px;border-radius:50%;display:inline-block}
.dot-green{background:#22c55e}.dot-red{background:#ef4444}
.dot-yellow{background:#eab308}.dot-gray{background:#6b7280}
input[type=range]{accent-color:#3b82f6}
body{font-family:system-ui,-apple-system,sans-serif}
.card-hdr{cursor:pointer;user-select:none}
.card.dragging{opacity:0.4;border:2px dashed #3b82f6!important}
.card.drag-over{border-top:3px solid #3b82f6!important}
.drag-handle{cursor:grab;touch-action:none;opacity:0.3;transition:opacity 0.2s}
.drag-handle:hover,.drag-handle:active{opacity:1}
</style>
<script>tailwind.config={darkMode:'class',theme:{extend:{}}}</script>
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen">

<!-- ========== DASHBOARD ========== -->
<div id="dash">
 <!-- Header -->
 <header class="flex items-center justify-between px-6 py-4 bg-gray-900/80 border-b border-gray-800">
  <div>
   <h1 class="text-xl font-bold">Modbus Gateway</h1>
   <span id="hdrIP" class="text-xs text-gray-500"></span>
  </div>
 </header>

 <!-- Grid -->
 <main class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 max-w-6xl mx-auto">

  <!-- CARD 1: V20 Frequenzumrichter -->
  <div id="card-v20" class="card bg-gray-800/50 backdrop-blur rounded-2xl border border-gray-700/50 p-6 shadow-lg">
   <div class="card-hdr flex items-center justify-between mb-4" onclick="toggleCard('v20')">
    <h2 class="text-lg font-semibold flex items-center gap-2">
     <svg class="drag-handle w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24" onmousedown="startDrag(event,'card-v20')" ontouchstart="startTouchDrag(event,'card-v20')"><path d="M3 8h18v2H3zm0 6h18v2H3z"/></svg>
     <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
     Frequenzumrichter V20
    </h2>
    <svg id="ccv20" class="w-5 h-5 text-gray-400 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
   </div>
   <!-- Status -->
   <div class="flex items-center gap-2 mb-4">
    <span id="v20dot" class="dot dot-gray"></span>
    <span id="v20status" class="text-sm font-medium">OFFLINE</span>
    <span id="v20fault" class="hidden ml-auto text-xs font-bold text-red-400 bg-red-500/20 px-2 py-0.5 rounded">STÖRUNG</span>
   </div>
   <!-- Frequency Bar -->
   <div class="mb-4">
    <div class="flex justify-between text-sm text-gray-400 mb-1">
     <span>Frequency</span><span id="v20freq">0.00 Hz</span>
    </div>
    <div class="w-full bg-gray-700 rounded-full h-3">
     <div id="v20bar" class="bg-blue-500 h-3 rounded-full transition-all" style="width:0%"></div>
    </div>
   </div>
   <!-- Values -->
   <div class="grid grid-cols-3 gap-3 text-center mb-4">
    <div class="bg-gray-700/50 rounded-xl p-3">
     <div class="text-xs text-gray-400">Leistung</div>
     <div id="v20power" class="text-lg font-bold">0 W</div>
    </div>
    <div class="bg-gray-700/50 rounded-xl p-3">
     <div class="text-xs text-gray-400">Strom</div>
     <div id="v20cur" class="text-lg font-bold">0.00 A</div>
    </div>
    <div class="bg-gray-700/50 rounded-xl p-3">
     <div class="text-xs text-gray-400">Spannung</div>
     <div id="v20volt" class="text-lg font-bold">0 V</div>
    </div>
   </div>
   <!-- Controls -->
   <div class="flex gap-2 mb-4">
    <button onclick="api('v20/start','POST')" class="flex-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg py-2 font-semibold transition text-sm">Start</button>
    <button onclick="api('v20/stop','POST')" class="flex-1 bg-red-600 hover:bg-red-500 rounded-lg py-2 font-semibold transition text-sm">Stop</button>
    <button onclick="api('v20/reset','POST')" class="flex-1 bg-amber-600 hover:bg-amber-500 rounded-lg py-2 font-semibold transition text-sm">Reset</button>
   </div>
   <!-- Frequency Slider -->
   <div>
    <div class="flex justify-between text-sm text-gray-400 mb-1">
     <span>Frequency Soll</span><span id="freqVal">0.0 Hz</span>
    </div>
    <input id="freqSlider" type="range" min="35" max="50" step="0.5" value="35"
           class="w-full" oninput="freqVal.textContent=this.value+' Hz'"
           onchange="api('v20/freq','POST',{hz:parseFloat(this.value)})">
    <div class="flex gap-2 mt-2">
     <button onclick="setFreq(35)" class="flex-1 bg-gray-700 hover:bg-gray-600 rounded py-1 text-xs transition">Langsam 35</button>
     <button onclick="setFreq(42)" class="flex-1 bg-gray-700 hover:bg-gray-600 rounded py-1 text-xs transition">Mittel 42</button>
     <button onclick="setFreq(50)" class="flex-1 bg-gray-700 hover:bg-gray-600 rounded py-1 text-xs transition">Schnell 50</button>
    </div>
   </div>
  </div>

  <!-- CARD 2: Temperatur -->
  <div id="card-temp" class="card bg-gray-800/50 backdrop-blur rounded-2xl border border-gray-700/50 p-6 shadow-lg">
   <div class="card-hdr flex items-center justify-between mb-4" onclick="toggleCard('temp')">
    <h2 class="text-lg font-semibold flex items-center gap-2">
     <svg class="drag-handle w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24" onmousedown="startDrag(event,'card-temp')" ontouchstart="startTouchDrag(event,'card-temp')"><path d="M3 8h18v2H3zm0 6h18v2H3z"/></svg>
     <svg class="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
     Temperatur
    </h2>
    <svg id="cctemp" class="w-5 h-5 text-gray-400 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
   </div>
   <div class="flex items-center justify-center py-8">
    <div class="text-center">
     <div id="tempVal" class="text-6xl font-bold tracking-tight">--.-</div>
     <div class="text-xl text-gray-400 mt-1">&deg;C</div>
    </div>
   </div>
   <div class="w-full bg-gray-700 rounded-full h-2 mt-4">
    <div id="tempBar" class="h-2 rounded-full transition-all bg-green-500" style="width:25%"></div>
   </div>
   <div class="flex justify-between text-xs text-gray-500 mt-1">
    <span>-10</span><span>0</span><span>25</span><span>50</span><span>80</span>
   </div>
  </div>

  <!-- CARD 3: Lüfter -->
  <div id="card-fan" class="card bg-gray-800/50 backdrop-blur rounded-2xl border border-gray-700/50 p-6 shadow-lg">
   <div class="card-hdr flex items-center justify-between mb-4" onclick="toggleCard('fan')">
    <h2 class="text-lg font-semibold flex items-center gap-2">
     <svg class="drag-handle w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24" onmousedown="startDrag(event,'card-fan')" ontouchstart="startTouchDrag(event,'card-fan')"><path d="M3 8h18v2H3zm0 6h18v2H3z"/></svg>
     <svg class="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
     Lüfter
    </h2>
    <svg id="ccfan" class="w-5 h-5 text-gray-400 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
   </div>
   <div class="flex items-center gap-6 mb-4">
    <!-- Fan SVG -->
    <svg id="fanSvg" viewBox="0 0 100 100" class="w-20 h-20 text-cyan-400">
     <g fill="currentColor" transform="translate(50,50)">
      <ellipse rx="11" ry="32" transform="rotate(0)" opacity="0.85"/>
      <ellipse rx="11" ry="32" transform="rotate(120)" opacity="0.85"/>
      <ellipse rx="11" ry="32" transform="rotate(240)" opacity="0.85"/>
      <circle r="7" opacity="1"/>
     </g>
    </svg>
    <div>
     <div class="text-3xl font-bold"><span id="fanRPM">0</span></div>
     <div class="text-sm text-gray-400">RPM</div>
     <div class="text-sm text-gray-500 mt-1">PWM: <span id="fanPWM">0</span>/255</div>
    </div>
   </div>
   <!-- Mode -->
   <div class="mb-4">
    <label class="text-sm text-gray-400 mb-1 block">Modus</label>
    <div class="flex gap-1">
     <button onclick="setFanMode('Auto')" id="fm0" class="flex-1 py-1.5 rounded text-xs font-semibold transition bg-cyan-600">Auto</button>
     <button onclick="setFanMode('LOGO')" id="fm1" class="flex-1 py-1.5 rounded text-xs font-semibold transition bg-gray-700">LOGO</button>
     <button onclick="setFanMode('MQTT')" id="fm2" class="flex-1 py-1.5 rounded text-xs font-semibold transition bg-gray-700">MQTT</button>
     <button onclick="setFanMode('Web')"  id="fm3" class="flex-1 py-1.5 rounded text-xs font-semibold transition bg-gray-700">Web</button>
    </div>
   </div>
   <!-- PWM Slider -->
   <div>
    <div class="flex justify-between text-sm text-gray-400 mb-1">
     <span>PWM Override</span><span id="fanPWMVal">0</span>
    </div>
    <input id="fanPWMSlider" type="range" min="0" max="255" step="1" value="0"
           class="w-full" oninput="fanPWMVal.textContent=this.value"
           onchange="api('fan/pwm','POST',{pwm:parseInt(this.value)})">
   </div>
  </div>

  <!-- CARD 4: System -->
  <div id="card-sys" class="card bg-gray-800/50 backdrop-blur rounded-2xl border border-gray-700/50 p-6 shadow-lg">
   <div class="card-hdr flex items-center justify-between mb-4" onclick="toggleCard('sys')">
    <h2 class="text-lg font-semibold flex items-center gap-2">
     <svg class="drag-handle w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24" onmousedown="startDrag(event,'card-sys')" ontouchstart="startTouchDrag(event,'card-sys')"><path d="M3 8h18v2H3zm0 6h18v2H3z"/></svg>
     <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
     System
    </h2>
    <svg id="ccsys" class="w-5 h-5 text-gray-400 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
   </div>
   <div class="space-y-3 text-sm">
    <div class="flex justify-between"><span class="text-gray-400">Modbus RTU (V20)</span>
     <span class="flex items-center gap-1"><span id="rtuDot" class="dot dot-gray"></span><span id="rtuSt">Offline</span></span></div>
    <div class="flex justify-between"><span class="text-gray-400">Modbus TCP (LOGO)</span>
     <span id="tcpSt" class="text-gray-300">0 Clients</span></div>
    <div class="flex justify-between"><span class="text-gray-400">MQTT Broker</span>
     <span class="flex items-center gap-1"><span id="mqttDot" class="dot dot-gray"></span><span id="mqttSt">Offline</span></span></div>
    <hr class="border-gray-700">
    <div class="flex justify-between"><span class="text-gray-400">IP-Adresse</span>
     <span id="sysIP" class="text-gray-300 font-mono">0.0.0.0</span></div>
    <div class="flex justify-between"><span class="text-gray-400">Uptime</span>
     <span id="sysUp" class="text-gray-300">0s</span></div>
    <div class="flex justify-between"><span class="text-gray-400">Firmware</span>
     <span id="sysFW" class="text-gray-300 font-mono">-</span></div>
   </div>
  </div>

  <!-- CARD 5: Zeitsperre -->
  <div id="card-time" class="card bg-gray-800/50 backdrop-blur rounded-2xl border border-gray-700/50 p-6 shadow-lg">
   <div class="card-hdr flex items-center justify-between mb-4" onclick="toggleCard('time')">
    <h2 class="text-lg font-semibold flex items-center gap-2">
     <svg class="drag-handle w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24" onmousedown="startDrag(event,'card-time')" ontouchstart="startTouchDrag(event,'card-time')"><path d="M3 8h18v2H3zm0 6h18v2H3z"/></svg>
     <svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
     Zeitsperre
    </h2>
    <svg id="cctime" class="w-5 h-5 text-gray-400 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
   </div>
   <!-- Status -->
   <div class="flex items-center justify-between mb-4">
    <div class="flex items-center gap-2">
     <span id="tgDot" class="dot dot-gray"></span>
     <span id="tgStatus" class="text-sm font-medium">--</span>
    </div>
    <span id="tgClock" class="text-sm text-gray-400 font-mono">kein NTP</span>
   </div>
   <!-- Enabled Toggle -->
   <div class="flex items-center justify-between mb-4 p-3 bg-gray-700/40 rounded-xl">
    <span class="text-sm text-gray-300">Zeitsperre aktiv</span>
    <label class="relative inline-flex items-center cursor-pointer">
     <input type="checkbox" id="tgEnabled" class="sr-only peer" onchange="tgDirty()">
     <div class="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:bg-amber-500 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition peer-checked:after:translate-x-5"></div>
    </label>
   </div>
   <!-- Time Range -->
   <div class="grid grid-cols-2 gap-3 mb-4">
    <div>
     <label class="text-xs text-gray-400 mb-1 block">Startzeit</label>
     <input type="time" id="tgStart" class="w-full bg-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500" oninput="tgDirty()">
    </div>
    <div>
     <label class="text-xs text-gray-400 mb-1 block">Endzeit</label>
     <input type="time" id="tgEnd" class="w-full bg-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500" oninput="tgDirty()">
    </div>
   </div>
   <!-- Days -->
   <div class="mb-4">
    <label class="text-xs text-gray-400 mb-2 block">Wochentage</label>
    <div class="flex gap-1" id="tgDays">
     <button onclick="tgToggleDay(0)" id="tgD0" class="flex-1 py-1.5 rounded text-xs font-semibold transition bg-amber-600">Mo</button>
     <button onclick="tgToggleDay(1)" id="tgD1" class="flex-1 py-1.5 rounded text-xs font-semibold transition bg-amber-600">Di</button>
     <button onclick="tgToggleDay(2)" id="tgD2" class="flex-1 py-1.5 rounded text-xs font-semibold transition bg-amber-600">Mi</button>
     <button onclick="tgToggleDay(3)" id="tgD3" class="flex-1 py-1.5 rounded text-xs font-semibold transition bg-amber-600">Do</button>
     <button onclick="tgToggleDay(4)" id="tgD4" class="flex-1 py-1.5 rounded text-xs font-semibold transition bg-amber-600">Fr</button>
     <button onclick="tgToggleDay(5)" id="tgD5" class="flex-1 py-1.5 rounded text-xs font-semibold transition bg-amber-600">Sa</button>
     <button onclick="tgToggleDay(6)" id="tgD6" class="flex-1 py-1.5 rounded text-xs font-semibold transition bg-amber-600">So</button>
    </div>
   </div>
   <!-- Save Button -->
   <button id="tgSaveBtn" onclick="tgSave()" class="w-full bg-amber-600 hover:bg-amber-500 rounded-lg py-2 font-semibold transition text-sm opacity-50 cursor-not-allowed" disabled>Gespeichert</button>
  </div>

  <!-- CARD 6: PI-Druckregelung -->
  <div id="card-pi" class="card bg-gray-800/50 backdrop-blur rounded-2xl border border-gray-700/50 p-6 shadow-lg">
   <div class="card-hdr flex items-center justify-between mb-4" onclick="toggleCard('pi')">
    <h2 class="text-lg font-semibold flex items-center gap-2">
     <svg class="drag-handle w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24" onmousedown="startDrag(event,'card-pi')" ontouchstart="startTouchDrag(event,'card-pi')"><path d="M3 8h18v2H3zm0 6h18v2H3z"/></svg>
     <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
     Druckregelung (PI)
    </h2>
    <svg id="ccpi" class="w-5 h-5 text-gray-400 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
   </div>
   <!-- Status + Druck -->
   <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2">
     <span id="piDot" class="dot dot-gray"></span>
     <span id="piStatus" class="text-sm font-medium">--</span>
    </div>
    <span id="piPressureVal" class="text-2xl font-bold text-blue-300">-.-- bar</span>
   </div>
   <!-- Druck-Balken -->
   <div class="w-full bg-gray-700 rounded-full h-2 mb-2">
    <div id="piBar" class="h-2 rounded-full transition-all bg-blue-500" style="width:0%"></div>
   </div>
   <!-- Trockenlauf-Sperre Warnung -->
   <div id="piDryRunBox" class="hidden mb-3 p-3 bg-red-900/50 border border-red-500/50 rounded-xl flex items-center justify-between">
    <span class="text-sm text-red-300 font-medium">Trockenlauf-Sperre aktiv (Auto-Reset 5 Min)</span>
    <button onclick="resetDryRun()" class="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg transition">Quittieren</button>
   </div>
   <!-- Durchfluss + Wassertemp -->
   <div class="grid grid-cols-2 gap-3 mb-4 text-sm">
    <div class="bg-gray-700/40 rounded-lg p-2 text-center">
     <span class="text-xs text-gray-400 block">Durchfluss</span>
     <span id="piFlowVal" class="font-mono text-cyan-300">-- L/min</span>
    </div>
    <div class="bg-gray-700/40 rounded-lg p-2 text-center">
     <span class="text-xs text-gray-400 block">Wassertemp.</span>
     <span id="piWaterTemp" class="font-mono text-cyan-300">-- °C</span>
    </div>
   </div>
   <!-- PI Enabled Toggle -->
   <div class="flex items-center justify-between mb-4 p-3 bg-gray-700/40 rounded-xl">
    <span class="text-sm text-gray-300">PI-Regelung aktiv</span>
    <label class="relative inline-flex items-center cursor-pointer">
     <input type="checkbox" id="piEnabled" class="sr-only peer" onchange="piDirty()">
     <div class="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition peer-checked:after:translate-x-5"></div>
    </label>
   </div>
   <!-- PI Einstellungen Toggle -->
   <div class="mb-3">
    <button onclick="togglePiSettings()" class="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition">
     <svg id="piSettingsChev" class="w-4 h-4 transition-transform -rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
     PI-Parameter anzeigen
    </button>
   </div>
   <div id="piSettingsPanel" class="hidden">
   <!-- Druckschwellen -->
   <div class="grid grid-cols-3 gap-3 mb-3">
    <div>
     <label class="text-xs text-gray-400 mb-1 block">EIN (bar)</label>
     <input type="number" id="piPon" value="2.2" step="0.1" min="0.1" max="6" class="w-full bg-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500" oninput="piDirty()">
    </div>
    <div>
     <label class="text-xs text-gray-400 mb-1 block">Sollwert (bar)</label>
     <input type="number" id="piSpNum" value="3.0" step="0.1" min="0.5" max="6" class="w-full bg-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" oninput="piDirty()">
    </div>
    <div>
     <label class="text-xs text-gray-400 mb-1 block">AUS (bar)</label>
     <input type="number" id="piPoff" value="4.0" step="0.1" min="1" max="8" class="w-full bg-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500" oninput="piDirty()">
    </div>
   </div>
   <!-- Kp / Ki -->
   <div class="grid grid-cols-2 gap-3 mb-3">
    <div>
     <label class="text-xs text-gray-400 mb-1 block">Kp (Hz/bar)</label>
     <input type="number" id="piKp" value="3.0" step="0.1" min="0.1" max="20" class="w-full bg-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" oninput="piDirty()">
    </div>
    <div>
     <label class="text-xs text-gray-400 mb-1 block">Ki (Hz/bar·s)</label>
     <input type="number" id="piKi" value="0.3" step="0.01" min="0" max="5" class="w-full bg-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" oninput="piDirty()">
    </div>
   </div>
   <!-- Min / Max Frequenz -->
   <div class="grid grid-cols-2 gap-3 mb-4">
    <div>
     <label class="text-xs text-gray-400 mb-1 block">Min-Freq (Hz)</label>
     <input type="number" id="piFreqMin" value="35" step="1" min="10" max="50" class="w-full bg-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" oninput="piDirty()">
    </div>
    <div>
     <label class="text-xs text-gray-400 mb-1 block">Max-Freq (Hz)</label>
     <input type="number" id="piFreqMax" value="50" step="1" min="10" max="50" class="w-full bg-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" oninput="piDirty()">
    </div>
   </div>
   </div><!-- /piSettingsPanel -->
   <!-- Save Button -->
   <button id="piSaveBtn" onclick="piSave()" class="w-full bg-blue-600 hover:bg-blue-500 rounded-lg py-2 font-semibold transition text-sm opacity-50 cursor-not-allowed" disabled>Gespeichert</button>
  </div>

  <!-- CARD 7: Betriebsmodi -->
  <div id="card-preset" class="card bg-gray-800/50 backdrop-blur rounded-2xl border border-gray-700/50 p-6 shadow-lg">
   <div class="card-hdr flex items-center justify-between mb-4" onclick="toggleCard('preset')">
    <h2 class="text-lg font-semibold flex items-center gap-2">
     <svg class="drag-handle w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24" onmousedown="startDrag(event,'card-preset')" ontouchstart="startTouchDrag(event,'card-preset')"><path d="M3 8h18v2H3zm0 6h18v2H3z"/></svg>
     <svg class="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
     Betriebsmodi
    </h2>
    <svg id="ccpreset" class="w-5 h-5 text-gray-400 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
   </div>
   <!-- Aktiver Modus -->
   <div class="flex items-center gap-3 mb-4 p-3 bg-teal-900/30 border border-teal-700/40 rounded-xl">
    <span id="presetDot" class="dot" style="background:#14b8a6"></span>
    <div class="flex-1 min-w-0">
     <div class="text-xs text-gray-400">Aktiver Modus</div>
     <div id="presetActiveName" class="text-sm font-semibold text-teal-300 truncate">--</div>
    </div>
    <div class="text-right ml-2 shrink-0">
     <div class="text-xs text-gray-400" id="presetModeLabel">--</div>
     <div class="text-sm font-mono text-gray-200" id="presetSetpointVal">--</div>
    </div>
   </div>
   <!-- Preset Buttons -->
   <div id="presetButtons" class="flex flex-wrap gap-2 mb-4"></div>
   <!-- Editor toggle -->
   <div class="mb-3">
    <button onclick="togglePresetEditor()" class="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition">
     <svg id="presetEditorChev" class="w-4 h-4 transition-transform -rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
     Presets bearbeiten
    </button>
   </div>
   <!-- Editor Panel -->
   <div id="presetEditorPanel" class="hidden space-y-3">
    <div id="presetEditList" class="space-y-2"></div>
    <!-- Neuer Preset -->
    <div class="p-3 bg-gray-700/40 rounded-xl">
     <div id="npFormTitle" class="text-xs text-teal-400 font-semibold mb-2 uppercase tracking-wide">Neuer Preset</div>
     <div class="grid grid-cols-2 gap-2 mb-2">
      <div>
       <label class="text-xs text-gray-400 mb-1 block">Name</label>
       <input type="text" id="npName" maxlength="31" placeholder="z.B. Garten vorn" class="w-full bg-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500">
      </div>
      <div>
       <label class="text-xs text-gray-400 mb-1 block">Modus</label>
       <select id="npMode" class="w-full bg-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500" onchange="npModeChange()">
        <option value="0">Druck (bar)</option>
        <option value="1" selected>Durchfluss (L/min)</option>
       </select>
      </div>
     </div>
     <div class="grid grid-cols-2 gap-2 mb-2">
      <div>
       <label class="text-xs text-gray-400 mb-1 block">Sollwert (<span id="npUnit">L/min</span>)</label>
       <input type="number" id="npSP" value="30" step="0.5" min="0.1" max="85" class="w-full bg-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500">
      </div>
      <div>
       <label class="text-xs text-gray-400 mb-1 block">Kp</label>
       <input type="number" id="npKp" value="0.3" step="0.01" min="0.01" max="20" class="w-full bg-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500">
      </div>
     </div>
     <div class="grid grid-cols-3 gap-2 mb-3">
      <div>
       <label class="text-xs text-gray-400 mb-1 block">Ki</label>
       <input type="number" id="npKi" value="0.05" step="0.01" min="0" max="5" class="w-full bg-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500">
      </div>
      <div>
       <label class="text-xs text-gray-400 mb-1 block">f-min Hz</label>
       <input type="number" id="npFmin" value="35" step="1" min="10" max="50" class="w-full bg-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500">
      </div>
      <div>
       <label class="text-xs text-gray-400 mb-1 block">f-max Hz</label>
       <input type="number" id="npFmax" value="50" step="1" min="10" max="50" class="w-full bg-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500">
      </div>
     </div>
     <button id="npSaveBtn" onclick="saveNewPreset()" class="w-full bg-teal-600 hover:bg-teal-500 rounded-lg py-2 font-semibold transition text-sm">Preset hinzufügen</button>
    </div>
   </div>
  </div>

  <!-- CARD 8: Log -->
  <div class="md:col-span-2 bg-gray-800/50 backdrop-blur rounded-2xl border border-gray-700/50 shadow-lg">
   <button onclick="toggleLog()" class="w-full flex items-center justify-between p-4 hover:bg-gray-700/30 transition rounded-2xl">
    <h2 class="text-lg font-semibold flex items-center gap-2">
     <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
     Diagnose Log
    </h2>
    <svg id="logChevron" class="w-5 h-5 text-gray-400 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
   </button>
   <div id="logPanel" class="hidden px-4 pb-4">
    <div class="flex gap-2 mb-2">
     <button onclick="clearLog()" class="text-xs bg-gray-700 hover:bg-gray-600 rounded px-3 py-1 transition">Löschen</button>
     <label class="text-xs text-gray-400 flex items-center gap-1"><input type="checkbox" id="logAuto" checked class="accent-green-500"> Auto-Scroll</label>
    </div>
    <div id="logBox" class="bg-gray-950 rounded-lg p-3 font-mono text-xs text-green-400 h-64 overflow-y-auto whitespace-pre-wrap border border-gray-800"></div>
   </div>
  </div>

 </main>
</div>

<!-- ========== JAVASCRIPT ========== -->
<script>
let ws=null;

// ── Dashboard Init ──
function initDash(){
 connectWS();
 loadPresets();
 // Fallback: poll status every 3s
 setInterval(async()=>{if(!ws||ws.readyState!==1){const r=await fetch('/api/status');if(r.ok)updateUI(await r.json());}},3000);
}

// ── WebSocket ──
function connectWS(){
 const proto=location.protocol==='https:'?'wss:':'ws:';
 ws=new WebSocket(proto+'//'+location.host+'/ws');
 ws.onmessage=e=>{try{const d=JSON.parse(e.data);if(d.log){appendLog(d.log,d.logSeq);}else{updateUI(d);}}catch(x){}};
 ws.onclose=()=>{setTimeout(connectWS,2000);};
 ws.onerror=()=>{ws.close();};
}

// ── UI Update ──
function updateUI(d){
 if(!d) return;
 // V20
 if(d.v20){
  const v=d.v20;
  document.getElementById('v20freq').textContent=v.frequency.toFixed(2)+' Hz';
  document.getElementById('v20bar').style.width=(v.frequency/50*100)+'%';
  document.getElementById('v20cur').textContent=v.current.toFixed(2)+' A';
  document.getElementById('v20volt').textContent=(v.voltage||0).toFixed(0)+' V';
  document.getElementById('v20power').textContent=Math.round((v.power||0)*1000)+' W';
  const fe=document.getElementById('v20fault');
  if(v.fault>0){fe.textContent='STÖRUNG';fe.className='ml-auto text-xs font-bold text-red-400 bg-red-500/20 px-2 py-0.5 rounded';}
  else{fe.textContent='';fe.className='hidden';}
  // Status
  const dot=document.getElementById('v20dot'),st=document.getElementById('v20status');
  if(!v.connected){dot.className='dot dot-gray';st.textContent='OFFLINE';}
  else if(v.fault>0){dot.className='dot dot-red';st.textContent='STÖRUNG';}
  else if(v.running){dot.className='dot dot-green';st.textContent='LÄUFT';}
  else{dot.className='dot dot-yellow';st.textContent='BEREIT';}
  document.getElementById('freqSlider').value=v.freq_setpoint;
  document.getElementById('freqVal').textContent=v.freq_setpoint.toFixed(1)+' Hz';
 }
 // Temp
 if(d.temp!==undefined){
  const t=d.temp;
  document.getElementById('tempVal').textContent=t>-100?t.toFixed(1):'--.-';
  const pct=Math.max(0,Math.min(100,(t+10)/90*100));
  const bar=document.getElementById('tempBar');bar.style.width=pct+'%';
  if(t<20)bar.className='h-2 rounded-full transition-all bg-blue-500';
  else if(t<30)bar.className='h-2 rounded-full transition-all bg-green-500';
  else if(t<40)bar.className='h-2 rounded-full transition-all bg-orange-500';
  else bar.className='h-2 rounded-full transition-all bg-red-500';
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
  // Mode buttons
  const modes=['Auto','LOGO','MQTT','Web'];
  const mIdx=modes.indexOf(f.mode);
  for(let i=0;i<4;i++){document.getElementById('fm'+i).className='flex-1 py-1.5 rounded text-xs font-semibold transition '+(i===mIdx?'bg-cyan-600':'bg-gray-700 hover:bg-gray-600');}
 }
 // Zeitsperre
 if(d.timeguard) updateTimeguard(d.timeguard);
 // PI-Druckregelung
 if(d.pi) updatePI(d.pi);
 // Betriebsmodi
 if(d.active_preset!==undefined) updatePresetStatus(d);
 // System
 if(d.sys){
  const s=d.sys;
  document.getElementById('sysIP').textContent=s.ip;
  document.getElementById('hdrIP').textContent=s.ip;
  document.getElementById('sysFW').textContent=s.fw;
  // Uptime format
  let u=s.uptime,str='';
  if(u>=86400){str+=Math.floor(u/86400)+'d ';u%=86400;}
  if(u>=3600){str+=Math.floor(u/3600)+'h ';u%=3600;}
  if(u>=60){str+=Math.floor(u/60)+'m ';u%=60;}
  str+=u+'s';
  document.getElementById('sysUp').textContent=str;
  // RTU
  const rd=document.getElementById('rtuDot'),rs=document.getElementById('rtuSt');
  if(s.rtu_connected){rd.className='dot dot-green';rs.textContent='Verbunden';}
  else{rd.className='dot dot-red';rs.textContent='Offline';}
  // TCP
  document.getElementById('tcpSt').textContent=s.tcp_clients+' Client'+(s.tcp_clients!==1?'s':'');
  // MQTT
  const md=document.getElementById('mqttDot'),ms2=document.getElementById('mqttSt');
  if(s.mqtt){md.className='dot dot-green';ms2.textContent='Verbunden';}
  else{md.className='dot dot-red';ms2.textContent='Offline';}
 }
}

// ── Card Drag & Drop (Desktop + Touch, localStorage persistent) ──
let dragEl=null;
let dragPlaceholder=null;
const CARD_IDS=['card-v20','card-temp','card-fan','card-sys','card-time','card-pi','card-preset'];

function getCardOrder(){
 const grid=document.querySelector('main');
 return Array.from(grid.children).filter(el=>el.classList.contains('card')).map(el=>el.id);
}
function saveCardOrder(){localStorage.setItem('cardOrder',JSON.stringify(getCardOrder()));}
function loadCardOrder(){try{return JSON.parse(localStorage.getItem('cardOrder'))||null;}catch(e){return null;}}

function applyCardOrder(){
 const order=loadCardOrder();
 if(!order)return;
 const grid=document.querySelector('main');
 const logCard=grid.lastElementChild; // Log-Karte immer am Ende
 order.forEach(id=>{
  const el=document.getElementById(id);
  if(el)grid.insertBefore(el,logCard);
 });
}

function startDrag(e,id){
 e.stopPropagation();
 dragEl=document.getElementById(id);
 if(!dragEl)return;
 dragEl.draggable=true;
 dragEl.addEventListener('dragstart',onDragStart);
 dragEl.addEventListener('dragend',onDragEnd);
}
function onDragStart(e){
 e.dataTransfer.effectAllowed='move';
 dragEl.classList.add('dragging');
 setTimeout(()=>{},0);
}
function onDragEnd(){
 if(dragEl){dragEl.classList.remove('dragging');dragEl.draggable=false;}
 document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
 saveCardOrder();
 dragEl=null;
}
document.addEventListener('dragover',e=>{
 e.preventDefault();
 if(!dragEl)return;
 const target=e.target.closest('.card');
 if(!target||target===dragEl||target.id==='card-log')return;
 document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
 target.classList.add('drag-over');
 const grid=target.parentNode;
 const rect=target.getBoundingClientRect();
 const midY=rect.top+rect.height/2;
 if(e.clientY<midY){grid.insertBefore(dragEl,target);}
 else{grid.insertBefore(dragEl,target.nextSibling);}
});
document.addEventListener('drop',e=>{e.preventDefault();});

// Touch Drag
let touchDragEl=null,touchClone=null,touchStartY=0,touchMoved=false;
function startTouchDrag(e,id){
 e.stopPropagation();
 e.preventDefault();
 touchDragEl=document.getElementById(id);
 if(!touchDragEl)return;
 touchMoved=false;
 touchStartY=e.touches[0].clientY;
 touchDragEl.classList.add('dragging');
 // Ghost
 touchClone=touchDragEl.cloneNode(true);
 touchClone.style.cssText='position:fixed;pointer-events:none;z-index:9999;opacity:0.7;width:'+touchDragEl.offsetWidth+'px;left:'+touchDragEl.getBoundingClientRect().left+'px;top:'+e.touches[0].clientY+'px;transform:translateY(-50%)';
 document.body.appendChild(touchClone);
 document.addEventListener('touchmove',onTouchMove,{passive:false});
 document.addEventListener('touchend',onTouchEnd);
}
function onTouchMove(e){
 if(!touchDragEl)return;
 e.preventDefault();
 touchMoved=true;
 const y=e.touches[0].clientY;
 if(touchClone)touchClone.style.top=y+'px';
 const target=document.elementFromPoint(e.touches[0].clientX,y);
 if(!target)return;
 const card=target.closest('.card');
 document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
 if(card&&card!==touchDragEl&&card.id!=='card-log'){
  card.classList.add('drag-over');
  const grid=card.parentNode;
  const rect=card.getBoundingClientRect();
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
 if(!touchMoved&&touchDragEl){
  const k=touchDragEl.id.replace('card-','');
  toggleCard(k);
 }
 touchDragEl=null;touchMoved=false;
}

// ── Card Collapse (localStorage persistent) ──
function loadCardState(){try{return JSON.parse(localStorage.getItem('cardState'))||{};}catch(e){return {};}}
function saveCardState(s){localStorage.setItem('cardState',JSON.stringify(s));}
function collapseCard(k){
 const c=document.getElementById('card-'+k);
 if(!c)return;
 const ch=document.getElementById('cc'+k);
 c.classList.add('collapsed');
 c.classList.remove('p-6');c.classList.add('px-4','py-3');
 c.style.alignSelf='start';
 Array.from(c.children).forEach(el=>{if(!el.classList.contains('card-hdr'))el.style.display='none';});
 const hdr=c.querySelector('.card-hdr');
 if(hdr)hdr.classList.remove('mb-4');
 if(ch)ch.style.transform='rotate(-90deg)';
}
function expandCard(k){
 const c=document.getElementById('card-'+k);
 if(!c)return;
 const ch=document.getElementById('cc'+k);
 c.classList.remove('collapsed','px-4','py-3');c.classList.add('p-6');
 c.style.alignSelf='';
 Array.from(c.children).forEach(el=>{if(!el.classList.contains('card-hdr'))el.style.display='';});
 const hdr=c.querySelector('.card-hdr');
 if(hdr)hdr.classList.add('mb-4');
 if(ch)ch.style.transform='';
}
function toggleCard(k){
 const c=document.getElementById('card-'+k);
 if(!c)return;
 const isCollapsed=c.classList.contains('collapsed');
 if(isCollapsed)expandCard(k);else collapseCard(k);
 const s=loadCardState();s[k]=isCollapsed;saveCardState(s);
}
function initCards(){
 applyCardOrder();
 const s=loadCardState();
 ['v20','temp','fan','sys','time','pi','preset'].forEach(k=>{
  if(s[k]===false)collapseCard(k);
 });
 if(s['log']===true){const p=document.getElementById('logPanel');const c=document.getElementById('logChevron');if(p){p.classList.remove('hidden');if(c)c.style.transform='rotate(180deg)';}}
}

// ── API Calls ──
async function api(ep,method,body){
 const opts={method:method||'POST',headers:{'Content-Type':'application/json'}};
 if(body)opts.body=JSON.stringify(body);
 await fetch('/api/'+ep,opts);
}
function setFreq(hz){
 document.getElementById('freqSlider').value=hz;
 document.getElementById('freqVal').textContent=hz+' Hz';
 api('v20/freq','POST',{hz:hz});
}
function setFanMode(m){api('fan/mode','POST',{mode:m});}

// ── Zeitsperre UI ──
let tgDays=[true,true,true,true,true,true,true];
let tgChanged=false;

function tgDirty(){
 tgChanged=true;
 const btn=document.getElementById('tgSaveBtn');
 btn.disabled=false;btn.classList.remove('opacity-50','cursor-not-allowed');
 btn.textContent='Speichern';
}
function tgToggleDay(i){
 tgDays[i]=!tgDays[i];
 const btn=document.getElementById('tgD'+i);
 btn.className='flex-1 py-1.5 rounded text-xs font-semibold transition '+(tgDays[i]?'bg-amber-600':'bg-gray-700 hover:bg-gray-600');
 tgDirty();
}
async function tgSave(){
 const startVal=document.getElementById('tgStart').value||'07:00';
 const endVal=document.getElementById('tgEnd').value||'22:00';
 const [sh,sm]=startVal.split(':').map(Number);
 const [eh,em]=endVal.split(':').map(Number);
 const body={
  enabled:document.getElementById('tgEnabled').checked,
  start_hour:sh,start_min:sm,
  end_hour:eh,end_min:em,
  days:tgDays
 };
 await api('timeguard','POST',body);
 tgChanged=false;
 const btn=document.getElementById('tgSaveBtn');
 btn.disabled=true;btn.classList.add('opacity-50','cursor-not-allowed');
 btn.textContent='Gespeichert';
}
function updateTimeguard(tg){
 if(!tg) return;
 // Uhrzeit
 document.getElementById('tgClock').textContent=tg.time||'--';
 // Status-Badge
 const dot=document.getElementById('tgDot'),st=document.getElementById('tgStatus');
 if(!tg.synced){dot.className='dot dot-yellow';st.textContent='KEIN NTP';}
 else if(!tg.enabled){dot.className='dot dot-gray';st.textContent='DEAKTIVIERT';}
 else if(tg.allowed){dot.className='dot dot-green';st.textContent='FREI';}
 else{dot.className='dot dot-red';st.textContent='GESPERRT';}
 // Felder nur beim ersten Mal (oder wenn nicht dirty)
 if(!tgChanged){
  document.getElementById('tgEnabled').checked=tg.enabled;
  document.getElementById('tgStart').value=tg.start||'07:00';
  document.getElementById('tgEnd').value=tg.end||'22:00';
  if(tg.days&&tg.days.length===7){
   tgDays=tg.days.slice();
   for(let i=0;i<7;i++){
    const b=document.getElementById('tgD'+i);
    if(b)b.className='flex-1 py-1.5 rounded text-xs font-semibold transition '+(tgDays[i]?'bg-amber-600':'bg-gray-700 hover:bg-gray-600');
   }
  }
 }
}

// ── PI-Druckregelung UI ──
let piChanged=false;

async function resetDryRun(){
 await api('pressure/reset_dryrun','POST');
}

function togglePiSettings(){
 const p=document.getElementById('piSettingsPanel');
 const c=document.getElementById('piSettingsChev');
 const vis=p.classList.toggle('hidden');
 c.classList.toggle('-rotate-90',vis);
 localStorage.setItem('piSettingsOpen',vis?'0':'1');
}
(function(){if(localStorage.getItem('piSettingsOpen')==='1'){
 document.getElementById('piSettingsPanel').classList.remove('hidden');
 document.getElementById('piSettingsChev').classList.remove('-rotate-90');
}})();

function piDirty(){
 piChanged=true;
 const btn=document.getElementById('piSaveBtn');
 btn.disabled=false;btn.classList.remove('opacity-50','cursor-not-allowed');
 btn.textContent='Speichern';
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
 piChanged=false;
 const btn=document.getElementById('piSaveBtn');
 btn.disabled=true;btn.classList.add('opacity-50','cursor-not-allowed');
 btn.textContent='Gespeichert';
}
function updatePI(pi){
 if(!pi) return;
 // Druck-Anzeige
 const bar=pi.pressure||0;
 document.getElementById('piPressureVal').textContent=bar.toFixed(2)+' bar';
 const pct=Math.max(0,Math.min(100,bar/6*100));
 const pb=document.getElementById('piBar');pb.style.width=pct+'%';
 if(bar<1)pb.className='h-2 rounded-full transition-all bg-red-500';
 else if(bar<(pi.p_on||2.2))pb.className='h-2 rounded-full transition-all bg-orange-500';
 else if(bar<=(pi.p_off||4.0))pb.className='h-2 rounded-full transition-all bg-blue-500';
 else pb.className='h-2 rounded-full transition-all bg-yellow-500';
 // Durchfluss + Wassertemp
 const flow=pi.flow||0;
 const fe=pi.flow_est||false;
 document.getElementById('piFlowVal').textContent=flow>0?(fe?'~':'')+flow.toFixed(1)+' L/min':'0';
 const wt=pi.water_temp;
 document.getElementById('piWaterTemp').textContent=(wt!=null&&wt>-100)?wt.toFixed(1)+' °C':'--';
 // Status-Badge mit Pumpenstatus
 const dot=document.getElementById('piDot'),st=document.getElementById('piStatus');
 const ps=pi.pump_state||0;
 const drb=document.getElementById('piDryRunBox');
 if(pi.dry_run_locked){
  dot.className='dot dot-red';st.textContent='TROCKENLAUF-SPERRE';
  if(drb)drb.classList.remove('hidden');
 } else {
  if(drb)drb.classList.add('hidden');
  if(!pi.enabled){dot.className='dot dot-gray';st.textContent='DEAKTIVIERT';}
  else if(ps===2){dot.className='dot dot-green';st.textContent='PUMPE LÄUFT';}
  else if(ps===1){dot.className='dot dot-yellow';st.textContent='STARTET...';}
  else if(bar<=0){dot.className='dot dot-red';st.textContent='KEIN DRUCK';}
  else{dot.className='dot dot-gray';st.textContent='PUMPE AUS ('+bar.toFixed(1)+'/'+((pi.p_on||2.2).toFixed(1))+' bar)';}
 }
 // Felder nur wenn nicht dirty
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
let _presets=[];
let _activePreset='';

async function loadPresets(){
 try{
  const r=await fetch('/api/presets');
  if(!r.ok)return;
  const d=await r.json();
  _presets=d.presets||[];
  _activePreset=d.active||'';
  renderPresetButtons();
  renderPresetEditor();
 }catch(e){}
}

function renderPresetButtons(){
 const c=document.getElementById('presetButtons');
 if(!c)return;
 c.innerHTML='';
 _presets.forEach(p=>{
  const active=(p.name===_activePreset);
  const btn=document.createElement('button');
  btn.textContent=p.name;
  btn.className='px-3 py-1.5 rounded-lg text-sm font-semibold transition '+(active?'bg-teal-600 text-white':'bg-gray-700 hover:bg-gray-600 text-gray-200');
  btn.onclick=()=>applyPreset(p.name);
  c.appendChild(btn);
 });
}

async function applyPreset(name){
 await api('preset/apply','POST',{name});
 await loadPresets();
}

function updatePresetStatus(d){
 if(!d)return;
 const name=d.active_preset||'';
 const mode=d.ctrl_mode; // 0=Druck, 1=Durchfluss
 if(name!==_activePreset){_activePreset=name;renderPresetButtons();}
 const ne=document.getElementById('presetActiveName');
 if(ne)ne.textContent=name||'--';
 const ml=document.getElementById('presetModeLabel');
 if(ml)ml.textContent=mode===1?'Durchfluss':'Druck';
 const sv=document.getElementById('presetSetpointVal');
 if(sv){
  const p=_presets.find(x=>x.name===name);
  if(p){
   if(mode===1){
    const fs=d.pi&&d.pi.flow_setpoint!=null?d.pi.flow_setpoint:p.setpoint;
    sv.textContent=fs.toFixed(0)+' L/min';
   }else{
    sv.textContent=p.setpoint.toFixed(1)+' bar';
   }
  }else{sv.textContent='--';}
 }
}

function renderPresetEditor(){
 const list=document.getElementById('presetEditList');
 if(!list)return;
 list.innerHTML='';
 _presets.forEach(p=>{
  const row=document.createElement('div');
  row.className='flex items-center justify-between bg-gray-700/40 rounded-lg px-3 py-2 text-sm';
  const esc=p.name.replace(/'/g,"\\'");
  const editBtn=`<button onclick="editPreset('${esc}')" class="text-teal-400 hover:text-teal-300 text-xs px-2 py-0.5 rounded border border-teal-500/40 hover:border-teal-400 transition ml-2 shrink-0">Bearbeiten</button>`;
  const delBtn=p.name!=='Normal'
   ?`<button onclick="deletePreset('${esc}')" class="text-red-400 hover:text-red-300 text-xs px-2 py-0.5 rounded border border-red-500/40 hover:border-red-400 transition ml-1 shrink-0">Löschen</button>`
   :'';
  row.innerHTML=`<span class="font-medium text-gray-200 truncate">${p.name}</span>`
   +`<span class="text-xs text-gray-400 mx-2 shrink-0">${p.mode===1?'Durchfluss':'Druck'} · ${p.setpoint}${p.mode===1?' L/min':' bar'}</span>`
   +`<span class="flex shrink-0">${editBtn}${delBtn}</span>`;
  list.appendChild(row);
 });
}

function editPreset(name){
 const p=_presets.find(x=>x.name===name);
 if(!p)return;
 document.getElementById('npName').value=p.name;
 document.getElementById('npMode').value=p.mode;
 document.getElementById('npSP').value=p.setpoint;
 document.getElementById('npKp').value=p.kp;
 document.getElementById('npKi').value=p.ki;
 document.getElementById('npFmin').value=p.freq_min;
 document.getElementById('npFmax').value=p.freq_max;
 document.getElementById('npUnit').textContent=p.mode===1?'L/min':'bar';
 // Editor öffnen falls geschlossen
 const panel=document.getElementById('presetEditorPanel');
 if(panel.classList.contains('hidden'))togglePresetEditor();
 // Formular-Titel + Button anpassen
 document.getElementById('npFormTitle').textContent='Preset bearbeiten';
 document.getElementById('npSaveBtn').textContent='Änderungen speichern';
 // Zum Formular scrollen
 document.getElementById('npName').focus();
}

async function deletePreset(name){
 if(!confirm(`Preset "${name}" wirklich löschen?`))return;
 await fetch('/api/presets/'+encodeURIComponent(name),{method:'DELETE'});
 await loadPresets();
}

async function saveNewPreset(){
 const name=document.getElementById('npName').value.trim();
 if(!name){alert('Name erforderlich');return;}
 const body={
  name,
  mode:parseInt(document.getElementById('npMode').value),
  setpoint:parseFloat(document.getElementById('npSP').value),
  kp:parseFloat(document.getElementById('npKp').value),
  ki:parseFloat(document.getElementById('npKi').value),
  freq_min:parseFloat(document.getElementById('npFmin').value),
  freq_max:parseFloat(document.getElementById('npFmax').value)
 };
 const r=await fetch('/api/presets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(r.ok){
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
 c.classList.toggle('-rotate-90',vis);
}

// ── Log Panel ──
function toggleLog(){
 const p=document.getElementById('logPanel');
 const c=document.getElementById('logChevron');
 p.classList.toggle('hidden');
 const hidden=p.classList.contains('hidden');
 c.style.transform=hidden?'':'rotate(180deg)';
 const s=loadCardState();s['log']=!hidden;saveCardState(s);
}
let _logBuf=[];
let _logSeq=0;
function clearLog(){_logBuf=[];document.getElementById('logBox').textContent='';}
function appendLog(lines,seq){
 const box=document.getElementById('logBox');
 if(!box||!lines) return;
 if(seq===undefined){_logBuf=lines.slice();} // Fallback
 else if(_logSeq===0){_logBuf=lines.slice();} // Erster Empfang
 else{
  const newCount=seq-_logSeq;
  if(newCount>0&&newCount<=lines.length){
   const nl=lines.slice(-newCount);
   _logBuf.push(...nl);
  }else if(newCount<0||newCount>lines.length){
   _logBuf=lines.slice(); // Buffer-Wrap oder Neustart
  }
 }
 _logSeq=seq||0;
 if(_logBuf.length>500) _logBuf=_logBuf.slice(-500);
 box.textContent=_logBuf.join('\n');
 if(document.getElementById('logAuto').checked){
  box.scrollTop=box.scrollHeight;
 }
}

// ── GSAP Entry Animation ──
document.addEventListener('DOMContentLoaded',()=>{
 initCards();
 initDash();
 gsap.from('.card',{y:30,opacity:0,stagger:0.1,duration:0.5});
});
</script>
</body>
</html>
)rawliteral";
