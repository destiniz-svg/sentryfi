import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Package, Plus, X } from "lucide-react";
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
import { cn, formatDate, today } from "@/lib/utils";
import { FIELD } from "@/lib/shipments";
import { ORDER_STATUS } from "@/lib/orders";
import { PendingAttachments, uploadPending } from "@/components/documents/Attachments";
import { UnitInput } from "@/components/ui/UnitInput";
import { Basket, FlowButtons, ItemPicker, PartyPicker, Step, dueFrom } from "@/components/forms/Pickers";
import { usePhone } from "@/lib/phone";

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
        title={{ quote: "Quotes", sale: "Sales orders", purchase: "Purchase orders" }[kind]}
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

const blankLine = () => ({ itemId: "", description: "", accountId: "", quantity: "1", unit: "", unitPrice: "" });
const VALIDITY_CHOICES = [7, 15, 30, 60];

function NewOrder({ kind, onClose }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { data: o } = useQuery({ queryKey: ["orders", companyId, "options"], queryFn: () => apiClient.get("/orders/options").then((r) => r.data) });
  const [files, setFiles] = useState([]);
  const [shareFiles, setShareFiles] = useState(false);
  const partyKind = kind === "purchase" ? "supplier" : "customer";
  const [party, setParty] = useState(null);
  // The guided way through, as on an invoice: who, items one at a time, when,
  // anything else, then the order itself. Closing a step leaves the form below.
  const [flow, setFlow] = useState("who");
  const phone = usePhone();
  const side = kind === "purchase" ? "purchase" : "sale";
  const [f, setF] = useState({ orderedOn: today(), projectId: "", expectedOn: "", note: "", validUntil: "" });
  const [lines, setLines] = useState([blankLine()]);
  const [pickFor, setPickFor] = useState(null);
  const { data: stockItems } = useQuery({ queryKey: ["stock", companyId], queryFn: () => apiClient.get("/stock").then((r) => r.data), select: (d) => d.items, enabled: Boolean(companyId) });
  const [err, setErr] = useState("");
  const save = useMutation({ mutationFn: (body) => apiClient.post("/orders", body).then((r) => r.data) });
  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((a, l) => a + n(l.quantity) * n(l.unitPrice), 0);
  const hasLines = lines.some((l) => l.itemId || l.description.trim());
  const label = { purchase: "purchase order", sale: "sales order", quote: "quote" }[kind];
  const step3Filled = kind === "quote" ? Boolean(f.validUntil) : Boolean(f.expectedOn);
  const at = !party ? 1 : !hasLines ? 2 : !step3Filled ? 3 : 4;
  const commitment = !party ? (kind === "purchase" ? "Who is it from?" : "Who is it for?") : !hasLines ? "Add a line" : `Save the ${label}`;

  function onSubmit(e) {
    e.preventDefault();
    submit();
  }

  function addLine(it, { quantity, uom, rate }) {
    setLines((ls) => [...ls.filter((l) => l.itemId || l.description.trim()), { ...blankLine(), itemId: it.id, description: it.name, quantity, unit: uom, unitPrice: rate.replace(/,/g, "") }]);
  }
  const money = (x) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const filled = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.itemId || l.description.trim());

  async function submit() {
    setErr("");
    try {
      const r = await save.mutateAsync({
        kind,
        counterpartyId: party?.id || null,
        partyName: party?.id ? null : party?.name || "",
        projectId: f.projectId || null,
        orderedOn: f.orderedOn || null,
        expectedOn: kind === "quote" ? null : f.expectedOn || null,
        validUntil: kind === "quote" ? f.validUntil || null : null,
        note: f.note || null,
        lines: lines
          .filter((l) => l.itemId || l.description.trim())
          .map((l) => ({ itemId: l.itemId || null, description: l.description, accountId: l.itemId ? null : l.accountId || null, quantity: String(l.quantity), unit: (l.unit || "").trim() || null, unitPrice: String(l.unitPrice || "0").replace(/,/g, "") })),
      });
      if (files.length) await uploadPending({ quote: "quote", sale: "sales_order", purchase: "purchase_order" }[kind], r.id, files, shareFiles);
      qc.invalidateQueries({ queryKey: ["orders", companyId] });
      nav(`/orders/${r.id}`);
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title={{ purchase: "Purchase order", sale: "Sales order", quote: "Quote" }[kind]} description={kind === "purchase" ? "Prices are before tax." : "What the customer ordered, at your prices before tax."} size="lg">
      {!o ? (
        <Loader2 size={18} className="animate-spin text-[var(--ink-muted)]" />
      ) : (
        <div className="grid gap-4">
          <Step n={1} id="order-step-who" title={kind === "purchase" ? "Who is it from?" : "Who is it for?"} done={at > 1} active={at === 1}>
            <PartyPicker kind={partyKind} value={party} onChange={(p) => (setParty(p), setFlow("items"))} open={flow === "who"} setOpen={(v) => setFlow((x) => (v ? "who" : x === "who" ? null : x))} />
          </Step>

          <Step n={2} id="order-step-lines" title="What's on it?" done={at > 2} active={at === 2} summary={hasLines ? `${lines.filter((l) => l.itemId || l.description.trim()).length} ${lines.filter((l) => l.itemId || l.description.trim()).length === 1 ? "line" : "lines"}` : null}>
          <fieldset className="space-y-3">
            {lines.map((l, i) => (
              <div key={i} data-testid="order-line" className="rounded-xl border border-[var(--border)] p-3 space-y-2">
                <div className="flex gap-2">
                  <button type="button" aria-label={`Line ${i + 1}: item`} onClick={() => setPickFor(i)} className={cn(FIELD, "flex-1 min-w-0 flex items-center gap-2 text-left")}>
                    <Package size={16} className="shrink-0 text-[var(--ink-muted)]" aria-hidden="true" />
                    <span className={cn("truncate", !l.itemId && "text-[var(--ink-muted)]")}>{l.itemId ? l.description : "Find or add an item"}</span>
                  </button>
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
                <div className="grid grid-cols-[minmax(0,1fr)_96px_minmax(0,1.3fr)] gap-2">
                  <input aria-label={`Line ${i + 1}: how many`} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} inputMode="decimal" placeholder="How many" className={`${FIELD} tabular`} />
                  <UnitInput label={`Line ${i + 1}: unit`} value={l.unit} onChange={(v) => setLine(i, { unit: v })} className={FIELD} />
                  <input aria-label={`Line ${i + 1}: price each`} value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} inputMode="decimal" placeholder="Price" className={`${FIELD} tabular`} />
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setFlow("items")}>
                <Package size={14} /> Add items
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>
                <Plus size={14} /> Another line
              </Button>
            </div>
            <ItemPicker
              open={pickFor != null}
              setOpen={(v) => !v && setPickFor(null)}
              side={kind === "purchase" ? "purchase" : "sale"}
              items={(stockItems || []).filter((it) => !it.archived && (kind === "purchase" ? it.buys : it.sells))}
              onPick={(it) => {
                const price = kind === "purchase" ? it.buyPrice : it.salePrice;
                setLine(pickFor, { itemId: it.id, description: it.name, unit: it.unit || "", unitPrice: price ? String(price).replace(/,/g, "") : lines[pickFor].unitPrice });
              }}
            />
          </fieldset>
          <p className="text-[14px] text-right tabular" data-testid="order-total">
            MVR {total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} before tax
          </p>
          </Step>

          <Step n={3} id="order-step-when" title={kind === "quote" ? "How long is it valid?" : "When do you expect it?"} done={at > 3} active={at === 3} summary={kind === "quote" ? (f.validUntil ? `Until ${formatDate(f.validUntil)}` : null) : (f.expectedOn ? formatDate(f.expectedOn) : null)}>
            <div className="grid gap-4">
              <label className="block max-w-[220px]">
                <span className="text-sm font-medium block mb-1.5">Dated</span>
                <input type="date" value={f.orderedOn} onChange={(e) => setF({ ...f, orderedOn: e.target.value, validUntil: "" })} className={FIELD} />
              </label>
              {kind === "quote" ? (
                <div>
                  <div role="radiogroup" aria-label="Valid for" className="flex flex-wrap gap-2">
                    {VALIDITY_CHOICES.map((d) => {
                      const val = dueFrom(f.orderedOn, d);
                      const on = f.validUntil === val;
                      return (
                        <button key={d} type="button" role="radio" aria-checked={on} onClick={() => setF({ ...f, validUntil: val })} className={cn("h-10 px-4 rounded-full border text-[14px]", on ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-semibold" : "border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)]")}>
                          {d} days
                        </button>
                      );
                    })}
                  </div>
                  <label className="mt-3 grid gap-1.5 max-w-[220px]">
                    <span className="text-[13px] font-medium">Or pick a date</span>
                    <input type="date" min={f.orderedOn} value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} className={FIELD} />
                  </label>
                </div>
              ) : (
                <label className="block max-w-[220px]">
                  <span className="text-sm font-medium block mb-1.5">Expected on</span>
                  <input type="date" min={f.orderedOn} value={f.expectedOn} onChange={(e) => setF({ ...f, expectedOn: e.target.value })} className={FIELD} />
                </label>
              )}
            </div>
          </Step>

          <Step n={4} id="order-step-more" title="Notes and details" active={at === 4}>
            <div className="grid gap-4">
              <label className="block">
                <span className="text-sm font-medium block mb-1.5">For a project (optional)</span>
                <select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })} className={FIELD}>
                  <option value="">None</option>
                  {o.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium block mb-1.5">Notes (optional)</span>
                <textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={3} maxLength={500} placeholder="Anything worth saying about this order" className={`${FIELD} h-auto py-3 leading-relaxed`} />
              </label>
              <PendingAttachments files={files} onChange={setFiles} share={shareFiles} onShare={setShareFiles} shareLabel={kind === "purchase" ? "Show them to the supplier with it" : "Show them to the customer with it"} />
            </div>
          </Step>
        </div>
      )}
      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">
          {err}
        </p>
      )}
      <ItemPicker
        open={flow === "items"}
        setOpen={(v) => setFlow((x) => (v ? "items" : x === "items" ? null : x))}
        side={side}
        items={(stockItems || []).filter((it) => !it.archived && (kind === "purchase" ? it.buys : it.sells))}
        onAdd={addLine}
        basket={
          <Basket
            lines={filled.map(({ l, i }) => ({ key: i, label: l.description, detail: `${l.quantity} ${l.unit} × ${money(n(l.unitPrice))}`, amount: money(n(l.quantity) * n(l.unitPrice)) }))}
            onRemove={(i) => setLines((ls) => (ls.length === 1 ? [blankLine()] : ls.filter((_, j) => j !== i)))}
            onNext={() => setFlow("when")}
            nextLabel={`${filled.length} ${filled.length === 1 ? "item" : "items"} · MVR ${money(total)} · Next`}
          />
        }
      />

      <Modal open={flow === "when"} onClose={() => setFlow(null)} title={kind === "quote" ? "How long is it good for?" : kind === "purchase" ? "When should it arrive?" : "When does it go out?"} variant={phone ? "sheet" : "card"}>
        {kind === "quote" ? (
          <div role="radiogroup" aria-label="Valid for" className="flex flex-wrap gap-2">
            {VALIDITY_CHOICES.map((d) => {
              const val = dueFrom(f.orderedOn, d);
              const on = f.validUntil === val;
              return (
                <button key={d} type="button" role="radio" aria-checked={on} onClick={() => setF({ ...f, validUntil: val })} className={cn("h-10 px-4 rounded-full border text-[14px]", on ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-semibold" : "border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)]")}>
                  {d} days
                </button>
              );
            })}
          </div>
        ) : (
          <label className="block max-w-[240px]">
            <span className="text-sm font-medium block mb-1.5">Expected on</span>
            <input id="flow-expected" type="date" min={f.orderedOn} value={f.expectedOn} onChange={(e) => setF({ ...f, expectedOn: e.target.value })} className={FIELD} />
          </label>
        )}
        <FlowButtons back={() => setFlow("items")} next={() => setFlow("more")} label={step3Filled ? "Next" : "Skip"} />
      </Modal>

      <Modal open={flow === "more"} onClose={() => setFlow(null)} title="Anything else on it?" description="All of it can be left empty." variant={phone ? "sheet" : "card"}>
        <div className="grid gap-4">
          {o?.projects?.length > 0 && (
            <label className="block">
              <span className="text-sm font-medium block mb-1.5">For a project</span>
              <select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })} className={FIELD}>
                <option value="">None</option>
                {o.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Notes</span>
            <textarea id="flow-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2} maxLength={500} className={`${FIELD} h-auto py-3 leading-relaxed`} />
          </label>
          {err && (
            <p role="alert" className="text-[13px] text-[var(--danger)]">
              {err}
            </p>
          )}
        </div>
        <FlowButtons back={() => setFlow("when")} next={submit} busy={save.isPending} disabled={!party || total <= 0} label={`Create the ${label} · MVR ${money(total)}`} testid="flow-create" />
      </Modal>

      <div className="flex justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant={party && hasLines ? "accent" : "outline"} disabled={save.isPending || !party || total <= 0}>
          {save.isPending && <Loader2 size={14} className="animate-spin" />}
          {commitment}
        </Button>
      </div>
    </Modal>
  );
}
