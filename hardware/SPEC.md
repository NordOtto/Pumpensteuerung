# Hardware-Spezifikation: AIO-Steuerplatine Pumpensteuerung

> **Stand:** Rev 0.2, 2026-10-20. Schaltplan netzlistengeprüft, Layout folgt.
> **Ziel:** LOGO! 8.4 + AM2 + Raspberry Pi 3B+ durch **eine** Platine mit ESP32-S3 (Steuerung) und ESP32-P4 (App/HMI mit 7"-Touch, LAN) ersetzen.
> Versorgung direkt mit 230 V, Einbau in ein 3D-gedrucktes Gehäuse.
> Rev 0.1 (Compute Module 5) liegt im Git-Verlauf.

## 1. Überblick

**Architektur (Rev 0.2):** Zwei ESP32, kein Linux.

| Controller | Aufgabe | Muss laufen, damit … |
|---|---|---|
| **ESP32-S3-WROOM-1-N16R8** (Steuerung) | Sensoren (ADS1115), PI-Druckregelung, V20 per Modbus RTU, Trockenlaufschutz, Relais, Dosierpumpe (AO), Lüfter | … der Druck gehalten wird |
| **M5Stack Stamp-P4** (App/HMI) | Web-UI per HTTP im LAN, Bewässerungs-Engine, Wetter (OWM/Ecowitt), MQTT/HA, Presets, Zeitschaltuhr, 7"-Touch (LVGL), OTA für beide | … automatisch bewässert und bedient wird |

Fällt der P4 aus oder wird gerade aktualisiert, regelt der S3 weiter mit den zuletzt gesetzten Sollwerten.

```
230 V AC ─ F1 T2A ─ RV1 ─ IRM-30-24 ─┬─ +24 V ─┬─ Sensorspeisung AI1–6, XTR111, Relais, DI
                                      │         ├─ LMR33630 → +12 V (Lüfter)
                                      │         └─ LMR33630 → +5 V/3 A ─┬─ Stamp-P4 (5VIN), Display (PTC 1,1 A)
                                      │                                  └─ AP63203 → +3V3 (S3, ADC/DAC, RS485, PHY)
USB-C (S3) ─ SS14 ─► +5 V  (Werkbankbetrieb ohne 230 V)

ESP32-S3 ── I²C ── ADS1115 ×2, MCP4728          ESP32-P4 ── RMII ── LAN8720A ── RJ45
         ── UART1 ── ADM2587E ── RS485 ── V20             ── MIPI-DSI 2-Lane ── FPC 15p ── 7"-Display
         ── GPIO ── DI1–4, K1/K2, Lüfter                   ── I²C ── Touch (über FPC)
         ── UART0 ◄═══════ Link (115200+) ═══════► G21/G22, dazu P4→S3 EN/IO0 (Reset/Flash)
```

Schaltplan-Blätter: Stromversorgung, Steuerung_ESP32S3, HMI_ESP32P4, Analogeingänge, Analogausgänge, Digital/RS485/Lüfter.
PDF: `pumpensteuerung_schaltplan.pdf`. Stückliste: `bom.csv`.

## 2. Klemmen

| Klemme (Ref. siehe Schaltplan) | Raster | Belegung | Verwendung |
|---|---|---|---|
| J1 | 5,08 | L / N | 230 V AC Eingang |
| J7–J12 | 3,5 | +24V / IN / GND | AI1–AI6 |
| J13, J14 | 3,5 | I+ / GND | AO1 (Dosierpumpe), AO2 (Reserve) |
| J15 | 3,5 | 24V / DI1 / DI2 / DI3 / DI4 / GND | Digitaleingänge (Schwimmer, Störmeldung …) |
| J16, J17 | 5,08 | NO / COM / NC | Relais K1 (z. B. Freigabe Dosierpumpe), K2 |
| J18 | 3,5 | A / B / GND_ISO | RS485 → V20 (A = P+, B = N−) |
| J19 | 2,54 | 4-Pin-Lüfter | Arctic P9 Max (12 V) |
| Erweiterung S3 | 2,54 | 3V3, SDA, SCL, IO39–42/47/48, GND | Reserve-I/O Steuerung |
| Erweiterung P4 | 2,54 | 3V3, G16–G18, GND | Reserve-I/O App |
| DSI | FPC 1,0 | 15-polig | 7"-Display |
| Display 5V | 2,54 | 5V / GND | Display-Versorgung |
| RJ45 | — | 10/100 Ethernet | LAN |

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

## 4. Pinbelegung

### ESP32-S3 (Steuerung)

| GPIO | Netz | Funktion |
|---|---|---|
| 8 / 9 | I2C_SDA / SCL | ADS1115 0x48 + 0x49, MCP4728 0x60 (4,7k Pull-ups) |
| 17 / 18 / 16 | RS485_TX / RX / DE | UART1 im RS485-Halbduplexmodus (DE = RTS), 10k Pull-down = Empfang |
| 4 / 5 / 6 / 7 | DI1–DI4 | **aktiv LOW** |
| 10 / 11 | RELAY1 / RELAY2 | HIGH = Relais an |
| 12 / 13 | AO_EN / AO_FAULT | AO freigeben / Fehler (LOW) |
| 14 / 15 | FAN_PWM / FAN_TACH | LEDC 25 kHz → 74LVC1G07, Tacho per PCNT |
| 1 / 2 | ADC1_ALERT / ADC2_ALERT | Conversion-Ready |
| 21 | STATUS_LED | gelb |
| 38 | SERVICE_BTN | aktiv LOW |
| 19 / 20 | USB D− / D+ | USB-C: Flashen und Konsole (USB-Serial/JTAG) |
| RXD0 / TXD0 | LINK | UART0 zum P4, gleichzeitig ROM-Bootloader-Port |
| EN / IO0 | — | Taster RESET/BOOT, zusätzlich vom P4 über 2N7002 gesteuert |
| 39–42, 47, 48 | S3_EXP* | Erweiterung J (mit I²C, 3V3, GND) |
| 3, 45, 46, 35–37 | — | frei lassen (Straps / Octal-PSRAM) |

### Stamp-P4 (App/HMI)

| Pad | GPIO | Netz | Funktion |
|---|---|---|---|
| 14 | — | +5V | Versorgung (5VIN) |
| 22 / 21 | G21 / G22 | LINK TX / RX | UART zum S3 (100 Ω in RX) |
| 23 / 20 | G23 / G20 | P4_S3_RST / P4_S3_BOOT | S3 resetten bzw. in den Bootloader → OTA für die Steuerung |
| 6 / 4 | LPG9 / LPG11 | TP_SCL / TP_SDA | Touch-I²C über FPC |
| 24 | G19 | P4_LED | blaue LED |
| 25–27 | G18 / G17 / G16 | P4_EXP* | Erweiterung |
| 46–55 | G32, G36, G35, G41, G33, G31, G28, G30, G29, G52 | RMII | LAN8720A (CLK, MDIO, TXD1, TXD0, TXEN, MDC, CRS_DV, RXD1, RXD0, nRST) |
| 57–64 | — | DSI_* | MIPI-DSI 2 Lanes → FPC |
| 34 / 36 + 48 | EN / G35 | — | Taster RESET / BOOT (G35 ist zugleich RMII_TXD1) |

Der modul-eigene USB-C des Stamp-P4 bleibt der Flash- und Konsolenport des P4. Das Modul deshalb so an den Platinenrand setzen, dass die Buchse (ragt 1,8 mm über) von außen erreichbar ist.

### Ethernet (LAN8720A)

25-MHz-Quarz, Strap `nINTSEL = 0` (10k an LED2) → Pin 14 liefert 50 MHz REFCLKO über 33 Ω an G32. Leitungen mit 4 × 49,9 Ω an die gefilterte 3,3 V (Ferrit). Mittelanzapfungen der MagJack liegen auf derselben Spannung. PHY-Adresse 0, MDIO-Pull-up 1,5k. ESP-IDF-Treiber: `esp_eth_phy_new_lan87xx`.

### Display

FPC 15-polig, 1,0 mm, Raspberry-Pi-Belegung (1 GND, 2/3 D1−/+, 5/6 CK−/+, 8/9 D0−/+, 11 SCL, 12 SDA, 15 3V3). Das Display braucht 5 V zusätzlich über eine separate 2-Pin-Leiste mit PTC 1,1 A. Gedacht ist es für das Waveshare 7-DSI-TOUCH-C (1024 × 600, ESP32-P4-Support). **Vor dem Layout die Pinbelegung am gekauften Display prüfen.**

## 5. Analogausgänge

MCP4728 (interne Referenz 2,048 V) → XTR111 → BSP170P mit PNP-Strombegrenzung (≈ 37 mA).
`I_out = 10 · U_DAC / 1,00 kΩ` → 0…20,48 mA. 4 mA entsprechen DAC-Code 800, 20 mA dem Code 4000.
Beim Booten sind beide Ausgänge über `OD` gesperrt, bis die Software `AO_EN` setzt. Die Bürde darf bis etwa 900 Ω betragen.

## 6. Leistungsbilanz (24 V, worst case)

| Verbraucher | Leistung |
|---|---|
| Stamp-P4 + 7"-Display (5 V, ca. 1,3 A) | 6,5 W / 0,9 ≈ 7,2 W |
| ESP32-S3, ADC/DAC, RS485 iso, PHY (3,3 V, ca. 0,6 A) | 2 W / 0,8 ≈ 2,5 W |
| Lüfter 12 V | 2,7 W |
| 6 × Sensorschleife 22 mA | 3,2 W |
| 2 × AO 20 mA, 2 × Relais | 1,4 W |
| **Summe** | **≈ 17 W** von 30 W (IRM-30-24) |

## 7. Sicherheit

- **230 V:** Gerät der Schutzklasse II, PE ist nicht auf der Platine. Sicherung T2A und Varistor sitzen vor dem IRM-30. Im Layout: ≥ 6 mm Kriechstrecke plus Frässchlitz zwischen Netz- und SELV-Bereich, Netzklemme mit Zugentlastung im Gehäuse.
- **Relaiskontakte** (Finder 34.51) können 230 V schalten. Im Layout gilt für die Kontaktseite derselbe Abstand wie für den Netzbereich.
- **Trockenlaufschutz unabhängig von der Software:** Schwimmer- oder Niveauschalter **direkt** auf einen Freigabe-DI des V20 verdrahten. Zusätzlich V20-Parameter P2014 (Modbus-Timeout) setzen, damit der FU stoppt, wenn der Pi hängt. Die Software-Sperre bleibt als zweite Ebene.
- **Gehäuse:** ASA oder PETG, kein PLA.

## 8. Software

1. **S3-Firmware (neu, ESP-IDF):** Treiber für ADS1115, MCP4728, DI, Relais und Lüfter. Dazu PI-Regelung aus `pressure_ctrl.py`, Modbus-Master zum V20 aus `modbus_rtu.py` und Trockenlaufschutz. Skalierung der AI wie in Abschnitt 3. Läuft autark mit gespeicherten Sollwerten.
2. **Link-Protokoll S3 ↔ P4:** Der S3 sendet zyklisch (z. B. 10 Hz) seinen Zustand, der P4 schickt Kommandos (Sollwert, Start/Stop, Relais, AO, Quittieren). Kompakte Frames mit CRC oder Modbus-RTU-Slave auf dem S3. Der P4 flasht neue S3-Firmware über UART0 + EN/IO0 (`esp-serial-flasher`).
3. **P4-Firmware (Port des Backends):** Logik aus `irrigation.py`, `presets.py`, `timeguard.py`, `weather_provider.py` und `mqtt_client.py`/`ha_discovery.py` nach C/C++ übernehmen. REST + WebSocket mit `esp_http_server`.
4. **Web-UI:** Die bestehende Next.js-UI als statischen Export (`output: 'export'`) aus dem Flash ausliefern, sofern ohne SSR-Abhängigkeiten machbar. Sonst eine schlanke Variante. HTTP im LAN, kein TLS.
5. **Display:** LVGL-Oberfläche mit Druck, Durchfluss, Status, Start/Stop, Quittieren und Bewässerung manuell.
6. **Zeit:** Es gibt keine RTC-Batterie mehr. Zeit per NTP über LAN. Bis zur Synchronisierung keine zeitgesteuerten Starts.

## 9. Offene Punkte vor dem Layout

- [x] **Footprint Stamp-P4:** Der offizielle M5Stack-Footprint liegt unter `kicad/lib/PumpCtrl.pretty/M5Stack_Stamp-P4.kicad_mod`, im KiCad-9-Format mit eingebettetem STEP-Modell, das sich auch für das Gehäuse eignet. Die Pads 1–65 stimmen mit `tools/stamp_p4_pins.py` überein: 19 Pads je Seite im 1,27-mm-Raster, 20 Pads oben im 1,0-mm-Raster (RMII + DSI) und 7 unten. Pad 42 (GND) ist 1 × 4 mm groß. Das Modul wird SMD gelötet, eine Steckmontage ist nicht möglich.
- [ ] **Footprint IRM-30-24** nach dem Mean-Well-Datenblatt anlegen.
- [ ] **Display-Pinbelegung** (FPC und Versorgung) am konkreten 7"-DSI-Display bestätigen.
- [ ] **DSI-Routing:** 100 Ω differentiell, Paare längengleich, so kurz wie möglich vom Modulrand zum FPC.
- [ ] **RMII-Routing:** 50 Ω, PHY direkt an der oberen Modulkante.
- [ ] **Sicherungswert** gegen den IRM-30-Einschaltstrom prüfen. LCSC-Nummern ergänzen.
- [ ] **Gehäuse** (Fusion): Display als Front, Platine dahinter, Klemmen unten, RJ45 und beide USB-C seitlich zugänglich.

## 10. Schaltplan-Stil, neu erzeugen und prüfen

Der Stil entspricht `pool_ui/hardware/pool-pcb`:
- Jede Funktion steht in einem gestrichelten Block mit Titel, die Erläuterungen als Notiz darunter.
- Bauteile sind mit echten Drähten verbunden.
- Versorgung über Power-Symbole, Global-Labels nur für Signale, die einen Block verlassen.
- Kein Block ragt in das Schriftfeld.

```bash
python3 hardware/tools/gen_schematic.py          # Schaltplan schreiben (Platzierung je Block in dieser Datei)
kicad-cli sch export netlist -o /tmp/n.net hardware/kicad/pumpensteuerung.kicad_sch
python3 hardware/tools/check_netlist.py /tmp/n.net hardware/tools/intended_netlist.json   # Zeichnung = Absicht?
python3 hardware/tools/mini_erc.py               # Treiber-/Versorgungsprüfung
python3 hardware/tools/make_bom.py               # bom.csv
```

`tools/schblock.py` setzt Bauteile an feste Koordinaten und zieht die Drähte selbst (L-/Z-Wege um Bauteilkörper, fremde Pins und Drähte herum). Wo kein Weg frei ist, setzt es lokale Labels. Der Netzlistenvergleich findet jeden Zeichenfehler. Bis zum Layout bitte im Generator ändern, danach in KiCad direkt weiterarbeiten. Die Dateien sind im KiCad-7-Format, KiCad 8–10 konvertiert sie beim Öffnen.
