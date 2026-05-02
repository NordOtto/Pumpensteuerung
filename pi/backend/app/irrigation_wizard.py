"""Praxisnaher Smart-ET-Assistent."""
from __future__ import annotations

from typing import Any

PLANT_PROFILES: dict[str, dict[str, float]] = {
    "rasen": {"target_mm": 25.0, "min_deficit_mm": 16.0, "seasonal_factor": 1.0},
    "hecke": {"target_mm": 12.0, "min_deficit_mm": 7.0, "seasonal_factor": 0.85},
    "beet": {"target_mm": 10.0, "min_deficit_mm": 6.0, "seasonal_factor": 0.8},
    "tropfschlauch": {"target_mm": 14.0, "min_deficit_mm": 8.0, "seasonal_factor": 0.75},
}

SOIL_FACTOR = {"sandig": 0.8, "lehmig": 1.0, "schwer": 1.15}
SUN_FACTOR = {"schattig": 0.8, "halbsonnig": 1.0, "vollsonnig": 1.2}


def _num(value: Any, fallback: float, lo: float, hi: float) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        n = fallback
    return max(lo, min(hi, n))


def recommend_smart_et(payload: dict[str, Any]) -> dict[str, Any]:
    plant = str(payload.get("plant_type") or "rasen").strip().lower()
    soil = str(payload.get("soil_type") or "lehmig").strip().lower()
    sun = str(payload.get("sun_exposure") or "halbsonnig").strip().lower()
    preset = str(payload.get("preset") or "Normal").strip() or "Normal"
    profile = PLANT_PROFILES.get(plant, PLANT_PROFILES["rasen"])

    measured_mm = _num(payload.get("measured_mm"), 6.0, 0.1, 80.0)
    test_minutes = _num(payload.get("test_minutes"), 10.0, 1.0, 240.0)
    max_runs = int(round(_num(payload.get("max_runs_per_week"), 3, 1, 4)))
    precip_mm_h = measured_mm / test_minutes * 60.0

    stress = SOIL_FACTOR.get(soil, 1.0) * SUN_FACTOR.get(sun, 1.0)
    target_mm = round(profile["target_mm"] * stress, 1)
    min_deficit_mm = round(profile["min_deficit_mm"] * stress, 1)
    seasonal_factor = round(profile["seasonal_factor"] * SUN_FACTOR.get(sun, 1.0), 2)
    duration_min = round(max(3.0, min(240.0, target_mm / max(precip_mm_h, 0.1) * 60.0)))
    water_mm = round(precip_mm_h * duration_min / 60.0, 1)
    cycle_min = 12 if plant == "rasen" and duration_min >= 25 else 0
    soak_min = 25 if cycle_min else 0

    return {
        "zone_patch": {
            "duration_min": duration_min,
            "water_mm": water_mm,
            "target_mm": target_mm,
            "min_deficit_mm": min_deficit_mm,
            "cycle_min": cycle_min,
            "soak_min": soak_min,
            "preset": preset,
            "plant_type": plant.capitalize(),
        },
        "program_patch": {
            "mode": "smart_et",
            "max_runs_per_week": max_runs,
            "seasonal_factor": seasonal_factor,
            "weather_enabled": True,
        },
        "precip_mm_h": round(precip_mm_h, 1),
        "summary": (
            f"{plant.capitalize()}: {precip_mm_h:.1f} mm/h, Ziel {target_mm:.1f} mm, "
            f"Start ab {min_deficit_mm:.1f} mm Defizit, ca. {duration_min} min je Lauf."
        ),
    }
