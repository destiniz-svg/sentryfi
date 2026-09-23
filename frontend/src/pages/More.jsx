import { Link, useNavigate } from "react-router-dom";
import { Banknote, Bot, Boxes, CheckCheck, ChevronRight, ClipboardList, DatabaseBackup, FileText, HandCoins, HardHat, Lock, LogOut, Moon, Package, Palette, Percent, Scale, Settings, Ship, Sunrise, Upload, User, Users, Wallet } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useCompany } from "@/context/CompanyContext";
import { PushSwitch } from "@/components/PushSwitch";

/**
 * More, in the main app on a phone: everything that is not a daily place,
 * grouped the way an owner thinks about it — the books, the company, and
 * themselves. Rows a person cannot open are left out rather than refused.
 */

function Group({ title, rows }) {
  const shown = rows.filter(Boolean);
  if (!shown.length) return null;
  return (
    <section aria-label={title}>
      <h2 className="text-[13px] text-[var(--ink-muted)] px-1 pt-3 pb-2">{title}</h2>
      <div className="rounded-[20px] bg-[var(--surface)] lift overflow-hidden py-1">
        {shown.map((r, i) => {
          const inner = (
            <>
              {r.icon && (
                <span className="h-9 w-9 shrink-0 rounded-full bg-[var(--surface-2)] inline-flex items-center justify-center text-[var(--ink)]" aria-hidden="true">
                  <r.icon size={17} strokeWidth={1.75} />
                </span>
              )}
              <span className="text-[15px] font-medium">{r.name}</span>
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
  const { can, company } = useCompany();
  const navigate = useNavigate();

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="font-display text-[30px] font-bold tracking-tight">More</h1>
      <Group
        title="The books"
        rows={[
          can("read") && { name: "The CFO: the morning brief", icon: Sunrise, to: "/cfo" },
          { name: "Statements", icon: Scale, to: "/statements" },
          { name: "Projects", icon: HardHat, to: "/projects" },
          { name: "Orders", icon: ClipboardList, to: "/orders" },
          { name: "Expense claims", icon: Wallet, to: "/claims" },
          can("approve") && { name: "Approvals", icon: CheckCheck, to: "/approvals" },
          can("record") && { name: "Payments", icon: Banknote, to: "/payments" },
          { name: "Stock", icon: Boxes, to: "/stock" },
          { name: "Shipments", icon: Ship, to: "/shipments" },
          { name: "Fixed assets", icon: Package, to: "/assets" },
          { name: "Closing a month or year", icon: Lock, to: "/closing" },
          { name: "GST return", icon: Percent, to: "/tax" },
          can("manage_settings") && { name: "Bring history in", icon: Upload, to: "/import" },
        ]}
      />
      <Group
        title="The company"
        rows={[
          { name: "Invoices", icon: FileText, to: "/invoices" },
          can("manage_people") && { name: "People", icon: Users, to: "/settings?tab=people" },
          { name: "Cash tins", icon: Wallet, to: "/bank" },
          { name: "Loans", icon: HandCoins, to: "/loans" },
          user?.platformAdmin && { name: "Backups", icon: DatabaseBackup, to: "/settings?tab=backups" },
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
