from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from .config import settings
from .persistence import IRRIGATION_WEATHER_CONFIG_FILE, load_json, save_json
from .state import web_log


# Refresh-Fenster (Lokalzeit): Stormglass Free Tier = 10 Requests/Tag.
# 9 Slots tagsueber, 1 Token Reserve fuer manuelle Refreshs.
REFRESH_HOURS_LOCAL = (5, 7, 9, 11, 13, 15, 17, 19, 21)
REFRESH_MIN_GAP_MIN = 90  # Mindestabstand zwischen erfolgreichen Refreshs
COOLDOWN_AFTER_FAILS = 3  # Nach so vielen Fehlversuchen in Folge → Pause bis Tageswechsel

DEFAULT_CONFIG: dict[str, Any] = {
    "source": "manual_ha",
    "openweathermap": {
        "api_key": "",
        "location_query": "",
        "lat": 0.0,
        "lon": 0.0,
    },
    "stormglass": {
        "api_key": "",
        "location_query": "",
        "lat": 0.0,
        "lon": 0.0,
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

VALID_SOURCES = ("manual_ha", "openweathermap", "stormglass", "hybrid", "hybrid_stormglass")


class WeatherProvider:
    def __init__(self, ingest_weather):
        self._ingest_weather = ingest_weather
        self.config = self._normalized(load_json(IRRIGATION_WEATHER_CONFIG_FILE) or {})

    def load(self) -> None:
        self.config = self._normalized(load_json(IRRIGATION_WEATHER_CONFIG_FILE) or {})

    def public_config(self) -> dict[str, Any]:
        cfg = self._normalized(self.config)
        owm = cfg["openweathermap"]
        sg = cfg["stormglass"]
        return {
            "source": cfg["source"],
            "refresh_hours_local": list(REFRESH_HOURS_LOCAL),
            "openweathermap": {
                "configured": bool(owm.get("api_key")),
                "location_query": owm.get("location_query", ""),
                "lat": owm["lat"],
                "lon": owm["lon"],
            },
            "stormglass": {
                "configured": bool(sg.get("api_key")),
                "location_query": sg.get("location_query", ""),
                "lat": sg["lat"],
                "lon": sg["lon"],
            },
            "location": cfg["location"],
            "last_refresh": cfg.get("last_refresh"),
            "last_ok": cfg.get("last_ok"),
            "last_message": cfg.get("last_message", ""),
            "fail_count": int(cfg.get("fail_count", 0) or 0),
            "in_cooldown": self._in_cooldown(cfg, datetime.now(ZoneInfo(settings.tz))),
            "cooldown_until_date": cfg.get("cooldown_until_date"),
        }

    def update_config(self, body: dict[str, Any]) -> dict[str, Any]:
        cfg = self._normalized(self.config)
        source = body.get("source")
        if source in VALID_SOURCES:
            cfg["source"] = source

        self._apply_provider_body(cfg["openweathermap"], body.get("openweathermap") or {})
        self._apply_provider_body(cfg["stormglass"], body.get("stormglass") or {})

        self.config = cfg
        self._save()
        return self.public_config()

    @staticmethod
    def _apply_provider_body(target: dict[str, Any], body: dict[str, Any]) -> None:
        if "api_key" in body:
            token = str(body.get("api_key") or "").strip()
            if token:
                target["api_key"] = token
        if body.get("clear_api_key"):
            target["api_key"] = ""
        if "location_query" in body:
            target["location_query"] = str(body.get("location_query") or "").strip()
        for key in ("lat", "lon"):
            if key in body:
                target[key] = float(body[key] or 0)

    async def refresh(self) -> dict[str, Any]:
        cfg = self._normalized(self.config)
        source = cfg["source"]
        if source == "manual_ha":
            msg = "Lokale Wetterquelle aktiv. Werte kommen per HA/MQTT oder REST."
            self._mark(False, msg)
            return {"ok": False, "message": msg}

        if source in ("openweathermap", "hybrid"):
            return await self._refresh_owm(cfg, forecast_only=source == "hybrid")
        if source in ("stormglass", "hybrid_stormglass"):
            return await self._refresh_stormglass(cfg, forecast_only=source == "hybrid_stormglass")
        msg = f"Unbekannte Wetterquelle: {source}"
        self._mark(False, msg)
        return {"ok": False, "message": msg}

    async def _refresh_owm(self, cfg: dict[str, Any], forecast_only: bool) -> dict[str, Any]:
        owm = cfg["openweathermap"]
        if not owm.get("api_key"):
            msg = "OpenWeatherMap API-Key fehlt."
            self._mark(False, msg)
            return {"ok": False, "message": msg}
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                query_location = await self._geocode_location_query(client, owm, "openweathermap")
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

        payload = self._owm_to_payload(data, forecast_only=forecast_only)
        self._ingest_weather(payload)
        cfg["location"] = location or cfg.get("location") or self._location_from_owm(data, owm)
        self.config = cfg
        msg = "OpenWeatherMap Forecast aktualisiert." if forecast_only else "OpenWeatherMap Wetter aktualisiert."
        self._mark(True, msg)
        return {"ok": True, "message": msg, "weather": payload}

    async def _refresh_stormglass(self, cfg: dict[str, Any], forecast_only: bool) -> dict[str, Any]:
        sg = cfg["stormglass"]
        if not sg.get("api_key"):
            msg = "Stormglass API-Key fehlt."
            self._mark(False, msg)
            return {"ok": False, "message": msg}
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                query_location = await self._geocode_location_query(client, sg, "stormglass")
                if query_location:
                    cfg["location"] = query_location
                    sg["lat"] = query_location["lat"]
                    sg["lon"] = query_location["lon"]
                if not float(sg.get("lat") or 0) or not float(sg.get("lon") or 0):
                    msg = "Stormglass Standort fehlt. Bitte Ort oder PLZ eintragen."
                    self.config = cfg
                    self._mark(False, msg)
                    return {"ok": False, "message": msg}

                now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
                end = now + timedelta(hours=168)
                params = {
                    "lat": str(sg["lat"]),
                    "lng": str(sg["lon"]),
                    "start": str(int(now.timestamp())),
                    "end": str(int(end.timestamp())),
                    "params": ",".join(("airTemperature", "humidity", "windSpeed", "gust", "precipitation")),
                }
                res = await client.get(
                    "https://api.stormglass.io/v2/weather/point",
                    params=params,
                    headers={"Authorization": sg["api_key"]},
                )
                if res.status_code >= 400:
                    raise RuntimeError(f"HTTP {res.status_code}: {res.text[:300]}")
                data = res.json()
        except Exception as exc:
            msg = f"Stormglass Fehler: {exc}"
            self._mark(False, msg)
            web_log(f"[Weather] {msg}")
            return {"ok": False, "message": msg}

        payload = self._stormglass_to_payload(data, forecast_only=forecast_only)
        self._ingest_weather(payload)
        self.config = cfg
        msg = "Stormglass Forecast aktualisiert." if forecast_only else "Stormglass Wetter aktualisiert."
        self._mark(True, msg)
        return {"ok": True, "message": msg, "weather": payload}

    def should_refresh(self) -> bool:
        cfg = self._normalized(self.config)
        if cfg["source"] == "manual_ha":
            return False
        now_local = datetime.now(ZoneInfo(settings.tz))
        if now_local.hour not in REFRESH_HOURS_LOCAL:
            return False
        if self._in_cooldown(cfg, now_local):
            return False
        last_ok = cfg.get("last_refresh_ok")
        if not last_ok:
            return True
        try:
            ts = datetime.fromisoformat(str(last_ok).replace("Z", "+00:00")).timestamp()
        except ValueError:
            return True
        return (datetime.now(timezone.utc).timestamp() - ts) >= REFRESH_MIN_GAP_MIN * 60

    @staticmethod
    def _in_cooldown(cfg: dict[str, Any], now_local: datetime) -> bool:
        """Pause bei ≥COOLDOWN_AFTER_FAILS Fehlversuchen in Folge bis zum nächsten Kalendertag (lokal)."""
        if int(cfg.get("fail_count", 0) or 0) < COOLDOWN_AFTER_FAILS:
            return False
        cooldown_until = cfg.get("cooldown_until_date")
        if not cooldown_until:
            return False
        return str(now_local.date()) <= str(cooldown_until)

    def _mark(self, ok: bool, message: str) -> None:
        now_iso = datetime.now(timezone.utc).isoformat()
        self.config["last_refresh"] = now_iso
        self.config["last_ok"] = ok
        self.config["last_message"] = message
        if ok:
            self.config["last_refresh_ok"] = now_iso
            self.config["fail_count"] = 0
            self.config["cooldown_until_date"] = None
        else:
            fc = int(self.config.get("fail_count", 0) or 0) + 1
            self.config["fail_count"] = fc
            if fc >= COOLDOWN_AFTER_FAILS:
                today_local = datetime.now(ZoneInfo(settings.tz)).date()
                self.config["cooldown_until_date"] = str(today_local)
        self._save()

    def _save(self) -> None:
        save_json(IRRIGATION_WEATHER_CONFIG_FILE, self.config)

    @staticmethod
    def _normalized(data: dict[str, Any]) -> dict[str, Any]:
        cfg = {**DEFAULT_CONFIG, **(data or {})}
        cfg["openweathermap"] = {
            **DEFAULT_CONFIG["openweathermap"],
            **((data or {}).get("openweathermap") or {}),
        }
        # alte refresh_min Felder verwerfen
        cfg["openweathermap"].pop("refresh_min", None)
        cfg["stormglass"] = {
            **DEFAULT_CONFIG["stormglass"],
            **((data or {}).get("stormglass") or {}),
        }
        cfg["location"] = {**DEFAULT_CONFIG["location"], **((data or {}).get("location") or {})}
        if cfg.get("source") not in VALID_SOURCES:
            cfg["source"] = "manual_ha"
        return cfg

    # ── OpenWeatherMap → Payload ──────────────────────────────────────────────
    @staticmethod
    def _owm_to_payload(data: dict[str, Any], forecast_only: bool = False) -> dict[str, Any]:
        current = data.get("current") or {}
        hourly = data.get("hourly") or []
        daily = data.get("daily") or []
        today = daily[0] if daily else {}
        temp = current.get("temp")
        humidity = current.get("humidity")
        wind_ms = float(current.get("wind_speed") or 0)
        gust_ms = current.get("wind_gust")
        rain_24h = float((today.get("rain") or 0) + (current.get("rain") or {}).get("1h", 0))
        forecast_1h = sum(WeatherProvider._owm_rain_from_hour(h) for h in hourly[:1])
        forecast_24h = sum(WeatherProvider._owm_rain_from_hour(h) for h in hourly[:24])
        forecast_48h = sum(WeatherProvider._owm_rain_from_hour(h) for h in hourly[:48])
        forecast_7d = sum(float(day.get("rain") or 0) for day in daily[:7])
        forecast_rain = forecast_48h or sum(float(day.get("rain") or 0) for day in daily[:2])
        et0 = WeatherProvider._estimate_et0_owm(today, current)
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
    def _owm_rain_from_hour(hour: dict[str, Any]) -> float:
        return float((hour.get("rain") or {}).get("1h", 0) or 0)

    # ── Stormglass → Payload ──────────────────────────────────────────────────
    @staticmethod
    def _stormglass_to_payload(data: dict[str, Any], forecast_only: bool = False) -> dict[str, Any]:
        hours = data.get("hours") or []
        now_ts = datetime.now(timezone.utc).timestamp()

        # Quellen-Praeferenz: DWD ist fuer Deutschland am genauesten (ICON-D2),
        # danach Stormglass-Mix, dann NOAA als Fallback.
        source_priority = ("dwd", "icon", "sg", "noaa", "meto", "meteo")

        def val(entry: dict[str, Any], key: str) -> float | None:
            v = entry.get(key)
            if isinstance(v, dict):
                for src in source_priority:
                    if src in v and v[src] is not None:
                        return float(v[src])
                for k in v.values():
                    if k is not None:
                        return float(k)
                return None
            return float(v) if v is not None else None

        def parse_ts(s: str | None) -> float:
            if not s:
                return 0.0
            try:
                return datetime.fromisoformat(str(s).replace("Z", "+00:00")).timestamp()
            except ValueError:
                return 0.0

        # Stundenwerte ab jetzt
        forward = [h for h in hours if parse_ts(h.get("time")) >= now_ts - 1800]
        # Rueckblick fuer rain_24h
        past_24h = [h for h in hours if now_ts - 86400 <= parse_ts(h.get("time")) < now_ts]

        def sum_rain(slice_: list[dict[str, Any]]) -> float:
            total = 0.0
            for h in slice_:
                v = val(h, "precipitation")
                if v is not None:
                    total += max(0.0, v)
            return round(total, 1)

        rain_1h = sum_rain(forward[:1])
        rain_24h_fc = sum_rain(forward[:24])
        rain_48h_fc = sum_rain(forward[:48])
        rain_7d_fc = sum_rain(forward[:168])
        rain_24h_past = sum_rain(past_24h) if past_24h else 0.0

        current = forward[0] if forward else {}
        temp = val(current, "airTemperature")
        humidity = val(current, "humidity")
        wind_ms = val(current, "windSpeed") or 0.0
        gust_ms = val(current, "gust")
        uvi = val(current, "uvIndex")

        # ET0 grob: Tagesmittel der naechsten 24h
        next_24 = forward[:24]
        if next_24:
            t_vals = [val(h, "airTemperature") for h in next_24 if val(h, "airTemperature") is not None]
            t_max = max(t_vals) if t_vals else (temp or 20)
            t_min = min(t_vals) if t_vals else (temp or 15)
            et0 = WeatherProvider._estimate_et0_simple(t_min, t_max, wind_ms, humidity, uvi)
        else:
            et0 = None

        payload = {
            "forecast_rain_mm": rain_48h_fc or rain_24h_fc,
            "forecast_rain_1h_mm": rain_1h,
            "forecast_rain_24h_mm": rain_24h_fc,
            "forecast_rain_48h_mm": rain_48h_fc,
            "forecast_rain_7d_mm": rain_7d_fc,
            "uv_index": uvi,
            "et0_mm": et0,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "forecast_source": "stormglass",
        }
        if forecast_only:
            payload["forecast_only"] = True
            return payload
        payload.update({
            "rain_24h_mm": rain_24h_past,
            "temp_c": temp,
            "humidity_pct": humidity,
            "wind_kmh": round(wind_ms * 3.6, 1),
            "wind_gust_kmh": round(gust_ms * 3.6, 1) if gust_ms is not None else None,
            "current_source": "stormglass",
        })
        return payload

    @staticmethod
    def _estimate_et0_simple(t_min: float | None, t_max: float | None, wind_ms: float, humidity: float | None, uvi: float | None) -> float | None:
        if t_min is None or t_max is None:
            return None
        t_avg = (float(t_min) + float(t_max)) / 2
        wind = float(wind_ms) * 3.6
        h = float(humidity) if humidity is not None else 60
        u = float(uvi) if uvi is not None else 3
        raw = 0.11 * max(t_avg, 0) + 0.12 * u + 0.012 * wind - 0.01 * max(h - 55, 0)
        return round(max(0.2, min(8.0, raw)), 1)

    @staticmethod
    def _estimate_et0_owm(today: dict[str, Any], current: dict[str, Any]) -> float | None:
        temps = today.get("temp") or {}
        return WeatherProvider._estimate_et0_simple(
            temps.get("min"),
            temps.get("max"),
            float(current.get("wind_speed") or 0),
            current.get("humidity"),
            current.get("uvi"),
        )

    @staticmethod
    def _location_from_owm(data: dict[str, Any], owm: dict[str, Any]) -> dict[str, Any]:
        return {
            "name": str(data.get("timezone") or ""),
            "postal_code": "",
            "country": "",
            "lat": float(data.get("lat") or owm.get("lat") or 0),
            "lon": float(data.get("lon") or owm.get("lon") or 0),
        }

    # ── Geocoding (gemeinsam) ─────────────────────────────────────────────────
    @staticmethod
    async def _lookup_location(client: httpx.AsyncClient, owm: dict[str, Any]) -> dict[str, Any] | None:
        nominatim = await WeatherProvider._lookup_location_nominatim(client, owm)
        if nominatim:
            return nominatim
        return await WeatherProvider._lookup_location_openweathermap(client, owm)

    @staticmethod
    async def _geocode_location_query(client: httpx.AsyncClient, provider: dict[str, Any], kind: str) -> dict[str, Any] | None:
        query = str(provider.get("location_query") or "").strip()
        if not query:
            return None
        nominatim = await WeatherProvider._search_location_nominatim(client, query)
        if nominatim:
            return nominatim
        if kind == "openweathermap":
            return await WeatherProvider._search_location_openweathermap(client, provider, query)
        return None

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
