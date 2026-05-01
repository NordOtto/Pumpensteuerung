import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-slate-50/50 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <div className="text-sm font-semibold text-slate-700">{title}</div>
        {description && <div className="mt-1 text-xs text-slate-500">{description}</div>}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition active:scale-[0.98]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
