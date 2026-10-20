#!/usr/bin/env python3
"""Erzeugt den KiCad-Schaltplan der Pumpensteuerung (AIO-Platine mit CM5).

Aufruf:  python3 hardware/tools/gen_schematic.py   (schreibt nach hardware/kicad/)
Benötigt die KiCad-Standardbibliotheken unter /usr/share/kicad (KiCad ≥ 7).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from cm5_pins import CM5_A, CM5_B, gpio_pad, ptypes  # noqa: E402
from schgen import Design, make_conn_symbol  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "kicad")

# ── Footprints ────────────────────────────────────────────────
R0603 = "Resistor_SMD:R_0603_1608Metric"
R1206 = "Resistor_SMD:R_1206_3216Metric"
R2512 = "Resistor_SMD:R_2512_6332Metric"
C0603 = "Capacitor_SMD:C_0603_1608Metric"
C0805 = "Capacitor_SMD:C_0805_2012Metric"
C1210 = "Capacitor_SMD:C_1210_3225Metric"
LED0603 = "LED_SMD:LED_0603_1608Metric"
SOD123 = "Diode_SMD:D_SOD-123"
SMA = "Diode_SMD:D_SMA"
SOT23 = "Package_TO_SOT_SMD:SOT-23"
SOT223 = "Package_TO_SOT_SMD:SOT-223-3_TabPin2"
PTC1206 = "Fuse:Fuse_1206_3216Metric"
PTC1812 = "Fuse:Fuse_1812_4532Metric"
JMP2 = "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical"
TB35 = "TerminalBlock_Phoenix:TerminalBlock_Phoenix_PT-1,5-{n}-3.5-H_1x0{n}_P3.50mm_Horizontal"
TB508 = "TerminalBlock_Phoenix:TerminalBlock_Phoenix_MKDS-1,5-{n}-5.08_1x0{n}_P5.08mm_Horizontal"
BTN = "Button_Switch_SMD:SW_SPST_TL3342"
LBUCK = "Inductor_SMD:L_Bourns_SRP7028A_7.3x6.6mm"

d = Design(date="2026-10-20", rev="0.1", company="Brunnensteuerung Wathlingen")

G = "GND"


def R(sh, val, a, b, fp=R0603, **kw):
    return sh.add("R", "Device:R", val, fp, {1: a, 2: b}, **kw)


def C(sh, val, a, b, fp=C0603, **kw):
    return sh.add("C", "Device:C", val, fp, {1: a, 2: b}, **kw)


def CP(sh, val, plus, minus, fp="Capacitor_SMD:CP_Elec_10x10.5"):
    return sh.add("C", "Device:C_Polarized", val, fp, {1: plus, 2: minus})


def LED(sh, val, anode, cathode):
    return sh.add("D", "Device:LED", val, LED0603, {1: cathode, 2: anode})


def DIODE(sh, cathode, anode, val="1N4148W"):
    return sh.add("D", "Diode:1N4148W", val, SOD123, {1: cathode, 2: anode})


def TVS(sh, val, cathode, anode, lib="Diode:SMAJ26A"):
    return sh.add("D", lib, val, SMA, {1: cathode, 2: anode})


def NMOS(sh, gate, drain, source=G):
    return sh.add("Q", "Transistor_FET:2N7002", "2N7002", SOT23, {1: gate, 2: source, 3: drain})


def TERM(sh, nets, pitch=3.5, val=None):
    n = len(nets)
    fp = (TB35 if pitch == 3.5 else TB508).format(n=n)
    return sh.add("J", f"Connector:Screw_Terminal_01x0{n}", val or f"Klemme {n}p", fp,
                  {i + 1: net for i, net in enumerate(nets)})


def FLAG(sh, net):
    return sh.add("#FLG", "power:PWR_FLAG", "PWR_FLAG", "", {1: net})


def buck(sh, name, vout_net, rfbb, lval, cout_val, cout_n):
    """LMR33630ADDA (400 kHz) 24 V → vout; VFB = 1,0 V, RFBT = 100k."""
    en, fb, vcc, boot, sw = (f"{name}_{s}" for s in ("EN", "FB", "VCC", "BOOT", "SW"))
    sh.add("U", "Regulator_Switching:LMR33630ADDA", "LMR33630ADDA",
           "Package_SO:Texas_HSOP-8-1EP_3.9x4.9mm_P1.27mm_ThermalVias",
           {1: G, 2: "+24V", 3: en, 4: None, 5: fb, 6: vcc, 7: boot, 8: sw, 9: G},
           props={"MPN": "LMR33630ADDAR"})
    for _ in range(2):
        C(sh, "10µF/50V", "+24V", G, fp=C1210)
    C(sh, "100nF/50V", "+24V", G)
    R(sh, "100k", "+24V", en)
    R(sh, "12k", en, G)                      # UVLO ≈ 11 V
    C(sh, "100nF", boot, sw)
    C(sh, "1µF", vcc, G)
    sh.add("L", "Device:L", lval, LBUCK, {1: sw, 2: vout_net},
           props={"MPN": f"Bourns SRP7028A-{'100M' if lval.startswith('10') else '220M'}"})
    for _ in range(cout_n):
        C(sh, cout_val, vout_net, G, fp=C1210)
    R(sh, "100k 1%", vout_net, fb)
    R(sh, f"{rfbb} 1%", fb, G)


# ══ Blatt 1: Stromversorgung ══════════════════════════════════
pw = d.sheet("Stromversorgung", "power.kicad_sch", "Stromversorgung 230 V → 24 V / 12 V / 5 V")
pw.group("230 V AC Eingang  (Netzbereich — Abstand ≥ 6 mm + Frässchlitz zur Niederspannung)")
TERM(pw, ["AC_L_IN", "AC_N"], pitch=5.08, val="230V L/N")
pw.add("F", "Device:Fuse", "T2A 250V 5x20", "Fuse:Fuseholder_Clip-5x20mm_Keystone_3517_Inline_P23.11x6.76mm_D1.70mm_Horizontal",
       {1: "AC_L_IN", 2: "AC_L"})
pw.add("RV", "Device:Varistor", "S10K275", "Varistor:RV_Disc_D12mm_W4.2mm_P7.5mm", {1: "AC_L", 2: "AC_N"})
pw.add("PS", "Converter_ACDC:IRM-20-24", "IRM-30-24", "PumpCtrl:MeanWell_IRM-30",
       {1: "AC_L", 2: "AC_N", 3: G, 4: "+24V"}, props={"MPN": "Mean Well IRM-30-24"})
pw.group("24 V Schiene")
CP(pw, "100µF/50V", "+24V", G)
TVS(pw, "SMAJ30A", "+24V", G, lib="Diode:SMAJ30A")
pw.group("24 V → 5 V / 3 A  (CM5)")
buck(pw, "BUCK5", "+5V", "24.9k", "10µH", "22µF/16V", 3)
pw.group("24 V → 12 V  (Lüfter)")
buck(pw, "BUCK12", "+12V", "9.09k", "22µH", "22µF/25V", 2)
pw.group("Anzeige & Power-Flags")
R(pw, "2.2k", "+5V", "PWR_LED_A")
LED(pw, "grün PWR", "PWR_LED_A", G)
FLAG(pw, "+5V")
FLAG(pw, "+12V")

# ══ Blatt 2: Compute Module 5 ═════════════════════════════════
cm = d.sheet("CM5", "cm5.kicad_sch", "Raspberry Pi Compute Module 5 + Ethernet / USB / Bedienung", width=594.0, height=420.0, paper="A2")
symA = make_conn_symbol("CM5_ConnA", CM5_A, ptypes(CM5_A), ref="J", value="CM5 Stecker A (Pin 1–100)",
                        fp="PumpCtrl:Hirose_DF40C-100DS-0.4V")
symB = make_conn_symbol("CM5_ConnB", CM5_B, ptypes(CM5_B), ref="J", value="CM5 Stecker B (Pin 101–200)",
                        fp="PumpCtrl:Hirose_DF40C-100DS-0.4V")

GPIO = {
    2: "I2C_SDA", 3: "I2C_SCL", 4: "EXP_GPIO4", 5: "DI1", 6: "DI2", 7: "EXP_GPIO7", 8: "EXP_GPIO8",
    9: "EXP_GPIO9", 10: "EXP_GPIO10", 11: "EXP_GPIO11",
    12: "DI3", 13: "DI4", 14: "RS485_TX", 15: "RS485_RX", 17: "RS485_DE",   # GPIO16 frei (CTS0 bei uart0_ctsrts)
    18: "FAN_PWM", 19: "AO_EN", 20: "AO_FAULT", 21: "SERVICE_BTN", 22: "ADC1_ALERT", 23: "FAN_TACH",
    24: "RELAY1", 25: "RELAY2", 26: "STATUS_LED", 27: "ADC2_ALERT",
}
mapA = {}
for pad, name in CM5_A.items():
    if name == "GND":
        mapA[pad] = G
    elif name == "+5V_IN":
        mapA[pad] = "+5V"
    elif name in ("CM5_3V3", "GPIO_VREF"):
        mapA[pad] = "+3V3"
mapA.update({4: "ETH1_P", 6: "ETH1_N", 10: "ETH0_N", 12: "ETH0_P", 15: "ETH_nLED3", 17: "ETH_nLED2",
             20: "EEPROM_nWP", 21: "LED_nACT", 76: "VBAT", 92: "PWR_BTN", 93: "nRPIBOOT"})
for gp, net in GPIO.items():
    mapA[gpio_pad(gp)] = net
mapB = {pad: G for pad, name in CM5_B.items() if name == "GND"}
mapB.update({3: "USB_DN", 5: "USB_DP"})       # CM5-Pin 103 / 105

cm.group("Compute Module 5 (2× Hirose DF40C-100DS-0.4V)")
cm.add("J", symA, "CM5 Stecker A", "PumpCtrl:Hirose_DF40C-100DS-0.4V", mapA, nc_rest=True,
       props={"MPN": "Hirose DF40C-100DS-0.4V(51)"})
cm.add("J", symB, "CM5 Stecker B", "PumpCtrl:Hirose_DF40C-100DS-0.4V", mapB, nc_rest=True,
       props={"MPN": "Hirose DF40C-100DS-0.4V(51)"})
cm.group("Versorgung CM5")
C(cm, "22µF/16V", "+5V", G, fp=C1210)
C(cm, "22µF/16V", "+5V", G, fp=C1210)
C(cm, "100nF", "+3V3", G)
cm.group("Ethernet 10/100 (MagJack, Paar 0/1)")
cm.add("J", "Connector:RJ45_Hanrun_HR911105A_Horizontal", "HR911105A", "Connector_RJ:RJ45_Hanrun_HR911105A_Horizontal",
       {1: "ETH0_P", 2: "ETH0_N", 3: "ETH1_P", 6: "ETH1_N", 4: "ETH_TCT", 5: "ETH_RCT", 7: None, 8: G,
        9: "ETH_LEDG_A", 10: "ETH_nLED2", 12: "ETH_LEDY_A", 11: "ETH_nLED3", "SH": G})
C(cm, "100nF", "ETH_TCT", G)
C(cm, "100nF", "ETH_RCT", G)
R(cm, "330", "+3V3", "ETH_LEDG_A")
R(cm, "330", "+3V3", "ETH_LEDY_A")
cm.group("USB-C (nur Daten: eMMC flashen per rpiboot)")
cm.add("J", "Connector:USB_C_Receptacle_USB2.0_16P", "USB-C", "Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12",
       {"A6": "USB_DP", "B6": "USB_DP", "A7": "USB_DN", "B7": "USB_DN", "A5": "USB_CC1", "B5": "USB_CC2",
        "A4": "USB_VBUS", "A9": "USB_VBUS", "B4": "USB_VBUS", "B9": "USB_VBUS", "A8": None, "B8": None,
        "A1": G, "B1": G, "A12": G, "B12": G, "S1": G})
R(cm, "5.1k", "USB_CC1", G)
R(cm, "5.1k", "USB_CC2", G)
R(cm, "10k", "USB_VBUS", G)
cm.group("Bedienung, RTC-Batterie, LEDs")
cm.add("SW", "Switch:SW_Push", "BOOT (rpiboot)", BTN, {1: "nRPIBOOT", 2: G})
cm.add("SW", "Switch:SW_Push", "POWER", BTN, {1: "PWR_BTN", 2: G})
cm.add("SW", "Switch:SW_Push", "SERVICE", BTN, {1: "SERVICE_BTN", 2: G})
R(cm, "10k", "+3V3", "SERVICE_BTN")
cm.add("JP", "Jumper:Jumper_2_Open", "EEPROM WP", JMP2, {1: "EEPROM_nWP", 2: G})
cm.add("BT", "Device:Battery_Cell", "CR2032", "Battery:BatteryHolder_Keystone_3002_1x2032", {1: "VBAT", 2: G})
R(cm, "1k", "+3V3", "ACT_LED_A")
LED(cm, "grün ACT", "ACT_LED_A", "LED_nACT")
R(cm, "470", "STATUS_LED", "STAT_LED_A")
LED(cm, "gelb STATUS", "STAT_LED_A", G)
cm.group("I²C-Pull-ups & Erweiterungsstecker")
R(cm, "4.7k", "+3V3", "I2C_SDA")
R(cm, "4.7k", "+3V3", "I2C_SCL")
cm.add("J", "Connector_Generic:Conn_01x10", "Erweiterung (I²C/SPI/GPIO)", "Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Vertical",
       {1: "+3V3", 2: "I2C_SDA", 3: "I2C_SCL", 4: "EXP_GPIO4", 5: "EXP_GPIO7", 6: "EXP_GPIO8", 7: "EXP_GPIO9",
        8: "EXP_GPIO10", 9: "EXP_GPIO11", 10: G})
cm.group("Befestigung")
for _ in range(4):
    cm.add("H", "Mechanical:MountingHole_Pad", "CM5 M2.5", "MountingHole:MountingHole_2.7mm_M2.5_Pad_Via", {1: G})
for _ in range(4):
    cm.add("H", "Mechanical:MountingHole", "Gehäuse M3", "MountingHole:MountingHole_3.2mm_M3", {})

# ══ Blatt 3: Analogeingänge ═══════════════════════════════════
ai = d.sheet("Analogeingänge", "analog_in.kicad_sch", "6 × Universal-Analogeingang 0–10 V / 4–20 mA (Jumper)",
             width=594.0, height=420.0, paper="A2")
USE = {1: "Druck 0–10 V", 2: "Durchfluss 4–20 mA", 3: "Wassertemp 4–20 mA", 4: "Regentonne 4–20 mA",
       5: "Reserve", 6: "Reserve"}
for ch in range(1, 7):
    p = f"AI{ch}"
    ai.group(f"{p} — {USE[ch]}   (JP gesteckt = 4–20 mA / 150 Ω, offen = 0–10 V)")
    TERM(ai, [f"{p}_PWR", f"{p}_IN", G], val=f"{p}: +24V / IN / GND")
    ai.add("F", "Device:Polyfuse", "50mA hold", PTC1206, {1: "+24V", 2: f"{p}_PWR"},
           props={"MPN": "Bourns MF-USMF005-2"})
    ai.add("F", "Device:Polyfuse", "50mA hold", PTC1206, {1: f"{p}_IN", 2: f"{p}_NODE"},
           props={"MPN": "Bourns MF-USMF005-2"})
    TVS(ai, "SMAJ26A", f"{p}_IN", G)
    ai.add("JP", "Jumper:Jumper_2_Open", "4-20mA", JMP2, {1: f"{p}_NODE", 2: f"{p}_SH"})
    R(ai, "150 0.1% 1W", f"{p}_SH", G, fp=R2512)
    R(ai, "22k 0.1%", f"{p}_NODE", f"{p}_ADC")
    R(ai, "10k 0.1%", f"{p}_ADC", G)
    C(ai, "10nF", f"{p}_ADC", G)
ai.group("Spannungsüberwachung")
R(ai, "100k 1%", "+24V", "MON_24V")
R(ai, "10k 1%", "MON_24V", G)
C(ai, "100nF", "MON_24V", G)
R(ai, "10k 1%", "+5V", "MON_5V")
R(ai, "10k 1%", "MON_5V", G)
C(ai, "100nF", "MON_5V", G)
ai.group("ADC 1 (0x48: AI1–AI4)  /  ADC 2 (0x49: AI5, AI6, 24V, 5V)")
ai.add("U", "Analog_ADC:ADS1115IDGS", "ADS1115IDGS", "Package_SO:TSSOP-10_3x3mm_P0.5mm",
       {1: G, 2: "ADC1_ALERT", 3: G, 4: "AI1_ADC", 5: "AI2_ADC", 6: "AI3_ADC", 7: "AI4_ADC", 8: "+3V3",
        9: "I2C_SDA", 10: "I2C_SCL"})
C(ai, "100nF", "+3V3", G)
ai.add("U", "Analog_ADC:ADS1115IDGS", "ADS1115IDGS", "Package_SO:TSSOP-10_3x3mm_P0.5mm",
       {1: "+3V3", 2: "ADC2_ALERT", 3: G, 4: "AI5_ADC", 5: "AI6_ADC", 6: "MON_24V", 7: "MON_5V", 8: "+3V3",
        9: "I2C_SDA", 10: "I2C_SCL"})
C(ai, "100nF", "+3V3", G)
R(ai, "10k", "+3V3", "ADC1_ALERT")
R(ai, "10k", "+3V3", "ADC2_ALERT")

# ══ Blatt 4: Analogausgänge ═══════════════════════════════════
ao = d.sheet("Analogausgänge", "analog_out.kicad_sch", "2 × Analogausgang 0/4–20 mA (Dosierpumpe + Reserve)")
ao.group("DAC (I²C 0x60, interne Ref. 2,048 V)  &  Ausgangsfreigabe")
ao.add("U", "Analog_DAC:MCP4728", "MCP4728-E/UN", "Package_SO:MSOP-10_3x3mm_P0.5mm",
       {1: "+3V3", 2: "I2C_SCL", 3: "I2C_SDA", 4: G, 5: None, 6: "AO1_SET", 7: "AO2_SET", 8: None, 9: None, 10: G})
C(ao, "100nF", "+3V3", G)
C(ao, "10µF", "+3V3", G, fp=C0805)
R(ao, "100", "AO_EN", "AO_EN_G")
R(ao, "100k", "AO_EN_G", G)
NMOS(ao, "AO_EN_G", "AO_OD")
R(ao, "10k", "+3V3", "AO_FAULT")
for k in (1, 2):
    p = f"AO{k}"
    ao.group(f"{p} — {'Dosierpumpe' if k == 1 else 'Reserve'}   I = 10 · U_DAC / 1 kΩ  (0…20,48 mA)")
    ao.add("U", "Interface_CurrentLoop:XTR111AxDGQ", "XTR111AIDGQR",
           "Package_SO:MSOP-10-1EP_3x3mm_P0.5mm_EP2.2x3.1mm_Mask1.83x1.89mm_ThermalVias",
           {1: "+24V", 2: f"{p}_IS", 3: f"{p}_VG", 4: f"{p}_REG", 5: f"{p}_REG", 6: f"{p}_SET",
            7: f"{p}_RSET", 8: "AO_FAULT", 9: "AO_OD", 10: G, 11: G})
    C(ao, "100nF/50V", "+24V", G)
    R(ao, "1.00k 0.1%", f"{p}_RSET", G)
    C(ao, "2.2nF", f"{p}_REG", G)
    R(ao, "15", f"{p}_IS", f"{p}_S")
    ao.add("Q", "Transistor_BJT:MMBT3906", "MMBT2907A", SOT23, {1: f"{p}_S", 2: f"{p}_IS", 3: f"{p}_VG"})
    ao.add("Q", "Device:Q_PMOS_GDS", "BSP170P", SOT223, {1: f"{p}_VG", 2: f"{p}_D", 3: f"{p}_S"})
    R(ao, "15", f"{p}_D", f"{p}_OUT")
    C(ao, "10nF/50V", f"{p}_OUT", G)
    DIODE(ao, "+24V", f"{p}_OUT")
    TVS(ao, "SMAJ26A", f"{p}_OUT", G)
    TERM(ao, [f"{p}_OUT", G], val=f"{p}: I+ / GND")

# ══ Blatt 5: Digital-E/A, RS485, Lüfter ═══════════════════════
io = d.sheet("Digital_RS485_Luefter", "io.kicad_sch", "Digitaleingänge, Relais, RS485 (V20), Lüfter",
             width=594.0, height=420.0, paper="A2")
io.group("Digitaleingänge 24 V (Schaltschwelle ≈ 12 V, aktiv = GPIO LOW)")
TERM(io, ["DI_24V", "DI1_IN", "DI2_IN", "DI3_IN", "DI4_IN", G], val="DI: 24V / DI1–DI4 / GND")
io.add("F", "Device:Polyfuse", "200mA hold", PTC1206, {1: "+24V", 2: "DI_24V"}, props={"MPN": "Bourns MF-USMF020-2"})
OPTO_PINS = {1: (1, 2, 16, 15), 2: (3, 4, 14, 13), 3: (5, 6, 12, 11), 4: (7, 8, 10, 9)}
units = {}
for k in range(1, 5):
    a, kk, c, e = OPTO_PINS[k]
    units[k] = {a: f"DI{k}_A", kk: G, c: f"DI{k}", e: G}
for k in range(1, 5):
    io.add("D", "Device:D_Zener", "BZT52C9V1", SOD123, {1: f"DI{k}_IN", 2: f"DI{k}_Z"})
    R(io, "3.3k", f"DI{k}_Z", f"DI{k}_A", fp=R1206)
    DIODE(io, f"DI{k}_A", G)
    R(io, "10k", "+3V3", f"DI{k}")
    C(io, "10nF", f"DI{k}", G)
io.add("U", "Isolator:TLP293-4", "TLP293-4", "Package_SO:SOIC-16_4.55x10.3mm_P1.27mm", units=units)

for k in (1, 2):
    io.group(f"Relais K{k} (230 V / 6 A, potentialfrei)" + ("  — z. B. Freigabe Dosierpumpe" if k == 1 else ""))
    io.add("K", "Relay:FINDER-34.51", "34.51.7.024.0010", "Relay_THT:Relay_SPDT_Finder_34.51_Vertical",
           {"A1": "+24V", "A2": f"RL{k}_COIL", "11": f"RL{k}_COM", "12": f"RL{k}_NC", "14": f"RL{k}_NO"},
           props={"MPN": "Finder 34.51.7.024.0010"})
    DIODE(io, "+24V", f"RL{k}_COIL")
    R(io, "100", f"RELAY{k}", f"RL{k}_G")
    R(io, "100k", f"RL{k}_G", G)
    NMOS(io, f"RL{k}_G", f"RL{k}_COIL")
    R(io, "4.7k", "+24V", f"RL{k}_LED")
    LED(io, f"rot K{k}", f"RL{k}_LED", f"RL{k}_COIL")
    TERM(io, [f"RL{k}_NO", f"RL{k}_COM", f"RL{k}_NC"], pitch=5.08, val=f"K{k}: NO / COM / NC")

io.group("RS485 isoliert → V20 (Modbus RTU, Halbduplex, DE über RTS/GPIO17)")
io.add("U", "Interface_UART:ADM2587E", "ADM2587EBRWZ", "Package_SO:SOIC-20W_7.5x12.8mm_P1.27mm",
       {1: G, 2: "+3V3", 3: G, 4: "RS485_RX", 5: "RS485_DE", 6: "RS485_DE", 7: "RS485_TX", 8: "+3V3",
        9: G, 10: G, 11: "GND_ISO", 12: "VISO", 13: "RS485_A", 14: "GND_ISO", 15: "RS485_B", 16: "GND_ISO",
        17: "RS485_B", 18: "RS485_A", 19: "VISO", 20: "GND_ISO"})
C(io, "10µF", "+3V3", G, fp=C0805)
C(io, "100nF", "+3V3", G)
C(io, "100nF", "+3V3", G)
C(io, "10µF", "VISO", "GND_ISO", fp=C0805)
C(io, "100nF", "VISO", "GND_ISO")
R(io, "10k", "RS485_DE", G)
R(io, "120", "RS485_A", "RS485_T", fp=R1206)
io.add("JP", "Jumper:Jumper_2_Open", "120Ω Abschluss", JMP2, {1: "RS485_T", 2: "RS485_B"})
TVS(io, "SMAJ15CA", "RS485_A", "GND_ISO", lib="Diode:SMAJ15CA")
TVS(io, "SMAJ15CA", "RS485_B", "GND_ISO", lib="Diode:SMAJ15CA")
TERM(io, ["RS485_A", "RS485_B", "GND_ISO"], val="RS485: A(P+) / B(N-) / GND_ISO")
FLAG(io, "GND_ISO")

io.group("Gehäuselüfter 12 V, 4-Pin-PWM (GPIO18, 25 kHz) + Tacho (GPIO23)")
io.add("U", "74xGxx:74LVC1G07", "74LVC1G07", "Package_TO_SOT_SMD:SOT-23-5",
       {1: None, 2: "FAN_PWM", 3: G, 4: "FAN_PWM_OD", 5: "+3V3"})
C(io, "100nF", "+3V3", G)
io.add("J", "Connector_Generic:Conn_01x04", "Lüfter 4-Pin", "Connector:FanPinHeader_1x04_P2.54mm_Vertical",
       {1: G, 2: "+12V", 3: "FAN_TACH_IN", 4: "FAN_PWM_OD"})
R(io, "10k", "+3V3", "FAN_TACH_IN")
R(io, "10k", "FAN_TACH_IN", "FAN_TACH")

ROOT_NOTES = [
    ("Pumpensteuerung — AIO-Steuerplatine, Rev 0.1 (Entwurf)\n"
     "Ersetzt LOGO! 8.4 + AM2 + Raspberry Pi 3B+. Kern: Raspberry Pi Compute Module 5 (eMMC, WLAN).\n"
     "Versorgung 230 V AC → Mean Well IRM-30-24 → 24 V (Sensoren, XTR111, Relais) → 12 V (Lüfter) / 5 V (CM5).\n"
     "Details, GPIO-Belegung und offene Punkte: hardware/SPEC.md", (25.4, 160.0)),
]

if __name__ == "__main__":
    d.write(OUT, root_notes=ROOT_NOTES)
    import json
    nl = {n: sorted(f"{r}.{p}" for r, p in v) for n, v in d.intended_netlist().items()}
    with open(os.path.join(OUT, "..", "tools", "intended_netlist.json"), "w") as f:
        json.dump(nl, f, indent=1, sort_keys=True)
    print(f"{len(d.parts)} Bauteile, {len(nl)} Netze → {os.path.abspath(OUT)}")
