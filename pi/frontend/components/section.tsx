export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-7">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-5 w-1 rounded-full bg-gradient-to-b from-primary to-ok shadow-[0_0_16px_rgba(37,136,235,0.32)]" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-600">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
