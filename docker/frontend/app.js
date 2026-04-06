lucide.createIcons();

// Update Time
setInterval(() => {
  const now = new Date();
  document.getElementById('clock').innerText = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}, 1000);

let ws;
const wsUrl = `ws://${window.location.hostname}:${window.location.port}/ws`;
const els = {
    freq: document.getElementById('vFreq'),
    pressure: document.getElementById('vPressure'),
    flow: document.getElementById('vFlow'),
    voltage: document.getElementById('dVoltage'),
    current: document.getElementById('dCurrent'),
    power: document.getElementById('dPower'),
    waterTemp: document.getElementById('dWaterTemp'),
    airTemp: document.getElementById('dAirTemp'),
    fanRpm: document.getElementById('dFan'),
    statusText: document.getElementById('statusText'),
    statusIcon: document.getElementById('vStatusIcon'),
    statusSub: document.getElementById('vStatusSubMini'),
    freqSet: document.getElementById('vFreqSet'),
    pressureSet: document.getElementById('vPressureSet'),
    flowSub: document.getElementById('vFlowSub'),
    slider: document.getElementById('freqSlider'),
    sliderVal: document.getElementById('freqSliderVal'),
    mqtt: document.getElementById('statusMqtt'),
    modbus: document.getElementById('statusModbus'),
    piPon: document.getElementById('piPon'),
    piSetpoint: document.getElementById('piSetpoint'),
    piPoff: document.getElementById('piPoff'),
    piKp: document.getElementById('piKp'),
    piKi: document.getElementById('piKi'),
    piFmin: document.getElementById('piFmin'),
    piFmax: document.getElementById('piFmax'),
    piEnabled: document.getElementById('piEnabled')
};

// UI Logger
function log(msg) {
    const ts = new Date().toISOString().split('T')[1].substring(0,8);
    const m = `[${ts}] ${msg}`;
    const box = document.getElementById('logBox');
    const full = document.getElementById('logBoxFull');
    if(box) { box.innerText = m + '\n' + box.innerText; box.scrollTop = 0; }
    if(full) { full.innerText = m + '\n' + full.innerText; }
    console.log(m);
}

// Toast
window.$toast = {
    el: document.getElementById('toast'),
    msg: document.querySelector('#toast .msg'),
    timer: null,
    show: (text, type = 'info') => {
        $toast.msg.innerText = text;
        $toast.el.className = `fixed top-[100px] left-1/2 -translate-x-1/2 z-[100] transition-all transform max-w-sm w-[90%] px-5 py-4 rounded-2xl shadow-xl flex items-center justify-between text-sm font-semibold pointer-events-none mt-4 ` + 
            (type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white');
        
        clearTimeout($toast.timer);
        $toast.el.classList.remove('-translate-y-[200%]', 'opacity-0');
        
        $toast.timer = setTimeout(() => { $toast.hide(); }, 4000);
    },
    hide: () => {
        $toast.el.classList.add('-translate-y-[200%]', 'opacity-0');
    }
};

// WebSocket
function connectWS() {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => { log("WebSocket verbunden"); };
    ws.onclose = () => { log("WS getrennt, reconnect..."); setTimeout(connectWS, 3000); setStatusDot('v20', false); setStatusDot('mqtt', false); };
    ws.onerror = (err) => { log("WS Error"); ws.close(); };
    ws.onmessage = (e) => {
        try {
            const msg = JSON.parse(e.data);
            if(msg.type === 'state') updateUI(msg.data);
            if(msg.type === 'system_update') {
                if(msg.src === 'mqtt') setStatusDot('mqtt', msg.state);
                if(msg.src === 'v20') setStatusDot('v20', msg.state);
            }
        } catch(err) {
            console.error("Parse Error", err);
        }
    };
}

function setStatusDot(type, obj) {
    if(type === 'mqtt') {
        const c = obj ? (obj.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700') : 'bg-slate-200 text-slate-500';
        els.mqtt.className = `text-xs font-bold px-3 py-1 rounded-lg ${c}`;
        els.mqtt.innerText = obj ? (obj.connected ? 'Verbunden' : 'Getrennt') : 'Warte..';
    } else if(type === 'v20') {
        const c = obj ? (obj.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700') : 'bg-slate-200 text-slate-500';
        els.modbus.className = `text-xs font-bold px-3 py-1 rounded-lg ${c}`;
        els.modbus.innerText = obj ? (obj.connected ? 'Verbunden' : 'Fehler') : 'Warte..';
    }
}

// State variables to remember
let lastPiState = {};

function updateUI(st) {
    // V20 Pump
    if(st.v20) {
        els.freq.innerText = (st.v20.actual_frequency || 0).toFixed(1);
        els.voltage.innerText = (st.v20.output_voltage || 0).toFixed(1);
        els.current.innerText = (st.v20.output_current || 0).toFixed(2);
        els.power.innerText = (st.v20.power_kW || 0).toFixed(2);
        
        let cIcon = 'text-slate-300';
        let txt = "Bereit";
        let bgStyle = "bg-gradient-to-br from-[#1A73E8] to-[#4285F4]";

        if(st.v20.fault) {
            cIcon = 'text-rose-500'; txt = `Störung ${st.v20.fault_code||''}`;
            bgStyle = "bg-gradient-to-br from-rose-500 to-rose-400";
        } else if(st.v20.running) {
            cIcon = 'text-emerald-500 text-shadow-glow'; txt = "Läuft";
            bgStyle = "bg-gradient-to-br from-emerald-500 to-emerald-400 opacity-90";
        } else if(!st.v20.connected) {
            txt = "Modbus offline"; bgStyle = "bg-gradient-to-br from-slate-400 to-slate-300";
        }

        els.statusIcon.className = `leading-none ${cIcon}`;
        els.statusText.innerText = txt;
        els.statusSub.innerText = txt;
        const pumpCard = document.getElementById('pumpStatusCard');
        if(pumpCard) {
            pumpCard.className = `xl:col-span-1 ${bgStyle} rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-lg flex flex-col justify-between min-h-[300px] transition-all duration-1000`;
        }
    }

    // Sensors
    if(st.sensors) {
        els.pressure.innerText = (st.sensors.pressure || 0).toFixed(2);
        els.flow.innerText = (st.sensors.flow || 0).toFixed(1);
        els.waterTemp.innerText = (st.sensors.water_temp || 0).toFixed(1);
        els.airTemp.innerText = (st.sensors.air_temp || 0).toFixed(1);
        pushChart(st.sensors.pressure);
    }
    
    // Pi-Controller
    if(st.pi && !document.getElementById('drawer').classList.contains('hidden') !== true) {
        lastPiState = st.pi;
        if(document.activeElement.tagName !== "INPUT") {
            els.piPon.value = st.pi.p_on;
            els.piPoff.value = st.pi.p_off;
            els.piSetpoint.value = st.pi.setpoint;
            els.piKp.value = st.pi.kp;
            els.piKi.value = st.pi.ki;
            els.piFmin.value = st.pi.freq_min || 30;
            els.piFmax.value = st.pi.freq_max || 50;
            els.piEnabled.checked = st.pi.enabled;
            
            // Prefill preset form if not active
            if(document.activeElement.id !== "presetNewSet" && document.activeElement.id !== "presetNewMode") {
                document.getElementById('presetNewSet').value = st.pi.setpoint;
                document.getElementById('presetNewKp').value = st.pi.kp;
                document.getElementById('presetNewKi').value = st.pi.ki;
                document.getElementById('presetNewFmin').value = st.pi.freq_min || 30;
                document.getElementById('presetNewFmax').value = st.pi.freq_max || 50;
            }

            els.pressureSet.innerText = st.pi.mode === 0 ? st.pi.setpoint + ' b' : 'auto';
            els.flowSub.innerText = st.pi.mode === 1 ? `Soll: ${st.pi.setpoint} l/m` : 'auto';
        }
    }
}

// Chart mapping
const ctx = document.getElementById('pressureChart').getContext('2d');
const chart = new Chart(ctx, {
    type: 'line',
    data: { labels: Array(30).fill(''), datasets: [{ label: 'Druck (bar)', data: Array(30).fill(null), borderColor: '#3b82f6', tension: 0.4, borderWidth: 3 }] },
    options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { display: false }, y: { min: 0, max: 10, grid: { color: '#f1f5f9' } } }
    }
});

function pushChart(val) {
    if(val===undefined)return;
    const data = chart.data.datasets[0].data;
    data.push(val); data.shift();
    chart.update('none');
}

// Fixed Bar Buttons
document.getElementById('btnStart').onclick = () => fetch('/api/pump', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({cmd:'start'})});
document.getElementById('btnStop').onclick = () => fetch('/api/pump', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({cmd:'stop'})});
document.getElementById('btnReset').onclick = () => fetch('/api/pump', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({cmd:'reset'})});

// Slider API mapping (Throttle 500ms)
let slTimer;
els.slider.addEventListener('input', (e) => { els.sliderVal.innerText = parseFloat(e.target.value).toFixed(1); });
els.slider.addEventListener('change', (e) => {
    clearTimeout(slTimer);
    slTimer = setTimeout(() => {
        fetch('/api/pump', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({cmd:'set_freq', freq: parseFloat(e.target.value)})})
          .then(r=>r.json()).then(o=>{
              if(o.success) $toast.show(`Frequenz auf ${e.target.value}Hz gesetzt`);
          });
    }, 500);
});

// UI Modals / Tabs
window.showTab = (tab) => {
    const drawer = document.getElementById('drawer');
    const drawerContent = document.getElementById('drawerContent');
    
    drawer.classList.remove('hidden');
    // small timeout to allow display block to apply before animating opacity/transform
    setTimeout(() => {
        drawer.classList.remove('opacity-0');
        drawerContent.classList.remove('translate-y-full');
    }, 10);
    
    ['tabSettings', 'tabPresets', 'tabLogs'].forEach(t => document.getElementById(t).classList.add('hidden'));
    
    let title = "Einstellungen";
    if(tab === 'settings') { document.getElementById('tabSettings').classList.remove('hidden'); title = "Modbus & PI"; }
    if(tab === 'presets') { document.getElementById('tabPresets').classList.remove('hidden'); title = "Presets Manager"; loadPresets(); }
    if(tab === 'logs') { document.getElementById('tabLogs').classList.remove('hidden'); title = "System Logs"; }
    
    document.getElementById('drawerTitle').innerText = title;
};

document.getElementById('closeDrawer').onclick = () => {
    const drawer = document.getElementById('drawer');
    const drawerContent = document.getElementById('drawerContent');
    drawer.classList.add('opacity-0');
    drawerContent.classList.add('translate-y-full');
    setTimeout(() => { drawer.classList.add('hidden'); }, 300);
};

// Presets Logic
async function loadPresets() {
    const res = await fetch('/presets');
    const presets = await res.json();
    const lst = document.getElementById('presetList');
    lst.innerHTML = '';
    presets.forEach(p => {
        lst.innerHTML += `
        <div class="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl">
            <div>
                <div class="font-bold text-slate-800">${p.name}</div>
                <div class="text-[10px] text-slate-500 uppercase tracking-widest font-bold">MODE: ${p.mode == 1 ? 'Flow' : 'Pressure'} | SOLL: ${p.setpoint}</div>
            </div>
            <div class="flex gap-2">
                <button onclick="applyP('${p.name}')" class="px-4 py-2 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-xl font-bold text-xs">Aktivieren</button>
                <button onclick="delP('${p.name}')" class="px-3 py-2 bg-rose-50 text-rose-500 hover:bg-rose-100 rounded-xl font-bold"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
        </div>`;
    });
    lucide.createIcons();
}

window.applyP = async (name) => {
    const res = await fetch('/preset/apply', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
    const d = await res.json();
    if(d.success) { $toast.show(`Preset ${name} geladen`); document.getElementById('closeDrawer').click(); }
    else $toast.show(d.error, 'error');
};

window.delP = async (name) => {
    if(!confirm('Löschen?')) return;
    const res = await fetch(`/presets/${name}`, {method:'DELETE'});
    if(res.ok) loadPresets();
};

document.getElementById('btnCreatePreset').onclick = async () => {
    const name = document.getElementById('presetNewName').value.trim();
    if(!name) return $toast.show('Name erforderlich', 'error');
    
    const body = {
        name,
        mode: parseInt(document.getElementById('presetNewMode').value),
        setpoint: parseFloat(document.getElementById('presetNewSet').value),
        kp: parseFloat(document.getElementById('presetNewKp').value),
        ki: parseFloat(document.getElementById('presetNewKi').value),
        freq_min: parseInt(document.getElementById('presetNewFmin').value),
        freq_max: parseInt(document.getElementById('presetNewFmax').value)
    };
    
    const res = await fetch('/presets', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
    const d = await res.json();
    if(d.success) {
        $toast.show(`Preset angelegt`);
        document.getElementById('presetNewName').value = '';
        loadPresets();
    } else {
        $toast.show(d.error || 'Fehler', 'error');
    }
};

document.getElementById('presetNewMode').onchange = (e) => {
    document.getElementById('lblPresetSet').innerText = e.target.value == "1" ? "Sollwert (L/Min)" : "Sollwert (bar)";
};

// Save PI Form
document.getElementById('savePI').onclick = async () => {
    const body = {
        p_on: parseFloat(els.piPon.value),
        p_off: parseFloat(els.piPoff.value),
        setpoint: parseFloat(els.piSetpoint.value),
        kp: parseFloat(els.piKp.value),
        ki: parseFloat(els.piKi.value),
        freq_min: parseInt(els.piFmin.value),
        freq_max: parseInt(els.piFmax.value),
        enabled: els.piEnabled.checked,
        mode: lastPiState.mode || 0 // keep current mode
    };
    
    const res = await fetch('/api/pi', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
    const d = await res.json();
    if(d.success) $toast.show('Parameter gespeichert');
};

connectWS();