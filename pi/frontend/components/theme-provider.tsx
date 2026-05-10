// pi/frontend/components/theme-provider.tsx
// Setzt data-theme="dark"|"light" auf <html> — kompatibel mit CSS-Variablen in globals.css

"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
type ThemeMode = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;       // tatsächlich angewendetes Theme
  mode: ThemeMode;    // gewählter Modus (system folgt prefers-color-scheme)
  setMode: (m: ThemeMode) => void;
  toggle: () => void; // light <-> dark (verwirft system)
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  mode: "system",
  setMode: () => {},
  toggle: () => {},
});

const STORAGE_KEY = "pumpe.theme";

function systemPref(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    const initialMode: ThemeMode = saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
    const initialTheme: Theme = initialMode === "system" ? systemPref() : initialMode;
    setModeState(initialMode);
    setThemeState(initialTheme);
    document.documentElement.setAttribute("data-theme", initialTheme);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const cur = (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? "system";
      if (cur === "system") {
        const t: Theme = e.matches ? "dark" : "light";
        setThemeState(t);
        document.documentElement.setAttribute("data-theme", t);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
    const t: Theme = m === "system" ? systemPref() : m;
    setThemeState(t);
    document.documentElement.setAttribute("data-theme", t);
  };

  const toggle = () => setMode(theme === "light" ? "dark" : "light");

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
