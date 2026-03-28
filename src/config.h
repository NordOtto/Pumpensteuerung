// ============================================================
//  config.h – Zentrale Konfiguration für Modbus Gateway
// ============================================================
#pragma once

#include <Arduino.h>
#include "secrets.h"

// ----- Firmware-Version -----
#define FW_VERSION "1.1.0"
#define FW_BOARD   "ESP32-DevKit-C"

// =============================================================
//  Pin-Belegung  ESP32 DevKit C
// =============================================================
// RS485  (UART1 – GPIO16/17)
#define RS485_RX_PIN      16    // GPIO16  ← MAX13487 TXD/RO
#define RS485_TX_PIN      17    // GPIO17  → MAX13487 RXD/DI
#define RS485_DE_PIN      -1    // -1 = nicht belegt (Auto-Direction)

// DS18B20 Temperatursensor (OneWire)
#define DS18B20_PIN       4     // 4.7 kΩ Pull-Up nach 3.3 V

// 4-Pin PWM-Lüfter
#define FAN_PWM_PIN       32    // LEDC PWM Ausgang
#define FAN_TACH_PIN      36    // Tachometer-Eingang (GPIO36/VP)
#define FAN_PWM_FREQ      25000 // 25 kHz (Intel-Spec für 4-Pin)
#define FAN_PWM_RES       8     // 8-bit  → 0 – 255

// Status-LED (GPIO2 = onboard LED)
#define STATUS_LED_PIN    2

// =============================================================
//  Modbus RTU – Sinamics V20
// =============================================================
#define V20_SLAVE_ADDR    1
#define V20_BAUDRATE      9600
#define V20_SERIAL_CFG    SERIAL_8N1

// V20 Holding-Register-Adressen (0-basiert = Modbus 40xxx - 40001)
//  ── Steuerung (PZD Schreiben) ──
#define V20_REG_STW       99    // 40100  Steuerwort            (Write)
#define V20_REG_HSW       100   // 40101  Hauptsollwert         (Write)
//  ── Status (PZD Lesen) ──
#define V20_REG_ZSW       109   // 40110  Zustandswort          (Read)
#define V20_REG_HIW       110   // 40111  Hauptistwert          (Read)
//  ── Überwachung / Istwerte ──
#define V20_REG_FREQ_OUT  23    // 40024  Frequenzausgang       (Read, ×100 → Hz)
#define V20_REG_SPEED     24    // 40025  Ist-Geschwindigkeit   (Read, U/min)
#define V20_REG_VOLTAGE   342   // 40343  Ausgangsspannung      (Read, V, r0025)
#define V20_REG_DCBUS     343   // 40344  Zwischenkreisspannung (Read, V, r0026)
#define V20_REG_CURRENT   344   // 40345  Ausgangsstrom         (Read, ×100 → A, r0027)
#define V20_REG_TORQUE    345   // 40346  Drehmoment            (Read, ×100 → Nm, r0031)
#define V20_REG_POWER     346   // 40347  Aktuelle Leistung     (Read, ×100 → kW, r0032)
#define V20_REG_ENERGY    347   // 40348  Energieverbrauch ges. (Read, kWh, r0039)
//  ── Diagnose ──
#define V20_REG_FAULT_CODE 54   // 40055  Letzter Fehler        (Read)
#define V20_REG_WARNING    59   // 40060  Letzte Warnung        (Read)

// Steuerwort-Werte
#define V20_CMD_START         0x047F
#define V20_CMD_STOP          0x047E
#define V20_CMD_FAULT_RESET   0x04FE

// Frequenz-Skalierung
//   Schreiben: HSW = Hz × 327.68          (50 Hz → 16384 = 0x4000)
//   Lesen:     Hz  = HIW × 0.0030517578   (16384 → 50 Hz)
#define V20_FREQ_WRITE_SCALE  327.68f
#define V20_FREQ_READ_SCALE   0.0030517578f

// Skalierungen der Diagnosewerte
#define V20_VOLTAGE_SCALE     1.0f    // raw × 1    = V
#define V20_CURRENT_SCALE     0.01f   // raw × 0.01 = A
#define V20_POWER_SCALE       0.01f   // raw × 0.01 = kW

// V20 Poll-Intervall
#define V20_POLL_INTERVAL_MS  500

// =============================================================
//  Modbus TCP – LOGO 8.4
// =============================================================
#define MODBUS_TCP_PORT   502

// TCP Holding-Register-Map  (LOGO-seitig, 0-basiert = LOGO HR - 1)
//  ── Schreib-Register (LOGO → ESP32) ──
#define TCP_REG_STW           0   // Control Word  (raw, z.B. 0x047F)     LOGO HR:1
#define TCP_REG_HSW           1   // Freq-Sollwert (Hz × 100)             LOGO HR:2
#define TCP_REG_FLOW          2   // Durchfluss    (L/min × 100)          LOGO HR:3
#define TCP_REG_PRESSURE      3   // Druck         (bar × 100)            LOGO HR:4
#define TCP_REG_WATER_TEMP    4   // Wassertemp.   (°C × 10)             LOGO HR:5

//  ── Lese-Register (V20 / Sensoren → WT32 → LOGO) ──
#define TCP_REG_ZSW           10  // Zustandswort
#define TCP_REG_HIW           11  // Ist-Frequenz  (Hz × 100)
#define TCP_REG_CURRENT       12  // Motorstrom    (A × 100)
#define TCP_REG_DCBUS         13  // DC-Bus        (V)
#define TCP_REG_FAULT         14  // Fehlercode
#define TCP_REG_TEMP          15  // Temperatur    (°C × 10, z.B. 235 = 23.5 °C)
#define TCP_REG_FAN_RPM       16  // Lüfter RPM
#define TCP_REG_FAN_PWM_READ  17  // Aktueller Fan-PWM  (0–255)
#define TCP_REG_COUNT         20  // Anzahl Register gesamt

// =============================================================
//  MQTT / Home Assistant  (Credentials in secrets.h)
// =============================================================
#define MQTT_CLIENT_ID    "pumpensteuerung-hw"
#define MQTT_BASE_TOPIC   "pumpensteuerung"
#define MQTT_RAW_PREFIX   "pumpensteuerung/raw"   // ESP32 publisht raw Daten
#define MQTT_CMD_PREFIX   "pumpensteuerung/cmd"   // Backend sendet Befehle
#define MQTT_PUBLISH_MS   500     // Publish-Intervall (500ms für PI-Regelung im Backend)
#define MQTT_RECONNECT_MS 5000    // Reconnect-Intervall

// =============================================================
//  Lüfter-Regelung (Auto-Modus)
// =============================================================
#define FAN_MODE_AUTO     0
#define FAN_MODE_LOGO     1
#define FAN_MODE_MQTT     2
#define FAN_MODE_WEB      3

#define FAN_TEMP_MIN      25.0f   // Unterhalb → pwm_min
#define FAN_TEMP_MAX      40.0f   // Oberhalb  → 100 %
#define FAN_PWM_MIN       30      // Minimaler PWM (12 % – Anlaufschwelle)
#define FAN_PWM_MAX       255

// =============================================================
//  Watchdog
// =============================================================
#define WATCHDOG_TIMEOUT_S  5     // Sekunden ohne STW von LOGO → V20 Stop

// =============================================================
//  Webserver
// =============================================================
#define WEB_PORT          80
#define WS_BROADCAST_MS   1000    // WebSocket Broadcast-Intervall

// =============================================================
//  OTA
// =============================================================
#define OTA_HOSTNAME      "pumpensteuerung"

// =============================================================
//  Gemeinsamer Anwendungszustand
//  Steuerungslogik (PI, Timeguard, Presets) läuft im Backend.
//  ESP32 hält nur Hardware-State.
// =============================================================
struct AppState {
    // ── V20 Ist-Werte ──
    uint16_t v20_status_word  = 0;
    float    v20_frequency    = 0;
    float    v20_voltage      = 0;
    float    v20_current      = 0;
    uint16_t v20_dc_bus       = 0;
    float    v20_power        = 0;
    uint8_t  v20_fault        = 0;   // 0=OK, 1=Störung (aus ZSW Bit 3)
    uint16_t v20_fault_code   = 0;   // Fehlercode aus Reg 40055
    bool     v20_running      = false;
    bool     v20_connected    = false;

    // ── V20 Soll-Werte ──
    uint16_t v20_control_word = 0;
    float    v20_freq_setpoint = 0;

    // ── Sensoren (von LOGO via Modbus TCP) ──
    float    pressure_bar          = 0.0f;
    float    flow_rate             = 0.0f;
    bool     flow_estimated        = false;
    unsigned long last_flow_update = 0;
    unsigned long last_pressure_update = 0;
    float    water_temp            = -127.0f;

    // ── DS18B20 ──
    float    temperature      = -127.0f;

    // ── Lüfter ──
    uint16_t fan_rpm          = 0;
    uint8_t  fan_pwm          = 0;
    uint8_t  fan_mode         = FAN_MODE_AUTO;

    // ── System ──
    unsigned long uptime_s    = 0;
    bool     eth_connected    = false;
    bool     mqtt_connected   = false;
    uint8_t  tcp_clients      = 0;
    String   ip_address       = "0.0.0.0";
};

// Globale Instanz (definiert in main.cpp)
extern AppState state;
