import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Plus, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { Segments } from "@/components/mobile/parts";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { formatDate } from "@/lib/utils";
import { FIELD } from "@/lib/shipments";
import { ORDER_STATUS } from "@/lib/orders";

/**
 * Orders: what was agreed with a supplier or a customer before the goods
 * moved, how much of it has arrived or gone out, and how much is billed.
 */

const n = (s) => Number(String(s ?? "").replace(/,/g, "")) || 0;

export default function Orders() {
  const { companyId, can } = useCompany();
  const [params, setParams] = useSearchParams();
  const kind = ["sale", "quote"].includes(params.get("kind")) ? params.get("kind") : "purchase";
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["orders", companyId, kind],
    queryFn: () => apiClient.get(`/orders?kind=${kind}`).then((r) => r.data.orders),
    enabled: Boolean(companyId),
  });
  const mayAdd = kind === "purchase" ? can("order") || can("record") : can("record");

  return (
    <div>
      <PageHeader
        title="Orders and quotes"
        description="What was agreed before the goods moved, what has arrived or gone out, and what is billed."
        actions={
          mayAdd && (
            <Button variant="accent" onClick={() => setAdding(true)}>
              <Plus size={16} /> {{ purchase: "Purchase order", sale: "Sales order", quote: "Quote" }[kind]}
            </Button>
          )
        }
      />
      <div className="max-w-sm mb-4">
        <Segments label="Kind of order" value={kind} onChange={(k) => setParams({ kind: k })} options={[{ value: "purchase", label: "Buying" }, { value: "sale", label: "Selling" }, { value: "quote", label: "Quotes" }]} />
      </div>
      {isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : !data?.length ? (
        <Card padding="lg">
          <p className="text-[16px] font-semibold">{kind === "quote" ? "No quotes yet" : `No ${kind === "purchase" ? "purchase" : "sales"} orders yet`}</p>
          <p className="text-[14px] text-[var(--ink-muted)] mt-1.5 max-w-prose">
            {kind === "purchase"
              ? "Order from a supplier, record what arrives, and the bill is made from what arrived: one cost, however many deliveries it came in. An order over your limit waits for someone who can approve it."
              : kind === "quote"
                ? "Give a customer a price. When they accept, it becomes a sales order with the same lines, ready to deliver and invoice."
                : "Take an order from a customer, record what goes out, and the invoice is made from what went out."}
          </p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="divide-y divide-[var(--border)]">
            {data.map((o) => {
              const st = ORDER_STATUS[o.status];
              const got = n(o.total) ? Math.round((n(o.delivered) / n(o.total)) * 100) : 0;
              return (
                <Link key={o.id} to={`/orders/${o.id}`} data-testid="order-row" className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-5 py-4 hover:bg-[var(--surface-2)]">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold truncate">
                      {o.number} · {o.party}
                    </div>
                    <div className="text-[13px] text-[var(--ink-muted)] truncate">
                      {formatDate(o.orderedOn)}
                      {o.project ? ` · ${o.project}` : ""}
                      {kind === "quote" ? (o.validUntil ? ` · good until ${formatDate(o.validUntil)}` : "") : ` · ${got}% ${kind === "purchase" ? "arrived" : "gone out"}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <Money amount={o.total} className="text-[15px] font-semibold" />
                    <div className="mt-1">
                      <Badge tone={st.tone}>{kind === "purchase" ? st.buy : st.sell}</Badge>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
      {adding && <NewOrder kind={kind} onClose={() => setAdding(false)} />}
    </div>
  );
}

const blankLine = () => ({ itemId: "", description: "", accountId: "", quantity: "1", unitPrice: "" });

function NewOrder({ kind, onClose }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { data: o } = useQuery({ queryKey: ["orders", companyId, "options"], queryFn: () => apiClient.get("/orders/options").then((r) => r.data) });
  const [f, setF] = useState({ partyName: "", projectId: "", expectedOn: "", note: "", validUntil: "" });
  const [lines, setLines] = useState([blankLine()]);
  const [err, setErr] = useState("");
  const save = useMutation({ mutationFn: (body) => apiClient.post("/orders", body).then((r) => r.data) });
  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((a, l) => a + n(l.quantity) * n(l.unitPrice), 0);
  const parties = (o?.parties || []).filter((p) => (p.kind || []).includes(kind === "purchase" ? "supplier" : "customer"));

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      const r = await save.mutateAsync({
        kind,
        partyName: f.partyName,
        projectId: f.projectId || null,
        expectedOn: f.expectedOn || null,
        validUntil: kind === "quote" ? f.validUntil || null : null,
        note: f.note || null,
        lines: lines
          .filter((l) => l.itemId || l.description.trim())
          .map((l) => ({ itemId: l.itemId || null, description: l.description, accountId: l.itemId ? null : l.accountId || null, quantity: String(l.quantity), unitPrice: String(l.unitPrice || "0").replace(/,/g, "") })),
      });
      qc.invalidateQueries({ queryKey: ["orders", companyId] });
      nav(`/orders/${r.id}`);
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title={{ purchase: "Purchase order", sale: "Sales order", quote: "Quote" }[kind]} description={kind === "purchase" ? "Prices are before tax." : "What the customer ordered, at your prices before tax."}>
      {!o ? (
        <Loader2 size={18} className="animate-spin text-[var(--ink-muted)]" />
      ) : (
        <div className="grid gap-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium block mb-1.5">{kind === "purchase" ? "From" : "For"}</span>
              <input id="order-party" list="order-parties" value={f.partyName} onChange={(e) => setF({ ...f, partyName: e.target.value })} placeholder={kind === "purchase" ? "Supplier" : "Customer"} className={FIELD} />
              <datalist id="order-parties">
                {parties.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </label>
            {kind === "quote" && (
              <label className="block">
                <span className="text-sm font-medium block mb-1.5">Good until</span>
                <input id="quote-until" type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} className={FIELD} />
              </label>
            )}
            <label className="block">
              <span className="text-sm font-medium block mb-1.5">For a project (optional)</span>
              <select id="order-project" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })} className={FIELD}>
                <option value="">None</option>
                {o.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium mb-1.5">Lines</legend>
            {lines.map((l, i) => (
              <div key={i} data-testid="order-line" className="rounded-xl border border-[var(--border)] p-3 space-y-2">
                <div className="flex gap-2">
                  <select
                    aria-label={`Line ${i + 1}: item`}
                    value={l.itemId}
                    onChange={(e) => {
                      const it = o.items.find((x) => x.id === e.target.value);
                      setLine(i, { itemId: e.target.value, description: it ? it.name : l.description, unitPrice: kind === "sale" && it?.sale_price_laari ? String(Number(it.sale_price_laari) / 100) : l.unitPrice });
                    }}
                    className={`${FIELD} flex-1 min-w-0`}
                  >
                    <option value="">{kind === "purchase" ? "Not stock: a service or a cost" : "Not from stock"}</option>
                    {o.items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => (ls.length === 1 ? [blankLine()] : ls.filter((_, j) => j !== i)))} className="h-11 w-11 shrink-0 rounded-full inline-flex items-center justify-center hover:bg-[var(--surface-2)] text-[var(--ink-muted)]">
                    <X size={15} />
                  </button>
                </div>
                {!l.itemId && (
                  <div className="grid sm:grid-cols-2 gap-2">
                    <input aria-label={`Line ${i + 1}: what`} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="What" className={FIELD} />
                    {kind === "purchase" && (
                      <select aria-label={`Line ${i + 1}: kind of cost`} value={l.accountId} onChange={(e) => setLine(i, { accountId: e.target.value })} className={FIELD}>
                        <option value="">Which kind of cost?</option>
                        {o.accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <input aria-label={`Line ${i + 1}: how many`} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} inputMode="decimal" placeholder="How many" className={`${FIELD} tabular`} />
                  <input aria-label={`Line ${i + 1}: price each`} value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} inputMode="decimal" placeholder="Price each, MVR" className={`${FIELD} tabular`} />
                </div>
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>
              <Plus size={14} /> Another line
            </Button>
          </fieldset>
          <p className="text-[14px] text-right tabular" data-testid="order-total">
            MVR {total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} before tax
          </p>
        </div>
      )}
      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">
          {err}
        </p>
      )}
      <div className="flex justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="accent" disabled={save.isPending || !f.partyName.trim() || total <= 0}>
          {save.isPending && <Loader2 size={14} className="animate-spin" />}
          {kind === "quote" ? "Save the quote" : "Place the order"}
        </Button>
      </div>
    </Modal>
  );
}
