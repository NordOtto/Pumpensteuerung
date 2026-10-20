"""M5Stack Stamp-P4 (SKU S013) — Pad-Nummern 1–65 laut M5Stack-Schaltplan (Symbol STAMP_P4).

Links 1–19, rechts 20–38, unten 39–45, oben 46–65 (RMII + MIPI-DSI).
G35 liegt doppelt auf Pad 36 und 48 (BOOT-Strap = RMII_TXD1).
Vor dem Layout gegen den offiziellen Footprint Stamp-P4.kicad_mod prüfen.
"""
STAMP_P4 = {
    1: "LPG15_LPRXD", 2: "LPG14_LPTXD", 3: "LPG12", 4: "LPG11_SDA", 5: "LPG10", 6: "LPG9_SCL", 7: "LPG8",
    8: "LPG7", 9: "LPG1", 10: "G50_ADC2", 11: "LPG0", 12: "G49_ADC2", 13: "GND", 14: "5VIN", 15: "VBUS",
    16: "LPG4", 17: "G27_USB1_D+", 18: "LPG6", 19: "G26_USB1_D-",
    20: "G23", 21: "G22", 22: "G21", 23: "G20", 24: "G19", 25: "G18", 26: "G17", 27: "G16", 28: "3V3_OUT",
    29: "LPG13", 30: "G37_U0TXD", 31: "G39", 32: "G38_U0RXD", 33: "G34_JTAG_EN", 34: "EN", 35: "LPG5",
    36: "G35_BOOT", 37: "LPG2", 38: "GND",
    39: "SYS_5V", 40: "USB2_HOST_DP", 41: "USB2_HOST_DM", 42: "GND", 43: "G24_USBC_D-", 44: "G25_USBC_D+",
    45: "LPG3",
    46: "G32_RMII_CLK", 47: "G36_RMII_MDIO", 48: "G35_RMII_TXD1", 49: "G41_RMII_TXD0", 50: "G33_RMII_TXEN",
    51: "G31_RMII_MDC", 52: "G28_RMII_CRSDV", 53: "G30_RMII_RXD1", 54: "G29_RMII_RXD0", 55: "G52_RMII_RST",
    56: "GND", 57: "DSI_D0_N", 58: "DSI_D0_P", 59: "GND", 60: "DSI_CK_P", 61: "DSI_CK_N", 62: "GND",
    63: "DSI_D1_N", 64: "DSI_D1_P", 65: "GND",
}
assert sorted(STAMP_P4) == list(range(1, 66))


def ptypes():
    return {n: ("power_in" if name in ("GND", "5VIN") else "passive") for n, name in STAMP_P4.items()}
