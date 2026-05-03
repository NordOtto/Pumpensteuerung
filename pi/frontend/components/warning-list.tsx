"use client";

import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Warning } from "@/lib/types";

export function WarningList({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-card border border-border bg-bg1 p-4 shadow-card">
        <CheckCircle2 className="h-5 w-5 text-ok" />
        <div>
          <div className="text-sm font-medium text-tx">Keine Warnungen</div>
          <div className="text-xs text-tx3">System läuft normal.</div>
        </div>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {warnings.map((w) => {
        const Icon = w.level === "danger" ? AlertCircle : AlertTriangle;
        const tone =
          w.level === "danger"
            ? "border-[var(--color-red)]/30 bg-[var(--color-red-dim)] text-danger"
            : "border-[var(--color-amber)]/30 bg-[var(--color-amber-dim)] text-warn";
        return (
          <li
            key={w.id}
            className={cn(
              "flex items-center gap-3 rounded-card border p-3 shadow-card animate-fade-in",
              tone
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">{w.message}</span>
          </li>
        );
      })}
    </ul>
  );
}

