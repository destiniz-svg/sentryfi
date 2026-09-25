import { NavLink, useLocation } from "react-router-dom";
import { House, Landmark, LayoutGrid, Plus, ReceiptText } from "lucide-react";
import { useOutbox } from "@/context/OutboxContext";
import { useT } from "@/lib/i18n";

/**
 * The main app's tab bar on a phone.
 *
 * Five places, the one thing this app exists for in the middle: Home · Money
 * · Record · Bank · More (DESIGN.md, "The phone, refined"). A floating pill of
 * round buttons inside the thumb's reach, above the home indicator; the
 * current place is filled ink, Record is always yellow. Each carries its name
 * for a screen reader and on a long press.
 * Field staff never see it; they have the expense manager's own bar.
 */

const TABS = [
  { to: "/dashboard", icon: House, label: "Home" },
  { to: "/money", icon: ReceiptText, label: "Money", also: ["/bills", "/invoices"] },
  null, // Record
  { to: "/bank", icon: Landmark, label: "Bank", also: ["/bank/"] },
  { to: "/more", icon: LayoutGrid, label: "More", also: ["/settings", "/reports", "/contacts", "/inbox", "/statements", "/closing", "/tax", "/import", "/assets", "/loans", "/stock", "/shipments", "/projects", "/orders", "/claims", "/approvals", "/payments", "/cfo"] },
];

export function TabBar({ onRecord }) {
  const { pathname } = useLocation();
  const { count } = useOutbox();
  const { t: tr } = useT();
  const current = (t) => pathname === t.to || (t.also || []).some((p) => pathname.startsWith(p));

  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-40">
      {/* What is held on this phone, said plainly: an iPhone cannot send it
          in the background, so it goes when the app is open with signal. */}
      {count > 0 && (
        <div role="status" className="mx-4 mb-2 rounded-2xl bg-[var(--ink-panel)] text-[var(--on-ink-panel)] text-[13px] px-3 py-2">
          {count} {count === 1 ? "thing" : "things"} waiting to send · they go when there is signal
        </div>
      )}
      <nav
        aria-label="Main"
        className="mx-4 flex items-center justify-between gap-1 rounded-full bg-[var(--surface)] lift p-1.5"
        style={{ marginBottom: "max(14px, env(safe-area-inset-bottom))" }}
      >
        {TABS.map((t) =>
          t ? (
            <NavLink
              key={t.to}
              to={t.to}
              aria-label={tr(t.label)}
              title={tr(t.label)}
              aria-current={current(t) ? "page" : undefined}
              className={`h-[52px] w-[52px] rounded-full flex items-center justify-center transition-colors ${
                current(t) ? "bg-[var(--ink)] text-[var(--surface)]" : "bg-[var(--surface-2)] text-[var(--ink-muted)]"
              }`}
            >
              <t.icon size={21} strokeWidth={1.75} aria-hidden="true" />
            </NavLink>
          ) : (
            <button
              key="record"
              type="button"
              onClick={onRecord}
              aria-label={tr("Record")}
              title={tr("Record")}
              className="h-[52px] w-[52px] rounded-full bg-[var(--accent)] text-[var(--on-accent)] flex items-center justify-center"
            >
              <Plus size={24} strokeWidth={2} aria-hidden="true" />
            </button>
          )
        )}
      </nav>
    </div>
  );
}
