"use client";

import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Warning } from "@/lib/types";

export function WarningList({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-white p-4 shadow-sm">
        <CheckCircle2 className="h-5 w-5 text-ok" />
        <div>
          <div className="text-sm font-medium text-slate-900">Keine Warnungen</div>
          <div className="text-xs text-slate-500">System läuft normal.</div>
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
            ? "border-danger/30 bg-danger/5 text-danger"
            : "border-warn/30 bg-warn/5 text-warn";
        return (
          <li
            key={w.id}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 shadow-sm animate-fade-in",
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
