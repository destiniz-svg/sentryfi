import { Link, useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useCompany } from "@/context/CompanyContext";

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
      <h2 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] px-1 pt-2 pb-1.5">{title}</h2>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        {shown.map((r, i) => {
          const inner = (
            <>
              <span className="text-[16px] font-medium">{r.name}</span>
              <span className="ml-auto flex items-center gap-1.5 text-[14px] text-[var(--ink-muted)]">
                {r.side}
                {r.to && <ChevronRight size={16} aria-hidden="true" />}
              </span>
            </>
          );
          const cls = `flex items-center gap-3 min-h-[52px] px-4 w-full text-left ${i ? "border-t border-[var(--border)]" : ""}`;
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
    <div className="max-w-xl space-y-3">
      <h1 className="font-display text-[30px] font-bold tracking-tight">More</h1>
      <Group
        title="The books"
        rows={[
          { name: "Statements", to: "/statements" },
          { name: "Projects", to: "/projects" },
          { name: "Stock", to: "/stock" },
          { name: "Shipments", to: "/shipments" },
          { name: "Fixed assets", to: "/assets" },
          { name: "Closing a month or year", to: "/closing" },
          { name: "GST return", to: "/tax" },
          can("manage_settings") && { name: "Bring history in", to: "/import" },
        ]}
      />
      <Group
        title="The company"
        rows={[
          { name: "Invoices", to: "/invoices" },
          can("manage_people") && { name: "People", to: "/settings?tab=people" },
          { name: "Cash tins", to: "/bank" },
          { name: "Loans", to: "/loans" },
          user?.platformAdmin && { name: "Backups", to: "/settings?tab=backups" },
          { name: "Settings", to: "/settings", side: company?.name },
        ]}
      />
      <Group
        title="You"
        rows={[
          { name: user?.name || "Account", to: "/settings?tab=profile" },
          { name: "Night", run: toggle, side: theme === "dark" ? "On" : "Off" },
          { name: "Sign out", run: async () => { await logout(); navigate("/login"); } },
        ]}
      />
    </div>
  );
}
