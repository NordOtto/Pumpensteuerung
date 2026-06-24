"""Gehäuselüfter-Steuerung über GPIO.

Schaltet einen PC-Lüfter (12V an 5V, über IRLZ44N Low-Side-Switch an GPIO 17)
ein, sobald der V20-Frequenzumrichter läuft, und nach einer konfigurierbaren
Nachlaufzeit wieder aus.

Trigger ist `app_state.v20.running` (Bit 2 des V20-Statusworts). Die eigentliche
Logik ist hardware-unabhängig in `tick()`; der GPIO-Zugriff wird gekapselt und
fällt auf der Entwicklungsmaschine (kein RPi.GPIO) auf einen No-Op zurück.
"""
from __future__ import annotations

import time

from .state import app_state, web_log

# BCM-Nummerierung: GPIO 17 = physischer Pin 11. Frei, kein Boot-Sonderverhalten.
FAN_GPIO = 17
# Nachlaufzeit, damit Restwärme nach Pumpenstopp noch abgeführt wird.
POSTRUN_S = 120.0


class FanController:
    def __init__(self, pin: int = FAN_GPIO, postrun_s: float = POSTRUN_S) -> None:
        self._pin = pin
        self._postrun_s = postrun_s
        self._gpio = None
        self._on = False
        self._off_at: float | None = None  # monotone Deadline für Nachlauf
        self._init_gpio()

    def _init_gpio(self) -> None:
        try:
            import RPi.GPIO as GPIO  # type: ignore
        except Exception as exc:
            web_log(f"[FAN] RPi.GPIO nicht verfügbar ({exc}) — Lüfter-GPIO deaktiviert")
            return
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        GPIO.setup(self._pin, GPIO.OUT, initial=GPIO.LOW)
        self._gpio = GPIO
        web_log(f"[FAN] GPIO {self._pin} initialisiert (Nachlauf {self._postrun_s:.0f}s)")

    def _set(self, on: bool) -> None:
        if self._on == on:
            return
        self._on = on
        if self._gpio is not None:
            self._gpio.output(self._pin, self._gpio.HIGH if on else self._gpio.LOW)
        web_log(f"[FAN] Lüfter {'AN' if on else 'AUS'}")

    def tick(self) -> None:
        """Wird periodisch aufgerufen. Lüfter folgt v20.running mit Nachlauf."""
        running = app_state.v20.running
        now = time.monotonic()

        if running:
            self._off_at = None
            self._set(True)
        else:
            if self._on:
                # Pumpe gerade gestoppt → Nachlauf-Deadline setzen
                if self._off_at is None:
                    self._off_at = now + self._postrun_s
                elif now >= self._off_at:
                    self._set(False)
                    self._off_at = None

        app_state.fan.mode = "AN" if self._on else "AUS"

    def cleanup(self) -> None:
        self._set(False)
        if self._gpio is not None:
            self._gpio.cleanup(self._pin)


controller = FanController()
