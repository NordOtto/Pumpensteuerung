# Pumpensteuerung — Design Handoff

Alle Dateien aus diesem Ordner in dein Next.js-Projekt kopieren.

---

## Schritt-für-Schritt

### 1. Schriftart einbinden
In `app/layout.tsx` den Google Fonts Import aus `globals.css` übernehmen
oder direkt in `<head>`:
```tsx
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"] });
// body className={inter.className}
```

### 2. `globals.css` ersetzen
```
cp handoff/globals.css pi/frontend/app/globals.css
```
→ Enthält CSS-Variablen für Light + Dark Theme, Inter-Import, .num Utility.

### 3. `tailwind.config.ts` ersetzen
```
cp handoff/tailwind.config.ts pi/frontend/tailwind.config.ts
```
→ Fügt bg0/bg1/bg2, tx/tx2/tx3, ok/warn/danger via CSS-Variablen hinzu.

### 4. Theme-Provider einbinden
```
cp handoff/components/theme-provider.tsx pi/frontend/components/theme-provider.tsx
```
In `app/layout.tsx`:
```tsx
import { ThemeProvider } from "@/components/theme-provider";
// <ThemeProvider>{children}</ThemeProvider>
```

### 5. Neue UI-Komponenten kopieren
```
cp handoff/components/ui/* pi/frontend/components/ui/
```

Neue Komponenten:
| Datei | Ersetzt / Ergänzt |
|---|---|
| `badge.tsx` | `status-badge.tsx` (mehr Tones: blue, purple) |
| `card.tsx` | glassmorphische Panels → flache Karten + `SectionLabel`, `StatBox` |
| `kpi-tile.tsx` | `kpi-card.tsx` (kompakter, Theme-aware) |
| `action-tile.tsx` | Neu — Start/Stop/Automatik Buttons |
| `zone-chip.tsx` | `zone-card.tsx` (kompaktere Dashboard-Version) |
| `info-chip.tsx` | Neu — Label+Wert Chip für TopBar |
| `btn.tsx` | Neu — einheitlicher Button mit Tone-System |
| `toggle.tsx` | Verbesserte Toggle-Version |

### 6. `tokens.ts` kopieren (optional)
```
cp handoff/tokens.ts pi/frontend/lib/tokens.ts
```
Nur nötig wenn du TypeScript-Zugriff auf Farbwerte brauchst.
Im Normalfall reichen die CSS-Variablen.

---

## Farbsystem

Alle Farben laufen über CSS-Variablen (`var(--color-green)` etc.).
Theme-Wechsel: `document.documentElement.setAttribute("data-theme", "dark")`.

### Light
| Token | Wert |
|---|---|
| bg0 | `#f0f4f8` |
| bg1 | `#ffffff` |
| green | `#00a372` |
| blue | `#1a6fd4` |
| amber | `#c47d0a` |
| red | `#d63030` |

### Dark
| Token | Wert |
|---|---|
| bg0 | `#0d1117` |
| bg1 | `#161b22` |
| green | `#00c896` |
| blue | `#58a6ff` |
| amber | `#f59e0b` |
| red | `#ef4444` |

---

## Wichtige Design-Prinzipien

- **Keine Glasmorphie** — klare Grenzen, `border-border bg-bg1`
- **Kompakte Dichte** — 8px gap, 6px border-radius für Kacheln
- **Inter überall** — auch für Zahlen (tabular-nums statt Monospace)
- **Touch-first** — min. 44px Tappable-Area für alle Buttons
- **CSS-Variablen** — nie Farben hardcoden, immer `var(--color-*)` nutzen
