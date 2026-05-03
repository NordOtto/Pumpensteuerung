# Pumpe-Frontend (Next.js + Tailwind)

Industrie-HMI-Dashboard fuer die Brunnenpumpe. Kommuniziert mit dem
Python-Backend ueber REST (`/api/*`) und WebSocket (`/ws`).

## Design-System

Das Frontend nutzt das Theme aus `../../handoff`:
- CSS-Variablen in `app/globals.css` fuer Light/Dark-Theme
- kompakte HMI/Webapp-Dichte mit `bg-bg1`, `bg-bg2`, `border-border`, `text-tx*`
- UI-Bausteine in `components/ui/*` fuer Cards, Badges, Buttons, KPI-Tiles und Zonen-Chips
- Touch-Targets >=44 px und tabellarische Zahlen

## Pages

| Pfad | Inhalt |
|---|---|
| `/dashboard` | Live-Werte, sicherer Pumpenstop/Pause, Bewaesserungssteuerung, Zonen-Status, Warnungen |
| `/control` | Redirect auf `/dashboard` |
| `/zones` | Wetter+ET0-Uebersicht, alle Programme + Zonen mit Bodenfeuchte/Defizit/Laufzeit |
| `/analytics` | Live-Charts (Druck/Flow/Hz), Lauf-Historie |
| `/settings` | Programme, Presets, PI-Tunings, Zeitfenster, OTA, Urlaubsmodus |

## Lokal entwickeln

```bash
cd pi/frontend
npm install
BACKEND_URL=http://127.0.0.1:8000 npm run dev
```

Browser: http://localhost:3001

## Production-Build

```bash
npm run build
```

Erzeugt `.next/standalone/server.js`, das auf dem Pi via systemd gestartet wird.

## Wiederverwendbare Komponenten

[components/ui](components/ui), [warning-list.tsx](components/warning-list.tsx),
[weather-widget.tsx](components/weather-widget.tsx), [irrigation-advisor.tsx](components/irrigation-advisor.tsx),
[sortable-panels.tsx](components/sortable-panels.tsx), [top-bar.tsx](components/top-bar.tsx),
[bottom-nav.tsx](components/bottom-nav.tsx).

State-Provider: [lib/ws.tsx](lib/ws.tsx) mit Auto-Reconnect, System-Modus und Warnungen.
