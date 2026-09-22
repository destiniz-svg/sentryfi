import { useMemo, useState } from "react";
import { Plus, FileText, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { VoidDialog } from "@/components/ui/VoidDialog";
import { RaiseInvoice } from "@/components/sales/RaiseInvoice";
import { ReceiveMoney, CreditInvoice } from "@/components/sales/SettleInvoice";
import { useAged, useSales, useSalesMutations } from "@/hooks/useSales";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { formatDate } from "@/lib/utils";

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

const BUCKETS = [
  { key: "current", label: "Not yet due" },
  { key: "thirty", label: "1–30 days over" },
  { key: "sixty", label: "31–60" },
  { key: "ninety", label: "61–90" },
  { key: "older", label: "Over 90" },
];

function daysOver(invoice) {
  if (!invoice.dueDate || invoice.settled || invoice.status !== "posted") return 0;
  const due = new Date(invoice.dueDate);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((now - due) / 86_400_000));
}

function stateOf(invoice) {
  if (invoice.voided) return { key: "void", tone: "neutral", label: "Void" };
  if (invoice.status === "draft") return { key: "draft", tone: "neutral", label: "Draft" };
  if (invoice.settled) return { key: "settled", tone: "success", label: "Settled" };
  const over = daysOver(invoice);
  if (over > 0) {
    return { key: "overdue", tone: "danger", label: `${over} ${over === 1 ? "day" : "days"} over` };
  }
  return { key: "owed", tone: "accent", label: "Owed" };
}

export default function Invoices() {
  const { data: invoices, isLoading } = useSales();
  const { data: aged } = useAged();
  const { post, discard } = useSalesMutations();
  const [discarding, setDiscarding] = useState(null);
  const { can } = useCompany();
  const toast = useToast();

  const [tab, setTab] = useState("all");
  const [raising, setRaising] = useState(false);
  // A new key each time the editor opens, so it mounts fresh.
  const [raiseKey, setRaiseKey] = useState(0);
  const [receiving, setReceiving] = useState(null);
  const [crediting, setCrediting] = useState(null);
  const [posting, setPosting] = useState(null);

  const mayRecord = can("record");
  const mayCredit = can("adjust") || can("record");

  const rows = useMemo(() => {
    const all = (invoices || []).map((inv) => ({ ...inv, state: stateOf(inv) }));
    if (tab === "all") return all.filter((r) => r.state.key !== "void");
    if (tab === "owed") return all.filter((r) => r.state.key === "owed" || r.state.key === "overdue");
    return all.filter((r) => r.state.key === tab);
  }, [invoices, tab]);

  const overdueCount = (invoices || []).filter((i) => stateOf(i).key === "overdue").length;

  async function onPost(invoice) {
    setPosting(invoice.id);
    try {
      const result = await post.mutateAsync(invoice.id);
      toast.success(
        `${invoice.invoiceNo} is in the books · entry ${result.entryNo}`,
        `MVR ${invoice.gross} owed by ${invoice.customer || "the customer"}, and MVR ${invoice.tax} of it is GST you now owe.`
      );
    } catch (err) {
      toast.error("Not yet", err.message);
    } finally {
      setPosting(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="What customers owe you."
        actions={
          mayRecord && (
            <Button variant="accent" onClick={() => { setRaiseKey((k) => k + 1); setRaising(true); }}>
              <Plus size={16} /> New invoice
            </Button>
          )
        }
      />

      {/* How much is out there, and how late. Read from the ledger. */}
      {aged && (
        <Card padding="lg" className="mb-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
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

            <dl className="grid grid-cols-2 sm:grid-cols-5 gap-x-6 gap-y-3">
              {BUCKETS.map((b) => (
                <div key={b.key} className="min-w-[96px]">
                  <dt className="text-[12px] text-[var(--ink-muted)]">{b.label}</dt>
                  <dd
                    className={`tabular text-[15px] font-semibold mt-0.5 ${
                      aged.buckets[b.key] === "0.00" ? "text-[var(--ink-muted)]" : "text-[var(--ink)]"
                    }`}
                  >
                    {aged.buckets[b.key]}
                  </dd>
                </div>
              ))}
            </dl>
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
            className={`h-11 px-4 rounded-full text-[13px] border transition-colors ${
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
              <Button variant="accent" onClick={() => { setRaiseKey((k) => k + 1); setRaising(true); }}>
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
        <Card padding="none" className="overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(0,1.4fr)_150px_110px_130px_130px_auto] gap-4 px-5 py-3 border-b border-[var(--border)] text-[12px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
            <span>Who</span>
            <span>Reference</span>
            <span>Due</span>
            <span>Status</span>
            <span className="text-right">Amount</span>
            <span />
          </div>

          <div className="divide-y divide-[var(--border)]">
            {rows.map((inv) => (
              <div
                key={inv.id}
                className="grid grid-cols-2 md:grid-cols-[minmax(0,1.4fr)_150px_110px_130px_130px_auto] gap-x-4 gap-y-1 px-5 py-4 items-center"
              >
                <div className="min-w-0 col-span-2 md:col-span-1">
                  <div className="text-sm font-semibold text-[var(--ink)] truncate">
                    {inv.customer || "Nobody named yet"}
                  </div>
                  <div className="text-xs text-[var(--ink-muted)] truncate">
                    {inv.subject || (inv.purchaseOrder ? `PO ${inv.purchaseOrder}` : "")}
                    {inv.missingPurchaseOrder && inv.status !== "draft" && !inv.settled && (
                      <span className="text-[var(--warning)]">
                        {inv.subject ? " · " : ""}No purchase order
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-sm tabular text-[var(--ink)]">{inv.invoiceNo}</div>

                <div className="text-sm tabular text-[var(--ink-muted)] hidden md:block">
                  {inv.dueDate ? formatDate(inv.dueDate) : "—"}
                </div>

                <div>
                  <Badge tone={inv.state.tone}>{inv.state.label}</Badge>
                </div>

                <div className="text-sm tabular text-right">
                  <div className="font-semibold text-[var(--ink)]">{inv.gross}</div>
                  {!inv.settled && inv.status === "posted" && inv.outstanding !== inv.gross && (
                    <div className="text-[11px] text-[var(--ink-muted)]">{inv.outstanding} left</div>
                  )}
                </div>

                <div className="col-span-2 md:col-span-1 justify-self-end flex items-center gap-1.5">
                  {mayRecord && inv.status === "draft" && !inv.voided && (
                    <>
                      <Button variant="outline" onClick={() => onPost(inv)} disabled={posting === inv.id}>
                        {posting === inv.id && <Loader2 size={13} className="animate-spin" />}
                        Put in the books
                      </Button>
                      {/* Only a draft can be discarded. Once it is in the
                          books it comes back out with a credit note. */}
                      <Button variant="ghost" onClick={() => setDiscarding(inv)}>
                        Discard
                      </Button>
                    </>
                  )}
                  {mayRecord && inv.status === "posted" && !inv.settled && (
                    <Button variant="outline" onClick={() => setReceiving(inv)}>
                      Money in
                    </Button>
                  )}
                  {mayCredit && inv.status === "posted" && !inv.settled && (
                    <Button variant="ghost" onClick={() => setCrediting(inv)}>
                      Credit note
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <RaiseInvoice key={raiseKey} open={raising} onClose={() => setRaising(false)} />
      <ReceiveMoney key={receiving?.id || "none"} invoice={receiving} onClose={() => setReceiving(null)} />
      <CreditInvoice key={crediting?.id || "none"} invoice={crediting} onClose={() => setCrediting(null)} />

      <VoidDialog
        open={Boolean(discarding)}
        onClose={() => setDiscarding(null)}
        onConfirm={async (reason) => {
          await discard.mutateAsync({ id: discarding.id, reason });
          toast.success(`${discarding.invoiceNo} discarded`, "It was never in the books, so nothing moves.");
          setDiscarding(null);
        }}
        busy={discard.isPending}
        what={discarding ? `draft ${discarding.invoiceNo}` : "this draft"}
        amount={discarding ? discarding.gross : null}
      />
    </div>
  );
}
