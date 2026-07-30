import type { Metadata, Viewport } from "next";
import "./globals.css";
import { StatusProvider } from "@/lib/ws";
import { ThemeProvider } from "@/components/theme-provider";
import { TopBar } from "@/components/top-bar";
import { BottomNav } from "@/components/bottom-nav";
import { AssistantFab } from "@/components/assistant-fab";

export const metadata: Metadata = {
  title: "Pumpensteuerung",
  description: "Brunnenpumpe + smarte Bewässerung",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pumpe",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f0f4f8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" data-theme="light">
      <body className="min-h-dvh overflow-x-hidden">
        <ThemeProvider>
          <StatusProvider>
            <TopBar />
            <main className="mx-auto max-w-7xl px-3 pb-24 pt-16 md:px-5 lg:pl-28 lg:pr-8">
              {children}
            </main>
            <BottomNav />
            <AssistantFab />
          </StatusProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
