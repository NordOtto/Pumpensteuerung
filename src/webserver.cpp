// ============================================================
//  webserver.cpp – AsyncWebServer + WebSocket + REST API
//  Notfall-Zugriff und OTA im Heimnetz.
//  Steuerungslogik (PI, Timeguard, Presets) läuft im Backend.
// ============================================================
#include "webserver.h"
#include "web_index.h"
#include "modbus_v20.h"
#include "sensors.h"
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <stdarg.h>

// ── Objekte ──
static AsyncWebServer server(WEB_PORT);
static AsyncWebSocket ws("/ws");

// ── Broadcast-Timer ──
static unsigned long last_broadcast = 0;

// ── Log-Ringbuffer ──
#define LOG_LINES    200
#define LOG_LINE_LEN 120
static char   log_ring[LOG_LINES][LOG_LINE_LEN];
static int    log_head  = 0;
static int    log_count = 0;
static bool   log_dirty = false;
static uint32_t log_seq = 0;

void web_log(const char* fmt, ...)
{
    char buf[LOG_LINE_LEN];
    unsigned long s = millis() / 1000;
    int h = (s / 3600) % 24;
    int m = (s / 60) % 60;
    int sec = s % 60;
    int offset = snprintf(buf, sizeof(buf), "%02d:%02d:%02d ", h, m, sec);

    va_list args;
    va_start(args, fmt);
    vsnprintf(buf + offset, sizeof(buf) - offset, fmt, args);
    va_end(args);

    strncpy(log_ring[log_head], buf, LOG_LINE_LEN - 1);
    log_ring[log_head][LOG_LINE_LEN - 1] = '\0';
    log_head = (log_head + 1) % LOG_LINES;
    if (log_count < LOG_LINES) log_count++;
    log_seq++;
    log_dirty = true;

    Serial.println(buf);
}

// =============================================================
//  JSON-Status aufbauen
// =============================================================
static String buildStatusJson()
{
    JsonDocument doc;

    // V20
    JsonObject v20 = doc["v20"].to<JsonObject>();
    v20["status"]        = state.v20_status_word;
    v20["frequency"]     = round(state.v20_frequency * 100) / 100.0;
    v20["freq_setpoint"] = round(state.v20_freq_setpoint * 10) / 10.0;
    v20["voltage"]       = round(state.v20_voltage * 10) / 10.0;
    v20["current"]       = round(state.v20_current * 100) / 100.0;
    v20["dc_bus"]        = state.v20_dc_bus;
    v20["power"]         = round(state.v20_power * 100) / 100.0;
    v20["fault"]         = state.v20_fault;
    v20["fault_code"]    = state.v20_fault_code;
    v20["running"]       = state.v20_running;
    v20["connected"]     = state.v20_connected;

    // Temperatur
    doc["temp"] = round(state.temperature * 10) / 10.0;

    // Fan
    JsonObject fan = doc["fan"].to<JsonObject>();
    fan["rpm"]  = state.fan_rpm;
    fan["pwm"]  = state.fan_pwm;
    const char* modes[] = {"Auto", "LOGO", "MQTT", "Web"};
    fan["mode"] = modes[state.fan_mode < 4 ? state.fan_mode : 0];

    // Sensoren
    JsonObject sensors = doc["sensors"].to<JsonObject>();
    sensors["pressure"]   = round(state.pressure_bar * 100) / 100.0;
    sensors["flow"]       = round(state.flow_rate * 10) / 10.0;
    sensors["flow_est"]   = state.flow_estimated;
    sensors["water_temp"] = round(state.water_temp * 10) / 10.0;

    // System
    JsonObject sys = doc["sys"].to<JsonObject>();
    sys["ip"]            = state.ip_address;
    sys["uptime"]        = state.uptime_s;
    sys["fw"]            = FW_VERSION;
    sys["rtu_connected"] = state.v20_connected;
    sys["tcp_clients"]   = state.tcp_clients;
    sys["mqtt"]          = state.mqtt_connected;

    String json;
    serializeJson(doc, json);
    return json;
}

// =============================================================
//  WebSocket Events
// =============================================================
static void onWsEvent(AsyncWebSocket* server,
                      AsyncWebSocketClient* client,
                      AwsEventType type, void* arg,
                      uint8_t* data, size_t len)
{
    if (type == WS_EVT_CONNECT) {
        Serial.printf("[WS] Client #%u verbunden\n", client->id());
    }
    else if (type == WS_EVT_DISCONNECT) {
        Serial.printf("[WS] Client #%u getrennt\n", client->id());
    }
    else if (type == WS_EVT_DATA) {
        AwsFrameInfo* info = (AwsFrameInfo*)arg;
        if (info->final && info->index == 0 && info->len == len
            && info->opcode == WS_TEXT)
        {
            data[len] = 0;
            JsonDocument doc;
            if (deserializeJson(doc, (char*)data) == DeserializationError::Ok) {
                String cmd = doc["cmd"] | "";
                if (cmd == "start")      modbus_v20_start();
                else if (cmd == "stop")  modbus_v20_stop();
                else if (cmd == "reset") modbus_v20_fault_reset();
                else if (cmd == "freq") {
                    float hz = doc["value"] | 0.0f;
                    modbus_v20_set_frequency(hz);
                }
                else if (cmd == "fan_pwm") {
                    uint8_t pwm = doc["value"] | 0;
                    fan_set_pwm(pwm);
                }
                else if (cmd == "fan_mode") {
                    String m = doc["value"] | "Auto";
                    if      (m == "LOGO") state.fan_mode = FAN_MODE_LOGO;
                    else if (m == "MQTT") state.fan_mode = FAN_MODE_MQTT;
                    else if (m == "Web")  state.fan_mode = FAN_MODE_WEB;
                    else                  state.fan_mode = FAN_MODE_AUTO;
                }
            }
        }
    }
}

// =============================================================
//  Routen registrieren
// =============================================================
static void setupRoutes()
{
    // ── Hauptseite ──
    server.on("/", HTTP_GET, [](AsyncWebServerRequest* req) {
        AsyncWebServerResponse* resp = req->beginResponse_P(
            200, "text/html", (const uint8_t*)INDEX_HTML, sizeof(INDEX_HTML) - 1);
        req->send(resp);
    });

    // ── Status (GET) ──
    server.on("/api/status", HTTP_GET, [](AsyncWebServerRequest* req) {
        req->send(200, "application/json", buildStatusJson());
    });

    // ── V20 Start ──
    server.on("/api/v20/start", HTTP_POST, [](AsyncWebServerRequest* req) {
        modbus_v20_start();
        req->send(200, "application/json", "{\"ok\":true}");
    });

    // ── V20 Stop ──
    server.on("/api/v20/stop", HTTP_POST, [](AsyncWebServerRequest* req) {
        modbus_v20_stop();
        req->send(200, "application/json", "{\"ok\":true}");
    });

    // ── V20 Fault Reset ──
    server.on("/api/v20/reset", HTTP_POST, [](AsyncWebServerRequest* req) {
        modbus_v20_fault_reset();
        req->send(200, "application/json", "{\"ok\":true}");
    });

    // ── V20 Frequenz setzen ──
    server.on("/api/v20/freq", HTTP_POST,
        [](AsyncWebServerRequest* req) {},
        NULL,
        [](AsyncWebServerRequest* req, uint8_t* data,
           size_t len, size_t index, size_t total)
    {
        JsonDocument doc;
        deserializeJson(doc, (char*)data);
        float hz = doc["hz"] | 0.0f;
        modbus_v20_set_frequency(hz);
        req->send(200, "application/json", "{\"ok\":true}");
    });

    // ── Fan PWM setzen ──
    server.on("/api/fan/pwm", HTTP_POST,
        [](AsyncWebServerRequest* req) {},
        NULL,
        [](AsyncWebServerRequest* req, uint8_t* data,
           size_t len, size_t index, size_t total)
    {
        JsonDocument doc;
        deserializeJson(doc, (char*)data);
        uint8_t pwm = doc["pwm"] | 0;
        fan_set_pwm(pwm);
        req->send(200, "application/json", "{\"ok\":true}");
    });

    // ── Fan Mode setzen ──
    server.on("/api/fan/mode", HTTP_POST,
        [](AsyncWebServerRequest* req) {},
        NULL,
        [](AsyncWebServerRequest* req, uint8_t* data,
           size_t len, size_t index, size_t total)
    {
        JsonDocument doc;
        deserializeJson(doc, (char*)data);
        String mode = doc["mode"] | "Auto";
        if      (mode == "LOGO") state.fan_mode = FAN_MODE_LOGO;
        else if (mode == "MQTT") state.fan_mode = FAN_MODE_MQTT;
        else if (mode == "Web")  state.fan_mode = FAN_MODE_WEB;
        else                     state.fan_mode = FAN_MODE_AUTO;
        req->send(200, "application/json", "{\"ok\":true}");
    });

    // ── PWA Manifest ──
    server.on("/manifest.json", HTTP_GET, [](AsyncWebServerRequest* req) {
        String json = "{\"name\":\"Pumpensteuerung\","
                      "\"short_name\":\"Pumpe\","
                      "\"start_url\":\"/\","
                      "\"display\":\"standalone\","
                      "\"background_color\":\"#111827\","
                      "\"theme_color\":\"#111827\","
                      "\"icons\":[{\"src\":\"/icon.svg\","
                      "\"sizes\":\"any\","
                      "\"type\":\"image/svg+xml\"}]}";
        req->send(200, "application/manifest+json", json);
    });

    // ── PWA Icon ──
    server.on("/icon.svg", HTTP_GET, [](AsyncWebServerRequest* req) {
        String svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>"
                     "<rect width='100' height='100' rx='20' fill='#0d9488'/>"
                     "<text x='50' y='68' text-anchor='middle' font-size='50' fill='white'>\xF0\x9F\x92\xA7</text>"
                     "</svg>";
        req->send(200, "image/svg+xml", svg);
    });

    // ── 404 ──
    server.onNotFound([](AsyncWebServerRequest* req) {
        req->send(404, "text/plain", "Not Found");
    });
}

// =============================================================
void webserver_init()
{
    ws.onEvent(onWsEvent);
    server.addHandler(&ws);

    setupRoutes();
    server.begin();

    Serial.printf("[WEB] Server auf Port %d gestartet\n", WEB_PORT);
}

// =============================================================
void webserver_task()
{
    ws.cleanupClients();
}

// =============================================================
static String buildLogJson()
{
    String json = "{\"log\":[";
    int start = (log_count < LOG_LINES) ? 0 : log_head;
    for (int i = 0; i < log_count; i++) {
        int idx = (start + i) % LOG_LINES;
        if (i > 0) json += ',';
        json += '"';
        for (const char* p = log_ring[idx]; *p; p++) {
            if (*p == '"')  json += "\\\"";
            else if (*p == '\\') json += "\\\\";
            else if (*p == '\n') json += "\\n";
            else json += *p;
        }
        json += '"';
    }
    json += "],\"logSeq\":";
    json += String(log_seq);
    json += '}';
    return json;
}

// =============================================================
void webserver_broadcast()
{
    unsigned long now = millis();
    if (now - last_broadcast < WS_BROADCAST_MS) return;
    last_broadcast = now;

    if (ws.count() == 0) return;

    ws.textAll(buildStatusJson());

    if (log_dirty) {
        log_dirty = false;
        ws.textAll(buildLogJson());
    }
}
