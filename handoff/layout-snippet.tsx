// pi/frontend/app/layout.tsx  ← ÄNDERUNG: ThemeProvider einbinden
// Nur der relevante Ausschnitt — füge ThemeProvider um {children} herum ein

/*
import { ThemeProvider } from "@/components/theme-provider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
*/

// ── Theme-Toggle Button (optional, z.B. in top-bar.tsx einbauen) ─────────────
// "use client";
// import { useTheme } from "@/components/theme-provider";
//
// export function ThemeToggle() {
//   const { theme, toggle } = useTheme();
//   return (
//     <button onClick={toggle} className="...">
//       {theme === "light" ? "🌙" : "☀️"}
//     </button>
//   );
// }
export {};
