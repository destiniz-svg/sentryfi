import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileText, Loader2, Plus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { formatDate, today } from "@/lib/utils";
import { FIELD, Field } from "@/pages/Payroll";

/**
 * Money asked for before the tax invoice.
 *
 * A proforma invoice is the invoice to come, sent so the customer can pay or
 * arrange payment; a retainer invoice asks for an amount up front. Neither is
 * a tax invoice and neither is in the books until money arrives. Then it is
 * held for the customer, with its GST (due when paid), until it is used on a
 * tax invoice or given back. A proforma becomes its tax invoice in one step.
 */

const n = (s) => Number(String(s ?? "").replace(/,/g, "")) || 0;
/** The country's word for the tax: GST here, VAT in the UAE. */
const useTax = () => useCompany().company?.tax?.tax || "GST";
const two = (x) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STANDING = {
  open: ["Waiting", "text-[var(--ink-muted)]"],
  accepted: ["Accepted", "text-[var(--ink)]"],
  "part paid": ["Part paid", "text-[var(--warning)]"],
  paid: ["Paid", "text-[var(--success)]"],
  invoiced: ["Invoiced", "text-[var(--success)]"],
  cancelled: ["Withdrawn", "text-[var(--ink-muted)]"],
};

export default function Advances() {
  const { companyId, can } = useCompany();
  const qc = useQueryClient();
  const [tab, setTab] = useState("asked");
  const [making, setMaking] = useState(null);
  const [paying, setPaying] = useState(null);
  const [using, setUsing] = useState(null);
  const [refunding, setRefunding] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ["advances", companyId], queryFn: () => apiClient.get("/advances").then((r) => r.data), enabled: Boolean(companyId) });
  const refresh = () => {
    for (const k of ["advances", "invoices", "figures", "attention", "statements", "sales"]) qc.invalidateQueries({ queryKey: [k, companyId] });
  };
  const held = (data?.held || []).filter((a) => n(a.left) > 0);
  const heldTotal = held.reduce((a, x) => a + n(x.left), 0);

  return (
    <div>
      <PageHeader
        title="Proforma and retainers"
        description="Ask for money before the tax invoice, keep what is paid for the customer, and use it when you invoice."
        actions={
          can("record") && (
            <Button variant="accent" onClick={() => setMaking("proforma")}>
              <Plus size={16} /> New proforma invoice
            </Button>
          )
        }
      />
      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : (
        <>
          <Tabs value={tab} onValueChange={setTab} className="mb-4">
            <TabsList>
              <TabsTrigger value="asked">Asked for · {data.requests.filter((r) => !["invoiced", "cancelled"].includes(r.status)).length}</TabsTrigger>
              <TabsTrigger value="held">Held for customers · {two(heldTotal)}</TabsTrigger>
            </TabsList>
          </Tabs>
          {tab === "asked" ? (
            <Requests list={data.requests} onPay={setPaying} onRetainer={() => setMaking("retainer")} onDone={refresh} />
          ) : (
            <Held list={held} used={(data.held || []).filter((a) => n(a.left) === 0)} onUse={setUsing} onRefund={setRefunding} onPay={() => setPaying({})} />
          )}
        </>
      )}
      {making && data && <NewRequest kind={making} customers={data.customers} onClose={() => setMaking(null)} onDone={refresh} />}
      {paying && data && <Receive request={paying.id ? paying : null} customers={data.customers} payInto={data.payInto} onClose={() => setPaying(null)} onDone={refresh} />}
      {using && <UseAdvance advance={using} onClose={() => setUsing(null)} onDone={refresh} />}
      {refunding && data && <Refund advance={refunding} payInto={data.payInto} onClose={() => setRefunding(null)} onDone={refresh} />}
    </div>
  );
}

function Requests({ list, onPay, onRetainer, onDone }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useCompany();
  const [busy, setBusy] = useState(null);
  async function invoice(r) {
    if (!window.confirm(`Raise the tax invoice for ${r.number} today and put it in the books? What was paid against it (${r.paid}) is taken off.`)) return;
    setBusy(r.id);
    try {
      const x = await apiClient.post(`/advances/requests/${r.id}/invoice`, {});
      onDone();
      toast.success(`${x.data.invoiceNo} raised from ${r.number}`, "It is in the books, with what was paid in advance taken off.");
      navigate(`/documents/invoice/${x.data.invoiceId}`);
    } catch (ex) {
      toast.error("Not raised", ex.message);
    } finally {
      setBusy(null);
    }
  }
  async function withdraw(r) {
    const reason = window.prompt(`Withdraw ${r.number}? Say why (optional).`);
    if (reason === null) return;
    try {
      await apiClient.post(`/advances/requests/${r.id}/cancel`, { reason });
      onDone();
    } catch (ex) {
      toast.error("Not withdrawn", ex.message);
    }
  }
  return (
    <>
      {!list.length ? (
        <Card padding="lg">
          <p className="text-[16px] font-semibold">Nothing asked for yet</p>
          <p className="text-[14px] text-[var(--ink-muted)] mt-1.5 max-w-prose">
            A proforma invoice shows a customer what the invoice will be, so they can pay first or arrange a transfer or an LC. A retainer asks for an
            amount up front. Neither is a tax invoice; what is paid is kept for the customer and taken off the tax invoice when it comes.
          </p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="hidden lg:grid grid-cols-[minmax(0,1.5fr)_130px_130px_130px_minmax(0,1.2fr)] gap-4 px-5 py-3 border-b border-[var(--border)] text-[12px] font-medium text-[var(--ink-muted)]">
            <span>Asked of</span>
            <span>Standing</span>
            <span className="text-right">Asked for</span>
            <span className="text-right">Paid</span>
            <span />
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {list.map((r) => {
              const [word, tone] = STANDING[r.status] || [r.status, ""];
              const live = !["invoiced", "cancelled"].includes(r.status);
              return (
                <li key={r.id} className="grid grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_130px_130px_130px_minmax(0,1.2fr)] gap-x-4 gap-y-1.5 px-5 py-4 items-center" data-testid="advance-request">
                  <Link to={`/documents/${r.kind}/${r.id}`} className="col-span-2 lg:col-span-1 min-w-0 flex items-start gap-3 group">
                    <span className="mt-0.5 h-9 w-9 shrink-0 rounded-full bg-[var(--surface-2)] inline-flex items-center justify-center text-[var(--ink-muted)]" aria-hidden="true">
                      <FileText size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold truncate group-hover:underline">{r.customer}</span>
                      <span className="block text-[13px] text-[var(--ink-muted)] truncate">
                        {r.label} {r.number} · {formatDate(r.issued)}
                        {r.subject ? ` · ${r.subject}` : ""}
                      </span>
                    </span>
                  </Link>
                  <span className={`text-[13px] font-medium ${tone}`}>
                    {word}
                    {r.status === "invoiced" && r.invoiceNo ? ` · ${r.invoiceNo}` : ""}
                    {r.acceptedBy && r.status === "accepted" ? ` by ${r.acceptedBy}` : ""}
                  </span>
                  <span className="text-[15px] font-semibold text-right"><Money amount={r.gross} /></span>
                  <span className="text-[14px] text-right text-[var(--ink-muted)]">{n(r.paid) ? <Money amount={r.paid} /> : "—"}</span>
                  <span className="col-span-2 lg:col-span-1 flex flex-wrap gap-2 lg:justify-end">
                    {live && can("record") && (
                      <>
                        {n(r.paid) < n(r.gross) && r.status !== "invoiced" && (
                          <Button variant="outline" size="sm" onClick={() => onPay(r)}>Record a payment</Button>
                        )}
                        {r.kind === "proforma" && (
                          <Button variant="outline" size="sm" onClick={() => invoice(r)} disabled={busy === r.id}>
                            {busy === r.id && <Loader2 size={13} className="animate-spin" />} Make the tax invoice
                          </Button>
                        )}
                        {n(r.paid) === 0 && (
                          <Button variant="ghost" size="sm" onClick={() => withdraw(r)}>Withdraw</Button>
                        )}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {can("record") && (
        <div className="mt-4">
          <Button variant="ghost" size="sm" onClick={onRetainer}>
            <Plus size={14} /> A retainer invoice instead: an amount up front
          </Button>
        </div>
      )}
    </>
  );
}

function Held({ list, used, onUse, onRefund, onPay }) {
  const { can } = useCompany();
  const tax = useTax();
  return (
    <>
      {!list.length ? (
        <Card padding="lg">
          <p className="text-[15px] font-semibold">Nothing held</p>
          <p className="text-[14px] text-[var(--ink-muted)] mt-1">Money a customer pays before their tax invoice is kept here, for them, until it is used on an invoice or given back.</p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-[var(--border)]">
            {list.map((a) => (
              <li key={a.id} className="px-5 py-4 grid grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_150px_150px_minmax(0,1fr)] gap-x-4 gap-y-1.5 items-center" data-testid="advance-held">
                <span className="col-span-2 lg:col-span-1 min-w-0">
                  <span className="block text-[15px] font-semibold truncate">{a.customer}</span>
                  <span className="block text-[13px] text-[var(--ink-muted)] truncate">
                    Paid {formatDate(a.receivedOn)}
                    {a.request ? ` against ${a.request}` : ""}
                    {n(a.tax) ? ` · ${tax} ${a.tax} inside, owed from that day` : ""}
                  </span>
                </span>
                <span className="text-[13px] text-[var(--ink-muted)] lg:text-right">of <Money amount={a.amount} /></span>
                <span className="text-[16px] font-semibold text-right"><Money amount={a.left} /> <span className="text-[12px] font-normal text-[var(--ink-muted)]">left</span></span>
                {can("record") && (
                  <span className="col-span-2 lg:col-span-1 flex gap-2 lg:justify-end">
                    <Button variant="outline" size="sm" onClick={() => onUse(a)}>Use on an invoice</Button>
                    <Button variant="ghost" size="sm" onClick={() => onRefund(a)}>Give back</Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {can("record") && (
        <div className="mt-4">
          <Button variant="ghost" size="sm" onClick={onPay}>
            <Plus size={14} /> Money paid in advance with nothing asked for
          </Button>
        </div>
      )}
      {used.length > 0 && <p className="mt-4 text-[13px] text-[var(--ink-muted)]">{used.length} {used.length === 1 ? "advance has" : "advances have"} been used in full.</p>}
    </>
  );
}

const blankLine = () => ({ description: "", quantity: "1", unitPrice: "" });

function NewRequest({ kind: first, customers, onClose, onDone }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { company } = useCompany();
  const [f, setF] = useState({ kind: first, counterpartyId: "", customerName: "", issueDate: today(), dueDate: "", gstTreatment: "exclusive", subject: "", lines: [blankLine()] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const put = (p) => setF((x) => ({ ...x, ...p }));
  const setLine = (i, p) => put({ lines: f.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const net = f.lines.reduce((a, l) => a + n(l.quantity || 1) * n(l.unitPrice), 0);
  const registered = company?.gstRegistered;
  const tax = company?.tax?.tax || "GST";
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await apiClient.post("/advances/requests", {
        ...f,
        counterpartyId: f.counterpartyId || null,
        customerName: f.counterpartyId ? null : f.customerName,
        dueDate: f.dueDate || null,
        gstTreatment: registered ? f.gstTreatment : null,
        lines: f.lines.filter((l) => l.description.trim() || n(l.unitPrice)).map((l) => ({ ...l, unitPrice: String(l.unitPrice).replace(/,/g, "") })),
      });
      onDone();
      toast.success(`${r.data.number} made`, "Send it from its page, or give the customer their link.");
      navigate(`/documents/${f.kind}/${r.data.id}`);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }
  const retainer = f.kind === "retainer";
  return (
    <Modal open onClose={onClose} as="form" onSubmit={save} title={retainer ? "New retainer invoice" : "New proforma invoice"} description={retainer ? "An amount asked for up front, taken off the tax invoices that follow." : "The invoice to come, so the customer can pay or arrange payment first."} size="lg">
      <div className="grid gap-4">
        <div className="flex gap-2" role="radiogroup" aria-label="Kind">
          {[["proforma", "Proforma invoice"], ["retainer", "Retainer invoice"]].map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => put({ kind: k })} className={`h-10 px-4 rounded-full border text-[14px] ${f.kind === k ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--border)] text-[var(--ink-muted)]"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="grid sm:grid-cols-[minmax(0,1fr)_160px_160px] gap-4">
          <Field label="Customer">
            {customers.length ? (
              <select value={f.counterpartyId} onChange={(e) => put({ counterpartyId: e.target.value })} className={FIELD}>
                <option value="">A new customer…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : null}
            {!f.counterpartyId && <input aria-label="New customer's name" value={f.customerName} onChange={(e) => put({ customerName: e.target.value })} placeholder="Lagoon View Resort" className={`${FIELD} ${customers.length ? "mt-2" : ""}`} />}
          </Field>
          <Field label="Dated">
            <input type="date" value={f.issueDate} onChange={(e) => put({ issueDate: e.target.value })} className={FIELD} />
          </Field>
          <Field label="Pay by (optional)">
            <input type="date" value={f.dueDate} onChange={(e) => put({ dueDate: e.target.value })} className={FIELD} />
          </Field>
        </div>
        <Field label="For (optional)">
          <input value={f.subject} onChange={(e) => put({ subject: e.target.value })} placeholder={retainer ? "Site supervision, October" : "Jetty repair, first stage"} className={FIELD} />
        </Field>
        <div className="grid gap-2">
          {f.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_80px_130px_auto] gap-2">
              <input aria-label={`Line ${i + 1}: what`} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="What for" className={FIELD} />
              <input aria-label={`Line ${i + 1}: how many`} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} inputMode="decimal" className={`${FIELD} tabular text-right`} />
              <input aria-label={`Line ${i + 1}: price`} value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} inputMode="decimal" placeholder="0.00" className={`${FIELD} tabular text-right`} />
              <Button type="button" variant="ghost" size="sm" onClick={() => put({ lines: f.lines.length === 1 ? [blankLine()] : f.lines.filter((_, j) => j !== i) })}>Remove</Button>
            </div>
          ))}
          <div>
            <Button type="button" variant="ghost" size="sm" onClick={() => put({ lines: [...f.lines, blankLine()] })}><Plus size={14} /> Another line</Button>
          </div>
        </div>
        {registered && (
          <Field label={tax} hint={`${tax} on a payment is due when it is paid, not when the tax invoice comes.`}>
            <select value={f.gstTreatment} onChange={(e) => put({ gstTreatment: e.target.value })} className={`${FIELD} sm:max-w-sm`}>
              <option value="exclusive">Added on top of these prices</option>
              <option value="inclusive">Included in these prices</option>
              <option value="zero_rated">Zero-rated</option>
              <option value="exempt">Exempt</option>
            </select>
          </Field>
        )}
      </div>
      {err && <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">{err}</p>}
      <div className="flex justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="accent" disabled={busy || !net || (!f.counterpartyId && !f.customerName.trim())}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          {!net ? "Add a price" : `Ask for ${two(net)}${registered && f.gstTreatment === "exclusive" ? ` and ${tax}` : ""}`}
        </Button>
      </div>
    </Modal>
  );
}

function Receive({ request, customers, payInto, onClose, onDone }) {
  const toast = useToast();
  const tax = useTax();
  const [f, setF] = useState({ amount: request ? String(Math.max(0, n(request.gross) - n(request.paid)).toFixed(2)) : "", receivedOn: today(), accountId: payInto[0]?.id || "", reference: "", counterpartyId: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await apiClient.post("/advances/receive", { ...f, requestId: request?.id || null, counterpartyId: request ? null : f.counterpartyId || null, reference: f.reference || null });
      onDone();
      toast.success(`${r.data.amount} received into ${r.data.into}`, n(r.data.tax) ? `Held for the customer, with ${r.data.tax} ${tax} owed from today. Entry ${r.data.entryNo}.` : `Held for the customer. Entry ${r.data.entryNo}.`);
      onClose();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} as="form" onSubmit={save} title={request ? `Paid against ${request.number}` : "Money paid in advance"} description={request ? `${request.customer} · ${request.gross} asked for, ${request.paid} paid so far.` : "For a customer with nothing asked for yet."}>
      <div className="grid sm:grid-cols-2 gap-4">
        {!request && (
          <Field label="From" className="sm:col-span-2">
            <select value={f.counterpartyId} onChange={set("counterpartyId")} className={FIELD}>
              <option value="">Which customer?</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="How much came in">
          <input value={f.amount} onChange={set("amount")} inputMode="decimal" className={`${FIELD} tabular`} autoFocus />
        </Field>
        <Field label="On">
          <input type="date" value={f.receivedOn} onChange={set("receivedOn")} className={FIELD} />
        </Field>
        <Field label="Into">
          <select value={f.accountId} onChange={set("accountId")} className={FIELD}>
            {payInto.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Reference (optional)">
          <input value={f.reference} onChange={set("reference")} placeholder="Transfer reference" className={FIELD} />
        </Field>
      </div>
      {err && <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">{err}</p>}
      <div className="flex justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="accent" disabled={busy || !n(f.amount) || !f.accountId || (!request && !f.counterpartyId)}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          {n(f.amount) ? `Received ${two(n(f.amount))}` : "Add the amount"}
        </Button>
      </div>
    </Modal>
  );
}

function UseAdvance({ advance, onClose, onDone }) {
  const toast = useToast();
  const tax = useTax();
  const { companyId } = useCompany();
  const { data, isLoading } = useQuery({ queryKey: ["advances", companyId, advance.id, "invoices"], queryFn: () => apiClient.get(`/advances/${advance.id}/invoices`).then((r) => r.data.invoices) });
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const chosen = data?.find((i) => i.id === pick);
  const amount = chosen ? Math.min(n(chosen.owed), n(advance.left)) : 0;
  async function use() {
    setBusy(true);
    try {
      const r = await apiClient.post(`/advances/${advance.id}/use`, { invoiceId: pick });
      onDone();
      toast.success(`${r.data.amount} of ${advance.customer}'s advance paid ${r.data.invoiceNo}`, `Entry ${r.data.entryNo}. Its ${tax} moved onto the invoice.`);
      onClose();
    } catch (ex) {
      toast.error("Not used", ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Use ${advance.customer}'s advance`} description={`${advance.left} left. It pays the invoice by that much, and the ${tax} paid with it moves onto the invoice.`}>
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : !data.length ? (
        <p className="text-[14px] text-[var(--ink-muted)]">{advance.customer} has no unpaid invoice in the books. Raise the invoice first, then come back.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] -mx-1" role="radiogroup" aria-label="Invoice">
          {data.map((i) => (
            <li key={i.id}>
              <label className="px-1 py-3 flex items-center gap-3 cursor-pointer">
                <input type="radio" name="inv" checked={pick === i.id} onChange={() => setPick(i.id)} />
                <span className="flex-1">
                  <span className="block text-[15px]">{i.number}</span>
                  <span className="block text-[12px] text-[var(--ink-muted)]">{formatDate(i.issued)}</span>
                </span>
                <span className="text-[14px] tabular"><Money amount={i.owed} /> <span className="text-[12px] text-[var(--ink-muted)]">owed</span></span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="accent" onClick={use} disabled={busy || !pick}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          {pick ? `Pay ${two(amount)} of ${chosen.number}` : "Pick an invoice"}
        </Button>
      </div>
    </Modal>
  );
}

function Refund({ advance, payInto, onClose, onDone }) {
  const toast = useToast();
  const tax = useTax();
  const [f, setF] = useState({ amount: advance.left.replace(/,/g, ""), on: today(), fromAccountId: payInto[0]?.id || "" });
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await apiClient.post(`/advances/${advance.id}/refund`, f);
      onDone();
      toast.success(`${r.data.amount} given back to ${advance.customer}`, `From ${r.data.from}, entry ${r.data.entryNo}. Its ${tax} comes off what you owe.`);
      onClose();
    } catch (ex) {
      toast.error("Not given back", ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} as="form" onSubmit={save} title={`Give ${advance.customer} their money back`} description={`${advance.left} is left of what they paid in advance.`}>
      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="How much">
          <input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} inputMode="decimal" className={`${FIELD} tabular`} />
        </Field>
        <Field label="From">
          <select value={f.fromAccountId} onChange={(e) => setF({ ...f, fromAccountId: e.target.value })} className={FIELD}>
            {payInto.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="On">
          <input type="date" value={f.on} onChange={(e) => setF({ ...f, on: e.target.value })} className={FIELD} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="outline" className="border-[var(--danger)] text-[var(--danger)]" disabled={busy || !n(f.amount)}>
          {busy && <Loader2 size={14} className="animate-spin" />} Give back {two(n(f.amount))}
        </Button>
      </div>
    </Modal>
  );
}
