"""Dependency-Container — wird vom main.py befüllt, von den Routen konsumiert.

Vermeidet zirkuläre Imports zwischen main.py und api/*.py.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..irrigation import IrrigationManager
    from ..modbus_rtu import V20RtuClient
    from ..presets import PresetManager
    from ..pressure_ctrl import PressureController


class Deps:
    pi_ctrl: "PressureController" = None  # type: ignore[assignment]
    preset_mgr: "PresetManager" = None    # type: ignore[assignment]
    irrigation: "IrrigationManager" = None  # type: ignore[assignment]
    rtu: "V20RtuClient" = None            # type: ignore[assignment]


deps = Deps()
