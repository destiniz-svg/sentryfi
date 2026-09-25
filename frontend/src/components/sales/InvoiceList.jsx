import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { VoidDialog } from "@/components/ui/VoidDialog";
import { ReceiveMoney, CreditInvoice } from "@/components/sales/SettleInvoice";
import { useSalesMutations } from "@/hooks/useSales";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { formatDate } from "@/lib/utils";

/**
 * The invoice list, one card, each row with its next steps in view. The
 * Invoices page and the phone's Money screen both show it, so an invoice
 * looks and acts the same wherever it is found.
 */

function daysOver(invoice) {
  if (!invoice.dueDate || invoice.settled || invoice.status !== "posted") return 0;
  const due = new Date(invoice.dueDate);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((now - due) / 86_400_000));
}

export function stateOf(invoice) {
  if (invoice.voided) return { key: "void", tone: "neutral", label: "Void" };
  if (invoice.status === "draft") return { key: "draft", tone: "neutral", label: "Draft" };
  if (invoice.settled) return { key: "settled", tone: "success", label: "Settled" };
  const over = daysOver(invoice);
  if (over > 0) {
    return { key: "overdue", tone: "danger", label: `${over} ${over === 1 ? "day" : "days"} over` };
  }
  return { key: "owed", tone: "accent", label: "Owed" };
}

export function InvoiceList({ rows }) {
  const { post, discard } = useSalesMutations();
  const { can } = useCompany();
  const toast = useToast();
  const [discarding, setDiscarding] = useState(null);
  const [receiving, setReceiving] = useState(null);
  const [crediting, setCrediting] = useState(null);
  const [posting, setPosting] = useState(null);

  const mayRecord = can("record");
  const mayCredit = can("adjust") || can("record");

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
    <>
      <Card padding="none" className="overflow-hidden">
        <div className="hidden xl:grid grid-cols-[minmax(0,1.4fr)_120px_110px_110px_150px_236px] gap-x-4 px-5 py-3 border-b border-[var(--border)] text-[12px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
          <span>Who</span>
          <span>Number</span>
          <span>Due</span>
          <span>Status</span>
          <span className="text-right">Amount</span>
          <span />
        </div>

        <div className="divide-y divide-[var(--border)]">
          {rows.map((row) => {
            const inv = { ...row, state: row.state || stateOf(row) };
            return (
              <div
                key={inv.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1.4fr)_120px_110px_110px_150px_236px] gap-x-4 gap-y-1.5 px-5 py-4 items-center"
              >
                <div className="min-w-0 order-1 xl:order-none">
                  <div className="text-sm font-semibold text-[var(--ink)] truncate">
                    {inv.customerId ? (
                      <Link to={`/documents/statement/${inv.customerId}`} title={`${inv.customer}'s statement`} className="hover:underline underline-offset-2">
                        {inv.customer}
                      </Link>
                    ) : (
                      inv.customer || "Nobody named yet"
                    )}
                  </div>
                  <div className="text-xs text-[var(--ink-muted)] truncate">{inv.subject || (inv.purchaseOrder ? `PO ${inv.purchaseOrder}` : "")}</div>
                  {/* A warning of its own, never the part a long subject cuts off. */}
                  {inv.missingPurchaseOrder && inv.status !== "draft" && !inv.settled && <div className="text-xs text-[var(--warning)]">No purchase order</div>}
                </div>

                <Link to={`/documents/invoice/${inv.id}`} className="order-3 xl:order-none justify-self-start text-sm tabular text-[var(--ink)] underline decoration-[var(--border)] underline-offset-4 hover:decoration-[var(--ink)]">
                  {inv.invoiceNo || "Draft"}
                </Link>

                <div className="text-sm tabular text-[var(--ink-muted)] hidden xl:block">
                  {inv.dueDate ? formatDate(inv.dueDate) : "—"}
                </div>

                <div className="order-4 xl:order-none justify-self-end xl:justify-self-auto">
                  <Badge tone={inv.state.tone}>{inv.state.label}</Badge>
                </div>

                <div className="order-2 xl:order-none text-sm tabular text-right self-start xl:self-auto">
                  <div className="font-semibold text-[var(--ink)]">
                    {inv.foreign ? (
                      <>
                        <span className="text-[12px] text-[var(--ink-muted)] mr-1">{inv.foreign.currency}</span>
                        <Money amount={inv.foreign.gross} />
                        <span className="block text-[12px] font-normal text-[var(--ink-muted)]">MVR {inv.gross} at {inv.foreign.rate}</span>
                      </>
                    ) : (
                      <Money amount={inv.gross} />
                    )}
                  </div>
                  {!inv.settled && inv.status === "posted" && inv.outstanding !== inv.gross && (
                    <div className="text-[13px] text-[var(--ink-muted)]"><Money amount={inv.outstanding} /> left</div>
                  )}
                </div>

                <div className="order-5 xl:order-none col-span-2 xl:col-span-1 justify-self-end flex flex-wrap items-center gap-1.5 empty:hidden">
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
            );
          })}
        </div>
      </Card>

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
    </>
  );
}
