// ============================================================
//  modbus_tcp.h – Modbus TCP Server für Siemens LOGO 8.4
// ============================================================
#pragma once

#include "config.h"

// Server starten (Port 502, Register anlegen)
void modbus_tcp_init();

// In loop() aufrufen – TCP-Verbindungen verarbeiten
void modbus_tcp_task();

// Lese-Register mit aktuellen Werten befüllen (state → TCP)
void modbus_tcp_update();

// Prüfen ob LOGO Schreib-Register geändert hat (TCP → V20/Fan)
void modbus_tcp_check_writes();

// Watchdog: Zeitpunkt des letzten LOGO-Schreibzugriffs (millis)
unsigned long modbus_tcp_last_stw_write();
