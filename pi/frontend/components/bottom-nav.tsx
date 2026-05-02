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
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/70 bg-white/80 shadow-[0_-12px_32px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:inset-y-0 lg:left-0 lg:right-auto lg:w-20 lg:border-r lg:border-t-0">
      <div className="mx-auto flex max-w-5xl items-center justify-around px-2 py-2.5 lg:h-full lg:flex-col lg:justify-center lg:gap-3 lg:px-3">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex min-h-[48px] min-w-[60px] flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-1 transition-all lg:min-h-[62px] lg:w-full",
                active
                  ? "bg-gradient-to-br from-primary/15 to-cyan-50 text-primary shadow-[0_12px_30px_rgba(37,136,235,0.16)]"
                  : "text-slate-400 hover:bg-white/70 hover:text-primary"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-semibold uppercase tracking-wider lg:text-[9px]">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
