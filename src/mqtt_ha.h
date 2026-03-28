// ============================================================
//  mqtt_ha.h – MQTT Hardware-Brücke
//  Publisht raw Sensordaten, empfängt cmd-Befehle vom Backend
// ============================================================
#pragma once

#include "config.h"

// Initialisierung (Client, Broker, Callbacks)
void mqtt_init();

// In loop() aufrufen – Reconnect + client.loop()
void mqtt_task();

// Alle Werte auf raw-Topics publishen (500 ms Intervall intern)
void mqtt_publish();
