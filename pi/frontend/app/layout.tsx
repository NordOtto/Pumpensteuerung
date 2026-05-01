import type { Metadata, Viewport } from "next";
import "./globals.css";
import { StatusProvider } from "@/lib/ws";
import { TopBar } from "@/components/top-bar";
import { BottomNav } from "@/components/bottom-nav";

export const metadata: Metadata = {
  title: "Pumpensteuerung",
  description: "Brunnenpumpe + smarte Bewässerung",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#2588eb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="light">
      <body className="min-h-dvh">
        <StatusProvider>
          <TopBar />
          <main className="mx-auto max-w-5xl px-4 pb-24 pt-20">{children}</main>
          <BottomNav />
        </StatusProvider>
      </body>
    </html>
  );
}
