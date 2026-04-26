// ============================================================
//  fallback_ctrl.h – Lokaler Druckschalter-Fallback
//
//  Läuft autonom auf dem ESP32 wenn MQTT/Server nicht erreichbar.
//  Verhält sich wie ein externer Druckschalter:
//    Druck < p_on  → Pumpe START (Festfrequenz)
//    Druck ≥ p_off → Pumpe STOP
//
//  Konfiguration wird vom Backend per MQTT mit retain=true
//  gesendet und in LittleFS gespeichert, damit sie einen
//  Stromausfall überlebt.
// ============================================================
#pragma once

// Gespeicherte Konfiguration aus LittleFS laden
void fallback_ctrl_load();

// Einzelne Parameter setzen (werden sofort in LittleFS gespeichert)
void fallback_ctrl_set_p_on(float bar);
void fallback_ctrl_set_p_off(float bar);
void fallback_ctrl_set_freq(float hz);

// Fallback aktivieren / deaktivieren (von checkWatchdog aufgerufen)
void fallback_ctrl_enter();
void fallback_ctrl_exit();

// 500 ms Regelzyklus – in loop() aufrufen
void fallback_ctrl_tick();
