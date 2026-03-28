# Projekt-Übersicht: Pumpensteuerung

> **Zweck dieses Dokuments:** Vollständige technische Referenz für das Projekt, so dass eine andere KI (oder ein neuer Entwickler) ohne Zugriff auf den Quellcode produktiv arbeiten kann.
>
> **Hinweis:** Credentials und private Konfiguration sind in `src/secrets.h` ausgelagert (nicht im Repo). Vorlage: `src/secrets.h.example`.

---

## 1. Projektbeschreibung

ESP32-basiertes **Modbus-Gateway**, das folgende Systeme verbindet:

```
Siemens LOGO 8.4 PLC
    ↕  Modbus TCP (Port 502) – LOGO ist Client, ESP32 ist Server
ESP32-DevKit-C  ←→  MQTT → Home Assistant
    ↕  Modbus RTU (RS485)
Siemens Sinamics V20 Frequenzumrichter (Pumpe)
```

**Kernfunktion:** Der ESP32 übernimmt die vollständige **Pumpensteuerung** mit interner **PI-Druckregelung** (3 bar Sollwert).
Die LOGO dient nur noch als **Sensor-Gateway**: Sie leitet die Analogwerte der 4–20 mA-Sensoren (Druck, Durchfluss, Wassertemperatur) als Modbus-Register an den ESP32 weiter.
Der ESP32 entscheidet eigenständig über Start/Stop, Frequenz und alle Schutzfunktionen.

Zusätzlich:
- DS18B20-Temperatursensor (OneWire)
- 4-Pin PWM-Lüfter (25 kHz, Tachometer)
- Web-Dashboard (HTTP/WebSocket auf Port 80)
- Wochenschaltuhr mit NTP-Synchronisation (CET/CEST)
- OTA-Firmware-Updates

---

## 2. Projektstruktur

```
c:\dev\modbus_logo\
├── src/
│   ├── main.cpp             # Setup, Loop, Watchdog, Timing
│   ├── config.h             # Pins, Konstanten, AppState-Struct
│   ├── secrets.h            # Credentials (WiFi, MQTT, OTA, Admin) ← .gitignore
│   ├── secrets.h.example    # Vorlage für secrets.h (im Repo)
│   ├── modbus_v20.h/.cpp    # Modbus RTU Master → V20
│   ├── modbus_tcp.h/.cpp    # Modbus TCP Server ← LOGO 8.4
│   ├── pressure_ctrl.h/.cpp # PI-Druckregelung (ESP32-intern)
│   ├── timeguard.h/.cpp     # NTP-Wochenschaltuhr (Betriebszeitfenster)
│   ├── mqtt_ha.h/.cpp       # MQTT-Client + Home Assistant Auto-Discovery
│   ├── sensors.h/.cpp       # DS18B20-Temperatur + PWM-Lüftersteuerung
│   ├── webserver.h/.cpp     # AsyncWebServer + WebSocket + REST API
│   └── web_index.h          # Dashboard HTML/CSS/JS (PROGMEM, inline)
├── platformio.ini            # Build-Konfiguration
├── partitions.csv            # Flash-Partitionierung
├── .gitignore                # Enthält src/secrets.h
└── PROJECT_OVERVIEW.md       # Diese Datei
```

### LittleFS-Dateien (persistent, `/`-Verzeichnis)

| Datei                  | Inhalt                                         |
|------------------------|------------------------------------------------|
| `/config.json`         | Admin-Credentials (Username + SHA-256-Hash)    |
| `/timeguard.json`      | Wochenschaltuhr-Konfiguration                  |
| `/pressure_ctrl.json`  | PI-Regler-Parameter (setpoint, Kp, Ki, f_min/max) |

---

## 3. Hardware

### ESP32-DevKit-C – GPIO-Belegung

| GPIO | Funktion       | Richtung | Peripherie      | Hinweis                         |
|------|----------------|----------|-----------------|---------------------------------|
| 16   | RS485_RX       | Input    | UART1 RXD       | MAX13487 TXD/RO → ESP32         |
| 17   | RS485_TX       | Output   | UART1 TXD       | ESP32 → MAX13487 RXD/DI         |
| 4    | DS18B20        | I/O      | OneWire         | 4,7 kΩ Pull-up auf 3,3 V        |
| 32   | FAN_PWM        | Output   | LEDC-Kanal 0    | 25 kHz, 8-bit                   |
| 36   | FAN_TACH       | Input    | GPIO-Interrupt  | Falling Edge, 2 Pulse/Umdrehung |
| 2    | STATUS_LED     | Output   | Onboard LED     | HIGH = online, LOW = offline    |

### RS485-Transceiver
- Typ: MAX13487 (Auto-Direction)
- DE-Pin: nicht belegt (-1), Richtungsumschaltung automatisch
- Verbindung: Halbduplex RS485 zum V20

---

## 4. Modbus RTU – Verbindung zum V20

### Verbindungsparameter

| Parameter       | Wert        |
|-----------------|-------------|
| Baud Rate       | 9600 bps    |
| Datenbits       | 8           |
| Parität         | None        |
| Stoppbits       | 1 (8N1)     |
| UART            | UART1 (Serial2) |
| Slave-Adresse   | 1           |
| Timeout         | 5 s ohne Antwort = `v20_connected = false` |
| Poll-Intervall  | 500 ms (ZSW + HIW), 5000 ms (Diagnose) |

### V20 Holding-Register (Parameternummern)

| Register-Adresse | Parameter | R/W  | Einheit    | Formel                              | Bedeutung                          |
|------------------|-----------|------|------------|-------------------------------------|------------------------------------|
| 99               | STW       | W    | Befehlscode| —                                   | Steuerwort (Control Word)          |
| 100              | HSW       | W    | Raw        | Hz → Raw: `Hz × 327.68`             | Hauptsollwert (Frequenz-Sollwert)  |
| 109              | ZSW       | R    | Bitmaske   | Bit 2 = läuft, Bit 3 = Störung      | Zustandswort (Status Word)         |
| 110              | HIW       | R    | Raw        | Raw → Hz: `Raw × 0.00305`           | Hauptistwert (Ist-Frequenz)        |
| 24               | r0025     | R    | V          | `V = Raw × 1.0`                     | Ausgangsspannung                   |
| 26               | r0027     | R    | 0,01 A     | `A = Raw × 0.01`                    | Motorstrom                         |
| 30               | r0031     | R    | V          | `V = Raw × 1.0`                     | DC-Bus-Spannung                    |
| 31               | r0032     | R    | 0,01 kW    | `kW = Raw × 0.01`                   | Wirkleistung                       |

### Steuerwort-Werte (STW, Register 99)

| Wert   | Bedeutung        | Hinweis                                    |
|--------|------------------|--------------------------------------------|
| 0x047F | Start            | Antrieb starten                            |
| 0x047E | Stop             | Antrieb stoppen (Rampe)                    |
| 0x04FE | Fault Reset      | Phase 1 von 2: Störung quittieren          |

**Fault-Reset-Ablauf (2-phasig):**
1. Schreibe `0x04FE` → V20 (Quittierung)
2. Warte 200 ms
3. Schreibe `0x047E` → V20 (Stop-Befehl)

**Frequenz-Skalierung:**
- Schreiben: `HSW_raw = Hz × 327.68`  (z. B. 50 Hz → 16384)
- Lesen:     `Hz = HIW_raw × 0.00305` (z. B. 16384 × 0.00305 ≈ 50.0 Hz)

---

## 5. Modbus TCP – Verbindung zur LOGO 8.4

Die LOGO fungiert als **reines Sensor-Gateway**: Sie liest die 4–20 mA-Analogausgänge der Sensoren (Druck, Durchfluss, Wassertemperatur) und schreibt die skalierten Rohwerte in die ESP32 Holding-Register.

### Verbindungsparameter

| Parameter        | Wert                     |
|------------------|--------------------------|
| Port             | 502 (Standard)           |
| Rolle des ESP32  | Server                   |
| Rolle der LOGO   | Client (schreibt Sensorwerte) |
| Registeranzahl   | 20 (Adressen 0–19)       |
| Registertyp      | Holding Registers (FC3/FC6/FC16) |

### LOGO-Adressierung

> **WICHTIG:** LOGO verwendet **1-basierte HR-Adressen**.
> HR3 → Modbus-Register 2, HR4 → Modbus-Register 3, HR5 → Modbus-Register 4.

| LOGO HR | Modbus-Register | Funktion                            |
|---------|-----------------|-------------------------------------|
| HR3     | Register 2      | Durchfluss (Raw 200–1000)            |
| HR4     | Register 3      | Druck (bar × 100)                    |
| HR5     | Register 4      | Wassertemperatur (Raw 200–1000)      |

### TCP Holding-Register – Schreibregister (LOGO → ESP32)

| Adresse | Define              | Typ      | Wertebereich | Bedeutung                                         |
|---------|---------------------|----------|--------------|---------------------------------------------------|
| 2       | TCP_REG_FLOW        | uint16_t | 0–1000       | Durchfluss: LOGO AI-Rohwert (200=0 L/min, 1000=85 L/min) |
| 3       | TCP_REG_PRESSURE    | uint16_t | 0–1000       | Druckwert bar × 100 (z.B. 300 = 3.00 bar)           |
| 4       | TCP_REG_WATER_TEMP  | uint16_t | 0–1000       | Wassertemperatur: LOGO AI-Rohwert (200=-25°C, 1000=125°C) |

> Register 0 (STW) und 1 (HSW) existieren noch im Code, werden aber bei aktiver PI-Regelung ignoriert.

### TCP Holding-Register – Leseregister (ESP32 → LOGO)

| Adresse | Define                | Typ      | Einheit  | Skalierung | Bedeutung                                  |
|---------|-----------------------|----------|----------|------------|--------------------------------------------|
| 10      | TCP_REG_ZSW           | uint16_t | Bitmaske | Raw        | V20 Zustandswort (Bit 2=läuft, Bit 3=Störung) |
| 11      | TCP_REG_HIW           | uint16_t | Hz × 100 | Raw        | Ist-Frequenz (z. B. 4250 = 42,50 Hz)       |
| 12      | TCP_REG_CURRENT       | uint16_t | A × 100  | A × 100    | Motorstrom (z. B. 325 = 3,25 A)            |
| 13      | TCP_REG_DCBUS         | uint16_t | V        | 1:1        | DC-Bus-Spannung                            |
| 14      | TCP_REG_FAULT         | uint16_t | 0/1      | 0=OK, 1=St.| Störstatus (aus ZSW Bit 3)                 |
| 15      | TCP_REG_TEMP          | uint16_t | °C × 10  | °C × 10    | Temperatur (z. B. 235 = 23,5°C), 0xFFFF = Sensorausfall |
| 16      | TCP_REG_FAN_RPM       | uint16_t | RPM      | 1:1        | Lüfterdrehzahl (0 wenn PWM < 5%)           |
| 17      | TCP_REG_FAN_PWM_READ  | uint16_t | 0–255    | 1:1        | Aktueller PWM-Wert (Rückmeldung)           |
| 18–19   | (reserviert)          | —        | —        | —          | Für künftige Erweiterungen                 |

---

## 6. PI-Druckregelung (pressure_ctrl)

Der PI-Regler läuft auf dem ESP32 und hält den Druck auf dem Sollwert (Default: 3,0 bar).
Die LOGO liefert nur die Sensorwerte (Druck, Durchfluss, Wassertemperatur) als Modbus-Register.

### Konfiguration (`PressureCtrlConfig`, gespeichert in `/pressure_ctrl.json`)

| Parameter  | Default | Wertebereich | Bedeutung                              |
|------------|---------|--------------|----------------------------------------|
| enabled    | true    | bool         | PI-Regelung aktiv/inaktiv              |
| setpoint   | 3.0     | 0.1–6.0 bar  | Druck-Sollwert                         |
| kp         | 3.0     | 0.1–20       | Proportionalverstärkung (Hz/bar)       |
| ki         | 0.3     | 0–5          | Integralverstärkung (Hz/bar·s)         |
| freq_min   | 35.0    | 10–50 Hz     | Untergrenze Ausgangsfrequenz           |
| freq_max   | 50.0    | 10–50 Hz     | Obergrenze Ausgangsfrequenz            |

### PI-Algorithmus (alle 500 ms)

```
Voraussetzung: enabled=true AND v20_running AND pressure_bar > 0

dt    = 0.5 s
error = setpoint - pressure_bar

integral += error * dt
integral  = constrain(integral, -(freq_max-freq_min)/ki, +(freq_max-freq_min)/ki)  // Anti-Windup

freq = kp * error + ki * integral + (freq_min + freq_max) / 2
freq = constrain(freq, freq_min, freq_max)

→ modbus_v20_set_frequency(freq)
```

### Watchdog-Integration

- PI aktiv → `last_stw_write` wird kontinuierlich auf `millis()` gesetzt → Watchdog feuert nicht
- Bei V20-Stop (Watchdog, Zeitsperre, manuell) → `pressure_ctrl_reset()` → Integral = 0
- Druck-Timeout: PI aktiv, aber kein Druckwert von LOGO > 5 s → V20 stoppen + `web_log`

### Pumpen-Schutzlogik

#### Kein-Bedarf-Erkennung (No-Demand Shutdown)

| Parameter         | Wert      |
|-------------------|-----------|
| Timeout           | 5 s       |
| Bedingung         | `flow < 1.0 L/min` ODER `flow_estimated == true` UND `Druck >= Sollwert` |
| Aktion            | Pumpe sauber stoppen, **kein Alarm**, kein Lock |
| Log               | `[PI] Kein Bedarf: Durchfluss=0 + Druck X bar >= SP → Pumpe STOP` |

#### Trockenlauf-Schutz (Dry-Run Protection)

| Parameter         | Wert      |
|-------------------|-----------|
| Timeout           | 30 s      |
| Bedingung         | `flow < 1.0 L/min` ODER `flow_estimated == true` UND `Druck < Sollwert` |
| Aktion            | Pumpe stoppen + Sperre (`dry_run_locked = true`) |
| Auto-Reset        | 5 Min (`DRY_RUN_AUTO_RESET_MS = 300000`)         |
| Manueller Reset   | `/api/pressure/reset_dryrun` oder Quittieren-Button |
| Log               | `[PI] TROCKENLAUF! Kein Durchfluss seit 30s → Pumpe STOP + SPERRE (5 Min)` |

> **Wichtig:** Flow-Schwelle auf 1.0 L/min angehoben, da der Autosen AS009 Vortex-Sensor unterhalb von ~5 L/min im Totbereich liegt (meldet immer 0). Geschätzte Werte (`flow_estimated`) werden für die Schutzlogik als "kein Durchfluss" behandelt.

#### Durchflussschätzung aus VFD-Frequenz

Wenn der Sensor im Totbereich ist (raw < 200 bzw. skalierter Wert < 1.0 L/min) und die Pumpe läuft, wird der Durchfluss geschätzt:

```
Q_est = (f_aktuell / 50.0) × 4.0  [L/min]
```

- `flow_estimated = true` → Schutzlogik ignoriert den Wert
- Dashboard zeigt "~" Prefix (z.B. `~2.8 L/min`)
- Sobald Sensorwert ≥ 1.0 L/min → zurück auf echten Messwert, `flow_estimated = false`

### Fail-Safe-Tabelle

| Zustand                         | Verhalten                                      |
|---------------------------------|------------------------------------------------|
| PI aktiv, kein Druck > 5 s      | V20 stoppen, Integral zurücksetzen, web_log    |
| PI aktiv, pressure_bar = 0      | PI rechnet nicht (Fehler/kein Signal)          |
| V20 stoppt (beliebiger Grund)   | Integral zurücksetzen → sauberer Neustart      |
| Zeitsperre greift               | V20 stoppen + Integral zurücksetzen            |
| Kein Bedarf (5 s)               | Sauberer Stop, kein Alarm                      |
| Trockenlauf (30 s)              | Stop + 5 Min Sperre                            |
| Zeitsperre + PUMP_OFF           | Start wird blockiert (nicht erst starten+stoppen) |

---

## 7. Wochenschaltuhr (timeguard)

Verhindert V20-Starts außerhalb definierter Betriebszeiten als **zusätzliche Sicherheitsebene**.

### NTP-Konfiguration

| Parameter     | Wert                                    |
|---------------|-----------------------------------------|
| Zeitzone      | `CET-1CEST,M3.5.0,M10.5.0/3`           |
| NTP-Server 1  | `pool.ntp.org`                          |
| NTP-Server 2  | `time.google.com`                       |
| Fail-Open     | Wenn keine NTP-Sync → Betrieb erlaubt (Warnung im Log) |

### Konfiguration (`TimeguardConfig`, gespeichert in `/timeguard.json`)

| Parameter  | Default      | Bedeutung                                   |
|------------|--------------|---------------------------------------------|
| enabled    | true         | Zeitsperre aktiv/inaktiv                    |
| start_hour | 7            | Freigabe ab (Stunde)                        |
| start_min  | 0            | Freigabe ab (Minute)                        |
| end_hour   | 22           | Sperre ab (Stunde)                          |
| end_min    | 0            | Sperre ab (Minute)                          |
| days[7]    | alle true    | Freigabetage [0]=Mo … [6]=So                |

### Verhalten

- Zeitsperre wird direkt in `PUMP_OFF` geprüft → Pumpe startet gar nicht erst
- Läuft V20 bereits und Fenster endet → **automatischer Stop**
- Beide Mechanismen rufen auch `pressure_ctrl_reset()` auf

---

## 8. MQTT – Home Assistant Integration

### Verbindungsparameter

| Parameter      | Wert              |
|----------------|-------------------|
| Broker IP      | (in secrets.h)    |
| Port           | (in secrets.h)    |
| Benutzername   | (in secrets.h)    |
| Passwort       | (in secrets.h)    |
| Client-ID      | `pumpensteuerung` |
| Base-Topic     | `pumpensteuerung` |
| Device-Name (HA) | Pumpensteuerung |
| Publish-Intervall | 2000 ms (retain=true für PI/Druck-Topics) |
| Reconnect-Intervall | 5000 ms      |

### MQTT Publish-Topics

| Topic                                    | Format      | Beispiel  | Bedeutung               |
|------------------------------------------|-------------|-----------|-------------------------|
| `pumpensteuerung/v20/frequency`           | float       | "42.50"   | Ist-Frequenz in Hz      |
| `pumpensteuerung/v20/current`             | float       | "3.25"    | Motorstrom in A         |
| `pumpensteuerung/v20/voltage`             | float       | "333.0"   | Ausgangsspannung in V   |
| `pumpensteuerung/v20/power`               | float       | "290"     | Leistung in W           |
| `pumpensteuerung/v20/fault`               | "ON"/"OFF"  | "OFF"     | Störung aktiv           |
| `pumpensteuerung/v20/fault_code`          | int         | "0"       | Fehlercode (V20)        |
| `pumpensteuerung/v20/connected`           | "ON"/"OFF"  | "ON"      | V20 RTU verbunden       |
| `pumpensteuerung/v20/status`              | text        | "LÄUFT"   | Statustext              |
| `pumpensteuerung/v20/running/state`       | "ON"/"OFF"  | "ON"      | Läuft-Zustand           |
| `pumpensteuerung/v20/freq_set/state`      | float       | "42.5"    | Frequenz-Sollwert in Hz |
| `pumpensteuerung/temperature`             | float       | "23.5"    | Gateway-Temperatur °C   |
| `pumpensteuerung/flow/state`              | float       | "12.3"    | Durchfluss L/min        |
| `pumpensteuerung/water_temp`              | float       | "11.2"    | Wassertemperatur °C     |
| `pumpensteuerung/fan/rpm`                 | int         | "2000"    | Lüfterdrehzahl RPM      |
| `pumpensteuerung/fan/pwm/state`           | "0"–"255"   | "200"     | Lüfter PWM-Wert         |
| `pumpensteuerung/fan/mode/state`          | text        | "Auto"    | Lüfter-Modus            |
| `pumpensteuerung/pressure/state`          | float       | "2.98"    | Aktueller Druck bar     |
| `pumpensteuerung/pressure/setpoint/state` | float       | "3.00"    | PI-Sollwert bar         |
| `pumpensteuerung/pi/enabled/state`        | "ON"/"OFF"  | "ON"      | PI-Regler ein/aus       |
| `pumpensteuerung/pi/active/state`         | text        | "AKTIV"   | PI rechnet gerade       |
| `pumpensteuerung/pi/freq_min/state`       | float       | "35.0"    | PI Untergrenze Hz       |
| `pumpensteuerung/pi/freq_max/state`       | float       | "50.0"    | PI Obergrenze Hz        |
| `pumpensteuerung/dryrun/locked`           | "ON"/"OFF"  | "OFF"     | Trockenlauf-Sperre      |
| `pumpensteuerung/timeguard/enabled/state` | "ON"/"OFF"  | "ON"      | Zeitsperre aktiv        |
| `pumpensteuerung/timeguard/allowed`       | "ON"/"OFF"  | "ON"      | Zeitfenster erlaubt     |
| `pumpensteuerung/sys/uptime`              | int         | "3600"    | Uptime in Sekunden      |

### MQTT Subscribe-Topics

| Topic                                     | Erwarteter Wert            | Aktion                              |
|-------------------------------------------|----------------------------|-------------------------------------|
| `pumpensteuerung/v20/running/set`          | "ON" / "OFF"               | V20 starten / stoppen               |
| `pumpensteuerung/v20/freq_set/set`         | Float-String Hz            | Frequenz direkt setzen (wenn PI aus)|
| `pumpensteuerung/v20/fault_reset`          | beliebig (Trigger)         | Störung quittieren (2-phasig)       |
| `pumpensteuerung/dryrun/reset`             | beliebig (Trigger)         | Trockenlauf-Sperre quittieren       |
| `pumpensteuerung/fan/pwm/set`              | "0"–"255"                  | Lüfter PWM (nur Modus MQTT)         |
| `pumpensteuerung/fan/mode/set`             | "Auto"/"MQTT"/"Web"        | Lüfter-Modus wechseln               |
| `pumpensteuerung/pressure/setpoint/set`    | Float-String bar (0.1–6.0) | PI-Sollwert setzen                  |
| `pumpensteuerung/pi/enabled/set`           | "ON" / "OFF"               | PI aktivieren/deaktivieren          |
| `pumpensteuerung/pi/freq_min/set`          | Float-String Hz (10–50)    | PI Mindestfrequenz                  |
| `pumpensteuerung/pi/freq_max/set`          | Float-String Hz (10–50)    | PI Maximalfrequenz                  |
| `pumpensteuerung/timeguard/enabled/set`    | "ON" / "OFF"               | Zeitsperre ein/aus                  |

### HA Auto-Discovery Entities (28 Entities)

| Typ            | Object-ID           | Bedeutung                            |
|----------------|---------------------|--------------------------------------|
| sensor         | v20_freq            | V20 Frequenz (Hz)                    |
| sensor         | v20_current         | V20 Motorstrom (A)                   |
| sensor         | v20_voltage         | V20 Ausgangsspannung (V)             |
| sensor         | v20_power           | V20 Leistung (W)                     |
| sensor         | v20_fault_code      | V20 Fehlercode                       |
| sensor         | v20_status          | V20 Statustext                       |
| binary_sensor  | v20_connected       | V20 RTU-Verbindung                   |
| binary_sensor  | v20_fault           | V20 Störung aktiv                    |
| switch         | v20_run             | Pumpe Ein/Aus                        |
| number         | v20_freq_set        | Frequenz-Sollwert (0–50 Hz)          |
| button         | v20_fault_reset     | Störung quittieren                   |
| sensor         | pressure            | Aktueller Druck (bar)                |
| sensor         | flow                | Durchfluss (L/min)                   |
| sensor         | water_temp          | Wassertemperatur (°C)                |
| number         | pi_setpoint         | Drucksollwert (0.1–6.0 bar)          |
| switch         | pi_enabled          | PI-Regelung ein/aus                  |
| sensor         | pi_active           | PI Rechnet-Status                    |
| number         | pi_freq_min         | PI Min-Frequenz (10–50 Hz)           |
| number         | pi_freq_max         | PI Max-Frequenz (10–50 Hz)           |
| binary_sensor  | dryrun_locked       | Trockenlauf-Sperre aktiv             |
| button         | dryrun_reset        | Trockenlauf quittieren               |
| switch         | timeguard_enabled   | Zeitsperre ein/aus                   |
| binary_sensor  | timeguard_allowed   | Zeitfenster aktuell erlaubt          |
| sensor         | fan_rpm             | Lüfter RPM                           |
| number         | fan_pwm             | Lüfter PWM (0–255)                   |
| select         | fan_mode            | Lüfter-Modus                         |
| sensor         | temperature         | Gateway Temperatur (°C)              |
| sensor         | uptime              | Uptime (Sekunden, diagnostic)        |

---

## 9. Lüftersteuerung

### Modi

| Modus-Nr. | Name  | Beschreibung                                          |
|-----------|-------|-------------------------------------------------------|
| 0         | Auto  | PWM automatisch nach Temperaturkurve                  |
| 1         | LOGO  | (Legacy, nicht mehr genutzt – TCP Reg 2 ist jetzt Durchfluss) |
| 2         | MQTT  | PWM von MQTT-Topic `fan/pwm/set`                      |
| 3         | Web   | PWM vom Web-Dashboard                                 |

### Auto-Modus Temperaturkurve

| Temperatur      | PWM-Wert | Drehzahl       |
|-----------------|----------|----------------|
| ≤ 25,0°C        | 30       | Minimum (≈12%) |
| 25,0–40,0°C     | Linear   | Interpoliert   |
| ≥ 40,0°C        | 255      | Vollgas        |

---

## 10. Datenfluss-Übersicht

### Sensoren → ESP32 (via LOGO als Sensor-Gateway)

```
Drucksensor (4-20mA)    → LOGO AI → HR4 → TCP Reg 3 (bar×100)   → state.pressure_bar
Durchfluss (4-20mA)     → LOGO AI → HR3 → TCP Reg 2 (Raw)       → state.flow_rate
Wassertemp (4-20mA)     → LOGO AI → HR5 → TCP Reg 4 (Raw)       → state.water_temp
DS18B20 (OneWire)       → 2000 ms                               → state.temperature
Fan Tachometer          → 2000 ms                               → state.fan_rpm
```

### V20 → ESP32 (via RTU)

```
V20 RTU Reg 109 (ZSW)     →  500 ms  →  state.v20_status_word
V20 RTU Reg 110 (HIW)     →  500 ms  →  state.v20_frequency
V20 RTU Reg 342 (Spannung)→  5000 ms →  state.v20_voltage
V20 RTU Reg 344 (Strom)   →  5000 ms →  state.v20_current
V20 RTU Reg 346 (Leistung)→  5000 ms →  state.v20_power
V20 RTU Reg 343 (DC-Bus)  →  5000 ms →  state.v20_dc_bus
```

### ESP32 → V20 (PI-Regelkreis)

```
state.pressure_bar
    → pressure_ctrl_task() alle 500 ms
    → freq = kp×error + ki×integral + f_mitte
    → modbus_v20_set_frequency(freq)
    → V20 RTU Reg 100 (HSW)
    → Pumpe regelt Druck
    → Druck steigt/fällt
    → Drucksensor → LOGO AI → ESP32  (geschlossener Regelkreis)
```

### ESP32 → LOGO (Rückmeldung, optional)

```
state.v20_status_word  →  TCP Reg 10 (ZSW)
state.v20_frequency    →  TCP Reg 11 (Hz×100)
state.v20_current      →  TCP Reg 12 (A×100)
state.v20_dc_bus       →  TCP Reg 13 (V)
state.v20_fault        →  TCP Reg 14
state.temperature      →  TCP Reg 15 (°C×10)
state.fan_rpm          →  TCP Reg 16
state.fan_pwm          →  TCP Reg 17
```

---

## 11. Timing-Tabelle

| Aufgabe                    | Intervall | Funktion                      | Effekt auf State                  |
|----------------------------|-----------|-------------------------------|-----------------------------------|
| RTU Poll (Haupt)           | 500 ms    | `modbus_v20_poll()`           | ZSW, HIW, v20_running, v20_fault  |
| RTU Poll (Diagnose)        | 5000 ms   | `modbus_v20_diag_poll()`      | Spannung, Strom, DC-Bus, Leistung |
| RTU Verbindungs-Timeout    | 5000 ms   | intern                        | v20_connected = false             |
| TCP Register-Update        | 250 ms    | `modbus_tcp_update()`         | TCP-Register ← State (Lesen)      |
| TCP Schreib-Check          | 250 ms    | `modbus_tcp_check_writes()`   | State ← TCP-Register (Schreiben)  |
| **PI-Druckregelung**       | **500 ms**| **`pressure_ctrl_task()`**    | **freq → V20 RTU Reg 100**        |
| Temperatur lesen           | 2000 ms   | `sensors_read_temperature()`  | state.temperature                 |
| Lüfter RPM berechnen       | 2000 ms   | `sensors_read_fan_rpm()`      | state.fan_rpm                     |
| Lüftersteuerung            | 500 ms    | `fan_control()`               | state.fan_pwm (Auto-Modus)        |
| MQTT Publish               | 2000 ms   | `mqtt_publish()`              | Alle Topics                       |
| MQTT Reconnect             | 5000 ms   | `mqtt_task()`                 | mqtt_connected                    |
| WebSocket Broadcast        | 1000 ms   | `webserver_broadcast()`       | JSON an alle WS-Clients           |
| Watchdog-Check             | 1000 ms   | `checkWatchdog()`             | Bei Timeout: V20 stoppen          |
| Uptime                     | 1000 ms   | intern                        | state.uptime_s + 1                |

---

## 12. Watchdog-Logik

```
Normal-Betrieb (PI aktiv):
    pressure_ctrl_is_active() == true
    → modbus_tcp_check_writes() setzt last_stw_write = millis() jede 250 ms
    → Watchdog feuert nie

Watchdog-Auslösung:
    (now - last_stw_write) > 5000 ms AND v20_running
    → modbus_v20_stop()
    → pressure_ctrl_reset()

Druck-Timeout (PI aktiv):
    pi_active AND (now - last_pressure_update) > 5000 ms
    → modbus_v20_stop()
    → pressure_ctrl_reset()
    → web_log("[PI] Druck-Timeout!")

Zeitsperre (laufender V20):
    v20_running AND !timeguard_is_allowed()
    → modbus_v20_stop()
    → pressure_ctrl_reset()
    → web_log("[TIME] Zeitsperre aktiv")

Zeitsperre (Startverhinderung):
    pump_state == PUMP_OFF AND !state.time_allowed
    → return (Start wird gar nicht erst versucht)
```

---

## 13. AppState-Struktur (globaler Zustand)

Definiert in `src/config.h`, globale Instanz `state`:

```cpp
struct AppState {
    // V20 Istwerte
    uint16_t v20_status_word;          // ZSW-Register Rohwert
    float    v20_frequency;            // Hz (Ist-Frequenz)
    float    v20_voltage;              // V (Ausgangsspannung)
    float    v20_current;              // A (Motorstrom)
    uint16_t v20_dc_bus;               // V (DC-Bus)
    float    v20_power;                // kW (Wirkleistung)
    uint8_t  v20_fault;                // 0=OK, 1=Störung (aus ZSW Bit 3)
    bool     v20_running;              // (ZSW & 0x0004) != 0
    bool     v20_connected;            // RTU-Kommunikation aktiv

    // V20 Sollwerte
    uint16_t v20_control_word;         // Letzter STW-Wert
    float    v20_freq_setpoint;        // Hz (letzter gesendeter Sollwert)

    // Sensoren
    float    temperature;              // °C (DS18B20), -127 = nicht verfügbar

    // Lüfter
    uint16_t fan_rpm;                  // RPM (Tachometer)
    uint8_t  fan_pwm;                  // 0–255 (aktueller Duty)
    uint8_t  fan_mode;                 // 0=Auto, 1=LOGO, 2=MQTT, 3=Web

    // Druckregelung (PI)
    float    pressure_bar;             // bar (aktueller Messwert von LOGO)
    float    pressure_setpoint;        // bar (PI-Sollwert, Spiegel aus PressureCtrlConfig)
    bool     pi_active;                // true wenn PI gerade rechnet
    unsigned long last_pressure_update;// millis() des letzten gültigen Druckwerts
    float    flow_rate;                // L/min (Durchfluss, Sensor oder geschätzt)
    bool     flow_estimated;           // true = Schätzwert aus VFD-Frequenz (Sensor Totbereich)
    unsigned long last_flow_update;    // millis() des letzten gültigen Durchflusswerts
    float    water_temp;               // °C (Brunnenwasser, Druckseite)
    bool     dry_run_locked;           // Trockenlauf-Sperre aktiv

    // Zeitsperre
    bool     time_allowed;             // Zeitfenster aktuell offen (Fail-Open)
    bool     time_synced;              // NTP-Sync erfolgreich

    // System
    unsigned long uptime_s;            // Uptime in Sekunden
    bool     eth_connected;            // WiFi/Netzwerk verbunden
    bool     mqtt_connected;           // MQTT-Broker verbunden
    uint8_t  tcp_clients;              // Aktive TCP-Verbindungen
    String   ip_address;               // Aktuelle IP-Adresse
};
```

---

## 14. Web-API (REST-Endpunkte)

| Methode | Pfad              | Body (JSON)                                      | Aktion                        |
|---------|-------------------|--------------------------------------------------|-------------------------------|
| POST    | /api/login        | `{"user":"admin","pass":"admin"}`                | Session-Cookie erzeugen       |
| POST    | /api/logout       | —                                                | Session invalidieren          |
| GET     | /api/status       | —                                                | Vollständiger JSON-Status      |
| POST    | /api/v20/start    | —                                                | V20 starten                   |
| POST    | /api/v20/stop     | —                                                | V20 stoppen                   |
| POST    | /api/v20/reset    | —                                                | V20 Fault Reset               |
| POST    | /api/v20/freq     | `{"hz":42.5}`                                    | Frequenz setzen (PI inaktiv)  |
| POST    | /api/fan/pwm      | `{"pwm":200}`                                    | Lüfter PWM setzen             |
| POST    | /api/fan/mode     | `{"mode":"Auto"}`                                | Lüfter-Modus setzen           |
| GET     | /api/timeguard    | —                                                | Zeitsperre-Konfiguration lesen|
| POST    | /api/timeguard    | `{"enabled":true,"start_hour":7,...,"days":[...]}` | Zeitsperre konfigurieren    |
| GET     | /api/pressure     | —                                                | PI-Konfiguration lesen        |
| POST    | /api/pressure     | `{"enabled":true,"setpoint":3.0,"kp":3.0,"ki":0.3,"freq_min":35,"freq_max":50}` | PI konfigurieren |
| POST    | /api/password     | `{"old":"admin","new":"neupass"}`                | Admin-Passwort ändern         |
| POST    | /api/pressure/reset_dryrun | —                                       | Trockenlauf-Sperre quittieren |

---

## 15. Netzwerk & Credentials

Alle Credentials sind in `src/secrets.h` ausgelagert (nicht im Git-Repository).
Vorlage mit Platzhaltern: `src/secrets.h.example`.

| Parameter            | Definiert in         | Hinweis                          |
|----------------------|----------------------|----------------------------------|
| WiFi SSID            | `secrets.h`          | `WIFI_SSID`                      |
| WiFi Passwort        | `secrets.h`          | `WIFI_PASS`                      |
| MQTT Broker IP       | `secrets.h`          | `MQTT_BROKER`                    |
| MQTT Port            | `secrets.h`          | `MQTT_PORT`                      |
| MQTT User            | `secrets.h`          | `MQTT_USER`                      |
| MQTT Passwort        | `secrets.h`          | `MQTT_PASS`                      |
| OTA Passwort         | `secrets.h`          | `OTA_PASSWORD`                   |
| Web Admin User       | `secrets.h`          | `DEFAULT_ADMIN_USER`             |
| Web Admin Passwort   | `secrets.h`          | `DEFAULT_ADMIN_PASS`             |
| OTA Hostname         | `config.h`           | `pumpensteuerung`                |
| OTA IP               | `platformio.ini`     | `upload_port`                    |
| Web-UI Port          | `config.h`           | 80                               |
| Modbus TCP Port      | `config.h`           | 502                              |

---

## 16. PlatformIO-Konfiguration

```ini
[env:esp32dev]
platform    = https://github.com/pioarduino/platform-espressif32/...
board       = esp32dev
framework   = arduino

monitor_speed  = 115200
upload_speed   = 921600
upload_port    = 192.168.1.82   (OTA)
upload_protocol = espota

board_build.partitions = partitions.csv
board_build.filesystem = littlefs
```

### Bibliotheken

| Bibliothek                         | Version  | Zweck                        |
|------------------------------------|----------|------------------------------|
| mathieucarbou/ESPAsyncWebServer    | ^3.6.0   | Async HTTP + WebSocket       |
| mathieucarbou/AsyncTCP             | ^3.3.2   | Async TCP für WebServer      |
| emelianov/modbus-esp8266           | GitHub   | Modbus RTU + TCP             |
| knolleary/PubSubClient             | ^2.8     | MQTT-Client                  |
| bblanchon/ArduinoJson              | ^7.3.0   | JSON für MQTT + WebSocket    |
| paulstoffregen/OneWire             | ^2.3.8   | OneWire-Bus (DS18B20)        |
| milesburton/DallasTemperature      | ^3.11.0  | DS18B20-Treiber              |

### Flash-Partitionen (partitions.csv)

| Name     | Typ        | Größe   | Offset     | Zweck                  |
|----------|------------|---------|------------|------------------------|
| nvs      | data/nvs   | 20 KB   | 0x9000     | WiFi-Credentials, NVS  |
| otadata  | data/ota   | 8 KB    | 0xe000     | OTA-Metadaten          |
| app0     | app/ota_0  | 1920 KB | 0x10000    | Firmware-Slot 1        |
| app1     | app/ota_1  | 1920 KB | 0x1F0000   | Firmware-Slot 2 (OTA)  |
| littlefs | data/spiffs| 192 KB  | 0x3D0000   | Konfiguration, Logs    |

---

## 17. Sensoren – Durchfluss & Druck

### Autosen AS009 Vortex-Sensor (Durchfluss + Temperatur)

| Parameter       | Wert                 |
|-----------------|----------------------|
| Messbereich     | 5–85 L/min (Vortex)  |
| Totbereich      | < 5 L/min → zeigt 0  |
| Ausgang         | 4–20 mA              |
| LOGO-Skalierung | min=200, max=1000    |
| Formel          | `Q = (raw - 200) × 0.10626` |
| Temperatur      | `T = (raw - 200) × 0.1875 - 25.0` |

> **Totbereich-Workaround:** Unter 5 L/min meldet der Sensor exakt 0. Der ESP32 schätzt den Durchfluss aus der VFD-Frequenz (`Q_est = f/50 × 4.0`) und setzt `flow_estimated = true`. Die Schutzlogik (Trockenlauf, Kein-Bedarf) behandelt geschätzte Werte als "kein Durchfluss".

---

## 18. Wichtige Besonderheiten / Fallstricke

1. **TCP_REG_STW (Reg 0) ist self-clearing:** Existiert im Code für manuelle Start/Stop-Befehle via Web/MQTT, wird aber bei aktiver PI-Regelung ignoriert.
2. **Register-Zuordnung:** Reg 2=Durchfluss, Reg 3=Druck, Reg 4=Wassertemperatur. Diese drei sind die einzigen von LOGO beschriebenen Register.
3. **LOGO HR-Adressen sind 1-basiert:** HR3 → Register 2, HR4 → Register 3, HR5 → Register 4. Nicht verwechseln!
4. **ESP32 steuert V20 eigenständig:** Start/Stop, Frequenz und alle Schutzfunktionen laufen ohne LOGO-Beteiligung.
5. **Fan PWM 255 wird zu 254 konvertiert:** Wert 255 wird von manchen Lüftern als fehlendes Signal interpretiert.
6. **Fault Reset ist 2-phasig:** Erst `0x04FE`, dann 200 ms warten, dann `0x047E`. Einphasiger Reset funktioniert nicht zuverlässig.
7. **Temperatur-Fehler:** Bei DS18B20-Ausfall wird `0xFFFF` in TCP-Register 15 geschrieben (erkennbarer Fehlercode).
8. **Watchdog greift nur bei laufendem V20:** Kein redundanter Stop wenn V20 bereits aus.
9. **NTP Fail-Open:** Wenn kein NTP-Sync → Zeitsperre erlaubt Betrieb (Warnung im Log, max. 1×/min).
10. **Anti-Windup:** PI-Integral wird auf `±(freq_max-freq_min)/ki` begrenzt – verhindert überschwingen nach langen Druckabweichungen.
11. **Zeitsperre blockiert Start:** Wird direkt in `PUMP_OFF` geprüft – Pumpe startet gar nicht erst (kein kurzes An/Aus mehr).
12. **Flow-Schätzung nur für Anzeige:** `flow_estimated == true` → Schutzlogik behandelt als kein Durchfluss. Verhindert dass geschätzter Wert Trockenlauf/Kein-Bedarf-Erkennung austrickst.
13. **Kein-Bedarf vs. Trockenlauf:** Gleiche Bedingung (kein Durchfluss), aber unterschieden durch Druckniveau: Druck ≥ SP → sauberer Stop (5s), Druck < SP → Alarm+Sperre (30s).

---

## Änderungsprotokoll

### 2026-03-20 (v1.1.0)

- **MQTT komplett überarbeitet:** Device-Name von "Modbus Gateway WT32" auf "Pumpensteuerung" geändert. Base-Topic `pumpensteuerung` statt `modbus_gw`. Alle unique_ids geändert (alte HA-Entities ggf. manuell löschen).
- **28 HA-Entities statt 19:** Neue Entities: V20 Ausgangsspannung, V20 Leistung (W), Durchfluss, Wassertemperatur, Trockenlauf-Sperre (binary_sensor), Trockenlauf quittieren (button), V20 Verbunden (binary_sensor), V20 Störung (binary_sensor), Zeitsperre ein/aus (switch), Zeitfenster aktiv (binary_sensor), Uptime (diagnostic).
- **MQTT Voltage korrigiert:** Publiziert jetzt Ausgangsspannung (`v20_voltage`) statt DC-Bus-Spannung.
- **Secrets ausgelagert:** Alle Credentials (WiFi, MQTT, OTA, Admin) in `src/secrets.h` verschoben. `src/secrets.h.example` als Vorlage für neue Entwickler. `secrets.h` in `.gitignore` eingetragen.
- **OTA-Hostname geändert:** `modbus-gw` → `pumpensteuerung`.
- **Firmware-Version:** 1.0.0 → 1.1.0.

### 2026-03-20 (v1.0.0)

- **Durchflussschätzung:** Neues `flow_estimated`-Flag in AppState. Wenn Sensor im Totbereich (<5 L/min) und Pumpe läuft → Schätzung aus VFD-Frequenz (`f/50 × 4.0`). Dashboard zeigt "~" Prefix.
- **Kein-Bedarf-Abschaltung (No-Demand):** Neuer Schutz: Durchfluss=0 + Druck ≥ Sollwert → nach 5s sauberer Pumpen-Stopp ohne Alarm. Verhindert Dauerlauf bei geschlossenem Ventil.
- **Trockenlauf-Schutz getrennt:** Durchfluss=0 + Druck < Sollwert → nach 30s Alarm + 5 Min Sperre (wie bisher, aber jetzt sauber getrennt von No-Demand).
- **Quittieren-Button repariert:** `pressure_ctrl_reset_dryrun()` if-Guard entfernt, Reset funktioniert jetzt immer. Setzt auch `no_demand_active` und `dry_run_alert` zurück.
- **Flow-Schwelle angehoben:** Von 0.1 auf 1.0 L/min (Sensor-Totzone berücksichtigt).
- **Zeitsperre Start-Blockade:** `!state.time_allowed` wird jetzt direkt in `PUMP_OFF` geprüft → Pumpe startet gar nicht erst statt kurz zu starten und sofort wieder gestoppt zu werden.
