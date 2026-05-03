"use client";

import { CheckCircle2, XCircle, Clock, Droplet } from "lucide-react";
import type { IrrigationDecision } from "@/lib/types";
import { cn } from "@/lib/utils";

interface IrrigationAdvisorProps {
  decision: IrrigationDecision;
}

export function IrrigationAdvisor({ decision }: IrrigationAdvisorProps) {
  const allowed = decision.allowed;
  const Icon = allowed ? CheckCircle2 : XCircle;

  return (
    <div
      className={cn(
        "rounded-card border p-4 shadow-card",
        allowed ? "border-[var(--color-green)]/30 bg-[var(--color-green-dim)]" : "border-[var(--color-amber)]/30 bg-[var(--color-amber-dim)]",
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-7 w-7 flex-shrink-0", allowed ? "text-ok" : "text-warn")} />
        <div className="flex-1">
          <div className="text-sm font-bold uppercase tracking-wider text-tx3">
            Bewässerungs-Assistent
          </div>
          <div className="mt-0.5 text-base font-semibold text-tx">
            {allowed ? "Bewässerung erlaubt" : "Aktuell pausiert"}
          </div>
          {decision.reason && (
            <div className="mt-1 text-sm text-tx2">{decision.reason}</div>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 sm:grid-cols-3">
        <Detail
          icon={Clock}
          label="Nächster Lauf"
          value={
            decision.next_start
              ? new Date(decision.next_start).toLocaleString("de-DE", {
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"
          }
        />
        <Detail
          icon={Droplet}
          label="Wasser-Budget"
          value={`${decision.water_budget_mm.toFixed(1)} mm`}
        />
        {decision.runtime_factor !== 1 && (
          <Detail
            icon={Droplet}
            label="Laufzeit-Faktor"
            value={`×${decision.runtime_factor.toFixed(2)}`}
          />
        )}
        {decision.running && decision.active_zone && (
          <Detail icon={Droplet} label="Aktive Zone" value={decision.active_zone} />
        )}
      </div>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-tx3" />
      <div className="flex flex-col">
        <span className="text-[10px] font-bold uppercase tracking-wider text-tx3">{label}</span>
        <span className="text-sm font-medium text-tx2">{value}</span>
      </div>
    </div>
  );
}

