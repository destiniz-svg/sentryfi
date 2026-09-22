import { NavLink } from "react-router-dom";
import { LogOut, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import { SECTIONS } from "@/lib/sections";
import { ROLE_TEXT } from "@/lib/roles";
import AILogo from "./AILogo";

/**
 * The desk's rail (DESIGN.md, "The desk register, rebuilt").
 *
 * Grouped under condensed labels — Needs you, Money, The books — with the
 * company's settings and the signed-in person at the foot, because a flat
 * list stops working at about ten places and the module list is longer than
 * that. 216px with a 2px ink rule on a wide screen; on a tablet it keeps its
 * icons and drops the words, and every icon still carries its name.
 */

const LABEL = "font-display text-[14px] font-bold uppercase tracking-[0.10em] whitespace-nowrap";

function Item({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      end={to === "/dashboard"}
      title={label}
      aria-label={label}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 h-11 px-0 lg:px-5 justify-center lg:justify-start",
          isActive ? "bg-[var(--ink)] text-[var(--accent)]" : "text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
        )
      }
    >
      <Icon size={20} strokeWidth={2} aria-hidden="true" className="shrink-0" />
      <span className={cn(LABEL, "hidden lg:inline truncate")}>{label}</span>
    </NavLink>
  );
}

export function Sidebar() {
  const { user, logout } = useAuth();
  const { company, roles, can } = useCompany();
  const role = ROLE_TEXT[roles?.[0]]?.label;

  return (
    <aside className="hidden md:flex shrink-0 flex-col sticky top-0 h-screen w-[72px] lg:w-[216px] border-r-2 border-[var(--ink)] bg-[var(--surface)] py-6 overflow-y-auto">
      <div className="flex items-center gap-2 px-0 lg:px-5 justify-center lg:justify-start mb-6">
        <AILogo size={36} />
        <div className="hidden lg:block min-w-0">
          <div className="font-display text-[24px] font-semibold tracking-[-0.03em] leading-none">Sentryfi</div>
          <div className="text-[12px] font-display font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)] truncate mt-1">
            {company?.name}
          </div>
        </div>
      </div>

      <nav aria-label="Sections" className="flex-1">
        {SECTIONS.map((s, i) => (
          <div key={s.label} className={i ? "mt-4" : ""}>
            <div className="hidden lg:block px-5 pb-1.5 font-display text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              {s.label}
            </div>
            {i > 0 && <div className="lg:hidden mx-4 mb-4 border-t border-[var(--border)]" aria-hidden="true" />}
            {s.items.filter((it) => !it.can || can(it.can)).map((it) => (
              <Item key={it.to} {...it} />
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--border)] pt-3 mt-4">
        <Item to="/settings" icon={Settings} label="Settings" />
        <div className="hidden lg:block px-5 pt-3">
          <div className="text-[14px] font-semibold truncate">{user?.name || "Account"}</div>
          {role && <div className="text-[12px] text-[var(--ink-muted)] truncate">{role}</div>}
        </div>
        <button
          type="button"
          onClick={logout}
          title="Sign out"
          aria-label="Sign out"
          className="flex items-center gap-3 h-11 w-full px-0 lg:px-5 justify-center lg:justify-start text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)] mt-1"
        >
          <LogOut size={20} aria-hidden="true" className="shrink-0" />
          <span className={cn(LABEL, "hidden lg:inline")}>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
