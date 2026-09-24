import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useOutbox } from "@/context/OutboxContext";
import { useToast } from "@/context/UIContext";
import { formatDate, today } from "@/lib/utils";
import { FIELD } from "@/lib/shipments";
import { ORDER_STATUS } from "@/lib/orders";

/**
 * One order: each line ordered, arrived (or gone out) and billed; and the one
 * next thing to do with it — approve, record a delivery, or make the bill or
 * invoice from what moved.
 */

const DOC_KIND = { quote: "quote", sale: "sales_order", purchase: "purchase_order" };

const n = (s) => Number(String(s ?? "").replace(/,/g, "")) || 0;

export default function Order() {
  const { id } = useParams();
  const { companyId, can } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(null);
  const { data: o, isLoading } = useQuery({ queryKey: ["orders", companyId, id], queryFn: () => apiClient.get(`/orders/${id}`).then((r) => r.data), enabled: Boolean(companyId) });
  const act = useMutation({ mutationFn: ({ url, body }) => apiClient.post(url, body).then((r) => r.data) });
  const refresh = () => {
    for (const k of ["orders", "bills", "sales", "stock", "projects", "attention"]) qc.invalidateQueries({ queryKey: [k, companyId] });
  };
  const run = async (url, body, said) => {
    try {
      const r = await act.mutateAsync({ url, body });
      refresh();
      if (said) toast.success(...said(r));
      return r;
    } catch (ex) {
      toast.error("Not yet", ex.message);
      return null;
    }
  };

  if (isLoading || !o) return <Skeleton className="h-60 rounded-2xl" />;
  const buying = o.kind === "purchase";
  const st = ORDER_STATUS[o.status];
  const toMove = o.lines.some((l) => n(l.delivered) < n(l.quantity));
  const toBill = o.lines.some((l) => n(l.billed) < n(l.delivered));
  const quote = o.kind === "quote";
  const live = !quote && !["cancelled", "done", "awaiting_approval"].includes(o.status);

  return (
    <div>
      <Link to={`/orders?kind=${o.kind}`} className="inline-flex items-center gap-1.5 text-[14px] text-[var(--ink-muted)] hover:text-[var(--ink)] mb-2">
        <ArrowLeft size={14} /> Orders
      </Link>
      <PageHeader
        title={`${o.number} · ${o.party}`}
        description={quote ? `Quoted ${formatDate(o.orderedOn)}${o.validUntil ? `, good until ${formatDate(o.validUntil)}` : ""}.` : `${buying ? "Ordered" : "Taken"} ${formatDate(o.orderedOn)} by ${o.orderer || "someone"}${o.approver && buying ? `, approved by ${o.approver}` : ""}${o.supplierConfirmed ? `. Confirmed by ${o.supplierConfirmed.by} (the supplier)${o.supplierConfirmed.expected ? `, to arrive by ${formatDate(o.supplierConfirmed.expected)}` : ""}${o.supplierConfirmed.note ? `: ${o.supplierConfirmed.note}` : ""}` : ""}${o.project ? `. For ${o.project}` : ""}.`}
        actions={
          <>
            <Link to={`/documents/${DOC_KIND[o.kind]}/${o.id}`} className="inline-flex items-center gap-1.5 h-11 px-4 rounded-full border border-[var(--border)] text-[14px] font-medium hover:border-[var(--ink)]" data-testid="order-document">
              <FileText size={15} /> {quote ? "The quotation" : buying ? "The purchase order" : "The sales order"}
            </Link>
            {quote && ["quoted", "expired"].includes(o.status) && can("record") && (
              <>
                <Button variant="outline" disabled={act.isPending} onClick={() => run(`/orders/${id}/decline`, {}, () => ["Declined", "Kept, so you can see what was lost and why."])}>
                  Declined
                </Button>
                <Button
                  variant="accent"
                  disabled={act.isPending}
                  onClick={async () => {
                    const r = await run(`/orders/${id}/accept`, {}, (x) => [`Accepted: ${x.number}`, "A sales order with the same lines, ready to deliver and invoice."]);
                    if (r?.orderId) nav(`/orders/${r.orderId}`);
                  }}
                >
                  Accepted
                </Button>
              </>
            )}
            {quote && o.becameOrderId && (
              <Button variant="outline" onClick={() => nav(`/orders/${o.becameOrderId}`)}>
                Its sales order
              </Button>
            )}
            {o.status === "awaiting_approval" && o.mayApprove && (
              <Button variant="accent" disabled={act.isPending} onClick={() => run(`/orders/${id}/approve`, {}, () => ["Approved", "Deliveries can be received against it now."])}>
                Approve MVR {o.total}
              </Button>
            )}
            {live && toMove && (can("receive") || can("record")) && (
              <Button variant={toBill ? "outline" : "accent"} onClick={() => setOpen("deliver")}>
                {buying ? "Record what arrived" : "Record what went out"}
              </Button>
            )}
            {live && toBill && can("record") && (
              <Button variant="accent" onClick={() => setOpen("bill")}>
                {buying ? "Make the bill" : "Make the invoice"}
              </Button>
            )}
          </>
        }
      />
      <div className="flex items-center gap-2 mb-4">
        <Badge tone={st.tone} data-testid="order-status">
          {buying ? st.buy : st.sell}
        </Badge>
        {o.status === "awaiting_approval" && !o.mayApprove && <span className="text-[13px] text-[var(--ink-muted)]">Someone who can approve MVR {o.total} has been asked.</span>}
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[14px] tabular" data-testid="order-lines">
            <thead>
              <tr className="text-[12px] text-[var(--ink-muted)] text-right border-b border-[var(--border)]">
                <th className="text-left font-medium px-4 sm:px-5 py-3">What</th>
                <th className="font-medium px-2 sm:px-3 py-3">Ordered</th>
                <th className="font-medium px-2 sm:px-3 py-3">{buying ? "Arrived" : "Gone out"}</th>
                <th className="font-medium px-2 sm:px-3 py-3">{buying ? "Billed" : "Invoiced"}</th>
                <th className="font-medium px-2 sm:px-3 py-3 hidden sm:table-cell">Each</th>
                <th className="font-medium pl-2 pr-4 sm:px-5 py-3">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {o.lines.map((l) => (
                <tr key={l.id} className="text-right">
                  <td className="text-left px-4 sm:px-5 py-3">
                    <div>{l.description}</div>
                    <div className="text-[12px] text-[var(--ink-muted)]">{l.item ? "Stock" : l.account || ""}</div>
                  </td>
                  <td className="px-2 sm:px-3 py-3">
                    {l.quantity} {l.unit || ""}
                  </td>
                  <td className={`px-2 sm:px-3 py-3 ${n(l.delivered) < n(l.quantity) ? "text-[var(--ink-muted)]" : ""}`}>{l.delivered}</td>
                  <td className={`px-2 sm:px-3 py-3 ${n(l.billed) < n(l.delivered) ? "text-[var(--accent-strong)] font-semibold" : "text-[var(--ink-muted)]"}`}>{l.billed}</td>
                  <td className="px-3 py-3 text-[var(--ink-muted)] hidden sm:table-cell">
                    <Money amount={l.price} />
                  </td>
                  <td className="pl-2 pr-4 sm:px-5 py-3 font-semibold">
                    <Money amount={l.amount} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-[var(--border)] text-[13px] text-[var(--ink-muted)] flex flex-wrap gap-x-6 gap-y-1 justify-end tabular">
          <span>
            Ordered MVR <Money amount={o.total} />
          </span>
          <span>
            {buying ? "Arrived" : "Gone out"} MVR <Money amount={o.delivered} />
          </span>
          <span>
            {buying ? "Billed" : "Invoiced"} MVR <Money amount={o.billed} />
          </span>
        </div>
      </Card>

      {o.deliveries?.length > 0 && (
        <Card padding="none" className="mt-4">
          <div className="px-5 py-3 border-b border-[var(--border)] text-[13px] font-semibold">{buying ? "Goods received" : "Delivery notes"}</div>
          <ul className="divide-y divide-[var(--border)]">
            {o.deliveries.map((d, i) => (
              <li key={d.id}>
                <Link to={`/documents/${buying ? "goods_received" : "delivery_note"}/${d.id}`} className="flex items-center gap-3 px-5 py-3 text-[14px] hover:bg-[var(--surface-2)]">
                  <FileText size={15} className="text-[var(--ink-muted)]" />
                  <span className="font-medium tabular">
                    {o.number}-D{i + 1}
                  </span>
                  <span className="text-[var(--ink-muted)]">{formatDate(d.on)}</span>
                  {d.reference && <span className="text-[var(--ink-muted)] truncate">{d.reference}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {live && can("record") && (
        <div className="flex gap-2 mt-4">
          {o.lines.every((l) => n(l.delivered) === 0) ? (
            <Button variant="ghost" size="sm" onClick={() => run(`/orders/${id}/cancel`, {}, () => ["Cancelled", "Nothing will be expected against it."])}>
              Cancel the order
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => run(`/orders/${id}/close`, {}, () => ["Closed", "What was still to come is no longer expected."])}>
              Close it: nothing more is coming
            </Button>
          )}
        </div>
      )}

      {open === "deliver" && <Deliver o={o} onClose={() => setOpen(null)} run={run} />}
      {open === "bill" && <Bill o={o} onClose={() => setOpen(null)} run={run} nav={nav} />}
    </div>
  );
}

function Deliver({ o, onClose, run }) {
  const buying = o.kind === "purchase";
  const { sendOrKeep } = useOutbox();
  const toast = useToast();
  const left = (l) => Math.max(0, n(l.quantity) - n(l.delivered));
  const [qty, setQty] = useState(Object.fromEntries(o.lines.map((l) => [l.id, String(left(l))])));
  const [f, setF] = useState({ deliveredOn: today(), reference: "" });
  const [busy, setBusy] = useState(false);
  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    const lines = Object.entries(qty).filter(([, v]) => n(v) > 0).map(([orderLineId, quantity]) => ({ orderLineId, quantity: String(quantity) }));
    // Recorded where the goods are, often with no signal: kept on the phone until there is.
    const body = { ...f, reference: f.reference || null, lines };
    if (!navigator.onLine) {
      await sendOrKeep({ url: `/orders/${o.id}/deliveries`, body, label: `${buying ? "Arrived" : "Went out"} against ${o.number}` });
      toast.success("Kept on this phone", "It is recorded against the order by itself when there is signal.");
      setBusy(false);
      return onClose();
    }
    const r = await run(`/orders/${o.id}/deliveries`, body, () => [buying ? "Recorded as arrived" : "Recorded as gone out", buying ? "Bill it when the supplier's invoice comes." : "Invoice it now or later."]);
    setBusy(false);
    if (r) onClose();
  }
  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title={buying ? "What arrived" : "What went out"} description="Only what actually came. The rest stays expected.">
      <div className="grid gap-3">
        {o.lines.filter((l) => left(l) > 0).map((l) => (
          <label key={l.id} className="grid grid-cols-[minmax(0,1fr)_120px] gap-3 items-center">
            <span className="text-[14px]">
              {l.description}
              <span className="block text-[12px] text-[var(--ink-muted)]">
                {left(l)} {l.unit || ""} still {buying ? "to come" : "to go"}
              </span>
            </span>
            <input aria-label={`How many ${l.description}`} value={qty[l.id]} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} inputMode="decimal" className={`${FIELD} tabular text-right`} />
          </label>
        ))}
        <div className="grid sm:grid-cols-2 gap-3 mt-1">
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">On</span>
            <input type="date" value={f.deliveredOn} onChange={(e) => setF({ ...f, deliveredOn: e.target.value })} className={FIELD} />
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Delivery note (optional)</span>
            <input id="delivery-ref" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="DN-1234" className={FIELD} />
          </label>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="accent" disabled={busy}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          Record it
        </Button>
      </div>
    </Modal>
  );
}

function Bill({ o, onClose, run, nav }) {
  const buying = o.kind === "purchase";
  const due = o.lines.filter((l) => n(l.delivered) > n(l.billed));
  const [rows, setRows] = useState(Object.fromEntries(due.map((l) => [l.id, { quantity: String(n(l.delivered) - n(l.billed)), unitPrice: String(n(l.price)) }])));
  const [f, setF] = useState({ billNo: "", issueDate: today(), gstTreatment: "exclusive" });
  const [busy, setBusy] = useState(false);
  const net = due.reduce((a, l) => a + n(rows[l.id].quantity) * n(rows[l.id].unitPrice), 0);
  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    const lines = due.filter((l) => n(rows[l.id].quantity) > 0).map((l) => ({ orderLineId: l.id, quantity: String(rows[l.id].quantity), unitPrice: String(rows[l.id].unitPrice) }));
    const r = await run(
      `/orders/${o.id}/${buying ? "bill" : "invoice"}`,
      { ...f, billNo: buying ? f.billNo || null : undefined, lines },
      (x) => [
        buying ? `Bill made · MVR ${x.gross}` : `Invoice ${x.invoiceNo} made · MVR ${x.gross}`,
        x.differences.length ? `Not as ordered: ${x.differences.join("; ")}.` : buying ? "Check it against the supplier's paper, then put it in the books." : "Put it in the books when it goes to the customer.",
      ]
    );
    setBusy(false);
    if (r) {
      onClose();
      nav(buying ? "/bills" : "/invoices");
    }
  }
  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title={buying ? "The supplier's bill" : "The invoice"} description={`For what ${buying ? "arrived" : "went out"} and is not yet ${buying ? "billed" : "invoiced"}. Change a price only if ${buying ? "their paper" : "you agreed"} says otherwise.`}>
      <div className="grid gap-3">
        {due.map((l) => (
          <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_90px_110px] gap-2 items-center">
            <span className="text-[14px] min-w-0 truncate">{l.description}</span>
            <input aria-label={`How many ${l.description} to bill`} value={rows[l.id].quantity} onChange={(e) => setRows({ ...rows, [l.id]: { ...rows[l.id], quantity: e.target.value } })} inputMode="decimal" className={`${FIELD} tabular text-right`} />
            <input aria-label={`Price each for ${l.description}`} value={rows[l.id].unitPrice} onChange={(e) => setRows({ ...rows, [l.id]: { ...rows[l.id], unitPrice: e.target.value } })} inputMode="decimal" className={`${FIELD} tabular text-right`} />
          </div>
        ))}
        <div className="grid sm:grid-cols-3 gap-3 mt-1">
          {buying && (
            <label className="block">
              <span className="text-sm font-medium block mb-1.5">Their bill number</span>
              <input id="bill-no" value={f.billNo} onChange={(e) => setF({ ...f, billNo: e.target.value })} className={FIELD} />
            </label>
          )}
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Dated</span>
            <input type="date" value={f.issueDate} onChange={(e) => setF({ ...f, issueDate: e.target.value })} className={FIELD} />
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">GST</span>
            <select id="bill-gst" value={f.gstTreatment} onChange={(e) => setF({ ...f, gstTreatment: e.target.value })} className={FIELD}>
              <option value="exclusive">Added on top</option>
              <option value="none_unregistered">None charged</option>
              <option value="exempt">Exempt</option>
              <option value="zero_rated">Zero-rated</option>
            </select>
          </label>
        </div>
        <p className="text-[14px] text-right tabular">MVR {net.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} before tax</p>
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="accent" disabled={busy || net <= 0}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          {buying ? "Make the bill" : "Make the invoice"}
        </Button>
      </div>
    </Modal>
  );
}
