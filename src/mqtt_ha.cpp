// ============================================================
//  mqtt_ha.cpp – MQTT Hardware-Brücke
//
//  ESP32 publisht rohe Sensordaten auf:
//    pumpensteuerung/raw/*
//
//  ESP32 empfängt Befehle vom Docker-Backend auf:
//    pumpensteuerung/cmd/*
//
//  HA Auto-Discovery und Steuerungslogik laufen im Backend.
// ============================================================
#include "mqtt_ha.h"
#include "modbus_v20.h"
#include "sensors.h"
#include <WiFiClient.h>
#include <PubSubClient.h>

// ── Interne Objekte ──
static WiFiClient   ethClient;
static PubSubClient mqtt(ethClient);

static unsigned long last_reconnect = 0;
static unsigned long last_publish   = 0;

// ── Topic-Hilfsfunktionen ──
static String rawTopic(const char* suffix)
{
    return String(MQTT_RAW_PREFIX) + "/" + suffix;
}

static String cmdTopic(const char* suffix)
{
    return String(MQTT_CMD_PREFIX) + "/" + suffix;
}

// ── Fan-Mode Strings ──
static const char* fanModeStr(uint8_t mode)
{
    switch (mode) {
        case FAN_MODE_AUTO: return "Auto";
        case FAN_MODE_LOGO: return "LOGO";
        case FAN_MODE_MQTT: return "MQTT";
        case FAN_MODE_WEB:  return "Web";
        default:            return "Auto";
    }
}

static uint8_t fanModeFromStr(const char* s)
{
    if (strcmp(s, "LOGO") == 0) return FAN_MODE_LOGO;
    if (strcmp(s, "MQTT") == 0) return FAN_MODE_MQTT;
    if (strcmp(s, "Web")  == 0) return FAN_MODE_WEB;
    return FAN_MODE_AUTO;
}

// =============================================================
//  MQTT Callback – Befehle vom Backend empfangen
// =============================================================
static void mqttCallback(char* t, byte* payload, unsigned int len)
{
    String msg;
    msg.reserve(len);
    for (unsigned int i = 0; i < len; i++) msg += (char)payload[i];

    Serial.printf("[MQTT] ← %s : %s\n", t, msg.c_str());

    String tp(t);

    if (tp == cmdTopic("v20/start")) {
        modbus_v20_start();
    }
    else if (tp == cmdTopic("v20/stop")) {
        modbus_v20_stop();
    }
    else if (tp == cmdTopic("v20/reset")) {
        modbus_v20_fault_reset();
    }
    else if (tp == cmdTopic("v20/freq")) {
        float hz = msg.toFloat();
        if (hz >= 10.0f && hz <= 50.0f) {
            modbus_v20_set_frequency(hz);
        }
    }
    else if (tp == cmdTopic("fan/pwm")) {
        uint8_t pwm = (uint8_t)msg.toInt();
        fan_set_pwm(pwm);
    }
    else if (tp == cmdTopic("fan/mode")) {
        state.fan_mode = fanModeFromStr(msg.c_str());
        Serial.printf("[MQTT] Fan-Mode → %s\n", fanModeStr(state.fan_mode));
    }
}

// =============================================================
//  cmd-Topics abonnieren
// =============================================================
static void mqttSubscribe()
{
    String wildcard = String(MQTT_CMD_PREFIX) + "/#";
    mqtt.subscribe(wildcard.c_str());
    Serial.printf("[MQTT] Subscribed: %s\n", wildcard.c_str());
}

// =============================================================
void mqtt_init()
{
    mqtt.setServer(MQTT_BROKER, MQTT_PORT);
    mqtt.setBufferSize(512);
    mqtt.setCallback(mqttCallback);
    Serial.printf("[MQTT] Broker: %s:%d\n", MQTT_BROKER, MQTT_PORT);
}

// =============================================================
void mqtt_task()
{
    if (!state.eth_connected) return;

    if (!mqtt.connected()) {
        state.mqtt_connected = false;
        unsigned long now = millis();
        if (now - last_reconnect < MQTT_RECONNECT_MS) return;
        last_reconnect = now;

        Serial.println("[MQTT] Verbindungsversuch …");
        if (mqtt.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASS)) {
            Serial.println("[MQTT] Verbunden!");
            state.mqtt_connected = true;
            mqttSubscribe();
        } else {
            Serial.printf("[MQTT] Fehler: rc=%d\n", mqtt.state());
        }
        return;
    }

    state.mqtt_connected = true;
    mqtt.loop();
}

// =============================================================
//  Rohe Sensordaten publishen (alle MQTT_PUBLISH_MS)
// =============================================================
void mqtt_publish()
{
    if (!mqtt.connected()) return;

    unsigned long now = millis();
    if (now - last_publish < MQTT_PUBLISH_MS) return;
    last_publish = now;

    // ── V20 Ist-Werte ──
    mqtt.publish(rawTopic("v20/frequency").c_str(),
                 String(state.v20_frequency, 2).c_str());
    mqtt.publish(rawTopic("v20/current").c_str(),
                 String(state.v20_current, 2).c_str());
    mqtt.publish(rawTopic("v20/voltage").c_str(),
                 String(state.v20_voltage, 1).c_str());
    mqtt.publish(rawTopic("v20/power").c_str(),
                 String(state.v20_power * 1000.0f, 0).c_str());  // kW → W
    mqtt.publish(rawTopic("v20/running").c_str(),
                 state.v20_running ? "ON" : "OFF");
    mqtt.publish(rawTopic("v20/connected").c_str(),
                 state.v20_connected ? "ON" : "OFF");
    mqtt.publish(rawTopic("v20/fault").c_str(),
                 state.v20_fault > 0 ? "ON" : "OFF");
    mqtt.publish(rawTopic("v20/fault_code").c_str(),
                 String(state.v20_fault_code).c_str());

    // V20 Status-Text
    const char* statusText = "UNBEKANNT";
    if (!state.v20_connected)           statusText = "OFFLINE";
    else if (state.v20_fault > 0)       statusText = "STÖRUNG";
    else if (state.v20_running)         statusText = "LÄUFT";
    else if (state.v20_status_word == 60209) statusText = "BEREIT";
    else                                statusText = "AUS";
    mqtt.publish(rawTopic("v20/status").c_str(), statusText);

    // ── Sensoren (von LOGO via Modbus TCP) ──
    mqtt.publish(rawTopic("pressure").c_str(),
                 String(state.pressure_bar, 2).c_str());
    mqtt.publish(rawTopic("flow").c_str(),
                 String(state.flow_rate, 1).c_str());
    if (state.water_temp > -100.0f) {
        mqtt.publish(rawTopic("water_temp").c_str(),
                     String(state.water_temp, 1).c_str());
    }

    // ── DS18B20 Temperatur ──
    if (state.temperature > -100.0f) {
        mqtt.publish(rawTopic("temperature").c_str(),
                     String(state.temperature, 1).c_str());
    }

    // ── Lüfter ──
    mqtt.publish(rawTopic("fan/rpm").c_str(),
                 String(state.fan_rpm).c_str());
    mqtt.publish(rawTopic("fan/pwm").c_str(),
                 String(state.fan_pwm).c_str());
    mqtt.publish(rawTopic("fan/mode").c_str(),
                 fanModeStr(state.fan_mode));
}
