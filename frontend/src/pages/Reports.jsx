import { Link } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, BarChart3, Boxes, ChevronRight, Clock, Contact, FileText, Gauge, Landmark, Percent, Receipt, Scale, Tags, Truck, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";

/**
 * Every report in one place, grouped the way an owner asks: how the business
 * did, who bought and what, who we bought from and where the money went,
 * tax, and stock. Some open the statements or a list that already answers
 * the question; the rest open one report over any dates, to read or download.
 */
const GROUPS = [
  {
    title: "How the business did",
    items: [
      { to: "/statements", icon: Scale, title: "Profit and loss, balance sheet, trial balance", about: "The three statements, from the ledger" },
      { to: "/analytics", icon: Gauge, title: "Analytics", about: "Income and costs month by month, with every figure opening onto its entries" },
      { to: "/cfo", icon: BarChart3, title: "Cash and the next 30 days", about: "What is due in and out, and how long the cash lasts" },
    ],
  },
  {
    title: "Sales",
    items: [
      { to: "/reports/sales-by-customer", icon: Contact, title: "Sales by customer", about: "What each customer was invoiced, less credits" },
      { to: "/reports/sales-by-item", icon: Tags, title: "Sales by item", about: "What sold, how many, and what it earned" },
      { to: "/reports/payments-received", icon: ArrowDownLeft, title: "Payments received", about: "Every payment in, and where it landed" },
      { to: "/invoices", icon: Clock, title: "Who owes you, and how late", about: "Aged receivables on Invoices" },
      { to: "/contacts?side=customers", icon: FileText, title: "Customer statements", about: "Open a customer and send their statement" },
    ],
  },
  {
    title: "Purchases and spending",
    items: [
      { to: "/reports/purchases-by-supplier", icon: Truck, title: "Purchases by supplier", about: "What each supplier billed" },
      { to: "/reports/expenses-by-account", icon: Receipt, title: "Expenses by account", about: "Where the money went" },
      { to: "/reports/payments-made", icon: ArrowUpRight, title: "Payments made", about: "Every bill and claim paid, and from which account" },
      { to: "/payments", icon: Wallet, title: "What you owe", about: "Bills and claims waiting to be paid" },
    ],
  },
  {
    title: "Tax, bank and stock",
    items: [
      { to: "/tax", icon: Percent, title: "GST return", about: "The return for the period, in MIRA's layout" },
      { to: "/bank", icon: Landmark, title: "Bank and cash", about: "Every account's lines, matched to the books" },
      { to: "/stock", icon: Boxes, title: "Items on hand", about: "Stock, what it cost, and what it is worth" },
    ],
  },
];

export default function Reports() {
  return (
    <div className="max-w-[980px]">
      <PageHeader title="Reports" description="Every report, grouped by the question it answers. Each opens over any dates you choose." />
      <div className="grid gap-8">
        {GROUPS.map((g) => (
          <section key={g.title} aria-labelledby={`rg-${g.title}`}>
            <h2 id={`rg-${g.title}`} className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)] mb-2.5 px-1">
              {g.title}
            </h2>
            <ul className="rounded-[20px] bg-[var(--surface)] lift divide-y divide-[var(--border)] overflow-hidden">
              {g.items.map((it) => (
                <li key={it.to}>
                  <Link to={it.to} className="flex items-center gap-3.5 px-5 py-3.5 min-h-[64px] hover:bg-[var(--surface-2)]/60 transition-colors">
                    <span className="h-9 w-9 shrink-0 rounded-full bg-[var(--surface-2)] inline-flex items-center justify-center text-[var(--ink-muted)]">
                      <it.icon size={17} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium">{it.title}</span>
                      <span className="block text-[13px] text-[var(--ink-muted)]">{it.about}</span>
                    </span>
                    <ChevronRight size={16} className="text-[var(--ink-muted)] shrink-0" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
