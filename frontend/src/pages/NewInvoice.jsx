import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Package, Plus, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { FittedPaper } from "@/components/documents/DocumentPaper";
import { useDesign } from "@/hooks/useDesign";
import { compose } from "@/lib/documents";
import { cn } from "@/lib/utils";
import { salesApi } from "@/api/sales";
import { taxApi } from "@/api/tax";
import { useSalesMutations } from "@/hooks/useSales";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { TagPicker } from "@/components/ui/TagPicker";
import { toDateInput } from "@/lib/utils";
import { apiClient } from "@/api/client";
import { PendingAttachments, uploadPending } from "@/components/documents/Attachments";
import { UnitInput } from "@/components/ui/UnitInput";
import { ItemPicker, PartyPicker, Step, TermsPicker, dueFrom, termsLabel } from "@/components/forms/Pickers";
import { Modal } from "@/components/ui/Modal";
import { usePhone } from "@/lib/phone";

/**
 * Raising an invoice.
 *
 * Shaped after how Maldivian contractors invoice: a customer, their purchase order, a subject line
 * saying which period it covers, and lines priced by quantity and rate — an
 * excavator at 3,000 a day for thirty days. The number continues the company's
 * own run and can be changed, because an invoice number is printed on a
 * document the customer already has in their system.
 *
 * The invoice is drawn beside the form as it is filled in, with the
 * company's own brand and template: what is seen is what is sent.
 *
 * Saving records it and nothing more. It goes into the books as a separate,
 * deliberate step: until it is sent, correcting it costs nothing.
 *
 * The totals shown here are a preview worked out the same way the server
 * works them out — per line, then added — but the figures that count are the
 * ones the server returns. The button carries the total, because a button
 * that says only "Save" asks somebody to commit to a word.
 */

const FIELD =
  "w-full h-11 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15";

const TAX = [
  {
    value: "exclusive",
    label: "Added on top",
    hint: "GST on top of the line totals. How most invoices here are written.",
  },
  {
    value: "inclusive",
    label: "Included in the price",
    hint: "The figures already have GST in them.",
  },
  {
    value: "zero_rated",
    label: "Zero-rated",
    hint: "Taxable at 0%. Reported on the return, but nothing is owed.",
  },
  { value: "exempt", label: "Exempt", hint: "Outside GST altogether." },
];

function today(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return toDateInput(d);
}

const blankLine = () => ({
  description: "",
  quantity: "1",
  uom: "",
  rate: "",
  itemId: "",
});

/** Whole laari from what was typed, never through a floating-point sum. */
function laari(text) {
  const clean = String(text || "")
    .replace(/,/g, "")
    .trim();
  if (!/^\d*(\.\d{0,2})?$/.test(clean) || clean === "" || clean === ".")
    return null;
  const [whole, fraction = ""] = clean.split(".");
  return Number(whole || "0") * 100 + Number((fraction + "00").slice(0, 2));
}

function show(l) {
  const sign = l < 0 ? "-" : "";
  const abs = Math.abs(l);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  return `${sign}${whole}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * The same split the server makes, line by line, so the preview agrees. The
 * rate is the one in force on the invoice date, from the tax engine; the
 * server looks it up again and keeps it on the invoice.
 */
function split(lineLaari, treatment, bp) {
  if (treatment === "exclusive") {
    const tax = Math.round((lineLaari * bp) / 10000);
    return { net: lineLaari, tax };
  }
  if (treatment === "inclusive") {
    const tax = Math.round((lineLaari * bp) / (10000 + bp));
    return { net: lineLaari - tax, tax };
  }
  return { net: lineLaari, tax: 0 };
}

export default function NewInvoice() {
  const open = true;
  const navigate = useNavigate();
  // Opened from a customer's page: their name is already filled in.
  const [params] = useSearchParams();
  const { companyId, can } = useCompany();
  const design = useDesign("invoice");
  const [view, setView] = useState("form");
  const toast = useToast();
  const { raise } = useSalesMutations();
  // Who, then what, then on which terms: each answer moves on to the next question.
  const [party, setParty] = useState(null);
  // The guided way through: customer, items one at a time, GST, terms, the
  // rest, then the invoice itself. Closing any step leaves the page form, with
  // everything so far kept, to finish by hand.
  const [flow, setFlow] = useState(params.get("customer") ? null : "who");
  const phone = usePhone();
  const [terms, setTerms] = useState(null);
  const [keepTerms, setKeepTerms] = useState(false);
  const firstLine = useRef(null);
  const go = (id) => setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
  const { data: contactList } = useQuery({ queryKey: ["contacts", companyId], queryFn: () => apiClient.get("/contacts").then((r) => r.data), enabled: Boolean(companyId) });
  // Opened from a customer's page: that customer, with their usual terms.
  useEffect(() => {
    const name = params.get("customer");
    if (!name || party || !contactList) return;
    const c = contactList.contacts.find((x) => x.name.toLowerCase() === name.toLowerCase());
    choose(c ? { id: c.id, name: c.name, termsDays: c.termsDays ?? null, email: c.email } : { id: null, name, termsDays: null }, false);
    setFlow("items");
  }, [contactList]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fresh every time it opens: the page remounts it with a new key, so there
  // is no reset step and no moment where the last invoice's figures show.
  const [files, setFiles] = useState([]);
  const [shareFiles, setShareFiles] = useState(false);
  // A cash sale: paid as it is made. The invoice goes into the books and the
  // money is recorded against it in the same step.
  const [paid, setPaid] = useState(false);
  const [paidInto, setPaidInto] = useState("");
  const { data: moneyAccounts = [] } = useQuery({ queryKey: ["money-accounts", companyId], queryFn: salesApi.moneyAccounts, enabled: Boolean(companyId) && can("record") });
  const [form, setForm] = useState(() => ({
    customerName: params.get("customer") || "",
    // null until somebody types one, so the suggested number fills it without
    // being copied into state — and a number they typed is never overwritten.
    invoiceNo: null,
    purchaseOrder: "",
    discount: "",
    subject: "",
    issueDate: today(),
    dueDate: "",
    notes: "",
    gstTreatment: "exclusive",
    tags: { projectId: null, dimensionIds: [] },
    currency: "", // our own
    fxRate: "",
  }));
  const [lines, setLines] = useState([blankLine()]);
  const [err, setErr] = useState("");

  // Never a cached number: a stale one is a number somebody else may already
  // have used, and the save would be refused over it.
  const { data: suggested } = useQuery({
    queryKey: ["sales-next", companyId],
    queryFn: salesApi.nextNumber,
    enabled: Boolean(companyId) && open,
    staleTime: 0,
    gcTime: 0,
  });

  const invoiceNo = form.invoiceNo ?? suggested ?? "";

  const { data: taxNow } = useQuery({
    queryKey: ["tax", companyId, form.issueDate],
    queryFn: () => taxApi.overview(form.issueDate),
    enabled: Boolean(companyId) && open && Boolean(form.issueDate),
  });
  const rateBp =
    taxNow?.rates.find((r) => r.code === taxNow.defaultRate)?.bp ?? null;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setLine = (i, key) => (e) =>
    setLines((all) =>
      all.map((l, j) => (j === i ? { ...l, [key]: e.target.value } : l)),
    );

  // A line can sell a saved item, product or service: picking one fills in its
  // name, unit and price. A counted product leaves stock at its average cost.
  const { data: stockItems } = useQuery({
    queryKey: ["stock", companyId],
    // The same cache as the Stock page, so the same shape: the items are picked out here.
    queryFn: () => apiClient.get("/stock").then((r) => r.data),
    select: (d) => d.items,
    enabled: Boolean(companyId) && open,
  });
  const forSale = (stockItems || []).filter((i) => !i.archived && i.sells !== false);
  function choose(p, advance = true) {
    setParty(p);
    setForm((x) => ({ ...x, customerName: p.name, ...(p.termsDays != null ? { dueDate: dueFrom(x.issueDate, p.termsDays) } : {}) }));
    if (p.termsDays != null) setTerms(p.termsDays);
    setKeepTerms(false);
    if (!advance) return;
    go("step-what");
    setFlow("items");
  }
  function addLine(item, { quantity, uom, rate }) {
    setLines((all) => [...all.filter((l) => l.description.trim() || l.rate), { ...blankLine(), itemId: item.id, description: item.name, quantity, uom, rate }]);
  }
  const setIssued = (e) => {
    const issueDate = e.target.value;
    setForm((x) => ({ ...x, issueDate, dueDate: terms != null && terms !== "date" ? dueFrom(issueDate, terms) || x.dueDate : x.dueDate }));
  };

  const discountPct = Math.min(100, Math.max(0, Number(String(form.discount || "").replace(/[,%]/g, "")) || 0));
  const priced = lines.map((l) => {
    const rate = laari(l.rate);
    const qty = Number(String(l.quantity).replace(/,/g, ""));
    const before = rate !== null && qty > 0 ? Math.round(rate * qty) : null;
    // The discount comes off each line before GST, as the server does it.
    const amount = before !== null && discountPct > 0 ? before - Math.round((before * Math.round(discountPct * 100)) / 10000) : before;
    return { ...l, amount };
  });
  const usable = priced.filter((l) => l.amount && l.amount > 0);
  const totals = usable.reduce(
    (t, l) => {
      const s = split(l.amount, form.gstTreatment, rateBp ?? 0);
      return { net: t.net + s.net, tax: t.tax + s.tax };
    },
    { net: 0, tax: 0 },
  );
  const gross = totals.net + totals.tax;

  const unit = form.currency || "MVR";
  const rateOk =
    !form.currency || Number(String(form.fxRate).replace(/,/g, "")) > 0;
  const commitment = !form.customerName.trim()
    ? "Who is it for?"
    : usable.length === 0
      ? "Add a line with a rate"
      : !form.dueDate
        ? "On which terms?"
        : !rateOk
        ? `At what rate? MVR for one ${form.currency}`
        : `Save ${invoiceNo || "invoice"} · ${unit} ${show(gross)}`;
  const ready = form.customerName.trim() && usable.length > 0 && form.dueDate && rateOk;
  const at = !form.customerName.trim() ? 1 : !usable.length ? 2 : !form.dueDate ? 3 : 4;

  function onSubmit(e) {
    e.preventDefault();
    save();
  }

  async function save() {
    setErr("");
    if (!ready) return setErr(commitment);

    try {
      const result = await raise.mutateAsync({
        clientRef: crypto.randomUUID(),
        customerName: form.customerName.trim(),
        counterpartyId: party?.id || null,
        notes: form.notes.trim() || null,
        invoiceNo: invoiceNo.trim() || null,
        purchaseOrder: form.purchaseOrder.trim() || null,
        subject: form.subject.trim() || null,
        issueDate: form.issueDate || null,
        dueDate: form.dueDate || null,
        gstTreatment: form.gstTreatment,
        currency: form.currency || null,
        fxRate: form.currency ? String(form.fxRate).trim() : null,
        projectId: form.tags.projectId || null,
        dimensionIds: form.tags.dimensionIds.length
          ? form.tags.dimensionIds
          : null,
        lines: usable.map((l) => ({
          description: l.description.trim(),
          quantity: Number(String(l.quantity).replace(/,/g, "")),
          uom: l.uom.trim() || null,
          unitPrice: show(laari(l.rate)).replace(/,/g, ""),
          discountPercent: discountPct || null,
          itemId: l.itemId || null,
        })),
      });
      if (keepTerms && party?.id && typeof terms === "number") await apiClient.patch(`/contacts/${party.id}`, { paymentTermsDays: terms }).catch(() => {});
      toast.success(
        `${result.invoice.invoiceNo} saved · MVR ${result.invoice.gross}`,
        result.matchedTo
          ? // A close name was taken as an existing customer. Right for a
            // shortened name, wrong for two different bodies whose names
            // overlap — so it is said, never silent.
            `Filed under ${result.matchedTo}, an existing customer with a similar name. If that is a different company, discard this draft and raise it again.`
          : form.purchaseOrder.trim()
            ? "Put it in the books when it goes to the customer."
            : "It has no purchase order. Their accounts department may not be able to match it.",
      );
      if (paid && paidInto && !form.currency) {
        try {
          const posted = await salesApi.post(result.invoice.id);
          // The invoice's own total: the entry's can be larger when stock leaves at cost in the same entry.
          const total = String(result.invoice.gross || posted.total || "").replace(/,/g, "");
          await salesApi.receive({ counterpartyId: posted.counterpartyId || null, amount: total, accountId: paidInto, receivedOn: form.issueDate || null, reference: `Paid on ${result.invoice.invoiceNo}`, allocations: [{ invoiceId: result.invoice.id, amount: total }] });
          toast.success(`${result.invoice.invoiceNo} is in the books and paid`, `MVR ${result.invoice.gross || posted.total} received into ${moneyAccounts.find((a) => a.id === paidInto)?.name || "the account"}.`);
        } catch (ex) {
          toast.error("Saved, but not marked paid", ex.message);
        }
      }
      // What was attached while writing it goes on with it.
      if (files.length && (await uploadPending("invoice", result.invoice.id, files, shareFiles))) toast.error("Some attachments did not go on", "Add them on the invoice's page.");
      navigate(`/documents/invoice/${result.invoice.id}`);
    } catch (ex) {
      setErr(ex.message || "The invoice could not be saved.");
    }
  }

  const fx = Number(String(form.fxRate).replace(/,/g, ""));
  const model = design.data
    ? compose({
        brand: design.data.brand,
        template: design.data.template,
        data: {
          kind: "invoice",
          number: invoiceNo || "INV-",
          status: "draft",
          issued: form.issueDate,
          due: form.dueDate,
          reference: form.purchaseOrder.trim(),
          subject: form.subject.trim(),
          notes: form.notes.trim() || null,
          project: null,
          to: { name: form.customerName.trim() || "Who is it for?" },
          currency: form.currency || null,
          fxRate: form.currency && fx > 0 ? String(fx) : null,
          gstTreatment: form.gstTreatment,
          gstRatePercent: rateBp === null ? null : rateBp / 100,
          lines: (usable.length
            ? usable
            : [
                {
                  description: "Add a line with a rate",
                  quantity: "",
                  uom: "",
                  rate: "",
                  amount: null,
                },
              ]
          ).map((l) => ({
            code: null,
            description: discountPct && l.amount ? `${l.description.trim()} (less ${discountPct}%)` : l.description.trim(),
            quantity: String(l.quantity),
            unit: l.uom.trim(),
            rate: laari(l.rate) !== null ? show(laari(l.rate)) : "",
            amount: l.amount ? show(l.amount) : "",
          })),
          totals: {
            net: show(totals.net),
            tax: show(totals.tax),
            gross: show(gross),
            ...(form.currency && fx > 0
              ? {
                  taxInBase: show(Math.round(totals.tax * fx)),
                  grossInBase: show(Math.round(gross * fx)),
                }
              : {}),
          },
        },
      })
    : null;

  return (
    <form onSubmit={onSubmit}>
      <PageHeader
        title="New invoice"
        description="Drawn beside you as you fill it in. Saved as a draft; it goes into the books when you say so."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/invoices")}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={ready ? "accent" : "outline"}
              disabled={raise.isPending}
              data-testid="save-invoice"
            >
              {raise.isPending && (
                <Loader2 size={14} className="animate-spin" />
              )}
              {commitment}
            </Button>
          </>
        }
      />
      <div className="lg:hidden flex gap-1 p-1 rounded-full bg-[var(--surface-2)] mb-4 w-fit">
        {["form", "preview"].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={cn(
              "h-9 px-5 rounded-full text-[14px] font-medium capitalize",
              view === v
                ? "bg-[var(--surface)] shadow-sm text-[var(--ink)]"
                : "text-[var(--ink-muted)]",
            )}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-start">
        <div className={cn("grid gap-4 min-w-0", view === "preview" && "hidden lg:grid")}>
          <FromWords
            onFill={(r) => {
              setForm((x) => ({
                ...x,
                customerName: r.customerName || x.customerName,
                subject: r.subject || x.subject,
                purchaseOrder: r.purchaseOrder || x.purchaseOrder,
                dueDate: r.dueDate || x.dueDate,
                gstTreatment: r.gstTreatment || x.gstTreatment,
              }));
              if (r.customerName) setParty({ id: null, name: r.customerName, termsDays: null });
              if (r.dueDate) setTerms("date");
              if (r.lines?.length) setLines(r.lines.map((l) => ({ ...blankLine(), ...l })));
            }}
          />

          <Step n={1} id="step-who" title="Who is it for?" done={at > 1} active={at === 1}>
            <PartyPicker kind="customer" value={party} onChange={(p) => choose(p)} open={flow === "who"} setOpen={(v) => setFlow((f) => (v ? "who" : f === "who" ? null : f))} />
          </Step>

          <Step n={2} id="step-what" title="Which items or services?" done={at > 2} active={at === 2} summary={usable.length ? `${usable.length} ${usable.length === 1 ? "line" : "lines"} · ${unit} ${show(gross)}` : null}>
            <div className="space-y-2">
              {priced.map((line, i) => (
                // Phone: what it is, then quantity, unit and rate, then the amount. Wider: two rows.
                <div key={i} className="grid grid-cols-6 sm:grid-cols-[64px_72px_minmax(0,1fr)_minmax(0,1fr)_40px] gap-2 items-center rounded-xl border border-[var(--border)] p-2">
                  <input ref={i === 0 ? firstLine : undefined} aria-label={`Line ${i + 1}: what it is`} value={line.description} onChange={setLine(i, "description")} placeholder="Excavator rental, Komatsu PC 56-7" className={`${FIELD} col-span-6 sm:col-span-5`} />
                  <input aria-label={`Line ${i + 1}: quantity`} value={line.quantity} onChange={setLine(i, "quantity")} inputMode="decimal" placeholder="Qty" className={`${FIELD} col-span-2 sm:col-span-1 tabular text-right px-2 sm:px-3`} />
                  <UnitInput label={`Line ${i + 1}: unit`} value={line.uom} onChange={(v) => setLine(i, "uom")({ target: { value: v } })} placeholder="day" className={`${FIELD} col-span-2 sm:col-span-1 px-2 sm:px-3`} />
                  <input aria-label={`Line ${i + 1}: rate`} value={line.rate} onChange={setLine(i, "rate")} inputMode="decimal" placeholder="Rate" className={`${FIELD} col-span-2 sm:col-span-1 tabular text-right px-2 sm:px-3`} />
                  <span className="col-span-5 sm:col-span-1 tabular text-[15px] text-right text-[var(--ink)] pr-1">{line.amount ? show(line.amount) : "—"}</span>
                  <button type="button" onClick={() => setLines((all) => (all.length > 1 ? all.filter((_, j) => j !== i) : all))} disabled={lines.length === 1} aria-label={`Remove line ${i + 1}`} className="h-11 w-11 justify-self-end rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)] disabled:opacity-30">
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setFlow("items")} data-testid="add-item">
                <Package size={16} /> Find or add an item
              </Button>
              <Button type="button" variant="ghost" onClick={() => setLines((all) => [...all, blankLine()])}>
                <Plus size={16} /> A line
              </Button>
              <Button type="button" variant="ghost" onClick={() => setLines((all) => [...all.filter((l) => l.description.trim() || l.rate), { ...blankLine(), description: "Delivery", uom: "trip" }])}>
                <Plus size={16} /> Delivery
              </Button>
              <label className="ml-auto flex items-center gap-2 text-[14px]">
                Discount
                <span className="relative">
                  <input aria-label="Discount, percent" value={form.discount} onChange={set("discount")} inputMode="decimal" placeholder="0" className={`${FIELD} w-20 pr-7 tabular text-right`} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none">%</span>
                </span>
              </label>
            </div>

            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <div role="radiogroup" aria-label="GST" className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-medium mr-1">GST</span>
                {TAX.map((c) => (
                  <button key={c.value} type="button" role="radio" aria-checked={form.gstTreatment === c.value} onClick={() => setForm((x) => ({ ...x, gstTreatment: c.value }))} className={cn("h-9 px-3.5 rounded-full border text-[13px] whitespace-nowrap", form.gstTreatment === c.value ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-semibold" : "border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)]")}>
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[13px] text-[var(--ink-muted)]">{TAX.find((c) => c.value === form.gstTreatment)?.hint}</p>
            </div>

            <dl className="mt-3 ml-auto w-full sm:w-[300px] text-[15px] tabular">
              <div className="flex justify-between py-1.5">
                <dt className="text-[var(--ink-muted)]">Before GST</dt>
                <dd>{show(totals.net)}</dd>
              </div>
              <div className="flex justify-between py-1.5">
                <dt className="text-[var(--ink-muted)]">GST {rateBp === null ? "…" : `${rateBp / 100}%`}</dt>
                <dd>{show(totals.tax)}</dd>
              </div>
              <div className="flex justify-between py-2 border-t border-[var(--ink)] font-semibold">
                <dt>Total</dt>
                <dd>{unit} {show(gross)}</dd>
              </div>
            </dl>
          </Step>

          <Step n={3} id="step-terms" title="On which terms?" done={at > 3} active={at === 3} summary={form.dueDate ? `${typeof terms === "number" ? termsLabel(terms) : terms === "eom" ? "End of month" : "Due"} · ${form.dueDate}` : null}>
            <div className="grid gap-4">
              <Field label="Issued" htmlFor="inv-issued">
                <input id="inv-issued" type="date" value={form.issueDate} onChange={setIssued} className={`${FIELD} tabular max-w-[220px]`} />
              </Field>
              <TermsPicker
                issued={form.issueDate}
                terms={terms}
                due={form.dueDate}
                party={party}
                keep={keepTerms}
                onKeep={can("record") ? setKeepTerms : null}
                onChange={({ terms: t, due }) => (setTerms(t), setForm((x) => ({ ...x, dueDate: due || "" })))}
              />
            </div>
          </Step>

          <Step n={4} id="step-more" title="Notes and details" active={at === 4}>
            <div className="grid gap-4">
              <Field label="A note to the customer" htmlFor="inv-notes" hint="Printed on this invoice, above your usual notes.">
                <textarea id="inv-notes" value={form.notes} onChange={set("notes")} rows={3} maxLength={2000} placeholder="Thank you for the work on the Hulhumalé site." className={`${FIELD} h-auto py-3 leading-relaxed`} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Their purchase order" htmlFor="inv-po" hint="Their accounts department matches on it.">
                  <input id="inv-po" value={form.purchaseOrder} onChange={set("purchaseOrder")} placeholder="PO-RDC-2026-003151" className={`${FIELD} tabular`} />
                </Field>
                <Field label="What it covers" htmlFor="inv-subject">
                  <input id="inv-subject" value={form.subject} onChange={set("subject")} placeholder="September 2026, 30 days" className={FIELD} />
                </Field>
                <Field label="Invoice number" htmlFor="inv-no">
                  <input id="inv-no" value={invoiceNo} onChange={set("invoiceNo")} placeholder="INV-000001" className={`${FIELD} tabular`} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="In" htmlFor="inv-currency">
                    <select id="inv-currency" value={form.currency} onChange={(e) => setForm((x) => ({ ...x, currency: e.target.value, fxRate: "" }))} className={FIELD}>
                      <option value="">MVR</option>
                      {["USD", "EUR", "GBP", "AED", "INR", "CNY", "SGD", "JPY"].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  {form.currency && (
                    <Field label={`MVR for 1 ${form.currency}`} htmlFor="inv-rate" hint={gross > 0 && Number(form.fxRate) > 0 ? `MVR ${show(Math.round(gross * Number(form.fxRate)))} in the books.` : "The rate on the invoice date."}>
                      <input id="inv-rate" value={form.fxRate} onChange={set("fxRate")} inputMode="decimal" placeholder="15.42" className={`${FIELD} tabular`} />
                    </Field>
                  )}
                </div>
                <TagPicker value={form.tags} onChange={(tags) => setForm((x) => ({ ...x, tags }))} fieldClass={FIELD} className="sm:col-span-2" />
              </div>
              {!form.currency && can("record") && moneyAccounts.length > 0 && (
                <div className="rounded-2xl border border-[var(--border)] p-4 grid gap-3" data-testid="paid-now">
                  <div role="radiogroup" aria-label="Has it been paid?" className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-medium mr-1">Paid already?</span>
                    {[[false, "No, on credit"], [true, "Yes, paid now"]].map(([v, label]) => (
                      <button key={label} type="button" role="radio" aria-checked={paid === v} onClick={() => (setPaid(v), v && !paidInto && setPaidInto(moneyAccounts[0].id))} className={`h-10 px-4 rounded-full border text-[14px] ${paid === v ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-semibold" : "border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {paid && (
                    <label className="grid gap-1.5 sm:max-w-sm">
                      <span className="text-[13px] font-medium">Received into</span>
                      <select value={paidInto} onChange={(e) => setPaidInto(e.target.value)} className={FIELD}>
                        {moneyAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                      <span className="text-[12px] text-[var(--ink-muted)]">Saving puts it in the books and records the money, dated the invoice day.</span>
                    </label>
                  )}
                </div>
              )}
              <PendingAttachments files={files} onChange={setFiles} share={shareFiles} onShare={setShareFiles} />

              {err && (
                <p role="alert" className="text-[13px] text-[var(--danger)]">
                  {err}
                </p>
              )}
            </div>
          </Step>
        </div>

        <div
          className={cn(
            "lg:sticky lg:top-4 min-w-0",
            view === "form" && "hidden lg:block",
          )}
        >
          <div
            className="rounded-2xl bg-[var(--surface-2)] p-3 sm:p-4 lg:max-h-[calc(100vh-120px)] overflow-auto"
            data-testid="invoice-preview"
          >
            {model && <FittedPaper model={model} />}
          </div>
        </div>
      </div>

      <ItemPicker
        open={flow === "items"}
        setOpen={(v) => setFlow((f) => (v ? "items" : f === "items" ? null : f))}
        items={forSale}
        onAdd={addLine}
        basket={
          usable.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[var(--border)]" data-testid="basket">
              <ul className="grid gap-1 max-h-[22dvh] overflow-y-auto">
                {priced.map((l, i) =>
                  l.amount ? (
                    <li key={i} className="flex items-center gap-2 text-[14px]">
                      <span className="min-w-0 flex-1 truncate">
                        {l.description} <span className="text-[var(--ink-muted)] tabular">· {l.quantity} {l.uom} × {show(laari(l.rate))}</span>
                      </span>
                      <span className="tabular">{show(l.amount)}</span>
                      <button type="button" onClick={() => setLines((all) => (all.length > 1 ? all.filter((_, j) => j !== i) : [blankLine()]))} aria-label={`Take ${l.description} off`} className="h-8 w-8 shrink-0 rounded-full grid place-items-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)]">
                        <X size={14} />
                      </button>
                    </li>
                  ) : null
                )}
              </ul>
              <Button type="button" variant="accent" className="w-full mt-3" onClick={() => setFlow("tax")} data-testid="flow-next">
                {usable.length} {usable.length === 1 ? "item" : "items"} · {unit} {show(totals.net)} · Next: GST
              </Button>
            </div>
          )
        }
      />

      <Modal open={flow === "tax"} onClose={() => setFlow(null)} title="How is GST charged?" variant={phone ? "sheet" : "card"}>
        <div role="radiogroup" aria-label="GST" className="grid gap-2">
          {TAX.map((c) => (
            <button key={c.value} type="button" role="radio" aria-checked={form.gstTreatment === c.value} onClick={() => setForm((x) => ({ ...x, gstTreatment: c.value }))}
              className={cn("rounded-2xl border p-3 text-left", form.gstTreatment === c.value ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--border)] hover:border-[var(--ink)]")}>
              <span className="block text-[15px] font-semibold">{c.label}</span>
              <span className={cn("block text-[13px]", form.gstTreatment === c.value ? "opacity-75" : "text-[var(--ink-muted)]")}>{c.hint}</span>
            </button>
          ))}
        </div>
        <label className="mt-4 flex items-center justify-between gap-3 text-[14px] font-medium">
          Discount on every line
          <span className="relative">
            <input aria-label="Discount, percent" value={form.discount} onChange={set("discount")} inputMode="decimal" placeholder="0" className={`${FIELD} w-24 pr-7 tabular text-right`} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none">%</span>
          </span>
        </label>
        <dl className="mt-4 text-[15px] tabular">
          <div className="flex justify-between py-1">
            <dt className="text-[var(--ink-muted)]">Before GST</dt>
            <dd>{show(totals.net)}</dd>
          </div>
          <div className="flex justify-between py-1">
            <dt className="text-[var(--ink-muted)]">GST {rateBp === null ? "…" : `${rateBp / 100}%`}</dt>
            <dd>{show(totals.tax)}</dd>
          </div>
          <div className="flex justify-between py-2 border-t border-[var(--ink)] font-semibold">
            <dt>Total</dt>
            <dd>{unit} {show(gross)}</dd>
          </div>
        </dl>
        <FlowButtons back={() => setFlow("items")} next={() => setFlow("terms")} label="Next: terms" />
      </Modal>

      <Modal open={flow === "terms"} onClose={() => setFlow(null)} title="When is it due?" variant={phone ? "sheet" : "card"}>
        <TermsPicker
          issued={form.issueDate}
          terms={terms}
          due={form.dueDate}
          party={party}
          keep={keepTerms}
          onKeep={can("record") ? setKeepTerms : null}
          onChange={({ terms: t, due }) => (setTerms(t), setForm((x) => ({ ...x, dueDate: due || "" })))}
        />
        <FlowButtons back={() => setFlow("tax")} next={() => setFlow("more")} label="Next" disabled={!form.dueDate} />
      </Modal>

      <Modal open={flow === "more"} onClose={() => setFlow(null)} title="Anything else on it?" description="All of it can be left empty." variant={phone ? "sheet" : "card"}>
        <div className="grid gap-4">
          <Field label="Their purchase order" htmlFor="flow-po">
            <input id="flow-po" value={form.purchaseOrder} onChange={set("purchaseOrder")} placeholder="PO-RDC-2026-003151" className={`${FIELD} tabular`} />
          </Field>
          <Field label="What it covers" htmlFor="flow-subject">
            <input id="flow-subject" value={form.subject} onChange={set("subject")} placeholder="September 2026, 30 days" className={FIELD} />
          </Field>
          <Field label="A note to the customer" htmlFor="flow-notes">
            <textarea id="flow-notes" value={form.notes} onChange={set("notes")} rows={2} maxLength={2000} className={`${FIELD} h-auto py-3 leading-relaxed`} />
          </Field>
          {!form.currency && can("record") && moneyAccounts.length > 0 && (
            <div role="radiogroup" aria-label="Has it been paid?" className="grid grid-cols-2 gap-2">
              {[[false, "On credit"], [true, "Paid now"]].map(([v, label]) => (
                <button key={label} type="button" role="radio" aria-checked={paid === v} onClick={() => (setPaid(v), v && !paidInto && setPaidInto(moneyAccounts[0].id))} className={cn("h-11 rounded-full border text-[14px]", paid === v ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-semibold" : "border-[var(--border)] text-[var(--ink-muted)]")}>
                  {label}
                </button>
              ))}
              {paid && (
                <select aria-label="Received into" value={paidInto} onChange={(e) => setPaidInto(e.target.value)} className={`${FIELD} col-span-2`}>
                  {moneyAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          {err && (
            <p role="alert" className="text-[13px] text-[var(--danger)]">
              {err}
            </p>
          )}
        </div>
        <FlowButtons back={() => setFlow("terms")} next={save} busy={raise.isPending} label={ready ? `Create invoice · ${unit} ${show(gross)}` : commitment} disabled={!ready} testid="flow-create" />
      </Modal>
    </form>
  );
}

/** Back and on, at the foot of each step of the guided way through. */
function FlowButtons({ back, next, label, disabled, busy, testid = "flow-next" }) {
  return (
    <div className="flex gap-2 justify-end mt-5">
      <Button type="button" variant="outline" onClick={back}>
        Back
      </Button>
      <Button type="button" variant="accent" onClick={next} disabled={disabled || busy} data-testid={testid}>
        {busy && <Loader2 size={14} className="animate-spin" />}
        {label}
      </Button>
    </div>
  );
}


function Field({ label, htmlFor, hint, children }) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-[var(--ink)] mb-1.5 block"
      >
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[13px] text-[var(--ink-muted)] mt-1.5 leading-snug">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Say the invoice in a sentence and the form fills itself (POST /sales/from-words).
 * Only what was said is filled; nothing is saved until the person saves it.
 */
function FromWords({ onFill }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function go() {
    setBusy(true);
    try {
      const r = await apiClient.post("/sales/from-words", { text });
      onFill(r.data);
      toast.success("Filled in", "Check each field against what you meant before saving.");
    } catch (err) {
      toast.error("Not filled", err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-xl bg-[var(--surface-2)] p-3" data-testid="from-words">
      <label htmlFor="inv-words" className="block text-[13px] font-medium">Say it in a sentence</label>
      <div className="mt-1.5 flex gap-2">
        <input
          id="inv-words"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), text.trim().length > 4 && go())}
          placeholder="22 days excavator hire to Blue Lagoon at 3,000 a day, plus GST, due in 30 days"
          className="flex-1 min-w-0 h-10 px-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[14px] outline-none focus:border-[var(--ink)]"
        />
        <Button type="button" variant="outline" onClick={go} disabled={busy || text.trim().length < 5}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : null} Fill it in
        </Button>
      </div>
    </div>
  );
}
