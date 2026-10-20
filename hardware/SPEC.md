# Hardware-Spezifikation: AIO-Steuerplatine Pumpensteuerung

> **Stand:** Rev 0.1, 2026-10-20. Schaltplan ist fertig und netzlistengeprüft, Layout folgt.
> **Ziel:** LOGO! 8.4 + AM2 + Raspberry Pi 3B+ durch **eine** Platine mit Raspberry Pi **Compute Module 5** ersetzen.
> Versorgung direkt mit 230 V, Einbau in ein 3D-gedrucktes Gehäuse. Die bestehende Software (FastAPI, Next.js, OTA, App) läuft weiter.

## 1. Überblick

```
230 V AC ─ F1 T2A ─ RV1 ─ IRM-30-24 ─┬─ +24 V ─┬─ Sensorspeisung AI1–6 (je PTC 50 mA)
                                      │         ├─ XTR111 ×2 (AO 0/4–20 mA)
                                      │         ├─ Relais K1/K2 (Spule 24 V)
                                      │         ├─ DI-Speisung (PTC 200 mA)
                                      │         ├─ LMR33630 → +12 V (Lüfter)
                                      │         └─ LMR33630 → +5 V/3 A → CM5 → +3V3 (Logik)
CM5 ── I²C1 ── ADS1115 ×2 (AI1–6, 24V/5V-Überwachung), MCP4728 (AO-Sollwert)
    ── UART0 ── ADM2587E (isoliert) ── RS485 ── V20 (Modbus RTU)
    ── GPIO ── DI1–4 (TLP293-4), K1/K2, Lüfter-PWM/Tacho, LEDs, Taster
    ── Ethernet 10/100 (HR911105A), WLAN onboard, USB-C (nur rpiboot)
```

Schaltplan-Blätter: `kicad/pumpensteuerung.kicad_sch` → Stromversorgung, CM5, Analogeingänge, Analogausgänge, Digital/RS485/Lüfter.
PDF: `pumpensteuerung_schaltplan.pdf`. Stückliste: `bom.csv` (223 Bauteile, 88 Positionen).

## 2. Klemmen

| Klemme | Raster | Belegung | Verwendung |
|---|---|---|---|
| J1 | 5,08 | L / N | 230 V AC Eingang |
| J7–J12 | 3,5 | +24V / IN / GND | AI1–AI6 |
| J13, J14 | 3,5 | I+ / GND | AO1 (Dosierpumpe), AO2 (Reserve) |
| J15 | 3,5 | 24V / DI1 / DI2 / DI3 / DI4 / GND | Digitaleingänge (Schwimmer, Störmeldung …) |
| J16, J17 | 5,08 | NO / COM / NC | Relais K1 (z. B. Freigabe Dosierpumpe), K2 |
| J18 | 3,5 | A / B / GND_ISO | RS485 → V20 (A = P+, B = N−) |
| J19 | 2,54 | 4-Pin-Lüfter | Arctic P9 Max (12 V) |
| J6 | 2,54 | 3V3, SDA, SCL, GPIO4/7/8/9/10/11, GND | Erweiterung (I²C/SPI) |

## 3. Belegung der Analogeingänge

| Kanal | Sensor | Jumper | Bereich |
|---|---|---|---|
| AI1 | Druck | **offen** (0–10 V) | 0–10 bar |
| AI2 | Durchfluss | gesteckt (4–20 mA) | 0–85 L/min |
| AI3 | Wassertemperatur (Kombisensor) | gesteckt | −25…125 °C |
| AI4 | Füllstand Regentonne | gesteckt | Bereich je nach Sensor |
| AI5, AI6 | Reserve | wahlweise | — |

**Eingangsschaltung je Kanal:** Klemme → PTC 50 mA → Knoten. Jumper gesteckt: 150 Ω (0,1 %, 2512) gegen GND. Teiler 22k/10k (0,1 %) → 10 nF → ADS1115. TVS SMAJ26A an der Klemme.

**Umrechnung in der Software:**

| Modus | Spannung am ADC | PGA | Formel |
|---|---|---|---|
| 4–20 mA | U = I · 150 Ω · 10/32 = I · 46,875 Ω (20 mA → 0,9375 V) | ±1,024 V | `I_mA = counts · 1.024 / 32767 / 46.875 · 1000` |
| 0–10 V | U = U_in · 0,3125 (10 V → 3,125 V) | ±4,096 V | `U_in = counts · 4.096 / 32767 / 0.3125` |

- Drahtbruch erkennbar bei < 3,6 mA.
- Ein Fehlanschluss von 24 V auf IN ist abgesichert: Im Strommodus löst der PTC aus, im Spannungsmodus begrenzt der 22k den Strom in den ADC auf 0,9 mA.
- ADC2 AIN2 misst die 24-V-Schiene (Teiler 11:1), AIN3 die 5-V-Schiene (Teiler 2:1). Damit gehen Versorgungswarnungen ins Dashboard.

## 4. GPIO-Belegung (CM5, BCM)

| GPIO | CM5-Pin | Netz | Funktion |
|---|---|---|---|
| 2 / 3 | 58 / 56 | I2C_SDA / SCL | I²C1: ADS1115 0x48 + 0x49, MCP4728 0x60 (4,7k Pull-ups) |
| 14 / 15 | 55 / 51 | RS485_TX / RX | UART0 → `/dev/ttyAMA0` |
| 17 | 50 | RS485_DE | RTS0 → DE + /RE (Halbduplex, 10k Pull-down = Empfang) |
| 18 | 49 | FAN_PWM | PWM 25 kHz → 74LVC1G07 (Open Drain) → Lüfter |
| 23 | 47 | FAN_TACH | Lüfter-Tacho (Pull-up 3V3, 10k Serie) |
| 5 / 6 / 12 / 13 | 34 / 30 / 31 / 28 | DI1–DI4 | **aktiv LOW** (24 V an Klemme → GPIO = 0) |
| 24 / 25 | 45 / 41 | RELAY1 / RELAY2 | HIGH = Relais an (Pull-down: aus beim Booten) |
| 19 | 26 | AO_EN | HIGH = AO-Ausgänge freigegeben (sonst 0 mA) |
| 20 | 27 | AO_FAULT | LOW = Fehler an AO1/AO2 (Drahtbruch, Bürde zu hoch) |
| 22 / 27 | 46 / 48 | ADC1_ALERT / ADC2_ALERT | Conversion-Ready (optional) |
| 26 | 24 | STATUS_LED | gelbe LED |
| 21 | 25 | SERVICE_BTN | Taster, aktiv LOW (z. B. Trockenlauf-Sperre quittieren) |
| 4, 7–11 | — | EXP_* | Erweiterungsstecker J6 |
| 16 | 29 | — | frei lassen (CTS0, wird von `uart0_ctsrts` belegt) |

Sonstiges: Ethernet-LEDs an `Ethernet_nLED2/3`, ACT-LED an `LED_nACT`, Taster an `nRPIBOOT` und `PWR_Button`. Jumper JP1 schützt das EEPROM gegen Schreiben, die CR2032 hängt an `VBAT` (RTC).

## 5. Analogausgänge

MCP4728 (interne Referenz 2,048 V) → XTR111 → BSP170P mit PNP-Strombegrenzung (≈ 37 mA).
`I_out = 10 · U_DAC / 1,00 kΩ` → 0…20,48 mA. 4 mA entsprechen DAC-Code 800, 20 mA dem Code 4000.
Beim Booten sind beide Ausgänge über `OD` gesperrt, bis die Software `AO_EN` setzt. Die Bürde darf bis etwa 900 Ω betragen.

## 6. Leistungsbilanz (24 V, worst case)

| Verbraucher | Leistung |
|---|---|
| CM5 (5 V, Spitzenlast inkl. WLAN) | 8 W / 0,9 ≈ 9 W |
| Lüfter 12 V | 2,4 W / 0,9 ≈ 2,7 W |
| 6 × Sensorschleife 22 mA | 3,2 W |
| 2 × AO 20 mA | 1,0 W |
| 2 × Relais | 0,4 W |
| RS485 isoliert, Logik | ≈ 0,7 W |
| **Summe** | **≈ 17 W** von 30 W (IRM-30-24) |

Die 3V3-Schiene kommt aus dem CM5 (max. 600 mA). Bedarf: ADM2587E ≤ 200 mA, Rest < 30 mA.

## 7. Sicherheit

- **230 V:** Gerät der Schutzklasse II, PE ist nicht auf der Platine. Sicherung T2A und Varistor sitzen vor dem IRM-30. Im Layout: ≥ 6 mm Kriechstrecke plus Frässchlitz zwischen Netz- und SELV-Bereich, Netzklemme mit Zugentlastung im Gehäuse.
- **Relaiskontakte** (Finder 34.51) können 230 V schalten. Im Layout gilt für die Kontaktseite derselbe Abstand wie für den Netzbereich.
- **Trockenlaufschutz unabhängig von der Software:** Schwimmer- oder Niveauschalter **direkt** auf einen Freigabe-DI des V20 verdrahten. Zusätzlich V20-Parameter P2014 (Modbus-Timeout) setzen, damit der FU stoppt, wenn der Pi hängt. Die Software-Sperre bleibt als zweite Ebene.
- **Gehäuse:** ASA oder PETG, kein PLA.

## 8. Nötige Software-Änderungen (Repo `pi/`)

1. **`modbus_tcp.py` → neues `analog_in.py`:** ADS1115 per I²C lesen (z. B. `smbus2`), Skalierung wie in Abschnitt 3, gleiche State-Felder (`flow_rate`, `pressure_bar`, `water_temp`). Neu dazu kommen `tank_level`, `supply_24v` und `supply_5v`.
2. **Füllstand Regentonne** in State, HA-Discovery und UI ergänzen.
3. **RS485:** DE läuft jetzt über RTS (GPIO17). UART0 mit RTS per Overlay aktivieren (auf dem CM5 voraussichtlich `dtoverlay=uart0-pi5,ctsrts`, gegen die Overlay-README prüfen), in `modbus_rtu.py` den Kernel-RS485-Modus einschalten (`serial.rs485.RS485Settings`). Port bleibt `/dev/ttyAMA0`.
4. **Lüfter:** Auf dem CM5 hängt GPIO18 an einem anderen PWM-Kanal als beim Pi 3B+ (RP1: PWM0, Kanal 2). `PWM_CHIP`, `PWM_CHANNEL` und das Overlay in `fan_ctrl.py` und `setup.sh` anpassen. Das Signal bleibt **nicht invertiert**.
5. **Neue Module:** `dio.py` (DI1–4, aktiv LOW, entprellt; K1/K2) und `analog_out.py` (MCP4728 + `AO_EN` + `AO_FAULT`) für die Dosierpumpe.
6. **Spannungsüberwachung** 24 V und 5 V als Warnungen.

## 9. Offene Punkte vor dem Layout

- [ ] **Footprint DF40C-100DS-0.4V** und CM5-Position (Abstand der Stecker, M2.5-Löcher) aus den offiziellen CM5-IO-Board-KiCad-Dateien übernehmen. Die Pinbelegung in `tools/cm5_pins.py` gegen das Datenblatt RP-008180-DS gegenprüfen.
- [ ] **Footprint IRM-30-24** (in KiCad 7 nicht enthalten) nach dem Mean-Well-Datenblatt anlegen. Das Symbol nutzt IRM-20, die Pinfolge ist identisch.
- [ ] **Ethernet:** Mit HR911105A läuft nur 10/100 (2 Paare). Für Gigabit wäre eine 4-Paar-MagJack nötig. Mittelanzapfungen sind mit je 100 nF gegen GND belegt, gegen das CM5-Design-Guide prüfen.
- [ ] **Sicherungswert** gegen den Einschaltstrom laut IRM-30-Datenblatt prüfen (T2A angenommen).
- [ ] **LCSC-Nummern** für die JLCPCB-Bestückung ergänzen.
- [ ] **Gehäuse** (Fusion): Klemmen an einer Seite, RJ45 und USB-C zugänglich, Lüfterkanal zum V20.

## 10. Neu erzeugen und prüfen

```bash
python3 hardware/tools/gen_schematic.py          # Schaltplan schreiben
kicad-cli sch export netlist -o /tmp/n.net hardware/kicad/pumpensteuerung.kicad_sch
python3 hardware/tools/check_netlist.py /tmp/n.net hardware/tools/intended_netlist.json
python3 hardware/tools/mini_erc.py               # Treiber-/Versorgungsprüfung
python3 hardware/tools/make_bom.py               # bom.csv
```

Der Schaltplan wird generiert, Änderungen also im Generator vornehmen. Ab dem Layout wird in KiCad direkt weitergearbeitet. Die Dateien sind im KiCad-7-Format, KiCad 8/9 öffnet und konvertiert sie. Im neueren KiCad zusätzlich ERC laufen lassen und *Felder automatisch platzieren*.
