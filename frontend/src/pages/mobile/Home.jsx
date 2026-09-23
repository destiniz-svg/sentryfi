import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowDownRight, ArrowUpRight, ChevronRight, Landmark, Percent, ReceiptText, Wallet } from "lucide-react";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/mobile/parts";
import { WaitingToSend } from "@/components/bills/WaitingToSend";

/**
 * Home, in the main app on a phone (DESIGN.md, "The phone, refined").
 *
 * One black card for the figure that matters (cash and bank now, which way it
 * is going, how long it lasts), four figures side by side, money out
 * month by month, where the cash sits, then what needs the owner. Everything
 * comes from journal lines (/figures) and from the same list the desk's "What
 * needs you" reads (/attention). Yellow only ever marks the one thing to see.
 */

const KIND = {
  money_at_risk: { dot: "var(--danger)", label: "Costs money" },
  blocked: { dot: "var(--warning)", label: "Waiting on you" },
  ageing: { dot: "var(--warning)", label: "Getting old" },
  waiting: { dot: "var(--ink-muted)", label: "Ready" },
};

/** Three months of spending kept aside is the usual cushion. */
const CUSHION = 3;

export default function MobileHome() {
  const { companyId } = useCompany();
  const figures = useQuery({
    queryKey: ["figures", companyId],
    queryFn: () => apiClient.get("/figures").then((r) => r.data),
    enabled: Boolean(companyId),
  });
  const attention = useQuery({
    queryKey: ["attention", companyId],
    queryFn: () => apiClient.get("/attention").then((r) => r.data),
    enabled: Boolean(companyId),
  });

  const f = figures.data;
  const items = attention.data?.items || [];

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Home</h1>
      <WaitingToSend className="" />
      {!f ? <Skeleton className="h-[176px] rounded-[24px]" /> : <CashCard f={f} />}

      {f && <Figures f={f} />}

      {f && (f.spendByMonth || []).length > 1 && <MoneyOut f={f} />}

      {f?.cashIsReal && (f.cashPlaces || []).length > 0 && (
        <section aria-labelledby="where" className="rounded-[24px] bg-[var(--surface)] lift p-5">
          <h2 id="where" className="text-[17px] font-semibold tracking-[-0.01em]">Where the cash is</h2>
          <ul className="mt-3 space-y-3">
            {f.cashPlaces.slice(0, 4).map((p) => (
              <li key={p.name} className="flex items-center gap-3">
                <Chip icon={/tin|cash/i.test(p.name) ? Wallet : Landmark} />
                <span className="min-w-0 flex-1 text-[15px] truncate">{p.name}</span>
                <span className="text-[15px] font-semibold tabular">
                  <Money amount={p.amount} />
                </span>
              </li>
            ))}
          </ul>
          {f.cashPlaces.length > 4 && (
            <Link to="/bank" className="mt-4 flex items-center justify-between rounded-full bg-[var(--surface-2)] h-10 px-4 text-[14px] font-medium">
              {f.cashPlaces.length - 4} more places
              <ChevronRight size={16} aria-hidden="true" className="text-[var(--ink-muted)]" />
            </Link>
          )}
        </section>
      )}

      <section aria-labelledby="needs-you">
        <h2 id="needs-you" className="text-[17px] font-semibold tracking-[-0.01em] px-1 pb-3">
          Needs you
        </h2>
        {attention.isPending ? (
          <Skeleton className="h-[88px] rounded-[20px]" />
        ) : items.length === 0 ? (
          <EmptyState title="Nothing is waiting on you" body="Bills, late customers and bank lines that need a person show up here, most costly first." />
        ) : (
          <div className="space-y-3">
            {items.map((it, i) => (
              <Link key={i} to={it.href} className="flex items-center gap-3 rounded-[20px] bg-[var(--surface)] lift px-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[12px] text-[var(--ink-muted)]">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: KIND[it.kind]?.dot || "var(--ink-muted)" }} aria-hidden="true" />
                    {KIND[it.kind]?.label || "Ready"}
                  </div>
                  <div className="mt-1 text-[15px] font-semibold leading-snug">{it.title}</div>
                  {it.detail && <div className="mt-0.5 text-[13px] text-[var(--ink-muted)] leading-snug">{it.detail}</div>}
                </div>
                <span className="h-8 w-8 shrink-0 rounded-full bg-[var(--surface-2)] inline-flex items-center justify-center text-[var(--ink-muted)]" aria-hidden="true">
                  <ChevronRight size={16} />
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** A small icon in a pale circle: the reference's one icon treatment. */
function Chip({ icon: Icon, dark }) {
  return (
    <span className={`h-9 w-9 shrink-0 rounded-full inline-flex items-center justify-center ${dark ? "bg-white/10 text-white" : "bg-[var(--surface-2)] text-[var(--ink)]"}`} aria-hidden="true">
      <Icon size={17} strokeWidth={1.75} />
    </span>
  );
}

function CashCard({ f }) {
  const unit = f.currency || "MVR";
  if (!f.cashIsReal) {
    return (
      <div className="rounded-[24px] bg-[var(--ink-panel)] text-[var(--on-ink-panel)] p-6">
        <div className="text-[14px] opacity-70">Cash and bank</div>
        <div className="mt-1.5 text-[26px] font-semibold leading-tight tracking-[-0.01em]">Not known yet</div>
        <p className="mt-2 text-[14px] leading-[1.45] opacity-75">Bring in a bank statement and this shows what you have, where it is, and which way it is going.</p>
        <Link to="/bank" className="inline-flex items-center mt-5 rounded-full bg-[var(--accent)] text-[var(--on-accent)] text-[15px] font-semibold px-5 h-11">
          Bring a statement in
        </Link>
      </div>
    );
  }

  const change = String(f.cashChange30 || "0.00");
  const down = /^[-−]/.test(change);
  const flat = /^[-−]?0\.00$/.test(change);
  const runway = f.runwayMonths;

  return (
    <div className="rounded-[24px] bg-[var(--ink-panel)] text-[var(--on-ink-panel)] p-6 flex items-start justify-between gap-4" data-testid="cash-card">
      <div className="min-w-0">
        <div className="text-[14px] opacity-70">Cash and bank now</div>
        <div className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.02em] tabular whitespace-nowrap">
          <span className="text-[14px] font-medium opacity-60 mr-1 align-[0.35em]">{unit}</span>
          <Money amount={f.inBankAndCash} className="text-inherit" />
        </div>
        <div className="mt-4 flex items-center gap-1.5 text-[13px]" style={{ color: flat ? "inherit" : down ? "#ff9d8f" : "var(--accent)" }}>
          {!flat && (down ? <ArrowDownRight size={15} aria-hidden="true" /> : <ArrowUpRight size={15} aria-hidden="true" />)}
          <span className={flat ? "opacity-70" : ""}>{flat ? "Level over 30 days" : `${change.replace(/^[-−]/, "")} ${down ? "down" : "up"} in 30 days`}</span>
        </div>
      </div>
      {runway != null && (
        <div className="shrink-0 text-right">
          <div className="text-[13px] opacity-70">It lasts</div>
          <div className="mt-2 text-[20px] font-semibold leading-none">
            {runway < 1 ? "Under a month" : `${runway >= 10 ? Math.round(runway) : runway} months`}
          </div>
          <div className="mt-4 h-1.5 w-24 rounded-full bg-white/15 overflow-hidden ml-auto" role="img" aria-label={`${Math.round(Math.min(runway / CUSHION, 1) * 100)}% of a ${CUSHION}-month cushion`}>
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(runway / CUSHION, 1) * 100}%` }} />
          </div>
          <div className="mt-1.5 text-[11px] opacity-60">of {CUSHION} months to keep</div>
        </div>
      )}
    </div>
  );
}

/** The figures an owner looks for, all four at once: nothing hides off the edge. */
function Figures({ f }) {
  const unit = f.currency || "MVR";
  const cards = [
    { icon: ArrowDownLeft, value: f.owedToUs, label: "Owed to you", to: "/invoices" },
    { icon: ArrowUpRight, value: f.owedToSuppliers, label: "You owe suppliers", to: "/bills" },
    { icon: ReceiptText, value: f.spentThisMonth, label: "Spent this month", to: "/figures" },
    { icon: Percent, value: f.gstOwed, label: "GST to set aside", to: "/tax" },
  ].filter((c) => c.value != null);
  return (
    <div className="grid grid-cols-2 gap-3" role="list" aria-label="Figures">
      {cards.map((c) => (
        <Link key={c.label} to={c.to} role="listitem" className="relative min-w-0 rounded-[20px] bg-[var(--surface)] lift p-4">
          <Chip icon={c.icon} />
          <div className="mt-3 text-[17px] font-semibold tracking-[-0.01em] tabular truncate">
            <Money amount={c.value} />
          </div>
          <div className="mt-0.5 text-[13px] text-[var(--ink-muted)] truncate">
            {c.label}
            <span className="sr-only">, {unit}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Money out by month: grey columns, this month's in yellow with its figure above. */
function MoneyOut({ f }) {
  const months = f.spendByMonth.slice(-8);
  const max = Math.max(...months.map((m) => m.raw), 1);
  const last = months[months.length - 1];
  return (
    <section aria-labelledby="money-out" className="rounded-[24px] bg-[var(--surface)] lift p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="money-out" className="text-[17px] font-semibold tracking-[-0.01em]">Money out</h2>
          <p className="text-[13px] text-[var(--ink-muted)] mt-0.5">By month, from the books</p>
        </div>
        <div className="flex items-center gap-3 text-[12px] text-[var(--ink-muted)] pt-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" aria-hidden="true" />
            This month
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--border)]" aria-hidden="true" />
            Before
          </span>
        </div>
      </div>
      <div className="relative mt-4">
        <div className="absolute right-0 -top-1 rounded-xl bg-[var(--surface)] lift px-3 py-2 text-right">
          <div className="text-[14px] font-semibold tabular">
            <Money amount={last.amount} />
          </div>
          <div className="text-[11px] text-[var(--ink-muted)]">For {last.label}</div>
        </div>
        <div className="flex items-end justify-between gap-2 h-[148px] pt-14" role="img" aria-label={`Money out by month: ${months.map((m) => `${m.label} ${m.amount}`).join(", ")}`}>
          {months.map((m, i) => (
            <div key={m.ym || m.label} className="flex-1 flex flex-col items-center justify-end h-full gap-2">
              <div className="w-2.5 rounded-full" style={{ height: `${Math.max(4, (m.raw / max) * 100)}%`, background: i === months.length - 1 ? "var(--accent)" : "var(--border)" }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between gap-2 mt-2">
          {months.map((m) => (
            <span key={m.ym || m.label} className="flex-1 text-center text-[11px] text-[var(--ink-muted)] truncate">
              {String(m.label).slice(0, 3)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
