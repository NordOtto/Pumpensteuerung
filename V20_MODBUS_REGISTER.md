# SINAMICS V20 – Modbus Register Map

> Quelle: SINAMICS V20 Operating Instructions, 05/2017, A5E34559884-007  
> Adressierung: **Inverter-Nr. = Modbus 40xxx − 40001** (0-basiert für ESP32)

---

## Steuerung & Konfiguration (R/W)

| Inv | Modbus | Beschreibung | Zugriff | Einheit | Skalierung | Bereich | Parameter |
|-----|--------|-------------|---------|---------|------------|---------|-----------|
| 0 | 40001 | Watchdog time | R/W | ms | 1 | 0 – 65535 | – |
| 1 | 40002 | Watchdog action | R/W | – | 1 | – | – |
| 2 | 40003 | Frequency setpoint | R/W | % | 100 | 0.00 – 100.00 | HSW |
| 3 | 40004 | Run enable | R/W | – | 1 | 0 – 1 | STW:3 |
| 4 | 40005 | Forward/reverse command | R/W | – | 1 | 0 – 1 | STW:11 |
| 5 | 40006 | Start command | R/W | – | 1 | 0 – 1 | STW:0 |
| 6 | 40007 | Fault acknowledgement | R/W | – | 1 | 0 – 1 | STW:7 |
| 7 | 40008 | PID setpoint reference | R/W | % | 100 | -200.0 – 200.0 | P2240 |
| 8 | 40009 | PID enable | R/W | – | 1 | 0 – 1 | P2200 |
| 9 | 40010 | Current limit | R/W | % | 10 | 10.0 – 400.0 | P0640 |
| 10 | 40011 | Acceleration time | R/W | s | 100 | 0.00 – 650.0 | P1120 |
| 11 | 40012 | Deceleration time | R/W | s | 100 | 0.00 – 650.0 | P1121 |
| 12 | 40013 | (Reserved) | – | – | – | – | – |
| 13 | 40014 | Digital output 1 | R/W | – | 1 | HIGH/LOW | r0747.0 |
| 14 | 40015 | Digital output 2 | R/W | – | 1 | HIGH/LOW | r0747.1 |
| 15 | 40016 | Reference frequency | R/W | Hz | 100 | 1.00 – 550.00 | P2000 |
| 16 | 40017 | PID upper limit | R/W | % | 100 | -200.0 – 200.0 | P2291 |
| 17 | 40018 | PID lower limit | R/W | % | 100 | -200.0 – 200.0 | P2292 |
| 18 | 40019 | Proportional gain | R/W | – | 1000 | 0.000 – 65.000 | P2280 |
| 19 | 40020 | Integral gain | R/W | s | 1 | 0 – 60 | P2285 |
| 20 | 40021 | Differential gain | R/W | – | 1 | 0 – 60 | P2274 |
| 21 | 40022 | Feedback gain | R/W | % | 100 | 0.00 – 500.00 | P2269 |
| 22 | 40023 | Low pass | R/W | – | 100 | 0.00 – 60.00 | P2265 |

---

## Überwachung / Istwerte (Read-Only)

| Inv | Modbus | Beschreibung | Zugriff | Einheit | Skalierung | Bereich | Parameter |
|-----|--------|-------------|---------|---------|------------|---------|-----------|
| 23 | 40024 | Frequency output | R | Hz | 100 | -327.68 – 327.67 | r0024 |
| 24 | 40025 | Speed | R | RPM | 1 | -16250 – 16250 | r0022 |
| 25 | 40026 | Current | R | A | 100 | 0 – 163.83 | r0027 |
| 26 | 40027 | Torque | R | Nm | 100 | -325.00 – 325.00 | r0031 |
| 27 | 40028 | Actual power | R | kW | 100 | 0 – 327.67 | r0032 |
| 28 | 40029 | Total kWh | R | kWh | 1 | 0 – 32767 | r0039 |
| 29 | 40030 | DC bus voltage | R | V | 1 | 0 – 32767 | r0026 |
| 30 | 40031 | Reference | R | Hz | 100 | -327.68 – 327.67 | r0020 |
| 31 | 40032 | Rated power | R | kW | 100 | 0 – 327.67 | r0206 |
| 32 | 40033 | Voltage output | R | V | 1 | 0 – 32767 | r0025 |

---

## Status-Bits (Read-Only)

| Inv | Modbus | Beschreibung | Zugriff | Werte | Parameter |
|-----|--------|-------------|---------|-------|-----------|
| 33 | 40034 | Forward/reverse | R | FWD / REV | ZSW:14 |
| 34 | 40035 | Stop/run | R | STOP / RUN | ZSW:2 |
| 35 | 40036 | Run at maximum frequency | R | MAX / NO | ZSW:10 |
| 36 | 40037 | Control mode | R | SERIAL / LOCAL | ZSW:9 |
| 37 | 40038 | Enabled | R | ON / OFF | ZSW:0 |
| 38 | 40039 | Ready to run | R | READY / OFF | ZSW:1 |

---

## Analoge & Digitale I/O

| Inv | Modbus | Beschreibung | Zugriff | Einheit | Skalierung | Parameter |
|-----|--------|-------------|---------|---------|------------|-----------|
| 39 | 40040 | Analog input 1 | R | % | 100 | r0754[0] |
| 40 | 40041 | Analog input 2 | R | % | 100 | r0754[1] |
| 41 | 40042 | Analog output 1 | R | % | 100 | r0774[0] |
| 43 | 40044 | Actual frequency | R | % | 100 | HIW |
| 44 | 40045 | PID setpoint output | R | % | 100 | r2250 |
| 45 | 40046 | PID output | R | % | 100 | r2294 |
| 46 | 40047 | PID feedback | R | % | 100 | r2266 |
| 47 | 40048 | Digital input 1 | R | – | 1 | r0722.0 |
| 48 | 40049 | Digital input 2 | R | – | 1 | r0722.1 |
| 49 | 40050 | Digital input 3 | R | – | 1 | r0722.2 |
| 50 | 40051 | Digital input 4 | R | – | 1 | r0722.3 |

---

## Diagnose & Fehler

| Inv | Modbus | Beschreibung | Zugriff | Bereich | Parameter |
|-----|--------|-------------|---------|---------|-----------|
| 53 | 40054 | Fault | R | FAULT / OFF | ZSW:3 |
| 54 | 40055 | Last fault | R | 0 – 32767 | r0947[0] |
| 55 | 40056 | Fault 1 | R | 0 – 32767 | r0947[1] |
| 56 | 40057 | Fault 2 | R | 0 – 32767 | r0947[2] |
| 57 | 40058 | Fault 3 | R | 0 – 32767 | r0947[3] |
| 58 | 40059 | Warning | R | WARN / OK | ZSW:7 |
| 59 | 40060 | Last warning | R | 0 – 32767 | r2110 |

---

## Geräte-Info

| Inv | Modbus | Beschreibung | Zugriff | Skalierung | Parameter |
|-----|--------|-------------|---------|------------|-----------|
| 60 | 40061 | Inverter version | R | 100 | r0018 |
| 61 | 40062 | Inverter model | R | 1 | r0201 |

---

## PZD (Prozessdaten) – Direkte Steuerung

| Inv | Modbus | Beschreibung | Zugriff | Skalierung | Richtung |
|-----|--------|-------------|---------|------------|----------|
| **99** | **40100** | **STW (Steuerwort)** | **R/W** | 1 | PZD 1 Write |
| **100** | **40101** | **HSW (Hauptsollwert)** | **R/W** | 1 | PZD 2 Write |
| **109** | **40110** | **ZSW (Zustandswort)** | **R** | 1 | PZD 1 Read |
| **110** | **40111** | **HIW (Hauptistwert)** | **R** | 1 | PZD 2 Read |

---

## Extended Digital I/O (200er Bereich)

| Inv | Modbus | Beschreibung | Zugriff | Parameter |
|-----|--------|-------------|---------|-----------|
| 199 | 40200 | Digital output 1 | R/W | r0747.0 |
| 200 | 40201 | Digital output 2 | R/W | r0747.1 |
| 219 | 40220 | Analog output 1 | R | r0774[0] |
| 239 | 40240 | Digital input 1 | R | r0722.0 |
| 240 | 40241 | Digital input 2 | R | r0722.1 |
| 241 | 40242 | Digital input 3 | R | r0722.2 |
| 242 | 40243 | Digital input 4 | R | r0722.3 |
| 259 | 40260 | Analog input 1 | R | r0754[0] |
| 260 | 40261 | Analog input 2 | R | r0754[1] |

---

## Geräte-Info (300er Bereich)

| Inv | Modbus | Beschreibung | Zugriff | Parameter |
|-----|--------|-------------|---------|-----------|
| 299 | 40300 | Inverter model | R | r0201 |
| 300 | 40301 | Inverter version | R | r0018 |
| 319 | 40320 | Rated power | R | r0206 |

---

## Extended Konfiguration (320er Bereich)

| Inv | Modbus | Beschreibung | Zugriff | Einheit | Skalierung | Parameter |
|-----|--------|-------------|---------|---------|------------|-----------|
| 320 | 40321 | Current limit | R/W | % | 10 | P0640 |
| 321 | 40322 | Acceleration time | R/W | s | 100 | P1120 |
| 322 | 40323 | Deceleration time | R/W | s | 100 | P1121 |
| 323 | 40324 | Reference frequency | R/W | Hz | 100 | P2000 |
| 339 | 40340 | Reference | R | Hz | 100 | r0020 |

---

## Extended Monitoring (340er Bereich) ⭐

| Inv | Modbus | Beschreibung | Zugriff | Einheit | Skalierung | Bereich | Parameter |
|-----|--------|-------------|---------|---------|------------|---------|-----------|
| **340** | **40341** | **Speed** | **R** | RPM | 1 | -16250 – 16250 | r0022 |
| **341** | **40342** | **Frequency output** | **R** | Hz | 100 | -327.68 – 327.67 | r0024 |
| **342** | **40343** | **Voltage output** | **R** | V | 1 | 0 – 32767 | r0025 |
| **343** | **40344** | **DC bus voltage** | **R** | V | 1 | 0 – 32767 | r0026 |
| **344** | **40345** | **Current** | **R** | A | 100 | 0 – 163.83 | r0027 |
| **345** | **40346** | **Torque** | **R** | Nm | 100 | -325.00 – 325.00 | r0031 |
| **346** | **40347** | **Actual power** | **R** | kW | 100 | 0 – 327.67 | r0032 |
| **347** | **40348** | **Total kWh** | **R** | kWh | 1 | 0 – 32767 | r0039 |
| 348 | 40349 | Hand/auto | R | – | 1 | HAND / AUTO | r0807 |

---

## Extended Störungshistorie (400er Bereich)

| Inv | Modbus | Beschreibung | Zugriff | Parameter |
|-----|--------|-------------|---------|-----------|
| 399 | 40400 | Fault 1 | R | r0947[0] |
| 400 | 40401 | Fault 2 | R | r0947[1] |
| 401 | 40402 | Fault 3 | R | r0947[2] |
| 402 | 40403 | Fault 4 | R | r0947[3] |
| 403 | 40404 | Fault 5 | R | r0947[4] |
| 404 | 40405 | Fault 6 | R | r0947[5] |
| 405 | 40406 | Fault 7 | R | r0947[6] |
| 406 | 40407 | Fault 8 | R | r0947[7] |
| 407 | 40408 | Warning | R | r2110[0] |

---

## PID-Regler (500er Bereich)

| Inv | Modbus | Beschreibung | Zugriff | Einheit | Skalierung | Parameter |
|-----|--------|-------------|---------|---------|------------|-----------|
| 498 | 40499 | Parameter error code | R | – | 1 | – |
| 499 | 40500 | PID enable | R/W | – | 1 | P2200 |
| 500 | 40501 | PID setpoint reference | R/W | % | 100 | P2240 |
| 509 | 40510 | Low pass | R/W | – | 100 | P2265 |
| 510 | 40511 | Feedback gain | R/W | % | 100 | P2269 |
| 511 | 40512 | Proportional gain | R/W | – | 1000 | P2280 |
| 512 | 40513 | Integral gain | R/W | s | 1 | P2285 |
| 513 | 40514 | Differential gain | R/W | – | 1 | P2274 |
| 514 | 40515 | PID upper limit | R/W | % | 100 | P2291 |
| 515 | 40516 | PID lower limit | R/W | % | 100 | P2292 |
| 519 | 40520 | PID setpoint output | R | % | 100 | r2250 |
| 520 | 40521 | PID feedback | R | % | 100 | r2266 |
| 521 | 40522 | PID output | R | % | 100 | r2294 |

---

## Parameter-Zugriff

| Inv | Modbus | Beschreibung | Zugriff |
|-----|--------|-------------|---------|
| 549 | 40550 | Parameter number | RW |
| 550 | 40551 | Parameter index | RW |
| 551 | 40552 | Reserved | RO |
| 553 | 40554 | Parameter upper word | RW |
| 554 | 40555 | Parameter lower word | RW |
| 557 | 40558 | Parameter upper word | RO |
| 558 | 40559 | Parameter lower word | RO |

---

## Hinweis zur Adressierung

Die **Inverter-Nummer** (0-basiert) wird direkt als Holding-Register-Adresse  
im ESP32 ModbusRTU-Library verwendet:

```
Inverter-Nr. = Modbus-Adresse − 40001
Beispiel: Modbus 40100 → Inverter 99 → readHreg(slave, 99, ...)
```

## Im Code verwendete Register

```c
// PZD Steuerung
V20_REG_STW       = 99    // 40100  Steuerwort
V20_REG_HSW       = 100   // 40101  Hauptsollwert
V20_REG_ZSW       = 109   // 40110  Zustandswort
V20_REG_HIW       = 110   // 40111  Hauptistwert

// Extended Monitoring (340er)
V20_REG_VOLTAGE   = 342   // 40343  Ausgangsspannung (V)
V20_REG_DCBUS     = 343   // 40344  DC-Bus-Spannung (V)
V20_REG_CURRENT   = 344   // 40345  Strom (×100 → A)
V20_REG_TORQUE    = 345   // 40346  Drehmoment (×100 → Nm)
V20_REG_POWER     = 346   // 40347  Leistung (×100 → kW)
V20_REG_ENERGY    = 347   // 40348  Energieverbrauch (kWh)

// Diagnose
V20_REG_FAULT_CODE = 54   // 40055  Letzter Fehler
V20_REG_WARNING    = 59   // 40060  Letzte Warnung
```
