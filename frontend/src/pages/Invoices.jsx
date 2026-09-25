import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { RepeatBilling } from "@/components/sales/RepeatBilling";
import { CustomerLinks } from "@/components/sales/CustomerLinks";
import { InvoiceList, stateOf } from "@/components/sales/InvoiceList";
import { useAged, useSales } from "@/hooks/useSales";
import { useCompany } from "@/context/CompanyContext";
import { AgingBar } from "@/components/ui/AgingBar";

/**
 * What customers owe you.
 *
 * This replaces the purchased product's invoice screen, which kept its own
 * figures in its own tables and knew nothing about the books. Every figure
 * here is either a journal query or an invoice less what has been applied to
 * it; nothing on this screen stores a balance.
 *
 * The headline is the aged total rather than a count, because the question an
 * owner asks of this screen is "how much is out there, and how late is it" —
 * and an invoice that is ninety days over is a conversation, not a follow-up.
 */

const TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "owed", label: "Owed" },
  { key: "overdue", label: "Overdue" },
  { key: "settled", label: "Settled" },
];

export default function Invoices() {
  const { data: invoices, isLoading } = useSales();
  const { data: aged } = useAged();
  const { can } = useCompany();

  const [tab, setTab] = useState("all");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  useEffect(() => {
    if (params.get("new") === "1") navigate("/invoices/new", { replace: true });
  }, [params, navigate]);
  const [repeating, setRepeating] = useState(false);
  const [linking, setLinking] = useState(false);

  const mayRecord = can("record");

  const rows = useMemo(() => {
    const all = (invoices || []).map((inv) => ({ ...inv, state: stateOf(inv) }));
    if (tab === "all") return all.filter((r) => r.state.key !== "void");
    if (tab === "owed") return all.filter((r) => r.state.key === "owed" || r.state.key === "overdue");
    return all.filter((r) => r.state.key === tab);
  }, [invoices, tab]);

  const overdueCount = (invoices || []).filter((i) => stateOf(i).key === "overdue").length;

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="What customers owe you."
        actions={
          <>
            {mayRecord && (
              <Button variant="outline" onClick={() => setLinking(true)}>
                Customer links
              </Button>
            )}
            <Button variant="outline" onClick={() => setRepeating(true)}>
              Repeat billing
            </Button>
            {mayRecord && (
              <Button variant="accent" onClick={() => navigate("/invoices/new")}>
                <Plus size={16} /> New invoice
              </Button>
            )}
          </>
        }
      />

      {/* How much is out there, and how late. Read from the ledger. */}
      {aged && (
        <Card padding="lg" className="mb-4">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-end lg:gap-10">
            <div>
              <div className="text-[13px] font-medium text-[var(--ink-muted)]">Owed to you</div>
              <div className="flex items-baseline gap-1.5 pt-1.5">
                <span className="text-[14px] font-medium text-[var(--ink-muted)]">MVR</span>
                <span className="tabular text-[30px] leading-none font-semibold tracking-[-.02em]">
                  {aged.total}
                </span>
              </div>
              <div className="text-[13px] text-[var(--ink-muted)] mt-1.5">
                {overdueCount === 0
                  ? "Nothing is overdue."
                  : overdueCount === 1
                    ? "One invoice is overdue."
                    : `${overdueCount} invoices are overdue.`}
              </div>
            </div>

            <AgingBar amounts={aged.buckets} laari={aged.bucketsLaari} />
          </div>
        </Card>
      )}

      <div role="tablist" aria-label="Which invoices" className="flex flex-wrap gap-2 mb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`h-10 px-3.5 sm:h-11 sm:px-4 rounded-full text-[14px] sm:text-[13px] whitespace-nowrap border transition-colors ${
              tab === t.key
                ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-semibold"
                : "bg-[var(--surface)] text-[var(--ink-muted)] border-[var(--border)] hover:text-[var(--ink)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : !invoices?.length ? (
        <EmptyState
          icon={FileText}
          title="No invoices yet"
          description={
            mayRecord
              ? "Raise the first one here. It goes into the books when you say so, and what the customer owes is tracked from then."
              : "Nothing has been invoiced here yet."
          }
          action={
            mayRecord && (
              <Button variant="outline" onClick={() => navigate("/invoices/new")}>
                <Plus size={16} /> New invoice
              </Button>
            )
          }
        />
      ) : rows.length === 0 ? (
        <Card padding="lg">
          <p className="text-[15px] text-[var(--ink-muted)]">Nothing here.</p>
        </Card>
      ) : (
        <InvoiceList rows={rows} />
      )}

      {repeating && <RepeatBilling onClose={() => setRepeating(false)} />}
      {linking && <CustomerLinks onClose={() => setLinking(false)} />}
    </div>
  );
}
