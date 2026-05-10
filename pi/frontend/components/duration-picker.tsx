"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const MINUTES = Array.from({ length: 120 }, (_, i) => i + 1);
const ITEM_H = 40; // px pro Eintrag

export function DurationPicker({ value, onChange }: {
  value: number;
  onChange: (minutes: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false);

  // Beim Mount + wenn value sich ändert: zum Wert scrollen
  useEffect(() => {
    if (isScrolling.current) return;
    const el = listRef.current;
    if (!el) return;
    const idx = MINUTES.indexOf(value);
    if (idx < 0) return;
    el.scrollTop = idx * ITEM_H;
  }, [value]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    isScrolling.current = true;
    const idx = Math.round(el.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(MINUTES.length - 1, idx));
    onChange(MINUTES[clamped]);
    clearTimeout((handleScroll as unknown as { _t: ReturnType<typeof setTimeout> })._t);
    (handleScroll as unknown as { _t: ReturnType<typeof setTimeout> })._t = setTimeout(() => {
      isScrolling.current = false;
    }, 150);
  };

  return (
    <div className="rounded-tile border border-[var(--color-blue)]/30 bg-bg2 overflow-hidden">
      {/* Auswahl-Highlight */}
      <div className="relative h-[200px]">
        {/* obere + untere Gradient-Masken */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-bg2 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-bg2 to-transparent" />
        {/* Mittel-Highlight */}
        <div className="pointer-events-none absolute inset-x-0 top-[80px] z-10 h-10 border-y border-[var(--color-blue)]/30 bg-[var(--color-blue-dim)]" />

        <div
          ref={listRef}
          onScroll={handleScroll}
          className="h-full overflow-y-scroll"
          style={{
            scrollSnapType: "y mandatory",
            paddingTop: `${80}px`,
            paddingBottom: `${80}px`,
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {MINUTES.map((m) => (
            <div
              key={m}
              onClick={() => onChange(m)}
              style={{ scrollSnapAlign: "center", height: `${ITEM_H}px` }}
              className={cn(
                "flex cursor-pointer items-center justify-center text-sm font-bold transition",
                m === value ? "text-primary" : "text-tx2"
              )}
            >
              {m} min
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
