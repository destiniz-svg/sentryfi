import { NavLink, useLocation } from "react-router-dom";
import { Landmark, LayoutGrid, Menu, Plus, ReceiptText } from "lucide-react";
import { useOutbox } from "@/context/OutboxContext";

/**
 * The main app's tab bar on a phone.
 *
 * Five places, labels always on, the one thing this app exists for in the
 * middle: Home · Money · Record · Bank · More (DESIGN.md, "The phone, as two
 * apps"). It sits inside the thumb's reach and respects the home indicator.
 * Field staff never see it; they have the expense manager's own bar.
 */

const TABS = [
  { to: "/dashboard", icon: LayoutGrid, label: "Home" },
  { to: "/money", icon: ReceiptText, label: "Money", also: ["/bills", "/invoices"] },
  null, // Record
  { to: "/bank", icon: Landmark, label: "Bank", also: ["/bank/"] },
  { to: "/more", icon: Menu, label: "More", also: ["/settings", "/statements", "/closing", "/tax", "/import", "/assets", "/loans", "/stock", "/shipments", "/projects", "/orders"] },
];

export function TabBar({ onRecord }) {
  const { pathname } = useLocation();
  const { count } = useOutbox();
  const current = (t) => pathname === t.to || (t.also || []).some((p) => pathname.startsWith(p));

  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-40">
      {/* What is held on this phone, said plainly: an iPhone cannot send it
          in the background, so it goes when the app is open with signal. */}
      {count > 0 && (
        <div role="status" className="mx-3 mb-1 rounded-xl bg-[var(--ink-panel)] text-[var(--on-ink-panel)] text-[13px] px-3 py-2">
          {count} {count === 1 ? "thing" : "things"} waiting to send · they go when there is signal
        </div>
      )}
      <nav
        aria-label="Main"
        className="grid grid-cols-5 items-center bg-[var(--surface)] border-t border-[var(--border)] px-2 pt-1.5"
        style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
      >
        {TABS.map((t) =>
          t ? (
            <NavLink
              key={t.to}
              to={t.to}
              aria-current={current(t) ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-1 min-h-[52px] text-[11px] font-semibold ${
                current(t) ? "text-[var(--ink)]" : "text-[var(--ink-muted)]"
              }`}
            >
              <t.icon size={22} strokeWidth={current(t) ? 2.3 : 1.9} aria-hidden="true" />
              <span>{t.label}</span>
            </NavLink>
          ) : (
            <button
              key="record"
              type="button"
              onClick={onRecord}
              aria-label="Record"
              className="justify-self-center -mt-6 w-14 h-14 rounded-full bg-[var(--accent)] text-[var(--on-accent)] border border-[var(--ink)] shadow-[0_6px_16px_rgba(20,20,19,.18)] flex items-center justify-center"
            >
              <Plus size={26} strokeWidth={2.4} aria-hidden="true" />
            </button>
          )
        )}
      </nav>
    </div>
  );
}
