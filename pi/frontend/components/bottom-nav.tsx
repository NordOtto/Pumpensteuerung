"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Sliders, Sprout, BarChart3, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Status", icon: LayoutDashboard },
  { href: "/control", label: "Steuerung", icon: Sliders },
  { href: "/zones", label: "Zonen", icon: Sprout },
  { href: "/analytics", label: "Verlauf", icon: BarChart3 },
  { href: "/settings", label: "Einstellungen", icon: Settings },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-white shadow-[0_-4px_20px_0_rgba(0,0,0,0.04)]">
      <div className="mx-auto flex max-w-5xl items-center justify-around px-2 py-2.5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-h-[48px] min-w-[60px] flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1 transition-colors",
                active ? "bg-primary/10 text-primary" : "text-slate-400 hover:text-primary"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
