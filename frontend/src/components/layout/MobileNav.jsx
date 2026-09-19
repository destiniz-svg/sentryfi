import { useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  LayoutGrid,
  FileText,
  Users,
  Receipt,
  Wallet,
  Package,
  BarChart3,
  Settings,
  LogOut,
  X,
  Menu,
  ReceiptText,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import AILogo from "./AILogo";

/**
 * Navigation below the desktop breakpoint. The app shipped with a sidebar that
 * is `hidden md:flex` and nothing else, so on a phone an authenticated user had
 * no way to move between sections at all.
 *
 * Two pieces: a bar pinned to the bottom for the four places people go most,
 * within thumb reach, and a sheet for the rest. Everything is a real control at
 * 44px or more, with a focus trap, Escape, scroll lock and focus restore, so it
 * works by touch, by keyboard and by screen reader.
 */

const PRIMARY = [
  { to: "/dashboard", icon: LayoutGrid, label: "Home" },
  { to: "/bills", icon: ReceiptText, label: "Bills" },
  { to: "/invoices", icon: FileText, label: "Invoices" },
  { to: "/expenses", icon: Receipt, label: "Expenses" },
];

const REST = [
  { to: "/clients", icon: Users, label: "Clients" },
  { to: "/payments", icon: Wallet, label: "Payments" },
  { to: "/items", icon: Package, label: "Items" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function MobileNav({ open, onOpen, onClose }) {
  const still = useReducedMotion();
  const sheetRef = useRef(null);
  const openerRef = useRef(null);

  // Escape, focus trap, scroll lock and focus restore while the sheet is up.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    openerRef.current = opener;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const first = sheetRef.current?.querySelector("a,button");
    first?.focus();

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = sheetRef.current?.querySelectorAll("a,button");
      if (!nodes?.length) return;
      const list = Array.from(nodes);
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (opener && opener.focus) opener.focus();
    };
  }, [open, onClose]);

  const { user, logout } = useAuth();

  const tabClass = ({ isActive }) =>
    "flex flex-col items-center justify-center gap-1 min-h-[56px] flex-1 rounded-xl text-[11px] font-semibold transition-colors " +
    (isActive
      ? "text-[var(--ink)] bg-[var(--surface-2)]"
      : "text-[var(--ink-muted)] hover:text-[var(--ink)]");

  return (
    <>
      {/* bottom bar — thumb reach, always present below md */}
      <nav
        aria-label="Main"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[var(--border)] bg-[var(--surface)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-stretch gap-1 px-2 py-1.5">
          {PRIMARY.map((n) => (
            <NavLink key={n.to} to={n.to} className={tabClass}>
              {({ isActive }) => (
                <>
                  <n.icon size={19} strokeWidth={isActive ? 2.3 : 1.9} />
                  <span>{n.label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={onOpen}
            aria-expanded={open ? "true" : "false"}
            aria-haspopup="dialog"
            className="flex flex-col items-center justify-center gap-1 min-h-[56px] flex-1 rounded-xl text-[11px] font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            <Menu size={19} strokeWidth={1.9} />
            <span>More</span>
          </button>
        </div>
      </nav>

      {/* the sheet */}
      <AnimatePresence>
        {open && (
          <div className="md:hidden fixed inset-0 z-50">
            <motion.div
              className="absolute inset-0 bg-[rgba(20,20,20,.45)]"
              onClick={onClose}
              initial={still ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.div
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-label="More sections"
              className="absolute bottom-0 inset-x-0 rounded-t-[22px] bg-[var(--surface)] border-t border-[var(--border)] p-5"
              style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}
              initial={still ? false : { y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex items-center gap-3 pb-4">
                <AILogo size={28} />
                <span className="flex flex-col min-w-0">
                  <span className="text-[15px] font-semibold truncate">
                    {user?.name || "Sentryfi"}
                  </span>
                  <span className="text-[12px] text-[var(--ink-muted)] truncate">
                    {user?.email || ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="ml-auto h-11 w-11 rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)]"
                >
                  <X size={19} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {REST.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      "flex items-center gap-3 min-h-[52px] px-3 rounded-xl text-[15px] font-medium transition-colors " +
                      (isActive
                        ? "bg-[var(--surface-2)] text-[var(--ink)]"
                        : "text-[var(--ink-muted)] hover:text-[var(--ink)]")
                    }
                  >
                    <n.icon size={18} strokeWidth={1.9} />
                    <span>{n.label}</span>
                  </NavLink>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  logout?.();
                }}
                className="mt-3 w-full min-h-[52px] rounded-xl border border-[var(--border)] text-[15px] font-semibold text-[var(--ink-muted)] hover:text-[var(--danger)] flex items-center justify-center gap-2"
              >
                <LogOut size={17} />
                <span>Log out</span>
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

export default MobileNav;
