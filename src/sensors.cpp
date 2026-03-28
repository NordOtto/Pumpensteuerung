// ============================================================
//  sensors.cpp – DS18B20 Temperatur + 4-Pin PWM-Lüfter
// ============================================================
#include "sensors.h"
#include "webserver.h"
#include <OneWire.h>
#include <DallasTemperature.h>

// ── DS18B20 ──
static OneWire           oneWire(DS18B20_PIN);
static DallasTemperature ds18b20(&oneWire);
static bool              temp_requested   = false;
static unsigned long     last_temp_req    = 0;
static const unsigned long TEMP_INTERVAL  = 2000;   // alle 2 s
static const unsigned long TEMP_CONV_TIME = 800;    // 750 ms + Puffer

// ── Lüfter Tachometer (Pulszählung über 2 s) ──
static volatile unsigned long tach_pulses   = 0;
static volatile unsigned long tach_last_us  = 0;     // Entprellung
static const unsigned long    TACH_DEBOUNCE = 5000;  // µs – min. Abstand zwischen Pulsen
static unsigned long          last_tach_ms  = 0;
static const unsigned long    TACH_INTERVAL = 2000;  // Zählfenster 2 s
static float                  rpm_filtered  = 0.0f;
static const float            RPM_ALPHA     = 0.4f;  // EMA-Glättung
static const uint16_t         RPM_MAX       = 4500;  // Arctic P9 max 4300 + Toleranz
static const uint8_t          FAN_PWM_STOP  = 13;    // <5% von 255 → Lüfter steht

// ── Tach ISR – zählt Pulse mit Entprellung ──
static void IRAM_ATTR tachISR()
{
    unsigned long now = micros();
    if (now - tach_last_us >= TACH_DEBOUNCE) {
        tach_pulses++;
        tach_last_us = now;
    }
}

// =============================================================
void sensors_init()
{
    // DS18B20
    ds18b20.begin();
    ds18b20.setResolution(12);
    ds18b20.setWaitForConversion(false);   // non-blocking

    int count = ds18b20.getDeviceCount();
    Serial.printf("[SENSOR] DS18B20: %d Sensor(en) gefunden auf GPIO%d\n",
                  count, DS18B20_PIN);

    // Fan PWM  (LEDC, ESP32 Core 3.x API)
    ledcAttach(FAN_PWM_PIN, FAN_PWM_FREQ, FAN_PWM_RES);
    ledcWrite(FAN_PWM_PIN, 1);   // duty=1 (<1%) statt 0 (=kein Signal=Vollgas!)
    Serial.printf("[FAN] PWM auf GPIO%d  (%d Hz, %d-bit)\n",
                  FAN_PWM_PIN, FAN_PWM_FREQ, FAN_PWM_RES);

    // Fan Tachometer  (Push-Pull Ausgang, KEIN Pull-Up nötig!)
    pinMode(FAN_TACH_PIN, INPUT);
    attachInterrupt(digitalPinToInterrupt(FAN_TACH_PIN), tachISR, FALLING);
    Serial.printf("[FAN] Tach auf GPIO%d  (Periodenmessung, Falling Edge, kein Pull-Up)\n",
                  FAN_TACH_PIN);
}

// =============================================================
//  DS18B20 Temperatur – non-blocking
// =============================================================
void sensors_read_temperature()
{
    unsigned long now = millis();

    if (!temp_requested) {
        if (now - last_temp_req >= TEMP_INTERVAL) {
            ds18b20.requestTemperatures();
            temp_requested = true;
            last_temp_req  = now;
        }
        return;
    }

    // Konvertierung abwarten
    if (now - last_temp_req < TEMP_CONV_TIME) return;

    float t = ds18b20.getTempCByIndex(0);
    temp_requested = false;

    if (t == DEVICE_DISCONNECTED_C || t < -55.0f || t > 125.0f) {
        // Sensor-Fehler → letzten gültigen Wert behalten
        return;
    }
    state.temperature = t;
}

// =============================================================
//  Lüfter RPM berechnen (Pulszählung über 2 s)
// =============================================================
static unsigned long last_diag_ms = 0;

void sensors_read_fan_rpm()
{
    unsigned long now = millis();
    if (now - last_tach_ms < TACH_INTERVAL) return;

    unsigned long elapsed = now - last_tach_ms;
    last_tach_ms = now;

    noInterrupts();
    unsigned long pulses = tach_pulses;
    tach_pulses = 0;
    interrupts();

    // Diagnose nur bei Änderung loggen (statt alle 4 s)
    static uint16_t last_log_rpm = 0xFFFF;
    static uint8_t  last_log_pwm = 0xFF;
    if (state.fan_rpm != last_log_rpm || state.fan_pwm != last_log_pwm) {
        last_log_rpm = state.fan_rpm;
        last_log_pwm = state.fan_pwm;
        web_log("[FAN] pwm=%d  rpm=%d", state.fan_pwm, state.fan_rpm);
    }

    // Lüfter steht laut Spec bei <5% PWM
    if (state.fan_pwm < FAN_PWM_STOP) {
        state.fan_rpm = 0;
        rpm_filtered  = 0.0f;
        return;
    }

    if (pulses == 0) {
        rpm_filtered = 0.0f;
        state.fan_rpm = 0;
        return;
    }

    // RPM = (Pulse × 60000) / (elapsed_ms × 2)  (2 Pulse pro Umdrehung)
    float raw_rpm = (float)(pulses * 60000UL) / (float)(elapsed * 2);

    // Plausibilität
    if (raw_rpm > RPM_MAX) {
        return;  // Letzten Wert behalten
    }

    // Exponential Moving Average
    if (rpm_filtered < 1.0f) {
        rpm_filtered = raw_rpm;
    } else {
        rpm_filtered = RPM_ALPHA * raw_rpm + (1.0f - RPM_ALPHA) * rpm_filtered;
    }
    state.fan_rpm = (uint16_t)(rpm_filtered + 0.5f);
}

// =============================================================
//  Fan PWM direkt setzen
//  WICHTIG: ledcWrite(0)=konstant LOW, ledcWrite(255)=konstant HIGH
//  → beides "kein Signal" → Lüfter fährt Vollgas!
//  Deshalb: 0→1 (<1% Duty, Lüfter stoppt laut Spec <5%)
//           255→254 (~99.6% Duty, fast Vollgas aber gültiges Signal)
// =============================================================
void fan_set_pwm(uint8_t pwm)
{
    state.fan_pwm = pwm;
    uint8_t duty = pwm;
    if (duty == 0)   duty = 1;    // gültiges PWM-Signal <5% → Lüfter stoppt
    if (duty == 255) duty = 254;  // gültiges PWM-Signal ~100% → volle Drehzahl
    ledcWrite(FAN_PWM_PIN, duty);
}

// =============================================================
//  Fan-Regelung (modusabhängig)
// =============================================================
void fan_control()
{
    switch (state.fan_mode) {

    case FAN_MODE_AUTO: {
        // Lineare Interpolation  temp_min…temp_max → pwm_min…255
        float t = state.temperature;
        uint8_t pwm;
        if (t <= FAN_TEMP_MIN) {
            pwm = FAN_PWM_MIN;
        } else if (t >= FAN_TEMP_MAX) {
            pwm = 255;
        } else {
            float ratio = (t - FAN_TEMP_MIN) / (FAN_TEMP_MAX - FAN_TEMP_MIN);
            pwm = FAN_PWM_MIN + (uint8_t)(ratio * (255 - FAN_PWM_MIN));
        }
        fan_set_pwm(pwm);
        break;
    }

    case FAN_MODE_LOGO:
    case FAN_MODE_MQTT:
    case FAN_MODE_WEB:
        // PWM wird extern gesetzt (via TCP / MQTT / WebSocket)
        fan_set_pwm(state.fan_pwm);
        break;

    default:
        break;
    }
}
