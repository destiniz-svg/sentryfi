import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronRight, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import { SECTIONS, sectionOf } from "@/lib/sections";
import { ROLE_TEXT } from "@/lib/roles";
import AILogo from "./AILogo";
import { useT } from "@/lib/i18n";

/**
 * The desk's rail (DESIGN.md, "The desk register, rebuilt").
 *
 * Grouped under condensed labels, and each group folds away: the module list
 * outgrew one screen, so a person keeps open what they use and the rest is a
 * single line. The group holding the current page is always open. The
 * company's own setup (branding, history, settings) sits at the foot with the
 * person. 216px with a 2px ink rule on a wide screen; on a tablet it keeps its
 * icons and drops the words, and every icon still carries its name.
 */

const LABEL = "font-display text-[14px] font-bold uppercase tracking-[0.10em] whitespace-nowrap";
const KEY = "sentryfi.rail";

function Item({ to, icon: Icon, label: english }) {
  const { t } = useT();
  const label = t(english);
  return (
    <NavLink
      to={to}
      end={to === "/dashboard"}
      title={label}
      aria-label={label}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 h-10 px-0 lg:px-5 justify-center lg:justify-start",
          isActive ? "bg-[var(--ink)] text-[var(--accent)]" : "text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
        )
      }
    >
      <Icon size={19} strokeWidth={2} aria-hidden="true" className="shrink-0" />
      <span className={cn(LABEL, "hidden lg:inline truncate")}>{label}</span>
    </NavLink>
  );
}

/** Which groups a person has folded, remembered on this device. */
function useFolded() {
  const [folded, setFolded] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(KEY) || "null") ?? ["Work and assets", "The books"]);
    } catch {
      return new Set();
    }
  });
  const toggle = (label) =>
    setFolded((f) => {
      const next = new Set(f);
      next.has(label) ? next.delete(label) : next.add(label);
      try {
        localStorage.setItem(KEY, JSON.stringify([...next]));
      } catch {
        /* private window: folding still works, it is just not remembered */
      }
      return next;
    });
  return [folded, toggle];
}

function Group({ s, first, open, onToggle, can, tax, multi }) {
  const { t } = useT();
  // "All your companies" only for someone who keeps more than one set of books.
  const items = s.items.filter((it) => (!it.can || can(it.can)) && (!it.multi || multi));
  if (!items.length) return null;
  const id = `rail-${s.label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className={first ? "" : "mt-2"}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="hidden lg:flex w-full items-center justify-between h-8 px-5 font-display text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)]"
      >
        {t(s.label)}
        <ChevronRight size={14} aria-hidden="true" className={cn("transition-transform duration-200", open && "rotate-90")} />
      </button>
      {!first && <div className="lg:hidden mx-4 my-2 border-t border-[var(--border)]" aria-hidden="true" />}
      {/* Folded on a wide rail only: the icon rail on a tablet is short enough to show everything. */}
      <div id={id} className={cn(!open && "lg:hidden")}>
        {items.map((it) => (
          <Item key={it.to} {...it} label={it.to === "/tax" && tax !== "GST" ? `${tax} return` : it.label} />
        ))}
      </div>
    </div>
  );
}

export function Sidebar() {
  const { t } = useT();
  const { user, logout } = useAuth();
  const { company, companies, roles, can } = useCompany();
  const multi = (companies || []).length > 1;
  const tax = company?.tax?.tax || "GST";
  const { pathname } = useLocation();
  const role = ROLE_TEXT[roles?.[0]]?.label;
  const [folded, toggle] = useFolded();
  const here = sectionOf(pathname);
  const isOpen = (label) => label === here || !folded.has(label);

  return (
    <aside className="hidden md:flex shrink-0 flex-col sticky top-0 h-screen w-[72px] lg:w-[216px] border-r-2 rtl:border-r-0 rtl:border-l-2 border-[var(--ink)] bg-[var(--surface)] pt-6 pb-3 overflow-y-auto">
      <div className="flex items-center gap-2 px-0 lg:px-5 justify-center lg:justify-start mb-5">
        <AILogo size={36} />
        <div className="hidden lg:block min-w-0">
          <div className="font-display text-[24px] font-semibold tracking-[-0.03em] leading-none">Sentryfi</div>
          <div className="text-[12px] font-display font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)] truncate mt-1">
            {company?.name}
          </div>
        </div>
      </div>

      <nav aria-label="Sections" className="flex-1">
        {SECTIONS.filter((s) => !s.foot).map((s, i) => (
          <Group key={s.label} s={s} first={i === 0} open={isOpen(s.label)} onToggle={() => toggle(s.label)} can={can} tax={tax} multi={multi} />
        ))}
      </nav>

      <div className="border-t border-[var(--border)] pt-2 mt-4">
        {SECTIONS.filter((s) => s.foot).map((s) => (
          <Group key={s.label} s={s} first open={isOpen(s.label)} onToggle={() => toggle(s.label)} can={can} tax={tax} multi={multi} />
        ))}
        <div className="hidden lg:flex items-center gap-2 px-5 pt-3">
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold truncate">{user?.name || "Account"}</div>
            {role && <div className="text-[12px] text-[var(--ink-muted)] truncate">{role}</div>}
          </div>
          <button type="button" onClick={logout} title={t("Sign out")} aria-label={t("Sign out")} className="h-9 w-9 shrink-0 inline-flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>
        <button type="button" onClick={logout} title={t("Sign out")} aria-label={t("Sign out")} className="lg:hidden flex items-center h-10 w-full justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)] mt-1">
          <LogOut size={19} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
