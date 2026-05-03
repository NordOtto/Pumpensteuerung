"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gauge, Leaf, CloudRain, Bot, BarChart3, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/zones",     label: "Zonen",     icon: Leaf },
  { href: "/weather",   label: "Wetter",    icon: CloudRain },
  { href: "/assistant", label: "Assistent", icon: Bot },
  { href: "/analytics", label: "Verlauf",   icon: BarChart3 },
  { href: "/settings",  label: "Einst.",    icon: Settings },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-bg1 lg:inset-y-0 lg:left-0 lg:right-auto lg:w-20 lg:border-r lg:border-t-0">
      <div className="mx-auto flex max-w-5xl items-stretch justify-around lg:h-full lg:flex-col lg:justify-center lg:gap-0">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} className={cn(
              "relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 transition-colors",
              "lg:min-h-[62px] lg:w-full lg:flex-none",
              active ? "text-ok" : "text-tx3 hover:text-tx2"
            )}>
              {active && (
                <div className="absolute inset-x-[20%] top-0 h-0.5 rounded-b-full bg-ok lg:inset-x-0 lg:inset-y-[20%] lg:right-auto lg:w-0.5 lg:h-auto lg:rounded-none lg:rounded-r-full" />
              )}
              <Icon className="h-[18px] w-[18px]" />
              <span className="text-[9px] font-bold uppercase tracking-[0.06em]">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
