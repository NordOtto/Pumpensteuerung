// ============================================================
//  webserver.h – AsyncWebServer + WebSocket + REST API + Auth
// ============================================================
#pragma once

#include "config.h"

// Server starten (Port 80, Routen registrieren)
void webserver_init();

// In loop() aufrufen – WebSocket CleanUp
void webserver_task();

// JSON-Broadcast an alle WebSocket-Clients
void webserver_broadcast();

// Log-Nachricht an Web-UI senden (printf-Format)
void web_log(const char* fmt, ...);
