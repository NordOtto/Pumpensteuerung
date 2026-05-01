import { cn } from "@/lib/utils";

type Tone = "ok" | "warn" | "danger" | "muted";

const STYLES: Record<Tone, string> = {
  ok: "bg-ok/10 text-ok",
  warn: "bg-warn/10 text-warn",
  danger: "bg-danger/10 text-danger",
  muted: "bg-slate-100 text-slate-600",
};

export function StatusBadge({
  tone,
  children,
  pulse,
}: {
  tone: Tone;
  children: React.ReactNode;
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider",
        STYLES[tone]
      )}
    >
      {pulse && <span className={cn("h-2 w-2 rounded-full bg-current", pulse && "animate-pulse")} />}
      {children}
    </span>
  );
}
