from app.irrigation_wizard import recommend_smart_et


def test_lawn_full_sun_recommendation_is_deep_watering():
    rec = recommend_smart_et({
        "plant_type": "rasen",
        "soil_type": "lehmig",
        "sun_exposure": "vollsonnig",
        "measured_mm": 5,
        "test_minutes": 10,
        "preset": "Rasen",
    })

    assert rec["program_patch"]["mode"] == "smart_et"
    assert rec["program_patch"]["max_runs_per_week"] == 3
    assert rec["zone_patch"]["target_mm"] >= 25
    assert rec["zone_patch"]["min_deficit_mm"] >= 16
    assert rec["zone_patch"]["duration_min"] >= 45
    assert rec["zone_patch"]["cycle_min"] == 12
    assert rec["zone_patch"]["soak_min"] == 25


def test_drip_zone_uses_given_preset_and_clamps_duration():
    rec = recommend_smart_et({
        "plant_type": "tropfschlauch",
        "soil_type": "schwer",
        "sun_exposure": "schattig",
        "measured_mm": 0.2,
        "test_minutes": 30,
        "preset": "Tropfschlauch",
    })

    assert rec["zone_patch"]["preset"] == "Tropfschlauch"
    assert rec["zone_patch"]["duration_min"] <= 240
    assert rec["precip_mm_h"] > 0
