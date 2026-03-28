// ============================================================
//  modbus_v20.cpp – Sinamics V20 Modbus RTU Master
// ============================================================
#include "modbus_v20.h"
#include "webserver.h"
#include <ModbusRTU.h>
#include "driver/uart.h"   // RX-Unterdrückung während TX (Echo-Schutz)

// ── Interne Objekte ──
static ModbusRTU     mb_rtu;
static HardwareSerial SerialV20(1);   // UART1, GPIO16=RX GPIO17=TX

// Empfangs-Puffer
static uint16_t buf_pzd[2]  = {0, 0}; // ZSW + HIW (Register 99–100, ein Read)
static uint16_t buf_voltage    = 0;
static uint16_t buf_current    = 0;
static uint16_t buf_dcbus      = 0;
static uint16_t buf_power      = 0;

// Hauptpoll-Steuerung (ZSW + HIW, 500 ms, ein einzelner 2-Register-Read)
static bool     poll_active    = false;
static unsigned long poll_start   = 0;
static unsigned long last_poll    = 0;
static unsigned long last_success = 0;

// Diagnosepoll-Steuerung (sequentiell: ein Register pro Zyklus, alle 5 s)
static bool     diag_active    = false;
static uint8_t  diag_step      = 0;       // 0–3: Voltage, Current, DCBus, Power
static unsigned long diag_start = 0;
static unsigned long last_diag  = 0;
#define DIAG_POLL_INTERVAL_MS  5000

// Emergency-Timeout: poll_active / diag_active zurücksetzen
#define POLL_EMERGENCY_RESET_MS  10000

// Boot-Quit: einmaliger Auto-Quit nach erster Verbindung
static bool boot_quit_done = false;

// Fault-Reset Zweistufig
static bool          reset_pending  = false;
static unsigned long reset_time     = 0;

// Frequenz-Schreibwert Change-Detection (verhindert PI-Flooding)
static uint16_t last_freq_raw = 0xFFFF;

// Register-Scan (einmalig nach erster Verbindung)
static bool     scan_done      = false;
static bool     scan_active    = false;
static uint16_t scan_reg       = 0;
static uint16_t scan_buf       = 0;
static unsigned long scan_start = 0;

// Scan-Bereiche: mehrere Blöcke statt einem Riesenbereich
static const uint16_t SCAN_RANGES[][2] = {
    {23, 32},     // Frequenz, Geschwindigkeit + undokumentierte (28-31)
    {54, 60},     // Fehlercode + Warnung
    {99, 111},    // STW/HSW/ZSW/HIW
    {340, 350},   // Dokumentierte Monitoring-Register
};
#define SCAN_RANGE_COUNT  (sizeof(SCAN_RANGES)/sizeof(SCAN_RANGES[0]))
static uint8_t scan_range_idx = 0;

// ── Hauptpoll abschließen ──
static void finalizePoll(bool success)
{
    if (success) {
        last_success = millis();
        state.v20_connected   = true;
        state.v20_status_word = buf_pzd[0];                              // ZSW (Reg 109)
        state.v20_frequency   = (float)buf_pzd[1] * V20_FREQ_READ_SCALE; // HIW (Reg 110)

        // ZSW-Bits (echtes Zustandswort von Reg 40110):
        //  Bit 2: Operation enabled (Betrieb freigegeben = Motor läuft)
        //  Bit 3: Fault active (Störung aktiv)
        //  Bit 7: Warning active
        state.v20_running = (buf_pzd[0] & (1 << 2)) != 0;
        state.v20_fault   = (buf_pzd[0] & (1 << 3)) ? 1 : 0;

        // Debug: nur bei signifikanter Änderung loggen (>1 Hz oder ZSW-Wechsel)
        static uint16_t last_log_zsw = 0xFFFF;
        static float    last_log_hz  = -99.0f;
        float hz_diff = state.v20_frequency - last_log_hz;
        if (hz_diff < 0) hz_diff = -hz_diff;
        if (buf_pzd[0] != last_log_zsw || hz_diff > 1.0f) {
            last_log_zsw = buf_pzd[0];
            last_log_hz  = state.v20_frequency;
            web_log("[RTU] ZSW=0x%04X HIW=%.1f Hz",
                    buf_pzd[0], state.v20_frequency);
        }
    }
    poll_active = false;
}

// ── RTU Callback (ZSW + HIW) ──
static bool onRtuResult(Modbus::ResultCode event,
                        uint16_t transactionId,
                        void* data)
{
    if (event == Modbus::EX_SUCCESS) {
        finalizePoll(true);
    } else {
        web_log("[RTU] Poll-Fehler: 0x%02X  tid=%u", event, transactionId);
        finalizePoll(false);
    }
    return true;
}

// ── RTU Callback (Diagnose, ein Register) ──
static bool onRtuDiag(Modbus::ResultCode event,
                      uint16_t transactionId,
                      void* data)
{
    if (event == Modbus::EX_SUCCESS) {
        switch (diag_step) {
            case 0: state.v20_voltage    = (float)buf_voltage * V20_VOLTAGE_SCALE; break;
            case 1: state.v20_current    = (float)buf_current * V20_CURRENT_SCALE; break;
            case 2: state.v20_dc_bus     = buf_dcbus; break;
            case 3: state.v20_power      = (float)buf_power   * V20_POWER_SCALE;  break;
        }
    } else {
        web_log("[RTU] Diag-Fehler: 0x%02X  tid=%u", event, transactionId);
    }
    diag_active = false;
    diag_step   = (diag_step + 1) % 4;
    return true;
}

// ── RTU Write Callback ──
static bool onWriteResult(Modbus::ResultCode event,
                          uint16_t transactionId,
                          void* data)
{
    if (event != Modbus::EX_SUCCESS) {
        web_log("[RTU] Schreib-Fehler: 0x%02X  tid=%u", event, transactionId);
    }
    return true;
}

// =============================================================
void modbus_v20_init()
{
    SerialV20.begin(V20_BAUDRATE, V20_SERIAL_CFG,
                    RS485_RX_PIN, RS485_TX_PIN);
    // RX während TX deaktivieren → eigenes Echo wird nicht empfangen
    uart_set_mode(UART_NUM_1, UART_MODE_RS485_HALF_DUPLEX);
    delay(100);

    mb_rtu.begin(&SerialV20, RS485_DE_PIN);   // -1 → kein DE/RE
    mb_rtu.master();

    web_log("[RTU] Init: Slave=%d Baud=%d RX=%d TX=%d",
            V20_SLAVE_ADDR, V20_BAUDRATE, RS485_RX_PIN, RS485_TX_PIN);
}

// =============================================================
void modbus_v20_task()
{
    mb_rtu.task();
    yield();

    // Emergency Reset: poll/diag nach 10 s freigeben (Safety-Net)
    if (poll_active && millis() - poll_start > POLL_EMERGENCY_RESET_MS) {
        poll_active = false;
        web_log("[RTU] Poll-Emergency-Reset (10s Timeout)");
    }
    if (diag_active && millis() - diag_start > POLL_EMERGENCY_RESET_MS) {
        diag_active = false;
        diag_step   = (diag_step + 1) % 4;
        web_log("[RTU] Diag-Emergency-Reset (10s Timeout)");
    }
    if (scan_active && millis() - scan_start > POLL_EMERGENCY_RESET_MS) {
        scan_active = false;
        scan_reg++;
        web_log("[RTU] Scan-Emergency-Reset (10s Timeout)");
    }

    // Fault-Reset Phase 2: Stop senden sobald Library frei ist (nach Phase 1)
    if (reset_pending && millis() - reset_time >= 200) {
        if (mb_rtu.writeHreg(V20_SLAVE_ADDR, V20_REG_STW,
                             (uint16_t)V20_CMD_STOP, onWriteResult)) {
            reset_pending = false;
            state.v20_control_word = V20_CMD_STOP;
            web_log("[RTU] Fault-Reset Phase 2: Stop gesendet");
        }
        // Timeout: nach 5 s aufgeben (Phase 1 sollte nach 1 s fertig sein)
        if (millis() - reset_time > 5000) {
            reset_pending = false;
            web_log("[RTU] Fault-Reset Phase 2: Timeout, abgebrochen");
        }
    }

    // Verbindungstimeout (10 s ohne Erfolg → disconnected)
    // Längerer Timeout weil Writes den Bus bis zu 5 s blockieren können
    if (state.v20_connected && millis() - last_success > 10000) {
        state.v20_connected = false;
        web_log("[RTU] V20 Verbindung verloren");
    }

    // Boot-Quit: bei erster Verbindung Störung automatisch quittieren
    if (state.v20_connected && !boot_quit_done) {
        boot_quit_done = true;
        if (state.v20_fault) {
            web_log("[RTU] Boot-Quit: Störung erkannt (ZSW=0x%04X), quittiere",
                    state.v20_status_word);
            modbus_v20_fault_reset();
        }
    }
}

// =============================================================
void modbus_v20_poll()
{
    if (poll_active) return;                    // Vorheriger Zyklus läuft noch

    unsigned long now = millis();
    if (now - last_poll < V20_POLL_INTERVAL_MS) return;

    poll_active = true;
    poll_start  = now;

    // Ein einzelner Read: 2 konsekutive Register (ZSW=99, HIW=100)
    // Library ist Single-Request: readHreg gibt false zurück wenn
    // noch eine andere Transaktion läuft → sofort freigeben
    if (!mb_rtu.readHreg(V20_SLAVE_ADDR, V20_REG_ZSW, buf_pzd, 2, onRtuResult)) {
        poll_active = false;
        // Retry in 200 ms statt volle 500 ms warten
        last_poll = now - V20_POLL_INTERVAL_MS + 200;
        return;
    }

    last_poll = now;
}

// =============================================================
// Diagnosepoll: sequentiell ein Register pro Zyklus (alle 5 s)
void modbus_v20_diag_poll()
{
    if (poll_active || diag_active) return;

    unsigned long now = millis();
    if (now - last_diag < DIAG_POLL_INTERVAL_MS) return;

    diag_active = true;
    diag_start  = now;

    bool ok = false;
    switch (diag_step) {
        case 0: ok = mb_rtu.readHreg(V20_SLAVE_ADDR, V20_REG_VOLTAGE,    &buf_voltage,    1, onRtuDiag); break;
        case 1: ok = mb_rtu.readHreg(V20_SLAVE_ADDR, V20_REG_CURRENT,    &buf_current,    1, onRtuDiag); break;
        case 2: ok = mb_rtu.readHreg(V20_SLAVE_ADDR, V20_REG_DCBUS,      &buf_dcbus,      1, onRtuDiag); break;
        case 3: ok = mb_rtu.readHreg(V20_SLAVE_ADDR, V20_REG_POWER,      &buf_power,      1, onRtuDiag); break;
    }

    if (!ok) {
        diag_active = false;
        // Retry in 1 s statt volle 5 s warten
        last_diag = now - DIAG_POLL_INTERVAL_MS + 1000;
    } else {
        last_diag = now;
    }
}

// =============================================================
void modbus_v20_start()
{
    // Force-Write beim nächsten set_frequency() damit V20 gültigen HSW bekommt
    last_freq_raw = 0xFFFF;
    if (!mb_rtu.writeHreg(V20_SLAVE_ADDR, V20_REG_STW,
                          (uint16_t)V20_CMD_START, onWriteResult)) {
        web_log("[RTU] START abgelehnt (Bus belegt)");
        return;
    }
    web_log("[RTU] → START");
    state.v20_control_word = V20_CMD_START;
}

void modbus_v20_stop()
{
    if (!mb_rtu.writeHreg(V20_SLAVE_ADDR, V20_REG_STW,
                          (uint16_t)V20_CMD_STOP, onWriteResult)) {
        web_log("[RTU] STOP abgelehnt (Bus belegt)");
        return;
    }
    web_log("[RTU] → STOP");
    state.v20_control_word = V20_CMD_STOP;
}

void modbus_v20_fault_reset()
{
    if (!mb_rtu.writeHreg(V20_SLAVE_ADDR, V20_REG_STW,
                          (uint16_t)V20_CMD_FAULT_RESET, onWriteResult)) {
        web_log("[RTU] FAULT RESET abgelehnt (Bus belegt)");
        return;
    }
    web_log("[RTU] → FAULT RESET (Phase 1)");
    reset_pending = true;
    reset_time    = millis();
    state.v20_control_word = V20_CMD_FAULT_RESET;
}

void modbus_v20_set_frequency(float hz)
{
    if (hz < 0)  hz = 0;
    if (hz > 50) hz = 50;

    uint16_t raw = (uint16_t)(hz * V20_FREQ_WRITE_SCALE);

    // Change-Detection: nur senden wenn sich der Rohwert ändert
    // Verhindert Bus-Flooding durch PI-Regler (500 ms Zyklus)
    if (raw == last_freq_raw) return;
    last_freq_raw = raw;

    mb_rtu.writeHreg(V20_SLAVE_ADDR, V20_REG_HSW, raw, onWriteResult);
    state.v20_freq_setpoint = hz;
}

void modbus_v20_write_stw(uint16_t stw)
{
    web_log("[RTU] → STW: 0x%04X", stw);
    mb_rtu.writeHreg(V20_SLAVE_ADDR, V20_REG_STW, stw, onWriteResult);
    state.v20_control_word = stw;
}

// =============================================================
//  Register-Scan (einmalig nach erster Verbindung)
//  Scannt mehrere Bereiche: Monitoring, Diagnose, PZD, Doku-Register
// =============================================================
static bool onScanResult(Modbus::ResultCode event,
                         uint16_t transactionId,
                         void* data)
{
    if (event == Modbus::EX_SUCCESS) {
        web_log("[SCAN] Reg %3u = %5u  (0x%04X)", scan_reg, scan_buf, scan_buf);
    } else {
        web_log("[SCAN] Reg %3u = FEHLER 0x%02X", scan_reg, event);
    }
    scan_active = false;
    scan_reg++;
    // Prüfen ob aktueller Bereich fertig → nächsten starten
    if (scan_range_idx < SCAN_RANGE_COUNT &&
        scan_reg > SCAN_RANGES[scan_range_idx][1]) {
        scan_range_idx++;
        if (scan_range_idx < SCAN_RANGE_COUNT) {
            scan_reg = SCAN_RANGES[scan_range_idx][0];
        }
    }
    return true;
}

void modbus_v20_reg_scan()
{
    if (scan_done || !state.v20_connected) return;
    if (poll_active || diag_active || scan_active) return;

    // Erster Aufruf: Range initialisieren
    if (scan_range_idx == 0 && scan_reg == 0) {
        scan_reg = SCAN_RANGES[0][0];
        web_log("[SCAN] Starte Register-Scan (%d Bereiche)", SCAN_RANGE_COUNT);
    }

    // Alle Bereiche fertig?
    if (scan_range_idx >= SCAN_RANGE_COUNT) {
        scan_done = true;
        web_log("[SCAN] Register-Scan abgeschlossen");
        return;
    }

    unsigned long now = millis();
    if (now - scan_start < 500) return;   // 500 ms zwischen Scans

    scan_active = true;
    scan_start  = now;

    if (!mb_rtu.readHreg(V20_SLAVE_ADDR, scan_reg, &scan_buf, 1, onScanResult)) {
        scan_active = false;
        scan_start  = now - 300;  // schneller Retry
    }
}
