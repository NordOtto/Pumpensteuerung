from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

from .persistence import IRRIGATION_WEATHER_CONFIG_FILE, load_json, save_json
from .state import web_log


DEFAULT_CONFIG: dict[str, Any] = {
    "source": "manual_ha",
    "openweathermap": {
        "api_key": "",
        "lat": 0.0,
        "lon": 0.0,
        "refresh_min": 60,
    },
    "last_refresh": None,
    "last_ok": None,
    "last_message": "",
}


class WeatherProvider:
    def __init__(self, ingest_weather):
        self._ingest_weather = ingest_weather
        self.config = self._normalized(load_json(IRRIGATION_WEATHER_CONFIG_FILE) or {})

    def load(self) -> None:
        self.config = self._normalized(load_json(IRRIGATION_WEATHER_CONFIG_FILE) or {})

    def public_config(self) -> dict[str, Any]:
        cfg = self._normalized(self.config)
        owm = cfg["openweathermap"]
        return {
            "source": cfg["source"],
            "openweathermap": {
                "configured": bool(owm.get("api_key")),
                "lat": owm["lat"],
                "lon": owm["lon"],
                "refresh_min": owm["refresh_min"],
            },
            "last_refresh": cfg.get("last_refresh"),
            "last_ok": cfg.get("last_ok"),
            "last_message": cfg.get("last_message", ""),
        }

    def update_config(self, body: dict[str, Any]) -> dict[str, Any]:
        cfg = self._normalized(self.config)
        source = body.get("source")
        if source in ("manual_ha", "openweathermap"):
            cfg["source"] = source

        owm_body = body.get("openweathermap") or {}
        owm = cfg["openweathermap"]
        if "api_key" in owm_body:
            token = str(owm_body.get("api_key") or "").strip()
            if token:
                owm["api_key"] = token
        if owm_body.get("clear_api_key"):
            owm["api_key"] = ""
        for key in ("lat", "lon"):
            if key in owm_body:
                owm[key] = float(owm_body[key] or 0)
        if "refresh_min" in owm_body:
            owm["refresh_min"] = max(15, min(24 * 60, int(float(owm_body["refresh_min"] or 60))))

        self.config = cfg
        self._save()
        return self.public_config()

    async def refresh(self) -> dict[str, Any]:
        cfg = self._normalized(self.config)
        if cfg["source"] != "openweathermap":
            msg = "Lokale Wetterquelle aktiv. Werte kommen per HA/MQTT oder REST."
            self._mark(False, msg)
            return {"ok": False, "message": msg}

        owm = cfg["openweathermap"]
        if not owm.get("api_key"):
            msg = "OpenWeatherMap API-Key fehlt."
            self._mark(False, msg)
            return {"ok": False, "message": msg}
        if not float(owm.get("lat") or 0) or not float(owm.get("lon") or 0):
            msg = "OpenWeatherMap Standort fehlt."
            self._mark(False, msg)
            return {"ok": False, "message": msg}

        params = {
            "lat": owm["lat"],
            "lon": owm["lon"],
            "appid": owm["api_key"],
            "units": "metric",
            "lang": "de",
            "exclude": "minutely,alerts",
        }
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                res = await client.get("https://api.openweathermap.org/data/3.0/onecall", params=params)
                res.raise_for_status()
                data = res.json()
        except Exception as exc:
            msg = f"OpenWeatherMap Fehler: {exc}"
            self._mark(False, msg)
            web_log(f"[Weather] {msg}")
            return {"ok": False, "message": msg}

        payload = self._to_weather_payload(data)
        self._ingest_weather(payload)
        msg = "OpenWeatherMap Wetter aktualisiert."
        self._mark(True, msg)
        return {"ok": True, "message": msg, "weather": payload}

    def should_refresh(self) -> bool:
        cfg = self._normalized(self.config)
        if cfg["source"] != "openweathermap":
            return False
        last = cfg.get("last_refresh")
        if not last:
            return True
        try:
            ts = datetime.fromisoformat(str(last).replace("Z", "+00:00")).timestamp()
        except ValueError:
            return True
        return (datetime.now(timezone.utc).timestamp() - ts) >= int(cfg["openweathermap"]["refresh_min"]) * 60

    def _mark(self, ok: bool, message: str) -> None:
        self.config["last_refresh"] = datetime.now(timezone.utc).isoformat()
        self.config["last_ok"] = ok
        self.config["last_message"] = message
        self._save()

    def _save(self) -> None:
        save_json(IRRIGATION_WEATHER_CONFIG_FILE, self.config)

    @staticmethod
    def _normalized(data: dict[str, Any]) -> dict[str, Any]:
        cfg = {**DEFAULT_CONFIG, **(data or {})}
        owm = {**DEFAULT_CONFIG["openweathermap"], **((data or {}).get("openweathermap") or {})}
        cfg["openweathermap"] = owm
        if cfg.get("source") not in ("manual_ha", "openweathermap"):
            cfg["source"] = "manual_ha"
        return cfg

    @staticmethod
    def _to_weather_payload(data: dict[str, Any]) -> dict[str, Any]:
        current = data.get("current") or {}
        daily = data.get("daily") or []
        today = daily[0] if daily else {}
        tomorrow = daily[1] if len(daily) > 1 else {}
        temp = current.get("temp")
        humidity = current.get("humidity")
        wind_ms = float(current.get("wind_speed") or 0)
        gust_ms = current.get("wind_gust")
        rain_24h = float((today.get("rain") or 0) + (current.get("rain") or {}).get("1h", 0))
        forecast_rain = sum(float(day.get("rain") or 0) for day in daily[:2])
        et0 = WeatherProvider._estimate_et0(today, current)
        return {
            "forecast_rain_mm": round(forecast_rain, 1),
            "rain_24h_mm": round(rain_24h, 1),
            "temp_c": temp,
            "humidity_pct": humidity,
            "wind_kmh": round(wind_ms * 3.6, 1),
            "wind_gust_kmh": round(float(gust_ms) * 3.6, 1) if gust_ms is not None else None,
            "uv_index": current.get("uvi"),
            "et0_mm": et0,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _estimate_et0(today: dict[str, Any], current: dict[str, Any]) -> float | None:
        temps = today.get("temp") or {}
        t_min = temps.get("min")
        t_max = temps.get("max")
        if t_min is None or t_max is None:
            return None
        t_avg = (float(t_min) + float(t_max)) / 2
        wind = float(current.get("wind_speed") or 0) * 3.6
        humidity = float(current.get("humidity") or 60)
        uvi = float(current.get("uvi") or 3)
        raw = 0.11 * max(t_avg, 0) + 0.12 * uvi + 0.012 * wind - 0.01 * max(humidity - 55, 0)
        return round(max(0.2, min(8.0, raw)), 1)
