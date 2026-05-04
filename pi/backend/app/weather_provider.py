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
        "location_query": "",
        "lat": 0.0,
        "lon": 0.0,
        "refresh_min": 60,
    },
    "location": {
        "name": "",
        "postal_code": "",
        "country": "",
        "lat": 0.0,
        "lon": 0.0,
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
                "location_query": owm.get("location_query", ""),
                "lat": owm["lat"],
                "lon": owm["lon"],
                "refresh_min": owm["refresh_min"],
            },
            "location": cfg["location"],
            "last_refresh": cfg.get("last_refresh"),
            "last_ok": cfg.get("last_ok"),
            "last_message": cfg.get("last_message", ""),
        }

    def update_config(self, body: dict[str, Any]) -> dict[str, Any]:
        cfg = self._normalized(self.config)
        source = body.get("source")
        if source in ("manual_ha", "openweathermap", "hybrid"):
            cfg["source"] = source

        owm_body = body.get("openweathermap") or {}
        owm = cfg["openweathermap"]
        if "api_key" in owm_body:
            token = str(owm_body.get("api_key") or "").strip()
            if token:
                owm["api_key"] = token
        if owm_body.get("clear_api_key"):
            owm["api_key"] = ""
        if "location_query" in owm_body:
            owm["location_query"] = str(owm_body.get("location_query") or "").strip()
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
        if cfg["source"] == "manual_ha":
            msg = "Lokale Wetterquelle aktiv. Werte kommen per HA/MQTT oder REST."
            self._mark(False, msg)
            return {"ok": False, "message": msg}

        owm = cfg["openweathermap"]
        if not owm.get("api_key"):
            msg = "OpenWeatherMap API-Key fehlt."
            self._mark(False, msg)
            return {"ok": False, "message": msg}
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                query_location = await self._geocode_location_query(client, owm)
                if query_location:
                    cfg["location"] = query_location
                    owm["lat"] = query_location["lat"]
                    owm["lon"] = query_location["lon"]
                if not float(owm.get("lat") or 0) or not float(owm.get("lon") or 0):
                    msg = "OpenWeatherMap Standort fehlt. Bitte Ort oder PLZ eintragen."
                    self.config = cfg
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
                res = await client.get("https://api.openweathermap.org/data/3.0/onecall", params=params)
                res.raise_for_status()
                data = res.json()
                location = await self._lookup_location(client, owm)
        except Exception as exc:
            msg = f"OpenWeatherMap Fehler: {exc}"
            self._mark(False, msg)
            web_log(f"[Weather] {msg}")
            return {"ok": False, "message": msg}

        payload = self._to_weather_payload(data, forecast_only=cfg["source"] == "hybrid")
        self._ingest_weather(payload)
        cfg["location"] = location or cfg.get("location") or self._location_from_weather(data, owm)
        self.config = cfg
        msg = "OpenWeatherMap Forecast aktualisiert." if cfg["source"] == "hybrid" else "OpenWeatherMap Wetter aktualisiert."
        self._mark(True, msg)
        return {"ok": True, "message": msg, "weather": payload}

    def should_refresh(self) -> bool:
        cfg = self._normalized(self.config)
        if cfg["source"] not in ("openweathermap", "hybrid"):
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
        cfg["location"] = {**DEFAULT_CONFIG["location"], **((data or {}).get("location") or {})}
        if cfg.get("source") not in ("manual_ha", "openweathermap", "hybrid"):
            cfg["source"] = "manual_ha"
        return cfg

    @staticmethod
    def _to_weather_payload(data: dict[str, Any], forecast_only: bool = False) -> dict[str, Any]:
        current = data.get("current") or {}
        hourly = data.get("hourly") or []
        daily = data.get("daily") or []
        today = daily[0] if daily else {}
        temp = current.get("temp")
        humidity = current.get("humidity")
        wind_ms = float(current.get("wind_speed") or 0)
        gust_ms = current.get("wind_gust")
        rain_24h = float((today.get("rain") or 0) + (current.get("rain") or {}).get("1h", 0))
        forecast_1h = sum(WeatherProvider._rain_from_hour(h) for h in hourly[:1])
        forecast_24h = sum(WeatherProvider._rain_from_hour(h) for h in hourly[:24])
        forecast_48h = sum(WeatherProvider._rain_from_hour(h) for h in hourly[:48])
        forecast_7d = sum(float(day.get("rain") or 0) for day in daily[:7])
        forecast_rain = forecast_48h or sum(float(day.get("rain") or 0) for day in daily[:2])
        et0 = WeatherProvider._estimate_et0(today, current)
        payload = {
            "forecast_rain_mm": round(forecast_rain, 1),
            "forecast_rain_1h_mm": round(forecast_1h, 1),
            "forecast_rain_24h_mm": round(forecast_24h, 1),
            "forecast_rain_48h_mm": round(forecast_48h, 1),
            "forecast_rain_7d_mm": round(forecast_7d, 1),
            "uv_index": current.get("uvi"),
            "et0_mm": et0,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "forecast_source": "openweathermap",
        }
        if forecast_only:
            payload["forecast_only"] = True
            return payload
        payload.update({
            "rain_24h_mm": round(rain_24h, 1),
            "temp_c": temp,
            "humidity_pct": humidity,
            "wind_kmh": round(wind_ms * 3.6, 1),
            "wind_gust_kmh": round(float(gust_ms) * 3.6, 1) if gust_ms is not None else None,
            "current_source": "openweathermap",
        })
        return payload

    @staticmethod
    def _rain_from_hour(hour: dict[str, Any]) -> float:
        return float((hour.get("rain") or {}).get("1h", 0) or 0)

    @staticmethod
    def _location_from_weather(data: dict[str, Any], owm: dict[str, Any]) -> dict[str, Any]:
        return {
            "name": str(data.get("timezone") or ""),
            "postal_code": "",
            "country": "",
            "lat": float(data.get("lat") or owm.get("lat") or 0),
            "lon": float(data.get("lon") or owm.get("lon") or 0),
        }

    @staticmethod
    async def _lookup_location(client: httpx.AsyncClient, owm: dict[str, Any]) -> dict[str, Any] | None:
        nominatim = await WeatherProvider._lookup_location_nominatim(client, owm)
        if nominatim:
            return nominatim
        return await WeatherProvider._lookup_location_openweathermap(client, owm)

    @staticmethod
    async def _geocode_location_query(client: httpx.AsyncClient, owm: dict[str, Any]) -> dict[str, Any] | None:
        query = str(owm.get("location_query") or "").strip()
        if not query:
            return None
        nominatim = await WeatherProvider._search_location_nominatim(client, query)
        if nominatim:
            return nominatim
        return await WeatherProvider._search_location_openweathermap(client, owm, query)

    @staticmethod
    async def _search_location_nominatim(client: httpx.AsyncClient, query: str) -> dict[str, Any] | None:
        try:
            res = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "format": "jsonv2",
                    "q": query,
                    "limit": 1,
                    "addressdetails": 1,
                    "accept-language": "de",
                    "countrycodes": "de",
                },
                headers={"User-Agent": "Pumpensteuerung/1.0"},
            )
            res.raise_for_status()
            items = res.json()
            if not isinstance(items, list) or not items:
                return None
            item = items[0]
            address = item.get("address") or {}
            name = (
                address.get("village")
                or address.get("town")
                or address.get("city")
                or address.get("municipality")
                or item.get("name")
                or item.get("display_name")
                or ""
            )
            return {
                "name": str(name),
                "postal_code": str(address.get("postcode") or ""),
                "country": str(address.get("country_code") or "").upper(),
                "lat": float(item.get("lat") or 0),
                "lon": float(item.get("lon") or 0),
            }
        except Exception:
            return None

    @staticmethod
    async def _search_location_openweathermap(client: httpx.AsyncClient, owm: dict[str, Any], query: str) -> dict[str, Any] | None:
        try:
            res = await client.get(
                "https://api.openweathermap.org/geo/1.0/direct",
                params={
                    "q": query,
                    "limit": 1,
                    "appid": owm["api_key"],
                },
            )
            res.raise_for_status()
            items = res.json()
            if not isinstance(items, list) or not items:
                return None
            item = items[0]
            local_names = item.get("local_names") or {}
            name = local_names.get("de") or item.get("name") or query
            return {
                "name": str(name),
                "postal_code": "",
                "country": str(item.get("country") or ""),
                "lat": float(item.get("lat") or 0),
                "lon": float(item.get("lon") or 0),
            }
        except Exception:
            return None

    @staticmethod
    async def _lookup_location_nominatim(client: httpx.AsyncClient, owm: dict[str, Any]) -> dict[str, Any] | None:
        try:
            res = await client.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={
                    "format": "jsonv2",
                    "lat": owm["lat"],
                    "lon": owm["lon"],
                    "zoom": 18,
                    "addressdetails": 1,
                    "accept-language": "de",
                },
                headers={"User-Agent": "Pumpensteuerung/1.0"},
            )
            res.raise_for_status()
            item = res.json()
            address = item.get("address") or {}
            name = (
                address.get("village")
                or address.get("town")
                or address.get("city")
                or address.get("municipality")
                or item.get("name")
                or ""
            )
            return {
                "name": str(name),
                "postal_code": str(address.get("postcode") or ""),
                "country": str(address.get("country_code") or "").upper(),
                "lat": float(item.get("lat") or owm.get("lat") or 0),
                "lon": float(item.get("lon") or owm.get("lon") or 0),
            }
        except Exception:
            return None

    @staticmethod
    async def _lookup_location_openweathermap(client: httpx.AsyncClient, owm: dict[str, Any]) -> dict[str, Any] | None:
        try:
            res = await client.get(
                "https://api.openweathermap.org/geo/1.0/reverse",
                params={
                    "lat": owm["lat"],
                    "lon": owm["lon"],
                    "limit": 1,
                    "appid": owm["api_key"],
                },
            )
            res.raise_for_status()
            items = res.json()
            if not isinstance(items, list) or not items:
                return None
            item = items[0]
            local_names = item.get("local_names") or {}
            name = local_names.get("de") or item.get("name") or ""
            return {
                "name": str(name),
                "postal_code": "",
                "country": str(item.get("country") or ""),
                "lat": float(item.get("lat") or owm.get("lat") or 0),
                "lon": float(item.get("lon") or owm.get("lon") or 0),
            }
        except Exception:
            return None

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
