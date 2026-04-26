// ============================================================
//  main.cpp – Modbus Gateway  ESP32 DevKit C
//
//  LOGO 8.4  ←  Modbus TCP (Port 502)  →  ESP32 DevKit C
//                                             ↕
//                                       Modbus RTU / RS485
//                                             ↕
//                                      Sinamics V20  (FU)
//
//  + MQTT (Home Assistant)  + Web-UI  + DS18B20  + PWM-Fan
// ============================================================

#include <Arduino.h>
#include <WiFi.h>
#include <ArduinoOTA.h>
#include <LittleFS.h>

#include "config.h"
#include "modbus_v20.h"
#include "modbus_tcp.h"
#include "mqtt_ha.h"
#include "sensors.h"
#include "webserver.h"
#include "fallback_ctrl.h"

// ── Globaler Zustand ──
AppState state;

// ── Timing ──
static unsigned long last_tcp_update = 0;
static unsigned long last_fan        = 0;
static unsigned long last_watchdog   = 0;
static unsigned long boot_time       = 0;

// ── WiFi-Event ──
static void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info)
{
    switch (event) {
    case ARDUINO_EVENT_WIFI_STA_START:
        WiFi.setHostname(OTA_HOSTNAME);
        Serial.println("[WiFi] Gestartet");
        break;
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:
        Serial.println("[WiFi] AP verbunden");
        break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
        state.eth_connected = true;
        state.ip_address    = WiFi.localIP().toString();
        Serial.printf("[WiFi] IP: %s  MAC: %s\n",
                      state.ip_address.c_str(),
                      WiFi.macAddress().c_str());
        break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
        state.eth_connected = false;
        Serial.println("[WiFi] Verbindung getrennt – reconnect...");
        WiFi.begin(WIFI_SSID, WIFI_PASS);
        break;
    default:
        break;
    }
}

// ── Watchdog / Fallback ──
static void checkWatchdog()
{
    unsigned long now = millis();
    if (now - last_watchdog < 1000) return;
    last_watchdog = now;

    // Uptime aktualisieren
    state.uptime_s = (now - boot_time) / 1000;

    static unsigned long mqtt_lost_since  = 0;
    static bool          fallback_active  = false;

    if (!state.mqtt_connected) {
        if (mqtt_lost_since == 0) mqtt_lost_since = now;
        // Nach WATCHDOG_TIMEOUT_S Sekunden: Fallback-Regelung aktivieren
        if (!fallback_active &&
            (now - mqtt_lost_since > (unsigned long)WATCHDOG_TIMEOUT_S * 1000))
        {
            fallback_ctrl_enter();
            fallback_active = true;
        }
    } else {
        if (fallback_active) {
            fallback_ctrl_exit();
            fallback_active = false;
        }
        mqtt_lost_since = 0;
    }
}

// =============================================================
//  SETUP
// =============================================================
void setup()
{
    Serial.begin(115200);
    delay(500);
    Serial.println();
    Serial.println("========================================");
    Serial.println("  Modbus Gateway ESP32-DevKit-C  v" FW_VERSION);
    Serial.println("========================================");

    boot_time = millis();

    // ── Status-LED ──
    pinMode(STATUS_LED_PIN, OUTPUT);
    digitalWrite(STATUS_LED_PIN, LOW);

    // ── WiFi ──
    WiFi.onEvent(onWiFiEvent);
    WiFi.begin(WIFI_SSID, WIFI_PASS);

    // Auf IP warten (max 15 s)
    Serial.print("[WiFi] Warte auf IP (DHCP) ");
    unsigned long t0 = millis();
    while (!state.eth_connected && millis() - t0 < 15000) {
        Serial.print(".");
        delay(500);
    }
    Serial.println();

    if (!state.eth_connected) {
        Serial.println("[WiFi] ⚠ Keine IP erhalten – Fortfahren ohne Netzwerk");
    }

    // ── ArduinoOTA ──
    ArduinoOTA.setHostname(OTA_HOSTNAME);
    ArduinoOTA.setPassword(OTA_PASSWORD);
    ArduinoOTA.onStart([]() {
        Serial.println("[OTA] Update startet …");
    });
    ArduinoOTA.onEnd([]() {
        Serial.println("\n[OTA] Fertig – Neustart");
    });
    ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
        Serial.printf("[OTA] %u%%\r", progress * 100 / total);
    });
    ArduinoOTA.onError([](ota_error_t error) {
        Serial.printf("[OTA] Fehler [%u]\n", error);
    });
    ArduinoOTA.begin();
    Serial.println("[OTA] Bereit  (Hostname: " OTA_HOSTNAME ")");

    // ── LittleFS ──
    if (LittleFS.begin(true)) {
        Serial.println("[FS]  LittleFS gemountet");
    } else {
        Serial.println("[FS]  ⚠ LittleFS Fehler");
    }

    // ── Fallback-Konfiguration laden ──
    fallback_ctrl_load();

    // ── Modbus RTU  (V20) ──
    modbus_v20_init();

    // ── Modbus TCP  (LOGO) ──
    modbus_tcp_init();

    // ── MQTT ──
    mqtt_init();

    // ── Sensoren + Lüfter ──
    sensors_init();

    // ── Webserver ──
    webserver_init();

    // ── Fertig ──
    digitalWrite(STATUS_LED_PIN, HIGH);
    Serial.println("========================================");
    Serial.println("  Initialisierung abgeschlossen");
    Serial.printf("  IP:   %s\n", state.ip_address.c_str());
    Serial.printf("  HTTP: Port %d\n", WEB_PORT);
    Serial.printf("  TCP:  Port %d\n", MODBUS_TCP_PORT);
    Serial.printf("  MQTT: %s:%d\n", MQTT_BROKER, MQTT_PORT);
    Serial.println("========================================\n");
}

// =============================================================
//  LOOP
// =============================================================
void loop()
{
    unsigned long now = millis();

    // ── OTA ──
    ArduinoOTA.handle();

    // ── Modbus RTU ──
    modbus_v20_task();
    modbus_v20_poll();          // ZSW+HIW, 500 ms
    modbus_v20_diag_poll();     // Spannung/Strom/DC-Bus/Leistung, 5 s
    modbus_v20_reg_scan();      // Einmaliger Register-Scan nach Boot

    // ── Modbus TCP ──
    modbus_tcp_task();
    if (now - last_tcp_update >= 250) {
        modbus_tcp_update();         // State → LOGO-Register
        modbus_tcp_check_writes();   // LOGO-Register → V20
        last_tcp_update = now;
    }

    // ── MQTT ──
    mqtt_task();
    mqtt_publish();             // intern auf 2000 ms getimed

    // ── Sensoren ──
    sensors_read_temperature(); // intern non-blocking, 2 s Zyklus
    sensors_read_fan_rpm();     // intern 1 s Zyklus

    // ── Lüfter-Regelung ──
    if (now - last_fan >= 500) {
        fan_control();
        last_fan = now;
    }

    // ── WebSocket Broadcast ──
    webserver_task();
    webserver_broadcast();      // intern auf 1000 ms getimed

    // ── Fallback-Regelung ──
    fallback_ctrl_tick();

    // ── Watchdog ──
    checkWatchdog();
}