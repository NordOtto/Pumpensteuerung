// ============================================================
//  fallback_ctrl.cpp – Lokaler Druckschalter-Fallback
// ============================================================
#include <LittleFS.h>
#include "fallback_ctrl.h"
#include "config.h"
#include "modbus_v20.h"
#include "webserver.h"

static int           fb_state     = 0;   // 0=gestoppt, 1=läuft
static unsigned long fb_last_tick = 0;

// ── Konfiguration in LittleFS sichern ──
static void fb_save()
{
    File f = LittleFS.open(FALLBACK_FILE, "w");
    if (!f) return;
    f.printf("%.2f\n%.2f\n%.1f\n",
             state.fallback_p_on,
             state.fallback_p_off,
             state.fallback_freq);
    f.close();
}

// =============================================================
void fallback_ctrl_load()
{
    if (!LittleFS.exists(FALLBACK_FILE)) {
        Serial.println("[FB] Keine Konfigurationsdatei – Standardwerte aktiv");
        return;
    }
    File f = LittleFS.open(FALLBACK_FILE, "r");
    if (!f) return;

    float p_on  = f.readStringUntil('\n').toFloat();
    float p_off = f.readStringUntil('\n').toFloat();
    float freq  = f.readStringUntil('\n').toFloat();
    f.close();

    if (p_on  >= 0.5f  && p_on  <= 6.0f)  state.fallback_p_on  = p_on;
    if (p_off >= 1.0f  && p_off <= 8.0f)  state.fallback_p_off = p_off;
    if (freq  >= 10.0f && freq  <= 60.0f) state.fallback_freq  = freq;

    Serial.printf("[FB] Geladen: p_on=%.1f bar  p_off=%.1f bar  freq=%.0f Hz\n",
                  state.fallback_p_on, state.fallback_p_off, state.fallback_freq);
}

// =============================================================
void fallback_ctrl_set_p_on(float bar)
{
    if (bar < 0.5f || bar > 6.0f) return;
    state.fallback_p_on = bar;
    fb_save();
    Serial.printf("[FB] p_on → %.2f bar\n", bar);
}

void fallback_ctrl_set_p_off(float bar)
{
    if (bar < 1.0f || bar > 8.0f) return;
    state.fallback_p_off = bar;
    fb_save();
    Serial.printf("[FB] p_off → %.2f bar\n", bar);
}

void fallback_ctrl_set_freq(float hz)
{
    if (hz < 10.0f || hz > 60.0f) return;
    state.fallback_freq = hz;
    fb_save();
    Serial.printf("[FB] freq → %.1f Hz\n", hz);
}

// =============================================================
void fallback_ctrl_enter()
{
    // Aktuellen Pumpenstatus übernehmen, damit laufende Pumpe weiterläuft
    fb_state            = state.v20_running ? 1 : 0;
    state.fallback_mode = true;

    Serial.printf("[FB] Fallback aktiv – p_on=%.1f  p_off=%.1f  freq=%.0f Hz\n",
                  state.fallback_p_on, state.fallback_p_off, state.fallback_freq);
    web_log("[FB] Netzwerk weg – lokaler Druckschalter aktiv "
            "(p_on=%.1f / p_off=%.1f bar)",
            state.fallback_p_on, state.fallback_p_off);
}

void fallback_ctrl_exit()
{
    state.fallback_mode = false;
    fb_state            = 0;

    Serial.println("[FB] Server verbunden – PI-Regelung übernimmt");
    web_log("[FB] Server verbunden – PI-Regelung übernimmt");
}

// =============================================================
//  Regelzyklus 500 ms
// =============================================================
void fallback_ctrl_tick()
{
    if (!state.fallback_mode) return;

    unsigned long now = millis();
    if (now - fb_last_tick < 500) return;
    fb_last_tick = now;

    // V20 nicht erreichbar oder Störung → sicherer Stopp
    if (!state.v20_connected) return;
    if (state.v20_fault) {
        if (state.v20_running) modbus_v20_stop();
        fb_state = 0;
        return;
    }

    float p = state.pressure_bar;
    if (p <= 0.0f) return;   // Noch kein gültiger Druckwert

    if (fb_state == 0) {
        // Einschaltbedingung
        if (p < state.fallback_p_on) {
            modbus_v20_set_frequency(state.fallback_freq);
            modbus_v20_start();
            fb_state = 1;
            web_log("[FB] Druck %.2f bar < %.1f → Pumpe START",
                    p, state.fallback_p_on);
        }
    } else {
        // Ausschaltbedingung
        if (p >= state.fallback_p_off) {
            modbus_v20_stop();
            fb_state = 0;
            web_log("[FB] Druck %.2f bar >= %.1f → Pumpe STOP",
                    p, state.fallback_p_off);
        }
    }
}
