// ============================================================
//  sensors.h – DS18B20 Temperatur + 4-Pin PWM-Lüfter
// ============================================================
#pragma once

#include "config.h"

// Initialisierung (OneWire, LEDC, Tach-Interrupt)
void sensors_init();

// Temperatur auslesen (non-blocking, intern getimed)
void sensors_read_temperature();

// Fan RPM berechnen (alle 1 s)
void sensors_read_fan_rpm();

// Lüfter-PWM setzen (0–255)
void fan_set_pwm(uint8_t pwm);

// Fan-Regelung gemäß aktuellem Modus
void fan_control();
