import { Link, useNavigate } from "react-router-dom";
import { Bot, ChevronRight, DatabaseBackup, Languages, LogOut, Moon, Receipt, User, Users } from "lucide-react";
import { SECTIONS } from "@/lib/sections";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useCompany } from "@/context/CompanyContext";
import { PushSwitch } from "@/components/PushSwitch";
import { useT } from "@/lib/i18n";

/**
 * More, in the main app on a phone: every place, in the same sections as the
 * desk's rail (Sales, Purchases, Banking, Team, Inventory, Projects,
 * Accounting, Company), then the person themselves. Rows a person cannot open
 * are left out rather than refused.
 */

function Group({ title, rows }) {
  const { t } = useT();
  const shown = rows.filter(Boolean);
  if (!shown.length) return null;
  return (
    <section aria-label={title}>
      <h2 className="text-[13px] text-[var(--ink-muted)] px-1 pt-3 pb-2">{t(title)}</h2>
      <div className="rounded-[20px] bg-[var(--surface)] lift overflow-hidden py-1">
        {shown.map((r, i) => {
          const inner = (
            <>
              {r.icon && (
                <span className="h-9 w-9 shrink-0 rounded-full bg-[var(--surface-2)] inline-flex items-center justify-center text-[var(--ink)]" aria-hidden="true">
                  <r.icon size={17} strokeWidth={1.75} />
                </span>
              )}
              <span className="text-[15px] font-medium">{t(r.name)}</span>
              <span className="ml-auto flex items-center gap-1.5 text-[14px] text-[var(--ink-muted)]">
                {r.side}
                {r.to && <ChevronRight size={16} aria-hidden="true" />}
              </span>
            </>
          );
          const cls = `flex items-center gap-3 min-h-[56px] px-4 w-full text-left ${i ? "border-t border-[var(--border)]/60" : ""}`;
          return r.to ? (
            <Link key={r.name} to={r.to} className={cls}>
              {inner}
            </Link>
          ) : (
            <button key={r.name} type="button" onClick={r.run} className={cls}>
              {inner}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// Phone-only places, added to the section they belong to.
const EXTRAS = {
  Purchases: [{ name: "The expenses app", icon: Receipt, to: "/go" }],
  Team: [{ name: "People and roles", icon: Users, to: "/settings?tab=people", can: "manage_people" }],
  Company: [{ name: "Your assistant", icon: Bot, to: "/settings?tab=assistant" }],
};

export default function More() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { can, company, companies } = useCompany();
  const navigate = useNavigate();
  const { lang, setLang } = useT();
  const tax = company?.tax?.tax || "GST";
  const allowed = (it) => (!it.can || can(it.can)) && (!it.multi || companies.length > 1);

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="font-display text-[28px] font-semibold tracking-tight">More</h1>
      {/* The same sections as the desk's rail, so a place is found in the same spot on both. Home is the tab bar's. */}
      {SECTIONS.map((sec) => (
        <Group
          key={sec.label}
          title={sec.label}
          rows={[
            ...sec.items.filter((it) => it.to !== "/dashboard" && allowed(it)).map((it) => ({ name: it.to === "/tax" ? `${tax} return` : it.label, icon: it.icon, to: it.to, side: it.to === "/settings" ? company?.name : undefined })),
            ...(EXTRAS[sec.label] || []).filter(allowed),
            ...(sec.label === "Company" && user?.platformAdmin
              ? [{ name: "Backups", icon: DatabaseBackup, to: "/settings?tab=backups" }, { name: "Developer portal", icon: DatabaseBackup, to: "/developer" }]
              : []),
          ]}
        />
      ))}
      <Group
        title="You"
        rows={[
          { name: user?.name || "Account", icon: User, to: "/settings?tab=profile" },
          { name: "Night", icon: Moon, run: toggle, side: theme === "dark" ? "On" : "Off" },
          { name: "Language", icon: Languages, run: () => setLang(lang === "dv" ? "en" : "dv"), side: lang === "dv" ? "ދިވެހި" : "English" },
          { name: "Sign out", icon: LogOut, run: async () => { await logout(); navigate("/login"); } },
        ]}
      />
      <section aria-label="Notifications">
        <h2 className="text-[13px] text-[var(--ink-muted)] px-1 pt-3 pb-2">Notifications</h2>
        <div className="rounded-[20px] bg-[var(--surface)] lift px-4 py-3.5">
          <PushSwitch />
        </div>
      </section>
    </div>
  );
}
