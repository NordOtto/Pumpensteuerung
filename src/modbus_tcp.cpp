// ============================================================
//  modbus_tcp.cpp – Modbus TCP Server für Siemens LOGO 8.4
//
//  LOGO schreibt Sensordaten in Register 2–4 (HR3–HR5):
//    HR3 = Durchfluss   (raw 200–1000)
//    HR4 = Druck        (bar × 100)
//    HR5 = Wassertemp   (raw 200–1000)
//
//  V20-Steuerung (STW/HSW) läuft jetzt über den Docker-Backend
//  via MQTT cmd-Topics – LOGO HR1/HR2 werden ignoriert.
// ============================================================
#include "modbus_tcp.h"
#include "modbus_v20.h"
#include "webserver.h"
#include <ModbusTCP.h>

// ── Internes Objekt ──
static ModbusTCP mb_tcp;

// =============================================================
void modbus_tcp_init()
{
    mb_tcp.server(MODBUS_TCP_PORT);

    // Alle Holding-Register anlegen (0 … TCP_REG_COUNT-1)
    mb_tcp.addHreg(0, 0, TCP_REG_COUNT);

    Serial.printf("[TCP] Modbus TCP Server auf Port %d gestartet\n",
                  MODBUS_TCP_PORT);
    Serial.printf("      Register: %d (Sensor-Eingang: 2–4, V20-Status: 10–17)\n",
                  TCP_REG_COUNT);
}

// =============================================================
void modbus_tcp_task()
{
    mb_tcp.task();
    yield();
}

// =============================================================
//  Lese-Register aktualisieren  (wird ~alle 500 ms aufgerufen)
// =============================================================
void modbus_tcp_update()
{
    // Zustandswort
    mb_tcp.Hreg(TCP_REG_ZSW, state.v20_status_word);

    // Ist-Frequenz  → Hz × 100  (z.B. 4250 = 42.50 Hz)
    mb_tcp.Hreg(TCP_REG_HIW, (uint16_t)(state.v20_frequency * 100.0f));

    // Motorstrom    → A × 100   (z.B. 325  = 3.25 A)
    mb_tcp.Hreg(TCP_REG_CURRENT, (uint16_t)(state.v20_current * 100.0f));

    // DC-Bus Spannung (V, ganzzahlig)
    mb_tcp.Hreg(TCP_REG_DCBUS, state.v20_dc_bus);

    // Fehlercode
    mb_tcp.Hreg(TCP_REG_FAULT, state.v20_fault);

    // Temperatur   → °C × 10   (z.B. 235  = 23.5 °C)
    if (state.temperature > -100.0f) {
        mb_tcp.Hreg(TCP_REG_TEMP, (uint16_t)(state.temperature * 10.0f));
    } else {
        mb_tcp.Hreg(TCP_REG_TEMP, 0xFFFF);  // Sensor-Fehler
    }

    // Lüfter
    mb_tcp.Hreg(TCP_REG_FAN_RPM,      state.fan_rpm);
    mb_tcp.Hreg(TCP_REG_FAN_PWM_READ, state.fan_pwm);
}

// =============================================================
//  Sensor-Register lesen  (LOGO → state)
//  HR1/HR2 (STW/HSW) werden nicht mehr verarbeitet –
//  V20-Steuerung erfolgt ausschliesslich über MQTT cmd-Topics.
// =============================================================
void modbus_tcp_check_writes()
{
    // ── Durchfluss-Eingang von LOGO (Register 2 = HR3) ──
    // Autosen AS009: 4-20mA, LOGO skaliert min=200 max=1000
    // Q [L/min] = (raw - 200) × 0.10626   (200→0, 1000→85 L/min)
    uint16_t raw_flow = mb_tcp.Hreg(TCP_REG_FLOW);
    if (raw_flow >= 200) {
        float sensor_flow = (raw_flow - 200) * 0.10626f;
        if (sensor_flow < 1.0f && state.v20_running && state.v20_frequency > 0) {
            // Sensor im Totbereich (<5 L/min) – Schätzung aus VFD-Frequenz
            state.flow_rate      = (state.v20_frequency / 50.0f) * 4.0f;
            state.flow_estimated = true;
        } else {
            state.flow_rate      = sensor_flow;
            state.flow_estimated = false;
        }
        state.last_flow_update = millis();
    } else if (raw_flow > 0 && raw_flow < 200) {
        state.flow_rate        = 0.0f;
        state.flow_estimated   = false;
        state.last_flow_update = millis();
    } else if (raw_flow == 0 && state.last_flow_update > 0) {
        state.flow_rate        = 0.0f;
        state.flow_estimated   = false;
        state.last_flow_update = millis();
    }

    // ── Druck-Eingang von LOGO (Register 3 = HR4) ──
    uint16_t raw_pressure = mb_tcp.Hreg(TCP_REG_PRESSURE);
    if (raw_pressure > 0) {
        state.pressure_bar         = raw_pressure / 100.0f;
        state.last_pressure_update = millis();
    }

    // ── Wassertemperatur von LOGO (Register 4 = HR5) ──
    // Autosen AS009: 4-20mA, LOGO skaliert min=200 max=1000
    // T [°C] = (raw - 200) × 0.1875 - 25   (200→-25°C, 1000→125°C)
    uint16_t raw_wtemp = mb_tcp.Hreg(TCP_REG_WATER_TEMP);
    if (raw_wtemp >= 200) {
        state.water_temp = (raw_wtemp - 200) * 0.1875f - 25.0f;
    } else if (raw_wtemp > 0 && raw_wtemp < 200) {
        state.water_temp = -127.0f;
    }
}

// =============================================================
//  Watchdog: Immer 0 zurückgeben (LOGO steuert V20 nicht mehr)
// =============================================================
unsigned long modbus_tcp_last_stw_write()
{
    return 0;
}
