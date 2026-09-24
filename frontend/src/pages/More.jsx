import { Link, useNavigate } from "react-router-dom";
import { Banknote, Bot, Building2, Languages, Receipt, Boxes, CheckCheck, ChevronRight, ClipboardList, DatabaseBackup, FileText, HandCoins, HardHat, Lock, LogOut, Moon, Package, Palette, Percent, Scale, Settings, Ship, Sunrise, Upload, User, Users, Wallet , Gauge } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useCompany } from "@/context/CompanyContext";
import { PushSwitch } from "@/components/PushSwitch";
import { useT } from "@/lib/i18n";

/**
 * More, in the main app on a phone: everything that is not a daily place,
 * grouped the way an owner thinks about it — the books, the company, and
 * themselves. Rows a person cannot open are left out rather than refused.
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

export default function More() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { can, company, companies } = useCompany();
  const navigate = useNavigate();
  const { lang, setLang } = useT();

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="font-display text-[28px] font-semibold tracking-tight">More</h1>
      <Group
        title="The books"
        rows={[
          can("read") && { name: "The CFO: the morning brief", icon: Sunrise, to: "/cfo" },
          can("read") && { name: "Analytics", icon: Gauge, to: "/analytics" },
          { name: "Statements", icon: Scale, to: "/statements" },
          { name: "Projects", icon: HardHat, to: "/projects" },
          { name: "Orders", icon: ClipboardList, to: "/orders" },
          { name: "Expense claims", icon: Wallet, to: "/claims" },
          { name: "The expenses app", icon: Receipt, to: "/go" },
          can("approve") && { name: "Approvals", icon: CheckCheck, to: "/approvals" },
          can("record") && { name: "Payments", icon: Banknote, to: "/payments" },
          can("run_payroll") && { name: "Payroll", icon: Users, to: "/payroll" },
          { name: "My payslips", icon: FileText, to: "/payslips" },
          { name: "Items", icon: Boxes, to: "/stock" },
          { name: "Shipments", icon: Ship, to: "/shipments" },
          { name: "Fixed assets", icon: Package, to: "/assets" },
          { name: "Closing a month or year", icon: Lock, to: "/closing" },
          { name: `${company?.tax?.tax || "GST"} return`, icon: Percent, to: "/tax" },
          can("manage_settings") && { name: "Bring history in", icon: Upload, to: "/import" },
        ]}
      />
      <Group
        title="The company"
        rows={[
          companies.length > 1 && { name: "All your companies", icon: Building2, to: "/practice" },
          { name: "Invoices", icon: FileText, to: "/invoices" },
          can("manage_people") && { name: "People", icon: Users, to: "/settings?tab=people" },
          { name: "Cash tins", icon: Wallet, to: "/bank" },
          { name: "Loans", icon: HandCoins, to: "/loans" },
          user?.platformAdmin && { name: "Backups", icon: DatabaseBackup, to: "/settings?tab=backups" },
          user?.platformAdmin && { name: "Developer portal", icon: DatabaseBackup, to: "/developer" },
          { name: "Branding and documents", icon: Palette, to: "/branding" },
          { name: "Your assistant", icon: Bot, to: "/settings?tab=assistant" },
          { name: "Settings", icon: Settings, to: "/settings", side: company?.name },
        ]}
      />
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
