import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { Money } from "@/components/ui/Money";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, TrendLine } from "@/components/mobile/parts";

/**
 * Home, in the main app on a phone: cash now and where it is going, then what
 * needs the owner. Everything comes from journal lines (/figures) and from the
 * same list the desk's "What needs you" reads (/attention).
 */

const KIND = {
  money_at_risk: { tone: "danger", label: "Costs money" },
  blocked: { tone: "warning", label: "Waiting on you" },
  ageing: { tone: "warning", label: "Getting old" },
  waiting: { tone: "neutral", label: "Ready" },
};

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
    <div className="space-y-5">
      <h1 className="font-display text-[30px] font-bold tracking-tight">Today</h1>

      {!f ? <Skeleton className="h-[220px] rounded-2xl" /> : <CashCard f={f} />}

      <section aria-labelledby="needs-you">
        <h2 id="needs-you" className="font-display text-[22px] font-bold px-1 pb-2">
          Needs you
        </h2>
        {attention.isPending ? (
          <Skeleton className="h-[88px] rounded-2xl" />
        ) : items.length === 0 ? (
          <EmptyState title="Nothing is waiting on you" body="Bills, late customers and bank lines that need a person show up here, most costly first." />
        ) : (
          <div className="space-y-2.5">
            {items.map((it, i) => (
              <Link
                key={i}
                to={it.href}
                className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <Badge tone={KIND[it.kind]?.tone}>{KIND[it.kind]?.label || "Ready"}</Badge>
                  <div className="mt-1.5 text-[16px] font-semibold leading-snug">{it.title}</div>
                  {it.detail && <div className="mt-0.5 text-[14px] text-[var(--ink-muted)] leading-snug">{it.detail}</div>}
                  {it.does && <div className="mt-1.5 text-[14px] font-semibold text-[var(--deep)]">{it.does}</div>}
                </div>
                <ChevronRight size={18} className="text-[var(--ink-muted)] mt-1 shrink-0" aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CashCard({ f }) {
  const unit = f.currency || "MVR";
  if (!f.cashIsReal) {
    return (
      <div className="rounded-2xl bg-[var(--ink-panel)] text-[var(--on-ink-panel)] p-5">
        <div className="text-[13px] font-semibold uppercase tracking-[0.12em] opacity-70">Cash and bank</div>
        <div className="mt-2 font-display text-[26px] font-bold leading-tight">Not known yet</div>
        <p className="mt-2 text-[15px] leading-[1.45] opacity-80">
          Bring in a bank statement and this shows what you have, where it is, and which way it is going.
        </p>
        <Link to="/bank" className="inline-block mt-4 rounded-[14px] bg-[var(--accent)] text-[var(--on-accent)] font-semibold px-4 h-11 leading-[44px]">
          Bring a statement in
        </Link>
      </div>
    );
  }

  const change = String(f.cashChange30 || "0.00");
  const down = /^[-−]/.test(change);
  const flat = /^[-−]?0\.00$/.test(change);
  const direction = flat ? "Level over 30 days" : `${down ? "Down" : "Up"} ${change.replace(/^[-−]/, "")} over 30 days`;
  const runway =
    f.runwayMonths == null
      ? null
      : f.runwayMonths < 1
        ? "Less than a month of spending at the recent pace"
        : `About ${f.runwayMonths >= 10 ? Math.round(f.runwayMonths) : f.runwayMonths} months of spending at the recent pace`;

  return (
    <div className="rounded-2xl bg-[var(--ink-panel)] text-[var(--on-ink-panel)] p-5">
      <div className="text-[13px] font-semibold uppercase tracking-[0.12em] opacity-70">Cash and bank now</div>
      <div className="mt-1 font-display text-[40px] font-bold leading-none tracking-tight">
        <span className="text-[18px] opacity-70 mr-1.5 align-middle">{unit}</span>
        <Money amount={f.inBankAndCash} className="text-inherit" />
      </div>
      <TrendLine points={f.cashTrend} className="block w-full h-14 mt-4" />
      <div className="mt-2 text-[14px] opacity-90">{direction}</div>
      {runway && <div className="text-[14px] opacity-70">{runway}</div>}
      {(f.cashPlaces || []).length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/15 space-y-1.5">
          {f.cashPlaces.slice(0, 4).map((p) => (
            <div key={p.name} className="flex justify-between gap-3 text-[14px]">
              <span className="truncate opacity-80">{p.name}</span>
              <Money amount={p.amount} className="text-inherit" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
