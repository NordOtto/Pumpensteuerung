#!/usr/bin/env python3
"""Erzeugt den KiCad-Schaltplan der Pumpensteuerung (AIO-Platine, ESP32-S3 + ESP32-P4).

Aufruf:  python3 hardware/tools/gen_schematic.py   (schreibt nach hardware/kicad/)
Benötigt die KiCad-Standardbibliotheken unter /usr/share/kicad (KiCad ≥ 7).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
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

d = Design(date="2026-10-20", rev="0.2", company="Brunnensteuerung Wathlingen")

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
pw = d.sheet("Stromversorgung", "power.kicad_sch", "Stromversorgung 230 V → 24 V / 12 V / 5 V / 3,3 V")
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
pw.group("24 V → 5 V / 3 A  (Stamp-P4 + 7\"-Display)")
buck(pw, "BUCK5", "+5V", "24.9k", "10µH", "22µF/16V", 3)
pw.group("5 V → 3,3 V / 2 A  (ESP32-S3, ADC/DAC, RS485, PHY)  +  USB-Versorgung für Werkbank")
pw.add("U", "Regulator_Switching:AP63203WU", "AP63203WU-7", "Package_TO_SOT_SMD:TSOT-23-6",
       {1: "+3V3", 2: "+5V", 3: "+5V", 4: G, 5: "BUCK3_SW", 6: "BUCK3_BST"}, props={"MPN": "AP63203WU-7"})
C(pw, "10µF/16V", "+5V", G, fp=C0805)
C(pw, "100nF", "BUCK3_BST", "BUCK3_SW")
pw.add("L", "Device:L", "4.7µH", "Inductor_SMD:L_Bourns-SRN6028", {1: "BUCK3_SW", 2: "+3V3"},
       props={"MPN": "Bourns SRN6028-4R7M"})
C(pw, "22µF/10V", "+3V3", G, fp=C1210)
C(pw, "22µF/10V", "+3V3", G, fp=C1210)
pw.add("D", "Diode:SS14", "SS14", SMA, {1: "+5V", 2: "USB_S3_VBUS"})
pw.group("24 V → 12 V  (Lüfter)")
buck(pw, "BUCK12", "+12V", "9.09k", "22µH", "22µF/25V", 2)
pw.group("Anzeige & Power-Flags")
R(pw, "2.2k", "+5V", "PWR_LED_A")
LED(pw, "grün PWR", "PWR_LED_A", G)
FLAG(pw, "+5V")
FLAG(pw, "+12V")
FLAG(pw, "+3V3")

# ══ Blatt 2: Steuerung ESP32-S3 ═══════════════════════════════
st = d.sheet("Steuerung_ESP32S3", "ctrl_s3.kicad_sch", "Steuerung: ESP32-S3-WROOM-1 (Regelung, I/O, V20, Sicherheit)")
S3 = {  # Modul-Pin → Netz
    1: G, 40: G, 41: G, 2: "+3V3", 3: "S3_EN",
    27: "S3_IO0", 39: "ADC1_ALERT", 38: "ADC2_ALERT",
    4: "DI1", 5: "DI2", 6: "DI3", 7: "DI4",                    # IO4–IO7
    12: "I2C_SDA", 17: "I2C_SCL",                              # IO8 / IO9
    18: "RELAY1", 19: "RELAY2",                                # IO10 / IO11
    20: "AO_EN", 21: "AO_FAULT",                               # IO12 / IO13
    22: "FAN_PWM", 8: "FAN_TACH",                              # IO14 / IO15
    9: "RS485_DE", 10: "RS485_TX", 11: "RS485_RX",             # IO16 / IO17 / IO18
    13: "USB_S3_DN", 14: "USB_S3_DP",                          # IO19 / IO20
    23: "STATUS_LED", 31: "SERVICE_BTN",                       # IO21 / IO38
    32: "S3_EXP39", 33: "S3_EXP40", 34: "S3_EXP41", 35: "S3_EXP42", 24: "S3_EXP47", 25: "S3_EXP48",
    36: "LINK_P4_TO_S3", 37: "LINK_S3_TO_P4",                  # UART0 RXD0/TXD0 (auch Flash-Port)
}
st.group("ESP32-S3-WROOM-1-N16R8  (IO3/IO45/IO46 = Straps, IO35–37 = Octal-PSRAM → frei lassen)")
st.add("U", "RF_Module:ESP32-S3-WROOM-1", "ESP32-S3-WROOM-1-N16R8", "RF_Module:ESP32-S3-WROOM-1", S3,
       nc=(15, 16, 26, 28, 29, 30), props={"MPN": "ESP32-S3-WROOM-1-N16R8"})
C(st, "10µF", "+3V3", G, fp=C0805)
C(st, "100nF", "+3V3", G)
st.group("Reset / Boot  (auch vom P4 aus steuerbar → P4 kann die Steuerung per OTA flashen)")
R(st, "10k", "+3V3", "S3_EN")
C(st, "1µF", "S3_EN", G)
st.add("SW", "Switch:SW_Push", "RESET S3", BTN, {1: "S3_EN", 2: G})
R(st, "10k", "+3V3", "S3_IO0")
st.add("SW", "Switch:SW_Push", "BOOT S3", BTN, {1: "S3_IO0", 2: G})
NMOS(st, "P4_S3_RST", "S3_EN")
R(st, "100k", "P4_S3_RST", G)
NMOS(st, "P4_S3_BOOT", "S3_IO0")
R(st, "100k", "P4_S3_BOOT", G)
st.group("USB-C  (S3 flashen / Konsole; versorgt die Platine auf der Werkbank ohne 230 V)")
st.add("J", "Connector:USB_C_Receptacle_USB2.0_16P", "USB-C S3", "Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12",
       {"A6": "USB_S3_DP", "B6": "USB_S3_DP", "A7": "USB_S3_DN", "B7": "USB_S3_DN", "A5": "USB_S3_CC1",
        "B5": "USB_S3_CC2", "A4": "USB_S3_VBUS", "A9": "USB_S3_VBUS", "B4": "USB_S3_VBUS", "B9": "USB_S3_VBUS",
        "A8": None, "B8": None, "A1": G, "B1": G, "A12": G, "B12": G, "S1": G})
R(st, "5.1k", "USB_S3_CC1", G)
R(st, "5.1k", "USB_S3_CC2", G)
st.group("Bedienung, LED, I²C-Pull-ups, Erweiterung")
st.add("SW", "Switch:SW_Push", "SERVICE", BTN, {1: "SERVICE_BTN", 2: G})
R(st, "10k", "+3V3", "SERVICE_BTN")
R(st, "470", "STATUS_LED", "STAT_LED_A")
LED(st, "gelb STATUS", "STAT_LED_A", G)
R(st, "4.7k", "+3V3", "I2C_SDA")
R(st, "4.7k", "+3V3", "I2C_SCL")
st.add("J", "Connector_Generic:Conn_01x10", "Erweiterung S3", "Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Vertical",
       {1: "+3V3", 2: "I2C_SDA", 3: "I2C_SCL", 4: "S3_EXP39", 5: "S3_EXP40", 6: "S3_EXP41", 7: "S3_EXP42",
        8: "S3_EXP47", 9: "S3_EXP48", 10: G})

# ══ Blatt 3: HMI / App  ESP32-P4 ══════════════════════════════
hm = d.sheet("HMI_ESP32P4", "hmi_p4.kicad_sch", "App/HMI: M5Stack Stamp-P4, Ethernet (LAN8720A), 7\"-DSI-Touch",
             width=594.0, height=420.0, paper="A2")
from stamp_p4_pins import STAMP_P4, ptypes as p4types  # noqa: E402
sym_p4 = make_conn_symbol("Stamp_P4", STAMP_P4, p4types(), ref="U", value="M5Stack Stamp-P4",
                          fp="PumpCtrl:M5Stack_Stamp-P4")
P4 = {13: G, 38: G, 42: G, 56: G, 59: G, 62: G, 65: G, 14: "+5V",
      6: "TP_SCL", 4: "TP_SDA",
      22: "LINK_P4_TO_S3", 21: "LINK_S3_TO_P4_R", 23: "P4_S3_RST", 20: "P4_S3_BOOT",
      24: "P4_LED", 25: "P4_EXP18", 26: "P4_EXP17", 27: "P4_EXP16",
      34: "P4_EN", 36: "RMII_TXD1", 48: "RMII_TXD1",
      46: "RMII_CLK_P4", 47: "RMII_MDIO", 49: "RMII_TXD0", 50: "RMII_TXEN", 51: "RMII_MDC",
      52: "RMII_CRSDV", 53: "RMII_RXD1", 54: "RMII_RXD0", 55: "PHY_nRST",
      57: "DSI_D0_N", 58: "DSI_D0_P", 60: "DSI_CK_P", 61: "DSI_CK_N", 63: "DSI_D1_N", 64: "DSI_D1_P"}
hm.group("M5Stack Stamp-P4 (ESP32-P4, 16 MB Flash, 32 MB PSRAM) — eigener USB-C am Platinenrand zugänglich")
hm.add("U", sym_p4, "M5Stack Stamp-P4", "PumpCtrl:M5Stack_Stamp-P4", P4, nc_rest=True,
       props={"MPN": "M5Stack S013 Stamp-P4"})
C(hm, "22µF/16V", "+5V", G, fp=C1210)
C(hm, "100nF", "+5V", G)
hm.add("SW", "Switch:SW_Push", "RESET P4", BTN, {1: "P4_EN", 2: G})
hm.add("SW", "Switch:SW_Push", "BOOT P4", BTN, {1: "RMII_TXD1", 2: G})
R(hm, "100", "LINK_S3_TO_P4", "LINK_S3_TO_P4_R")
R(hm, "470", "P4_LED", "P4_LED_A")
LED(hm, "blau APP", "P4_LED_A", G)
hm.add("J", "Connector_Generic:Conn_01x05", "Erweiterung P4", "Connector_PinHeader_2.54mm:PinHeader_1x05_P2.54mm_Vertical",
       {1: "+3V3", 2: "P4_EXP16", 3: "P4_EXP17", 4: "P4_EXP18", 5: G})
hm.group("Ethernet-PHY LAN8720A  (25-MHz-Quarz, REFCLKO 50 MHz → P4)")
hm.add("U", "Interface_Ethernet:LAN8720A", "LAN8720A-CP", "Package_DFN_QFN:VQFN-24-1EP_4x4mm_P0.5mm_EP2.5x2.5mm_ThermalVias",
       {1: "ETH_AVDD", 2: "ETH_LED2", 3: "ETH_LED1", 4: "ETH_XO", 5: "ETH_XI", 6: "ETH_VDDCR",
        7: "RMII_RXD1", 8: "RMII_RXD0", 9: "+3V3", 10: None, 11: "RMII_CRSDV", 12: "RMII_MDIO", 13: "RMII_MDC",
        14: "ETH_REFCLK", 15: "PHY_nRST", 16: "RMII_TXEN", 17: "RMII_TXD0", 18: "RMII_TXD1", 19: "ETH_AVDD",
        20: "ETH_TXN", 21: "ETH_TXP", 22: "ETH_RXN", 23: "ETH_RXP", 24: "ETH_RBIAS", 25: G},
       props={"MPN": "LAN8720A-CP-TR"})
hm.add("FB", "Device:FerriteBead", "600Ω@100MHz", "Inductor_SMD:L_0603_1608Metric", {1: "+3V3", 2: "ETH_AVDD"})
C(hm, "10µF", "ETH_AVDD", G, fp=C0805)
C(hm, "100nF", "ETH_AVDD", G)
C(hm, "100nF", "ETH_AVDD", G)
C(hm, "100nF", "+3V3", G)
C(hm, "1µF", "ETH_VDDCR", G)
C(hm, "470pF", "ETH_VDDCR", G)
R(hm, "12.1k 1%", "ETH_RBIAS", G)
hm.add("Y", "Device:Crystal_GND24", "25MHz 18pF", "Crystal:Crystal_SMD_3225-4Pin_3.2x2.5mm",
       {1: "ETH_XI", 2: G, 3: "ETH_XO", 4: G})
C(hm, "22pF", "ETH_XI", G)
C(hm, "22pF", "ETH_XO", G)
R(hm, "33", "ETH_REFCLK", "RMII_CLK_P4")
R(hm, "1.5k", "+3V3", "RMII_MDIO")
R(hm, "10k", "+3V3", "PHY_nRST")
R(hm, "10k", "ETH_LED2", G)            # nINTSEL = 0 → Pin 14 liefert REFCLKO
for net in ("ETH_TXP", "ETH_TXN", "ETH_RXP", "ETH_RXN"):
    R(hm, "49.9 1%", net, "ETH_AVDD")
hm.add("J", "Connector:RJ45_Hanrun_HR911105A_Horizontal", "HR911105A", "Connector_RJ:RJ45_Hanrun_HR911105A_Horizontal",
       {1: "ETH_TXP", 2: "ETH_TXN", 3: "ETH_RXP", 6: "ETH_RXN", 4: "ETH_AVDD", 5: "ETH_AVDD", 7: None, 8: G,
        9: "ETH_LEDG_A", 10: G, 12: "ETH_LEDY_A", 11: G, "SH": G})
R(hm, "330", "ETH_LED2", "ETH_LEDG_A")
R(hm, "330", "ETH_LED1", "ETH_LEDY_A")
hm.group("7\"-Display: MIPI-DSI 2-Lane, FPC 15-pol. 1,0 mm (Raspberry-Pi-Standard) + 5-V-Versorgung")
hm.add("J", "Connector_Generic_MountingPin:Conn_01x15_MountingPin", "DSI 15p 1.0mm",
       "Connector_FFC-FPC:TE_1-84952-5_1x15-1MP_P1.0mm_Horizontal",
       {1: G, 2: "DSI_D1_N", 3: "DSI_D1_P", 4: G, 5: "DSI_CK_N", 6: "DSI_CK_P", 7: G, 8: "DSI_D0_N",
        9: "DSI_D0_P", 10: G, 11: "TP_SCL", 12: "TP_SDA", 13: G, 14: None, 15: "+3V3", "MP": G},
       props={"MPN": "TE 1-84952-5"})
R(hm, "4.7k", "+3V3", "TP_SCL")
R(hm, "4.7k", "+3V3", "TP_SDA")
hm.add("F", "Device:Polyfuse", "1.1A hold", PTC1812, {1: "+5V", 2: "DISP_5V"}, props={"MPN": "Bourns MF-MSMF110-2"})
hm.add("J", "Connector_Generic:Conn_01x02", "Display 5V", "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical",
       {1: "DISP_5V", 2: G})
C(hm, "22µF/16V", "DISP_5V", G, fp=C1210)
hm.group("Befestigung")
for _ in range(4):
    hm.add("H", "Mechanical:MountingHole", "Gehäuse M3", "MountingHole:MountingHole_3.2mm_M3", {})

# ══ Blatt 4: Analogeingänge ═══════════════════════════════════
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

# ══ Blatt 5: Analogausgänge ═══════════════════════════════════
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

# ══ Blatt 6: Digital-E/A, RS485, Lüfter ═══════════════════════
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
    ("Pumpensteuerung — AIO-Steuerplatine, Rev 0.2 (Entwurf)\n"
     "Ersetzt LOGO! 8.4 + AM2 + Raspberry Pi 3B+. Zwei Controller ohne Linux:\n"
     "  ESP32-S3 = Steuerung (Sensoren, PI-Druckregelung, V20 per RS485, Relais, AO, Trockenlaufschutz)\n"
     "  ESP32-P4 (M5Stack Stamp-P4) = App/HMI (Web-UI, Bewässerung, Wetter, MQTT/HA, 7\"-DSI-Touch, LAN)\n"
     "  Verbindung: UART (S3-UART0 ↔ P4), P4 kann S3 resetten/flashen.\n"
     "Versorgung 230 V AC → IRM-30-24 → 24 V → 12 V (Lüfter) / 5 V (P4, Display) → 3,3 V (S3, Logik).\n"
     "Details, GPIO-Belegung und offene Punkte: hardware/SPEC.md", (25.4, 160.0)),
]

if __name__ == "__main__":
    d.write(OUT, root_notes=ROOT_NOTES)
    import json
    nl = {n: sorted(f"{r}.{p}" for r, p in v) for n, v in d.intended_netlist().items()}
    with open(os.path.join(OUT, "..", "tools", "intended_netlist.json"), "w") as f:
        json.dump(nl, f, indent=1, sort_keys=True)
    print(f"{len(d.parts)} Bauteile, {len(nl)} Netze → {os.path.abspath(OUT)}")
