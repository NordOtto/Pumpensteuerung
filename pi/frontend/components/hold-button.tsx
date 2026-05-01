"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface HoldButtonProps {
  onTrigger: () => void;
  label: string;
  holdMs?: number;
  disabled?: boolean;
  tone?: "primary" | "ok" | "danger";
}

const TONE: Record<NonNullable<HoldButtonProps["tone"]>, { bg: string; ring: string }> = {
  primary: { bg: "bg-primary text-white", ring: "ring-primary/40" },
  ok: { bg: "bg-ok text-white", ring: "ring-ok/40" },
  danger: { bg: "bg-danger text-white", ring: "ring-danger/40" },
};

/** Long-Press Button mit Progress-Ring. 1.5 s halten zum Auslösen. */
export function HoldButton({
  onTrigger,
  label,
  holdMs = 1500,
  disabled,
  tone = "primary",
}: HoldButtonProps) {
  const [progress, setProgress] = useState(0);
  const startedAt = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const t = TONE[tone];

  function tick() {
    if (startedAt.current == null) return;
    const elapsed = performance.now() - startedAt.current;
    const p = Math.min(1, elapsed / holdMs);
    setProgress(p);
    if (p >= 1) {
      startedAt.current = null;
      onTrigger();
      // Nach dem Trigger zurücksetzen
      window.setTimeout(() => setProgress(0), 200);
      return;
    }
    raf.current = requestAnimationFrame(tick);
  }

  function start() {
    if (disabled) return;
    startedAt.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  }

  function cancel() {
    startedAt.current = null;
    if (raf.current != null) cancelAnimationFrame(raf.current);
    setProgress(0);
  }

  useEffect(() => () => cancel(), []);

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      className={cn(
        "relative flex h-20 min-w-48 items-center justify-center overflow-hidden rounded-xl px-6 text-lg font-semibold uppercase tracking-wide ring-4 ring-transparent transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40",
        t.bg
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-white/20 transition-[width]"
        style={{ width: `${progress * 100}%` }}
      />
      <span className="relative">
        {progress > 0 && progress < 1 ? "Halten…" : label}
      </span>
    </button>
  );
}
