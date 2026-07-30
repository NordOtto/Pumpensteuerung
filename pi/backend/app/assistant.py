"""Regelbasierter Sprach-Assistent für die Bedienung per Freitext.

Wandelt Saetze wie "aendere den Beregnungsstart vom Garten auf 6:30" oder
"bewaessere die Hecke 20 Minuten" in konkrete Aktionen um. Laeuft komplett
lokal auf dem Pi — keine Cloud, keine API-Kosten, keine Latenz.

Ablauf: parse() erkennt Absicht + Entitaeten und liefert eine Vorschau
(confirm=True), die das Frontend bestaetigen laesst. apply() fuehrt sie aus.
Damit kann ein Tippfehler nie versehentlich die Pumpe starten.
"""
from __future__ import annotations

import re
from typing import Any

from .state import app_state

_WEEKDAYS = ("Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag")

# Technische Skip-Gruende in Alltagssprache
_REASON_TEXT = {
    "Regen kompensiert Defizit": "Der Boden ist noch feucht genug — es ist kein Wasser nötig",
    "Regen deckt Bedarf": "Der Regen deckt den Bedarf",
    "Regen kommt heute": "Für heute ist Regen angesagt",
    "Sperrzeit aktiv": "Es ist gerade Sperrzeit",
    "Sperrtag": "Heute ist ein Sperrtag",
    "Wochenlimit erreicht": "Das Wochenlimit ist erreicht",
    "Wind zu hoch": "Es ist zu windig",
    "Bodenfeuchte ausreichend": "Der Boden ist feucht genug",
    "Programm deaktiviert": "Das Programm ist ausgeschaltet",
    "Urlaubsmodus": "Der Urlaubsmodus ist aktiv",
    "MQTT getrennt": "Die Verbindung zu den Ventilen fehlt gerade",
    "V20-Stoerung": "Der Frequenzumrichter meldet eine Störung",
    "Trockenlauf-Sperre": "Trockenlaufschutz hat abgeschaltet",
    "Zeitfenster gesperrt": "Außerhalb des erlaubten Zeitfensters",
}

# Fuellwoerter, die vor dem Matching entfernt werden
_STOPWORDS = re.compile(
    r"\b(bitte|mal|doch|den|dem|der|die|das|des|vom|von|fuer|für|auf|um|im|in|ein|eine|einen)\b"
)


def _norm(text: str) -> str:
    t = (text or "").lower().strip()
    t = t.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    return re.sub(r"\s+", " ", t)


def _parse_time(text: str) -> tuple[int, int] | None:
    """Erkennt 6:30, 6.30, "6 uhr 30", "um 6", "halb 7"."""
    m = re.search(r"\b(\d{1,2})[:.](\d{2})\b", text)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        if 0 <= h <= 23 and 0 <= mi <= 59:
            return h, mi
    m = re.search(r"\b(\d{1,2})\s*uhr(?:\s*(\d{1,2}))?\b", text)
    if m:
        h = int(m.group(1))
        mi = int(m.group(2)) if m.group(2) else 0
        if 0 <= h <= 23 and 0 <= mi <= 59:
            return h, mi
    m = re.search(r"\bhalb\s*(\d{1,2})\b", text)
    if m:
        h = int(m.group(1)) - 1
        if 0 <= h <= 23:
            return h, 30
    return None


def _parse_duration_min(text: str) -> float | None:
    m = re.search(r"\b(\d+(?:[.,]\d+)?)\s*(?:min|minute|minuten)\b", text)
    if m:
        return float(m.group(1).replace(",", "."))
    m = re.search(r"\b(\d+(?:[.,]\d+)?)\s*(?:h|std|stunde|stunden)\b", text)
    if m:
        return float(m.group(1).replace(",", ".")) * 60
    return None


def _find_program(text: str) -> dict[str, Any] | None:
    """Findet ein Programm anhand seines Namens oder eines Zonennamens darin."""
    best: tuple[int, dict[str, Any]] | None = None
    for p in app_state.irrigation.programs:
        for cand in [p.get("name", ""), p.get("id", "")]:
            c = _norm(str(cand))
            if c and c in text and (best is None or len(c) > best[0]):
                best = (len(c), p)
        for z in p.get("zones", []):
            for cand in [z.get("name", ""), z.get("id", "")]:
                c = _norm(str(cand))
                if c and c in text and (best is None or len(c) > best[0]):
                    best = (len(c), p)
    return best[1] if best else None


def _find_zone(program: dict[str, Any], text: str) -> dict[str, Any] | None:
    for z in program.get("zones", []):
        for cand in [z.get("name", ""), z.get("id", "")]:
            c = _norm(str(cand))
            if c and c in text:
                return z
    return None


def _program_label(p: dict[str, Any]) -> str:
    return str(p.get("name") or p.get("id") or "Programm")


def parse(text_raw: str) -> dict[str, Any]:
    """Erkennt die Absicht. Liefert immer ein Dict mit 'action'.

    action="none"  → nichts erkannt, 'reply' enthaelt eine Hilfe-Antwort
    action="answer"→ reine Auskunft, 'reply' ist die Antwort
    sonst          → ausfuehrbar, 'preview' beschreibt was passieren wuerde
    """
    raw = (text_raw or "").strip()
    if not raw:
        return {"action": "none", "reply": "Was möchtest du tun?"}
    t = _norm(raw)
    t_clean = _STOPWORDS.sub(" ", t)
    program = _find_program(t)

    # Fragen zuerst abfangen: "wann wird bewaessert?" ist eine Auskunft,
    # kein Startbefehl — sonst wuerde die Aktionsregel darunter zugreifen.
    is_question = bool(
        raw.rstrip().endswith("?")
        or re.match(r"^\s*(wann|warum|wieso|weshalb|wie|was|welche|wer|wo|ist|sind|gibt)\b", t)
    )

    # ── Startzeit aendern ────────────────────────────────────
    # Nur wenn eine Uhrzeit im Satz steht — sonst ist "Garten starten" gemeint.
    tm = _parse_time(t)
    # "beregnungsstart"/"startzeit" sind Zeit-Woerter, auch wenn "beregn" darin steckt.
    wants_schedule = re.search(r"(startzeit|beregnungsstart|\bstart\w*|\bbeginn\w*|\buhrzeit\w*)", t) and re.search(
        r"\b(aender|ander|setz|stell|verschieb|mach)\w*", t_clean
    )
    if not is_question and tm and wants_schedule:
        if not program:
            return {"action": "none", "reply": "Welches Programm meinst du? Zum Beispiel: "
                                               "\"Beregnungsstart vom Garten auf 6:30\""}
        h, mi = tm
        return {
            "action": "set_start_time",
            "program_id": program["id"],
            "hour": h, "minute": mi,
            "confirm": True,
            "preview": f"Startzeit von \"{_program_label(program)}\" auf {h:02d}:{mi:02d} Uhr ändern "
                       f"(bisher {program['start_hour']:02d}:{program['start_min']:02d}).",
        }

    # ── Bewaesserung starten ─────────────────────────────────
    # \w* am Ende, weil "bewaessere"/"bewaessern"/"beregnen" sonst keine Wortgrenze
    # direkt nach dem Stamm haben und das Muster nicht greift.
    if not is_question and re.search(r"\b(bewaesser|beregn|giess|start)\w*", t) and not re.search(
        r"\b(stopp|stop|beend|abbrech)\w*", t
    ):
        if not program:
            return {"action": "none", "reply": "Welches Programm soll laufen? Zum Beispiel: "
                                               "\"Garten 20 Minuten bewässern\""}
        dur = _parse_duration_min(t)
        zone = _find_zone(program, t)
        label = _program_label(program)
        zone_txt = f", nur Zone \"{zone.get('name')}\"" if zone else ""
        dur_txt = f" für {dur:g} Minuten" if dur else ""
        return {
            "action": "run_program",
            "program_id": program["id"],
            "duration_min": dur,
            "zone_ids": [zone["id"]] if zone else None,
            "confirm": True,
            "preview": f"\"{label}\"{zone_txt} jetzt manuell starten{dur_txt}.",
        }

    # ── Stoppen ──────────────────────────────────────────────
    if re.search(r"\b(stopp|stop|beend|abbrech|aufhoer|halt)\w*", t):
        d = app_state.irrigation.decision
        if not d.running:
            return {"action": "answer", "reply": "Es läuft gerade keine Bewässerung."}
        return {
            "action": "stop",
            "confirm": True,
            "preview": f"Laufende Bewässerung \"{d.active_program_name or d.active_program}\" stoppen.",
        }

    # ── Programm aktivieren / deaktivieren ───────────────────
    if re.search(r"\b(aktivier|einschalt|anschalt|deaktivier|ausschalt|abschalt|pausier)\w*", t):
        if not program:
            return {"action": "none", "reply": "Welches Programm meinst du?"}
        enable = not re.search(r"\b(deaktivier|ausschalt|abschalt|pausier)\w*", t)
        return {
            "action": "set_enabled",
            "program_id": program["id"],
            "enabled": enable,
            "confirm": True,
            "preview": f"Programm \"{_program_label(program)}\" {'aktivieren' if enable else 'deaktivieren'}.",
        }

    # ── Auskuenfte ───────────────────────────────────────────
    d = app_state.irrigation.decision
    w = app_state.irrigation.weather

    if re.search(r"\b(naechste|nachste|wann|next)\b", t):
        if d.next_start:
            from datetime import datetime
            try:
                dt = datetime.fromisoformat(d.next_start)
                prog = next((p for p in app_state.irrigation.programs
                             if p["id"] == d.program_id), None)
                name = _program_label(prog) if prog else (d.active_program_name or d.program_id)
                return {"action": "answer",
                        "reply": f"Nächste Bewässerung: {_WEEKDAYS[dt.weekday()]} "
                                 f"{dt.strftime('%d.%m. um %H:%M')} Uhr ({name})."}
            except ValueError:
                pass
        return {"action": "answer", "reply": "Es ist aktuell keine Bewässerung geplant."}

    if re.search(r"\b(warum|wieso|grund|weshalb)\b", t):
        if d.running:
            return {"action": "answer", "reply": f"Es wird gerade bewässert: {d.active_program_name}."}
        return {"action": "answer",
                "reply": f"{_REASON_TEXT.get(d.reason, d.reason or 'Alles bereit')}. "
                         f"Aktueller Wasserbedarf: {d.water_budget_mm:.1f} mm."}

    if re.search(r"\b(wetter|regen|temperatur|warm|heiss|hitze)\b", t):
        return {"action": "answer",
                "reply": f"{w.temp_c:.0f} °C, Regen letzte 24 h {w.rain_24h_mm or 0:.1f} mm, "
                         f"Vorhersage 48 h {w.forecast_rain_48h_mm or 0:.1f} mm, "
                         f"Verdunstung heute {w.et0_mm or 0:.1f} mm."
                if w.temp_c is not None else "Es liegen noch keine Wetterdaten vor."}

    if re.search(r"\b(status|zustand|laeuft|lauft|wie geht|alles ok)\b", t):
        if d.running:
            return {"action": "answer",
                    "reply": f"\"{d.active_program_name}\" läuft gerade, Zone \"{d.active_zone_name}\", "
                             f"noch {round(d.remaining_s / 60)} Minuten."}
        return {"action": "answer", "reply": f"Keine Bewässerung aktiv. Status: {d.reason or 'bereit'}."}

    if re.search(r"\b(defizit|bedarf|trocken|wasserbedarf)\b", t):
        parts = []
        for p in app_state.irrigation.programs:
            for z in p.get("zones", []):
                if z.get("enabled"):
                    parts.append(f"{z.get('name')}: {float(z.get('deficit_mm', 0)):.1f} mm")
        return {"action": "answer",
                "reply": "Aktuelles Defizit — " + ", ".join(parts) if parts else "Keine aktiven Zonen."}

    return {
        "action": "none",
        "reply": "Das habe ich nicht verstanden. Beispiele:\n"
                 "• \"Beregnungsstart vom Garten auf 6:30\"\n"
                 "• \"Hecke 20 Minuten bewaessern\"\n"
                 "• \"Wann wird das naechste Mal bewaessert?\"\n"
                 "• \"Warum wird gerade nicht bewässert?\"",
    }


def apply(intent: dict[str, Any], irrigation: Any) -> dict[str, Any]:
    """Führt eine zuvor von parse() erkannte Aktion aus."""
    action = str(intent.get("action") or "")

    if action == "set_start_time":
        programs = [dict(p) for p in app_state.irrigation.programs]
        found = False
        for p in programs:
            if p["id"] == intent["program_id"]:
                p["start_hour"] = int(intent["hour"])
                p["start_min"] = int(intent["minute"])
                found = True
        if not found:
            return {"ok": False, "reply": "Programm nicht gefunden."}
        irrigation.set_programs({"programs": programs})
        return {"ok": True, "reply": f"Startzeit auf {int(intent['hour']):02d}:{int(intent['minute']):02d} Uhr geändert."}

    if action == "set_enabled":
        programs = [dict(p) for p in app_state.irrigation.programs]
        for p in programs:
            if p["id"] == intent["program_id"]:
                p["enabled"] = bool(intent["enabled"])
        irrigation.set_programs({"programs": programs})
        return {"ok": True, "reply": f"Programm {'aktiviert' if intent['enabled'] else 'deaktiviert'}."}

    if action == "run_program":
        res = irrigation.run_program(
            intent["program_id"],
            manual=True,
            force_weather=True,
            duration_min=intent.get("duration_min"),
            zone_ids=intent.get("zone_ids"),
        )
        if res.get("ok"):
            return {"ok": True, "reply": "Bewässerung gestartet."}
        return {"ok": False, "reply": f"Start nicht möglich: {res.get('error', 'unbekannt')}"}

    if action == "stop":
        irrigation.stop_program("", "Assistent")
        return {"ok": True, "reply": "Bewässerung gestoppt."}

    return {"ok": False, "reply": "Unbekannte Aktion."}
