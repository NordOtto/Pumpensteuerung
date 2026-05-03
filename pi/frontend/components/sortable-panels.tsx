"use client";

import { useEffect, useState } from "react";
import type React from "react";
import { AnimatePresence, motion, Reorder, useDragControls } from "framer-motion";
import { ChevronDown, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

type PanelId = string;

export function SortablePanels<T extends PanelId>({
  storageKey,
  defaultOrder,
  titles,
  hidden,
  children,
}: {
  storageKey: string;
  defaultOrder: readonly T[];
  titles: Record<T, string>;
  hidden?: Partial<Record<T, boolean>>;
  children: Record<T, React.ReactNode>;
}) {
  const orderKey = `${storageKey}.order`;
  const collapseKey = `${storageKey}.collapsed`;
  const [order, setOrder] = useState<T[]>([...defaultOrder]);
  const [collapsed, setCollapsed] = useState<Partial<Record<T, boolean>>>({});

  useEffect(() => {
    try {
      const savedOrder = JSON.parse(localStorage.getItem(orderKey) || "[]");
      if (Array.isArray(savedOrder)) {
        const known = uniqueOrder(savedOrder.filter((id): id is T => defaultOrder.includes(id as T)));
        const missing = defaultOrder.filter((id) => !known.includes(id));
        setOrder([...known, ...missing]);
      }
      const savedCollapsed = JSON.parse(localStorage.getItem(collapseKey) || "{}");
      if (savedCollapsed && typeof savedCollapsed === "object") setCollapsed(savedCollapsed);
    } catch {
      setOrder([...defaultOrder]);
      setCollapsed({});
    }
  }, [collapseKey, defaultOrder, orderKey]);

  useEffect(() => {
    localStorage.setItem(orderKey, JSON.stringify(order));
  }, [order, orderKey]);

  useEffect(() => {
    localStorage.setItem(collapseKey, JSON.stringify(collapsed));
  }, [collapsed, collapseKey]);

  const visibleOrder = order.filter((id) => !hidden?.[id]);

  return (
    <Reorder.Group axis="y" values={visibleOrder} onReorder={(items) => setOrder(mergeOrder(items, defaultOrder))} className="flex flex-col gap-5">
      {visibleOrder.map((id) => (
        <SortablePanel
          key={id}
          id={id}
          title={titles[id]}
          collapsed={collapsed[id] ?? false}
          onToggle={() => setCollapsed((current) => ({ ...current, [id]: !(current[id] ?? false) }))}
        >
          {children[id]}
        </SortablePanel>
      ))}
    </Reorder.Group>
  );
}

function SortablePanel({
  id,
  title,
  collapsed,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item value={id} layout="position" dragListener={false} dragControls={controls} className="touch-pan-y list-none">
      <section className="mb-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label={`${title} verschieben`}
              onPointerDown={(event) => controls.start(event)}
              className="flex h-9 w-9 shrink-0 touch-none items-center justify-center rounded-lg border border-white/70 bg-white/75 text-slate-400 shadow-sm active:scale-95"
            >
              <GripVertical size={18} />
            </button>
            <span className="h-5 w-1 rounded-full bg-gradient-to-b from-primary to-ok shadow-[0_0_16px_rgba(37,136,235,0.32)]" />
            <h2 className="truncate text-xs font-bold uppercase tracking-widest text-slate-600">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/70 bg-white/75 text-slate-500 shadow-sm transition active:scale-95"
            aria-label={collapsed ? `${title} ausklappen` : `${title} einklappen`}
          >
            <ChevronDown size={18} className={cn("transition-transform", collapsed && "-rotate-90")} />
          </button>
        </div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="overflow-hidden"
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </Reorder.Item>
  );
}

function mergeOrder<T extends string>(items: T[], defaults: readonly T[]) {
  const visible = uniqueOrder(items.filter((id): id is T => defaults.includes(id)));
  const missing = defaults.filter((id) => !visible.includes(id));
  return [...visible, ...missing];
}

function uniqueOrder<T extends string>(items: T[]) {
  const seen = new Set<T>();
  return items.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
