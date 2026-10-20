#!/usr/bin/env python3
"""Erzeugt den KiCad-Schaltplan der Pumpensteuerung (AIO-Platine, ESP32-S3 + ESP32-P4).

Stil wie pool_ui/hardware/pool-pcb: Funktionsblöcke (gestrichelt, Titel), echte Drähte,
Power-Symbole, Global-Labels nur an Blockgrenzen, Notizen unter den Blöcken.

Aufruf:  python3 hardware/tools/gen_schematic.py   (schreibt nach hardware/kicad/)
Prüfen:  check_netlist.py vergleicht die KiCad-Netzliste mit den hier deklarierten Netzen.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from schblock import Design, make_conn_symbol  # noqa: E402
from stamp_p4_pins import STAMP_P4, ptypes as p4types  # noqa: E402

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


# ── Bauteil-Helfer (at = Mittelpunkt; v = senkrecht, h = waagrecht) ──
def R(sh, val, a, b, at, h=False, fp=R0603, **kw):
    """v: Pin a oben, b unten.  h: a links, b rechts."""
    return sh.add("R", "Device:R", val, fp, {1: a, 2: b}, at=at, rot=90 if h else 0, **kw)


def C(sh, val, a, b, at, h=False, fp=C0603, **kw):
    return sh.add("C", "Device:C", val, fp, {1: a, 2: b}, at=at, rot=90 if h else 0, **kw)


def CP(sh, val, plus, minus, at, fp="Capacitor_SMD:CP_Elec_10x10.5"):
    return sh.add("C", "Device:C_Polarized", val, fp, {1: plus, 2: minus}, at=at)


def LEDv(sh, val, anode, cathode, at):
    """senkrecht: Anode oben."""
    return sh.add("D", "Device:LED", val, LED0603, {1: cathode, 2: anode}, at=at, rot=90, val_side="right")


def Dv(sh, cathode, anode, at, val="1N4148W"):
    """Diode senkrecht, Kathode oben."""
    return sh.add("D", "Diode:1N4148W", val, SOD123, {1: cathode, 2: anode}, at=at, rot=270, val_side="right")


def TVSv(sh, val, top, bottom, at, lib="Diode:SMAJ26A"):
    return sh.add("D", lib, val, SMA, {1: top, 2: bottom}, at=at, rot=270, val_side="right")


def NMOS(sh, gate, drain, source, at):
    return sh.add("Q", "Transistor_FET:2N7002", "2N7002", SOT23, {1: gate, 2: source, 3: drain}, at=at,
                  val_side="right")


def SWv(sh, val, top, bottom, at):
    return sh.add("SW", "Switch:SW_Push", val, BTN, {1: top, 2: bottom}, at=at, rot=270, val_side="right")


def PTCv(sh, val, top, bottom, at, fp=PTC1206, mpn=None):
    return sh.add("F", "Device:Polyfuse", val, fp, {1: top, 2: bottom}, at=at, props={"MPN": mpn} if mpn else None)


def TERM(sh, nets, at, pitch=3.5, val=None, right=True):
    """Klemme; right=True → Anschlüsse zeigen nach rechts (Klemme sitzt links im Block)."""
    n = len(nets)
    fp = (TB35 if pitch == 3.5 else TB508).format(n=n)
    return sh.add("J", f"Connector:Screw_Terminal_01x0{n}", val or f"Klemme {n}p", fp,
                  {i + 1: net for i, net in enumerate(nets)}, at=at, mirror=right, val_side="below")


def buck(sh, name, vout, rfbb, lval, cout_val, cout_n, x, y):
    """LMR33630ADDA (400 kHz), VFB = 1,0 V, RFBT = 100k. (x, y) = linke obere Blockecke."""
    en, fb, vcc, boot, sw = (f"{name}_{s}" for s in ("EN", "FB", "VCC", "BOOT", "SW"))
    ux, uy = x + 70, y + 30
    sh.add("U", "Regulator_Switching:LMR33630ADDA", "LMR33630ADDA",
           "Package_SO:Texas_HSOP-8-1EP_3.9x4.9mm_P1.27mm_ThermalVias",
           {1: G, 2: "+24V", 3: en, 4: None, 5: fb, 6: vcc, 7: boot, 8: sw, 9: G}, at=(ux, uy),
           props={"MPN": "LMR33630ADDAR"})
    C(sh, "10µ/50V", "+24V", G, (x + 8, uy + 2), fp=C1210)
    C(sh, "10µ/50V", "+24V", G, (x + 21, uy + 2), fp=C1210)
    C(sh, "100n/50V", "+24V", G, (x + 34, uy + 2))
    R(sh, "100k", "+24V", en, (x + 48, uy - 8))
    R(sh, "12k", en, G, (x + 48, uy + 12))
    C(sh, "1µ", vcc, G, (x + 57, uy + 16))
    C(sh, "100nF", boot, sw, (ux + 18, uy - 14), h=True)
    sh.add("L", "Device:L", lval, LBUCK, {1: sw, 2: vout}, at=(ux + 32, uy - 2.54), rot=90,
           props={"MPN": f"Bourns SRP7028A-{'100M' if lval.startswith('10') else '220M'}"}, val_side="below")
    R(sh, "100k 1%", vout, fb, (ux + 24, uy + 8))
    R(sh, f"{rfbb} 1%", fb, G, (ux + 24, uy + 22))
    for i in range(cout_n):
        C(sh, cout_val, vout, G, (ux + 50 + 13 * i, uy + 4), fp=C1210)


# ══ Blatt: Stromversorgung ════════════════════════════════════
pw = d.sheet("Stromversorgung", "power.kicad_sch", "Stromversorgung 230 V / 24 V / 12 V / 5 V / 3,3 V",
             "230 V AC → IRM-30-24 → 24 V; daraus 12 V (Lüfter), 5 V (P4, Display), 3,3 V (S3, Logik)")
pw.box("Netzeingang 230 V AC", 15, 25, 80, 75,
       note="F1 T2A träge (5×20) vor dem Netzteil, RV1 275 VAC gegen Netzspitzen.\n"
            "Netzbereich: ≥ 6 mm Kriechstrecke + Frässchlitz zur Kleinspannung.")
TERM(pw, ["AC_L_IN", "AC_N"], (25, 45), pitch=5.08, val="230V L/N")
pw.add("F", "Device:Fuse", "T2A 250V", "Fuse:Fuseholder_Clip-5x20mm_Keystone_3517_Inline_P23.11x6.76mm_D1.70mm_Horizontal",
       {1: "AC_L_IN", 2: "AC_L"}, at=(45, 45), rot=90, val_side="below")
pw.add("RV", "Device:Varistor", "S10K275", "Varistor:RV_Disc_D12mm_W4.2mm_P7.5mm", {1: "AC_L", 2: "AC_N"}, at=(62, 52))
pw.lab("AC_L", 78, 45, 0)
pw.lab("AC_N", 78, 62, 0)
pw.box("Netzteil 24 V / 30 W", 95, 25, 160, 75)
pw.add("PS", "Converter_ACDC:IRM-20-24", "IRM-30-24", "PumpCtrl:MeanWell_IRM-30",
       {1: "AC_L", 2: "AC_N", 3: G, 4: "+24V"}, at=(128, 47.54), props={"MPN": "Mean Well IRM-30-24"})
pw.lab("AC_L", 100, 45, 180)
pw.lab("AC_N", 100, 62, 180)
pw.pwr_flag("AC_L", 112, 35)
pw.pwr_flag("AC_N", 112, 68)
pw.box("24-V-Schiene", 175, 25, 245, 75, note="C1 Pufferung, D1 SMAJ30A gegen Überspannung auf 24 V.")
CP(pw, "100µF/50V", "+24V", G, (190, 50))
TVSv(pw, "SMAJ30A", "+24V", G, (205, 50), lib="Diode:SMAJ30A")
pw.pwr_flag("+24V", 225, 42)

pw.box("24 V → 5 V / 3 A  (Stamp-P4 + 7\"-Display)", 15, 95, 245, 170,
       note="LMR33630 400 kHz. U = 1 V · (1 + 100k / 24,9k) = 5,0 V. EN-Teiler: Einschalten ab ≈ 11 V.")
buck(pw, "BUCK5", "+5V", "24.9k", "10µH", "22µ/16V", 3, 15, 100)
pw.box("24 V → 12 V  (Gehäuselüfter)", 15, 195, 245, 270,
       note="U = 1 V · (1 + 100k / 9,09k) = 12,0 V.")
buck(pw, "BUCK12", "+12V", "9.09k", "22µH", "22µ/25V", 2, 15, 200)

pw.box("5 V → 3,3 V / 2 A", 265, 95, 405, 170,
       note="AP63203 (Festspannung 3,3 V) für ESP32-S3, ADS1115, MCP4728, ADM2587E, LAN8720A.\n"
            "D2 SS14: USB-C des S3 versorgt die Platine auf der Werkbank (ohne 230 V).")
pw.add("U", "Regulator_Switching:AP63203WU", "AP63203WU-7", "Package_TO_SOT_SMD:TSOT-23-6",
       {1: "+3V3", 2: "+5V", 3: "+5V", 4: G, 5: "BUCK3_SW", 6: "BUCK3_BST"}, at=(320, 125), props={"MPN": "AP63203WU-7"})
C(pw, "10µF/16V", "+5V", G, (290, 128), fp=C0805)
C(pw, "100nF", "BUCK3_BST", "BUCK3_SW", (338, 112), h=True)
pw.add("L", "Device:L", "4.7µH", "Inductor_SMD:L_Bourns-SRN6028", {1: "BUCK3_SW", 2: "+3V3"}, at=(355, 122.46), rot=90,
       props={"MPN": "Bourns SRN6028-4R7M"}, val_side="below")
C(pw, "22µF/10V", "+3V3", G, (375, 128), fp=C1210)
C(pw, "22µF/10V", "+3V3", G, (385, 128), fp=C1210)
pw.add("D", "Diode:SS14", "SS14", SMA, {1: "+5V", 2: "USB_S3_VBUS"}, at=(300, 152), val_side="below")
pw.box("Betriebsanzeige & Power-Flags", 265, 195, 405, 250)
R(pw, "2.2k", "+5V", "PWR_LED_A", (280, 212))
LEDv(pw, "grün PWR", "PWR_LED_A", G, (280, 228))
pw.pwr_flag("+5V", 310, 215)
pw.pwr_flag("+12V", 335, 215)
pw.pwr_flag("+3V3", 360, 215)

# ══ Blatt: Steuerung ESP32-S3 ═════════════════════════════════
st = d.sheet("Steuerung_ESP32S3", "ctrl_s3.kicad_sch", "Steuerung: ESP32-S3-WROOM-1",
             "Regelung, I/O, V20 per RS485, Sicherheit — läuft autark")
S3 = {
    1: G, 40: G, 41: G, 2: "+3V3", 3: "S3_EN",
    27: "S3_IO0", 39: "ADC1_ALERT", 38: "ADC2_ALERT",
    4: "DI1", 5: "DI2", 6: "DI3", 7: "DI4",
    12: "I2C_SDA", 17: "I2C_SCL", 18: "RELAY1", 19: "RELAY2", 20: "AO_EN", 21: "AO_FAULT",
    22: "FAN_PWM", 8: "FAN_TACH", 9: "RS485_DE", 10: "RS485_TX", 11: "RS485_RX",
    13: "USB_S3_DN", 14: "USB_S3_DP", 23: "STATUS_LED", 31: "SERVICE_BTN",
    32: "S3_EXP39", 33: "S3_EXP40", 34: "S3_EXP41", 35: "S3_EXP42", 24: "S3_EXP47", 25: "S3_EXP48",
    36: "LINK_P4_TO_S3", 37: "LINK_S3_TO_P4",
}
st.box("ESP32-S3-WROOM-1-N16R8", 100, 25, 230, 150,
       note="IO3/IO45/IO46 = Strapping, IO35–37 = Octal-PSRAM → frei.\n"
            "UART0 (RXD0/TXD0) = Link zum P4 und zugleich Flash-Port → P4 kann den S3 per OTA flashen.")
st.add("U", "RF_Module:ESP32-S3-WROOM-1", "ESP32-S3-WROOM-1-N16R8", "RF_Module:ESP32-S3-WROOM-1", S3,
       at=(165, 90), nc=(15, 16, 26, 28, 29, 30), props={"MPN": "ESP32-S3-WROOM-1-N16R8"})
C(st, "10µF", "+3V3", G, (125, 45), fp=C0805)
C(st, "100nF", "+3V3", G, (135, 45))

st.box("Reset / Boot  (Taster + vom P4 steuerbar)", 15, 25, 85, 150,
       note="P4_S3_RST / P4_S3_BOOT = HIGH zieht EN bzw. IO0 auf GND.")
R(st, "10k", "+3V3", "S3_EN", (22, 45))
C(st, "1µ", "S3_EN", G, (32, 58))
SWv(st, "RESET", "S3_EN", G, (44, 58))
NMOS(st, "P4_S3_RST", "S3_EN", G, (72, 62))
R(st, "100k", "P4_S3_RST", G, (62, 75))
st.lab("P4_S3_RST", 52, 82, 180)
st.lab("S3_EN", 80, 49, 0)
R(st, "10k", "+3V3", "S3_IO0", (22, 95))
SWv(st, "BOOT", "S3_IO0", G, (44, 108))
NMOS(st, "P4_S3_BOOT", "S3_IO0", G, (72, 112))
R(st, "100k", "P4_S3_BOOT", G, (62, 125))
st.lab("P4_S3_BOOT", 52, 132, 180)
st.lab("S3_IO0", 80, 99, 0)
st.lab("S3_EN", 105, 67.14, 180)
st.lab("S3_IO0", 105, 72.22, 180)

st.box("USB-C  (Flashen, Konsole, Werkbank-Versorgung)", 15, 175, 125, 265)
st.add("J", "Connector:USB_C_Receptacle_USB2.0_16P", "USB-C S3", "Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12",
       {"A6": "USB_S3_DP", "B6": "USB_S3_DP", "A7": "USB_S3_DN", "B7": "USB_S3_DN", "A5": "USB_S3_CC1",
        "B5": "USB_S3_CC2", "A4": "USB_S3_VBUS", "A9": "USB_S3_VBUS", "B4": "USB_S3_VBUS", "B9": "USB_S3_VBUS",
        "A8": None, "B8": None, "A1": G, "B1": G, "A12": G, "B12": G, "S1": G}, at=(40, 215))
R(st, "5.1k", "USB_S3_CC1", G, (80, 222))
R(st, "5.1k", "USB_S3_CC2", G, (90, 222))

st.box("Bedienung & Status", 140, 175, 230, 265)
SWv(st, "SERVICE", "SERVICE_BTN", G, (155, 215))
R(st, "10k", "+3V3", "SERVICE_BTN", (165, 195))
R(st, "470", "STATUS_LED", "STAT_LED_A", (200, 200))
LEDv(st, "gelb STATUS", "STAT_LED_A", G, (200, 218))

st.box("I²C-Pull-ups & Erweiterung", 245, 175, 405, 250)
R(st, "4.7k", "+3V3", "I2C_SDA", (260, 195))
R(st, "4.7k", "+3V3", "I2C_SCL", (270, 195))
st.add("J", "Connector_Generic:Conn_01x10", "Erweiterung S3", "Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Vertical",
       {1: "+3V3", 2: "I2C_SDA", 3: "I2C_SCL", 4: "S3_EXP39", 5: "S3_EXP40", 6: "S3_EXP41", 7: "S3_EXP42",
        8: "S3_EXP47", 9: "S3_EXP48", 10: G}, at=(330, 205))

# ══ Blatt: App / HMI ESP32-P4 ═════════════════════════════════
hm = d.sheet("HMI_ESP32P4", "hmi_p4.kicad_sch", "App/HMI: Stamp-P4, Ethernet, 7\"-Display",
             "Web-UI, Bewässerung, Wetter, MQTT/HA, LVGL-Touch")
LEFT = [14, 15, 39, 28, None, 34, 36, 33, None, 22, 21, 23, 20, None, 6, 4, None, 24, 25, 26, 27, None,
        30, 32, 31, None, 1, 2, 3, 5, 7, 8, 9, 10, 11, 12, 16, 17, 18, 19, None, 13, 38, 42, 56]
RIGHT = [46, 47, 48, 49, 50, 51, 52, 53, 54, 55, None, 57, 58, 60, 61, 63, 64, None, 59, 62, 65, None,
         40, 41, 43, 44, 45, 29, 35, 37]
sym_p4 = make_conn_symbol("Stamp_P4", STAMP_P4, p4types(), ref="U", value="M5Stack Stamp-P4",
                          fp="PumpCtrl:M5Stack_Stamp-P4", left=LEFT, right=RIGHT, width=33.02)
P4 = {13: G, 38: G, 42: G, 56: G, 59: G, 62: G, 65: G, 14: "+5V",
      6: "TP_SCL", 4: "TP_SDA",
      22: "LINK_P4_TO_S3", 21: "LINK_S3_TO_P4_R", 23: "P4_S3_RST", 20: "P4_S3_BOOT",
      24: "P4_LED", 25: "P4_EXP18", 26: "P4_EXP17", 27: "P4_EXP16",
      34: "P4_EN", 36: "RMII_TXD1", 48: "RMII_TXD1",
      46: "RMII_CLK_P4", 47: "RMII_MDIO", 49: "RMII_TXD0", 50: "RMII_TXEN", 51: "RMII_MDC",
      52: "RMII_CRSDV", 53: "RMII_RXD1", 54: "RMII_RXD0", 55: "PHY_nRST",
      57: "DSI_D0_N", 58: "DSI_D0_P", 60: "DSI_CK_P", 61: "DSI_CK_N", 63: "DSI_D1_N", 64: "DSI_D1_P"}
hm.box("M5Stack Stamp-P4  (ESP32-P4, 16 MB Flash, 32 MB PSRAM)", 120, 25, 240, 268,
       note="Modul wird aufgelötet (RMII + DSI nur an den Randpads oben).\n"
            "Eigener USB-C des Moduls = Flash/Konsole P4 → an den Platinenrand setzen.")
hm.add("U", sym_p4, "M5Stack Stamp-P4", "PumpCtrl:M5Stack_Stamp-P4", P4, at=(180, 145), nc_rest=True,
       props={"MPN": "M5Stack S013 Stamp-P4"})
C(hm, "22µF/16V", "+5V", G, (135, 45), fp=C1210)
C(hm, "100nF", "+5V", G, (145, 45))

hm.box("Bedienung, Link zum S3, Erweiterung", 15, 25, 100, 160,
       note="BOOT P4 liegt auf G35 (= RMII_TXD1), nur beim Reset drücken.")
SWv(hm, "RESET P4", "P4_EN", G, (25, 45))
SWv(hm, "BOOT P4", "RMII_TXD1", G, (50, 45))
R(hm, "100", "LINK_S3_TO_P4", "LINK_S3_TO_P4_R", (55, 75), h=True)
R(hm, "470", "P4_LED", "P4_LED_A", (30, 95))
LEDv(hm, "blau APP", "P4_LED_A", G, (30, 112))
hm.add("J", "Connector_Generic:Conn_01x05", "Erweiterung P4", "Connector_PinHeader_2.54mm:PinHeader_1x05_P2.54mm_Vertical",
       {1: "+3V3", 2: "P4_EXP16", 3: "P4_EXP17", 4: "P4_EXP18", 5: G}, at=(85, 120))

hm.box("Ethernet 10/100  (LAN8720A, 25-MHz-Quarz, REFCLKO 50 MHz → P4)", 255, 25, 410, 165,
       note="nINTSEL = 0 (R an LED2) → Pin 14 liefert 50 MHz Referenztakt. PHY-Adresse 0.\n"
            "4 × 49,9 Ω an ETH_AVDD (gefiltert über FB1), Mittelanzapfungen ebenfalls an ETH_AVDD.")
hm.add("U", "Interface_Ethernet:LAN8720A", "LAN8720A-CP", "Package_DFN_QFN:VQFN-24-1EP_4x4mm_P0.5mm_EP2.5x2.5mm_ThermalVias",
       {1: "ETH_AVDD", 2: "ETH_LED2", 3: "ETH_LED1", 4: "ETH_XO", 5: "ETH_XI", 6: "ETH_VDDCR",
        7: "RMII_RXD1", 8: "RMII_RXD0", 9: "+3V3", 10: None, 11: "RMII_CRSDV", 12: "RMII_MDIO", 13: "RMII_MDC",
        14: "ETH_REFCLK", 15: "PHY_nRST", 16: "RMII_TXEN", 17: "RMII_TXD0", 18: "RMII_TXD1", 19: "ETH_AVDD",
        20: "ETH_TXN", 21: "ETH_TXP", 22: "ETH_RXN", 23: "ETH_RXP", 24: "ETH_RBIAS", 25: G},
       at=(310, 95), props={"MPN": "LAN8720A-CP-TR"})
hm.add("FB", "Device:FerriteBead", "600Ω@100MHz", "Inductor_SMD:L_0603_1608Metric", {1: "+3V3", 2: "ETH_AVDD"},
       at=(265, 45), val_side="right")
C(hm, "10µ", "ETH_AVDD", G, (350, 40), fp=C0805)
C(hm, "100n", "ETH_AVDD", G, (360, 40))
C(hm, "100n", "+3V3", G, (296, 45))
C(hm, "1µ", "ETH_VDDCR", G, (318, 45))
C(hm, "470p", "ETH_VDDCR", G, (328, 45))
hm.pwr_flag("ETH_VDDCR", 338, 38)
hm.pwr_flag("ETH_AVDD", 375, 40)
R(hm, "12.1k 1%", "ETH_RBIAS", G, (336, 108))
hm.add("Y", "Device:Crystal_GND24", "25MHz", "Crystal:Crystal_SMD_3225-4Pin_3.2x2.5mm",
       {1: "ETH_XI", 2: G, 3: "ETH_XO", 4: G}, at=(275, 135), val_side="right")
C(hm, "22p", "ETH_XI", G, (264, 145))
C(hm, "22p", "ETH_XO", G, (287, 145))
R(hm, "33", "RMII_CLK_P4", "ETH_REFCLK", (277, 107.7), h=True)
R(hm, "1.5k", "+3V3", "RMII_MDIO", (284, 60))
R(hm, "10k", "+3V3", "PHY_nRST", (278, 60))
R(hm, "10k", "ETH_LED2", G, (348, 118))
for net, y in (("RMII_TXD0", 79.76), ("RMII_TXD1", 82.3), ("RMII_TXEN", 84.84), ("RMII_RXD0", 87.38),
               ("RMII_RXD1", 89.92), ("RMII_CRSDV", 95), ("RMII_MDIO", 97.54), ("RMII_MDC", 100.08),
               ("PHY_nRST", 105.16)):
    hm.lab(net, 270, y, 180)
hm.lab("RMII_CLK_P4", 262, 107.7, 180)
for i, net in enumerate(("ETH_TXP", "ETH_TXN", "ETH_RXP", "ETH_RXN")):
    R(hm, "49.9", "ETH_AVDD", net, (335 + 6 * i, 68))
hm.add("J", "Connector:RJ45_Hanrun_HR911105A_Horizontal", "HR911105A", "Connector_RJ:RJ45_Hanrun_HR911105A_Horizontal",
       {1: "ETH_TXP", 2: "ETH_TXN", 3: "ETH_RXP", 6: "ETH_RXN", 4: "ETH_AVDD", 5: "ETH_AVDD", 7: None, 8: G,
        9: "ETH_LEDG_A", 10: G, 12: "ETH_LEDY_A", 11: G, "SH": G}, at=(380, 89.92))
R(hm, "330", "ETH_LED1", "ETH_LEDY_A", (365, 125), h=True)
R(hm, "330", "ETH_LED2", "ETH_LEDG_A", (365, 135), h=True)

hm.box("7\"-Display  (MIPI-DSI 2-Lane, FPC 15-pol. 1,0 mm, Raspberry-Pi-Belegung)", 255, 180, 410, 252,
       note="Touch-I²C über FPC (Pin 11/12). Display-Logik 3,3 V über Pin 15, Hintergrundbeleuchtung 5 V separat.\n"
            "DSI-Paare 100 Ω differentiell, so kurz wie möglich.")
hm.add("J", "Connector_Generic_MountingPin:Conn_01x15_MountingPin", "DSI 15p 1.0mm",
       "Connector_FFC-FPC:TE_1-84952-5_1x15-1MP_P1.0mm_Horizontal",
       {1: G, 2: "DSI_D1_N", 3: "DSI_D1_P", 4: G, 5: "DSI_CK_N", 6: "DSI_CK_P", 7: G, 8: "DSI_D0_N",
        9: "DSI_D0_P", 10: G, 11: "TP_SCL", 12: "TP_SDA", 13: G, 14: None, 15: "+3V3", "MP": G},
       at=(300, 218), props={"MPN": "TE 1-84952-5"})
R(hm, "4.7k", "+3V3", "TP_SCL", (320, 195))
R(hm, "4.7k", "+3V3", "TP_SDA", (328, 195))
PTCv(hm, "1.1A hold", "+5V", "DISP_5V", (360, 205), fp=PTC1812, mpn="Bourns MF-MSMF110-2")
C(hm, "22µ/16V", "DISP_5V", G, (372, 225), fp=C1210)
hm.add("J", "Connector_Generic:Conn_01x02", "Display 5V", "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical",
       {1: "DISP_5V", 2: G}, at=(395, 220))
hm.box("Befestigung", 15, 185, 100, 230)
for i in range(4):
    hm.add("H", "Mechanical:MountingHole", "M3", "MountingHole:MountingHole_3.2mm_M3", {}, at=(30 + 18 * i, 205))

# ══ Blatt: Analogeingänge ═════════════════════════════════════
ai = d.sheet("Analogeingänge", "analog_in.kicad_sch", "Analogeingänge 6 × 0–10 V / 4–20 mA",
             "Jumper gesteckt = 4–20 mA (150 Ω), offen = 0–10 V; Teiler 22k/10k → ADS1115")
USE = {1: "Druck 0–10 V", 2: "Durchfluss 4–20 mA", 3: "Wassertemp 4–20 mA", 4: "Regentonne 4–20 mA",
       5: "Reserve", 6: "Reserve"}


def ai_channel(ch, ox, oy):
    p = f"AI{ch}"
    ai.box(f"{p} — {USE[ch]}", ox, oy, ox + 90, oy + 58,
           note="JP gesteckt: 4–20 mA → 150 Ω.  JP offen: 0–10 V.\nPTC 50 mA in Speisung und Eingang, TVS SMAJ26A."
           if ch == 1 else None)
    TERM(ai, [f"{p}_PWR", f"{p}_IN", G], (ox + 8, oy + 25), val=f"{p}")
    PTCv(ai, "50mA", "+24V", f"{p}_PWR", (ox + 22, oy + 12), mpn="Bourns MF-USMF005-2")
    ai.add("F", "Device:Polyfuse", "50mA", PTC1206, {1: f"{p}_IN", 2: f"{p}_NODE"}, at=(ox + 32, oy + 25), rot=90,
           props={"MPN": "Bourns MF-USMF005-2"}, val_side="below")
    TVSv(ai, "SMAJ26A", f"{p}_IN", G, (ox + 22, oy + 40))
    ai.add("JP", "Jumper:Jumper_2_Open", "4-20mA", JMP2, {1: f"{p}_NODE", 2: f"{p}_SH"}, at=(ox + 44, oy + 34), rot=270,
           val_side="right")
    R(ai, "150 0.1% 1W", f"{p}_SH", G, (ox + 44, oy + 48), fp=R2512)
    R(ai, "22k 0.1%", f"{p}_NODE", f"{p}_ADC", (ox + 58, oy + 25), h=True)
    R(ai, "10k 0.1%", f"{p}_ADC", G, (ox + 66, oy + 35))
    C(ai, "10n", f"{p}_ADC", G, (ox + 80, oy + 35))
    ai.lab(f"{p}_ADC", ox + 88, oy + 25, 0)


for i, ch in enumerate(range(1, 7)):
    col, row = i % 2, i // 2
    ai_channel(ch, 15 + col * 105, 25 + row * 85)
ai.box("ADC  ADS1115 × 2  (I²C 0x48 / 0x49)", 235, 25, 405, 175,
       note="ADC1: AI1–AI4.  ADC2: AI5, AI6, 24-V- und 5-V-Überwachung.\n"
            "4–20 mA: PGA ±1,024 V (20 mA → 0,9375 V).  0–10 V: PGA ±4,096 V (10 V → 3,125 V).")
for k, (y, addr, ins) in enumerate(((60, G, ("AI1_ADC", "AI2_ADC", "AI3_ADC", "AI4_ADC")),
                                    (130, "+3V3", ("AI5_ADC", "AI6_ADC", "MON_24V", "MON_5V")))):
    alert = f"ADC{k + 1}_ALERT"
    ai.add("U", "Analog_ADC:ADS1115IDGS", "ADS1115IDGS", "Package_SO:TSSOP-10_3x3mm_P0.5mm",
           {1: addr, 2: alert, 3: G, 4: ins[0], 5: ins[1], 6: ins[2], 7: ins[3], 8: "+3V3",
            9: "I2C_SDA", 10: "I2C_SCL"}, at=(290, y))
    C(ai, "100nF", "+3V3", G, (270, y - 18))
    R(ai, "10k", "+3V3", alert, (320, y - 14))
ai.box("Versorgungsüberwachung", 235, 192, 405, 245,
       note="MON_24V = 24 V / 11 (2,18 V), MON_5V = 5 V / 2 (2,5 V).")
R(ai, "100k 1%", "+24V", "MON_24V", (255, 207))
R(ai, "10k 1%", "MON_24V", G, (255, 225))
C(ai, "100n", "MON_24V", G, (270, 225))
R(ai, "10k 1%", "+5V", "MON_5V", (320, 207))
R(ai, "10k 1%", "MON_5V", G, (320, 225))
C(ai, "100n", "MON_5V", G, (335, 225))

# ══ Blatt: Analogausgänge ═════════════════════════════════════
ao = d.sheet("Analogausgänge", "analog_out.kicad_sch", "Analogausgänge 2 × 0/4–20 mA",
             "MCP4728 → XTR111 → BSP170P; I = 10 · U_DAC / 1 kΩ")
ao.box("DAC  MCP4728  (I²C 0x60, int. Ref. 2,048 V)", 15, 25, 130, 95,
       note="4 mA = Code 800, 20 mA = Code 4000.")
ao.add("U", "Analog_DAC:MCP4728", "MCP4728-E/UN", "Package_SO:MSOP-10_3x3mm_P0.5mm",
       {1: "+3V3", 2: "I2C_SCL", 3: "I2C_SDA", 4: G, 5: None, 6: "AO1_SET", 7: "AO2_SET", 8: None, 9: None, 10: G},
       at=(70, 60))
C(ao, "100nF", "+3V3", G, (30, 45))
C(ao, "10µF", "+3V3", G, (40, 45), fp=C0805)
ao.box("Ausgangsfreigabe & Fehlermeldung", 15, 120, 130, 190,
       note="AO_EN LOW (Boot, Absturz) → OD = HIGH → beide Ausgänge 0 mA.\nAO_FAULT LOW = Drahtbruch / Bürde zu hoch.")
R(ao, "100", "AO_EN", "AO_EN_G", (40, 145), h=True)
R(ao, "100k", "AO_EN_G", G, (52, 160))
NMOS(ao, "AO_EN_G", "AO_OD", G, (70, 145))
R(ao, "10k", "+3V3", "AO_FAULT", (105, 145))


def ao_channel(k, ox, oy):
    p = f"AO{k}"
    ao.box(f"{p} — {'Dosierpumpe' if k == 1 else 'Reserve'}   (0…20,48 mA, Bürde ≤ 900 Ω)", ox, oy, ox + 245, oy + 95,
           note="PNP + 15 Ω begrenzt auf ≈ 37 mA. Diode gegen Überspannung an +24 V, TVS gegen GND." if k == 1 else None)
    ao.add("U", "Interface_CurrentLoop:XTR111AxDGQ", "XTR111AIDGQR",
           "Package_SO:MSOP-10-1EP_3x3mm_P0.5mm_EP2.2x3.1mm_Mask1.83x1.89mm_ThermalVias",
           {1: "+24V", 2: f"{p}_IS", 3: f"{p}_VG", 4: f"{p}_REG", 5: f"{p}_REG", 6: f"{p}_SET",
            7: f"{p}_RSET", 8: "AO_FAULT", 9: "AO_OD", 10: G, 11: G}, at=(ox + 60, oy + 50))
    C(ao, "100nF/50V", "+24V", G, (ox + 75, oy + 25))
    C(ao, "2.2nF", f"{p}_REG", G, (ox + 30, oy + 30))
    R(ao, "1.00k 0.1%", f"{p}_RSET", G, (ox + 38, oy + 70))
    ao.lab(f"{p}_SET", ox + 5, oy + 50, 180)
    ao.add("Q", "Transistor_BJT:MMBT3906", "MMBT2907A", SOT23, {1: f"{p}_S", 2: f"{p}_IS", 3: f"{p}_VG"},
           at=(ox + 100, oy + 62), val_side="right")
    R(ao, "15", f"{p}_IS", f"{p}_S", (ox + 88, oy + 76))
    ao.add("Q", "Device:Q_PMOS_GDS", "BSP170P", SOT223, {1: f"{p}_VG", 2: f"{p}_D", 3: f"{p}_S"},
           at=(ox + 125, oy + 50), val_side="right")
    R(ao, "15", f"{p}_D", f"{p}_OUT", (ox + 145, oy + 35), h=True)
    C(ao, "10nF/50V", f"{p}_OUT", G, (ox + 165, oy + 50))
    Dv(ao, "+24V", f"{p}_OUT", (ox + 178, oy + 25))
    TVSv(ao, "SMAJ26A", f"{p}_OUT", G, (ox + 192, oy + 50))
    ao.add("J", "Connector:Screw_Terminal_01x02", f"{p}", TB35.format(n=2), {1: f"{p}_OUT", 2: G},
           at=(ox + 232, oy + 35), val_side="below")


ao_channel(1, 150, 25)
ao_channel(2, 150, 160)

# ══ Blatt: Digital-E/A, RS485, Lüfter ═════════════════════════
io = d.sheet("Digital_RS485_Luefter", "io.kicad_sch", "Digitaleingänge, Relais, RS485, Lüfter",
             "DI 24 V über TLP293-4, Relais 230 V, RS485 isoliert zum V20, 4-Pin-PWM-Lüfter")
io.box("Digitaleingänge 24 V  (aktiv = GPIO LOW)", 15, 25, 200, 150,
       note="Schaltschwelle ≈ 12 V (Z-Diode 9,1 V + LED). PTC 200 mA schützt die DI-Speisung.")
TERM(io, ["DI_24V", "DI1_IN", "DI2_IN", "DI3_IN", "DI4_IN", G], (25, 80), val="DI")
PTCv(io, "200mA", "+24V", "DI_24V", (40, 50), mpn="Bourns MF-USMF020-2")
OPTO = {1: (1, 2, 16, 15), 2: (3, 4, 14, 13), 3: (5, 6, 12, 11), 4: (7, 8, 10, 9)}
units, unit_at = {}, {}
for k in range(1, 5):
    y = 40 + (k - 1) * 27
    a, kk, c, e = OPTO[k]
    units[k] = {a: f"DI{k}_A", kk: G, c: f"DI{k}", e: G}
    unit_at[k] = ((140, y + 2.54), 0)
    io.add("D", "Device:D_Zener", "BZT52C9V1", SOD123, {1: f"DI{k}_IN", 2: f"DI{k}_Z"}, at=(70, y), val_side="below")
    R(io, "3.3k", f"DI{k}_Z", f"DI{k}_A", (88, y), h=True, fp=R1206)
    Dv(io, f"DI{k}_A", G, (110, y + 10))
    R(io, "10k", "+3V3", f"DI{k}", (160, y - 6))
    C(io, "10nF", f"DI{k}", G, (172, y + 6))
    io.lab(f"DI{k}", 195, y, 0)
io.add("U", "Isolator:TLP293-4", "TLP293-4", "Package_SO:SOIC-16_4.55x10.3mm_P1.27mm", units=units, unit_at=unit_at)

for k in (1, 2):
    oy = 25 + (k - 1) * 70
    io.box(f"Relais K{k}  (230 V / 6 A, potentialfrei)" + ("  — z. B. Freigabe Dosierpumpe" if k == 1 else ""),
           220, oy, 405, oy + 55)
    io.add("K", "Relay:FINDER-34.51", "34.51.7.024.0010", "Relay_THT:Relay_SPDT_Finder_34.51_Vertical",
           {"A1": "+24V", "A2": f"RL{k}_COIL", "11": f"RL{k}_COM", "12": f"RL{k}_NC", "14": f"RL{k}_NO"},
           at=(330, oy + 28), props={"MPN": "Finder 34.51.7.024.0010"})
    Dv(io, "+24V", f"RL{k}_COIL", (305, oy + 28))
    R(io, "100", f"RELAY{k}", f"RL{k}_G", (245, oy + 42), h=True)
    R(io, "100k", f"RL{k}_G", G, (257, oy + 48))
    NMOS(io, f"RL{k}_G", f"RL{k}_COIL", G, (275, oy + 42))
    R(io, "4.7k", "+24V", f"RL{k}_LED", (290, oy + 14))
    LEDv(io, f"rot K{k}", f"RL{k}_LED", f"RL{k}_COIL", (290, oy + 30))
    io.add("J", "Connector:Screw_Terminal_01x03", f"K{k}", TB508.format(n=3),
           {1: f"RL{k}_NO", 2: f"RL{k}_COM", 3: f"RL{k}_NC"}, at=(395, oy + 28), val_side="below")
    io.lab(f"RELAY{k}", 225, oy + 42, 180)

io.box("RS485 isoliert → V20  (Modbus RTU, Halbduplex)", 15, 170, 200, 270,
       note="DE + /RE gemeinsam (RTS/GPIO16), 10k Pull-down = Empfang. 120 Ω per Jumper.\n"
            "Klemme: A = P+, B = N−, GND_ISO an V20-Bezugspotenzial.")
io.add("U", "Interface_UART:ADM2587E", "ADM2587EBRWZ", "Package_SO:SOIC-20W_7.5x12.8mm_P1.27mm",
       {1: G, 2: "+3V3", 3: G, 4: "RS485_RX", 5: "RS485_DE", 6: "RS485_DE", 7: "RS485_TX", 8: "+3V3",
        9: G, 10: G, 11: "GND_ISO", 12: "VISO", 13: "RS485_A", 14: "GND_ISO", 15: "RS485_B", 16: "GND_ISO",
        17: "RS485_B", 18: "RS485_A", 19: "VISO", 20: "GND_ISO"}, at=(85, 220))
C(io, "10µF", "+3V3", G, (25, 195), fp=C0805)
C(io, "100nF", "+3V3", G, (33, 195))
C(io, "100nF", "+3V3", G, (41, 195))
R(io, "10k", "RS485_DE", G, (50, 245))
C(io, "10µF", "VISO", "GND_ISO", (112, 185), fp=C0805)
C(io, "100nF", "VISO", "GND_ISO", (120, 185))
R(io, "120", "RS485_A", "RS485_T", (135, 222), fp=R1206)
io.add("JP", "Jumper:Jumper_2_Open", "120Ω", JMP2, {1: "RS485_T", 2: "RS485_B"}, at=(145, 240), rot=270, val_side="right")
TVSv(io, "SMAJ15CA", "RS485_A", "GND_ISO", (160, 228), lib="Diode:SMAJ15CA")
TVSv(io, "SMAJ15CA", "RS485_B", "GND_ISO", (170, 228), lib="Diode:SMAJ15CA")
io.add("J", "Connector:Screw_Terminal_01x03", "RS485", TB35.format(n=3),
       {1: "RS485_A", 2: "RS485_B", 3: "GND_ISO"}, at=(192, 210), val_side="below")
io.pwr_flag("GND_ISO", 185, 250)

io.box("Gehäuselüfter 12 V  (4-Pin-PWM 25 kHz, Tacho)", 220, 165, 405, 240,
       note="74LVC1G07 Open-Drain: LOW = Lüfter langsam, offen = Lüfter-interner Pull-up → voll.\n"
            "Tacho mit Pull-up auf 3,3 V und 10k Serienwiderstand.")
io.add("U", "74xGxx:74LVC1G07", "74LVC1G07", "Package_TO_SOT_SMD:SOT-23-5",
       {1: None, 2: "FAN_PWM", 3: G, 4: "FAN_PWM_OD", 5: "+3V3"}, at=(275, 205))
C(io, "100n", "+3V3", G, (250, 185))
io.add("J", "Connector_Generic:Conn_01x04", "Lüfter 4-Pin", "Connector:FanPinHeader_1x04_P2.54mm_Vertical",
       {1: G, 2: "+12V", 3: "FAN_TACH_IN", 4: "FAN_PWM_OD"}, at=(392, 200))
R(io, "10k", "+3V3", "FAN_TACH_IN", (345, 185))
R(io, "10k", "FAN_TACH", "FAN_TACH_IN", (320, 228), h=True)
io.lab("FAN_TACH", 228, 228, 180)

ROOT_NOTES = [
    ("Pumpensteuerung — AIO-Steuerplatine, Rev 0.2 (Entwurf)\n"
     "Ersetzt LOGO! 8.4 + AM2 + Raspberry Pi 3B+. Zwei Controller ohne Linux:\n"
     "  ESP32-S3 = Steuerung (Sensoren, PI-Druckregelung, V20 per RS485, Relais, AO, Trockenlaufschutz)\n"
     "  ESP32-P4 (M5Stack Stamp-P4) = App/HMI (Web-UI, Bewässerung, Wetter, MQTT/HA, 7\"-DSI-Touch, LAN)\n"
     "  Verbindung: UART (S3-UART0 ↔ P4), P4 kann S3 resetten/flashen.\n"
     "Versorgung 230 V AC → IRM-30-24 → 24 V → 12 V (Lüfter) / 5 V (P4, Display) → 3,3 V (S3, Logik).\n"
     "Details: hardware/SPEC.md", (25.4, 140.0)),
]

if __name__ == "__main__":
    d.write(OUT, root_notes=ROOT_NOTES)
    with open(os.path.join(HERE, "intended_netlist.json"), "w") as f:
        json.dump(d.intended_netlist(), f, indent=1, sort_keys=True)
    for line in d.report:
        print("  " + line)
    print(f"{len([p for s, p in d.parts if not p.ref.startswith('#')])} Bauteile, "
          f"{len(d.net_nodes)} Netze → {os.path.abspath(OUT)}")
