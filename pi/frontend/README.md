# Pumpe-Frontend (Next.js + Tailwind)

Industrie-HMI-Dashboard für die Brunnenpumpe. Kommuniziert mit dem
Python-Backend über REST (`/api/*`) und WebSocket (`/ws`).

## Design-System

Strikt eingehalten gemäß Spec:
- Hintergrund weiß (#ffffff), Primär #2588eb, OK #14c957, Warn #ffa000, Fehler #ff0000
- Light-Mode, große Zahlen (Tabular-Nums), Touch-Targets ≥48 px
- Sprache deutsch (Druck/Durchfluss/Bewässerung), Aktionen englisch (Start/Stop/Auto)

## Pages

| Pfad | Inhalt |
|---|---|
| `/dashboard` | KPI-Karten (Druck/Durchfluss/Hz), Pumpenstatus + Hold-Start, Zonen-Übersicht, Warnungen |
| `/control` | Manuelle Pumpensteuerung (Hold-Start/Stop/Reset), Hz-Slider, manuelle Zonen |
| `/zones` | Wetter+ET0-Übersicht, alle Programme + Zonen mit Bodenfeuchte/Defizit/Laufzeit |
| `/analytics` | Live-Charts (Druck/Flow/Hz), Lauf-Historie |
| `/settings` | PI-Tunings, Zeitfenster, Presets, Urlaubsmodus, Systeminfo |

## Lokal entwickeln

```bash
cd pi/frontend
npm install
# Backend lokal laufen lassen (siehe pi/backend/README.md)
BACKEND_URL=http://127.0.0.1:8000 npm run dev
```
Browser: http://localhost:3001 — Vite-ähnliche HMR.

WebSocket geht direkt gegen `ws://localhost:3001/ws` (Next leitet weiter).
Im Production-Build übernimmt nginx das.

## Production-Build (für den Pi)

```bash
npm run build
# Erzeugt .next/standalone/server.js — wird via systemd gestartet
```

Im systemd-Unit (siehe Plan):
```
ExecStart=/usr/bin/node /opt/pumpe/frontend/.next/standalone/server.js
Environment=PORT=3001
```

## Wiederverwendbare Komponenten

[components/kpi-card.tsx](components/kpi-card.tsx), [zone-card.tsx](components/zone-card.tsx),
[status-badge.tsx](components/status-badge.tsx), [hold-button.tsx](components/hold-button.tsx),
[warning-list.tsx](components/warning-list.tsx), [section.tsx](components/section.tsx),
[top-bar.tsx](components/top-bar.tsx), [bottom-nav.tsx](components/bottom-nav.tsx).

State-Provider: [lib/ws.tsx](lib/ws.tsx) — globaler WebSocket-Hook mit
Auto-Reconnect, leitet System-Modus + Warnungen ab.
