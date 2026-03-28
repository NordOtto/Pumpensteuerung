// ============================================================
//  modbus_v20.h – Sinamics V20 Modbus RTU Master
// ============================================================
#pragma once

#include "config.h"

// Initialisierung  (Serial2 + ModbusRTU)
void modbus_v20_init();

// In loop() aufrufen – verarbeitet RTU-Queue
void modbus_v20_task();

// Zyklisches Lesen ZSW+HIW (500 ms) → schreibt in state
void modbus_v20_poll();

// Langsamer Diagnosepoll Spannung/Strom/DC-Bus/Leistung (5 s)
void modbus_v20_diag_poll();

// Steuerbefehle
void modbus_v20_start();
void modbus_v20_stop();
void modbus_v20_fault_reset();
void modbus_v20_set_frequency(float hz);

// Rohes Steuerwort schreiben (z.B. von LOGO durchgereicht)
void modbus_v20_write_stw(uint16_t stw);

// Einmaliger Register-Scan (Reg 20–40) nach Verbindung → Log
void modbus_v20_reg_scan();
