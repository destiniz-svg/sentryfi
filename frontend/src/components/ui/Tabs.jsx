import { createContext, useContext } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const TabsCtx = createContext(null);

export function Tabs({ value, onValueChange, children, className }) {
  return (
    <TabsCtx.Provider value={{ value, onValueChange }}>
      <div className={cn("", className)}>{children}</div>
    </TabsCtx.Provider>
  );
}

/**
 * A row of tabs.
 *
 * Always separate pills that wrap: a shared pill container turned into a
 * blob whenever the row wrapped (phones, and seven tabs on a desk screen),
 * and scrolling the strip sideways hid tabs with nothing to say so.
 */
export function TabsList({ children, className }) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex flex-wrap items-center gap-2",
        className
      )}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children, className }) {
  const ctx = useContext(TabsCtx);
  const active = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        "relative px-4 h-11 text-sm font-medium rounded-full transition-colors",
        "border border-[var(--border)]",
        active ? "text-[var(--bg)] border-[var(--ink)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
        className
      )}
    >
      {active && (
        <motion.span
          layoutId="tab-active"
          className="absolute inset-0 rounded-full bg-[var(--ink)]"
          transition={{ type: "spring", duration: 0.4, bounce: 0.18 }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  );
}

export function TabsContent({ value, children, className }) {
  const ctx = useContext(TabsCtx);
  if (ctx.value !== value) return null;
  return <div role="tabpanel" className={cn("", className)}>{children}</div>;
}
