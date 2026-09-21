import { useRef, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { salesApi } from "@/api/sales";
import { useSalesMutations } from "@/hooks/useSales";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";

/**
 * Raising an invoice.
 *
 * Shaped after Altura's own: a customer, their purchase order, a subject line
 * saying which period it covers, and lines priced by quantity and rate — an
 * excavator at 3,000 a day for thirty days. The number continues the company's
 * own run and can be changed, because an invoice number is printed on a
 * document the customer already has in their system.
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
  { value: "exclusive", label: "Added on top", hint: "8% on top of the line totals. How Altura's invoices are written." },
  { value: "inclusive", label: "Included in the price", hint: "The figures already have GST in them." },
  { value: "zero_rated", label: "Zero-rated", hint: "Taxable at 0%. Reported on the return, but nothing is owed." },
  { value: "exempt", label: "Exempt", hint: "Outside GST altogether." },
];

const RATE = 8;

function today(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const blankLine = () => ({ description: "", quantity: "1", uom: "", rate: "" });

/** Whole laari from what was typed, never through a floating-point sum. */
function laari(text) {
  const clean = String(text || "").replace(/,/g, "").trim();
  if (!/^\d*(\.\d{0,2})?$/.test(clean) || clean === "" || clean === ".") return null;
  const [whole, fraction = ""] = clean.split(".");
  return Number(whole || "0") * 100 + Number((fraction + "00").slice(0, 2));
}

function show(l) {
  const sign = l < 0 ? "-" : "";
  const abs = Math.abs(l);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  return `${sign}${whole}.${String(abs % 100).padStart(2, "0")}`;
}

/** The same split the server makes, line by line, so the preview agrees. */
function split(lineLaari, treatment) {
  if (treatment === "exclusive") {
    const tax = Math.round((lineLaari * RATE) / 100);
    return { net: lineLaari, tax };
  }
  if (treatment === "inclusive") {
    const tax = Math.round((lineLaari * RATE) / (100 + RATE));
    return { net: lineLaari - tax, tax };
  }
  return { net: lineLaari, tax: 0 };
}

export function RaiseInvoice({ open, onClose, onRaised }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const { raise } = useSalesMutations();
  const firstField = useRef(null);

  // Fresh every time it opens: the page remounts it with a new key, so there
  // is no reset step and no moment where the last invoice's figures show.
  const [form, setForm] = useState(() => ({
    customerName: "",
    // null until somebody types one, so the suggested number fills it without
    // being copied into state — and a number they typed is never overwritten.
    invoiceNo: null,
    purchaseOrder: "",
    subject: "",
    issueDate: today(),
    dueDate: today(30),
    gstTreatment: "exclusive",
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

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setLine = (i, key) => (e) =>
    setLines((all) => all.map((l, j) => (j === i ? { ...l, [key]: e.target.value } : l)));

  const priced = lines.map((l) => {
    const rate = laari(l.rate);
    const qty = Number(String(l.quantity).replace(/,/g, ""));
    const amount = rate !== null && qty > 0 ? Math.round(rate * qty) : null;
    return { ...l, amount };
  });
  const usable = priced.filter((l) => l.amount && l.amount > 0);
  const totals = usable.reduce(
    (t, l) => {
      const s = split(l.amount, form.gstTreatment);
      return { net: t.net + s.net, tax: t.tax + s.tax };
    },
    { net: 0, tax: 0 }
  );
  const gross = totals.net + totals.tax;

  const commitment = !form.customerName.trim()
    ? "Who is it to?"
    : usable.length === 0
      ? "Add a line with a rate"
      : `Save ${invoiceNo || "invoice"} · MVR ${show(gross)}`;
  const ready = form.customerName.trim() && usable.length > 0;

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (!ready) return setErr(commitment);

    try {
      const result = await raise.mutateAsync({
        clientRef: crypto.randomUUID(),
        customerName: form.customerName.trim(),
        invoiceNo: invoiceNo.trim() || null,
        purchaseOrder: form.purchaseOrder.trim() || null,
        subject: form.subject.trim() || null,
        issueDate: form.issueDate || null,
        dueDate: form.dueDate || null,
        gstTreatment: form.gstTreatment,
        gstRateBp: RATE * 100,
        lines: usable.map((l) => ({
          description: l.description.trim(),
          quantity: Number(String(l.quantity).replace(/,/g, "")),
          uom: l.uom.trim() || null,
          unitPrice: show(laari(l.rate)).replace(/,/g, ""),
        })),
      });
      toast.success(
        `${result.invoice.invoiceNo} saved · MVR ${result.invoice.gross}`,
        result.matchedTo
          ? // A close name was taken as an existing customer. Right for a
            // shortened name, wrong for two different bodies whose names
            // overlap — so it is said, never silent.
            `Filed under ${result.matchedTo}, an existing customer with a similar name. If that is a different company, discard this draft and raise it again.`
          : form.purchaseOrder.trim()
            ? "Put it in the books when it goes to the customer."
            : "It has no purchase order. Their accounts department may not be able to match it."
      );
      onRaised?.(result.invoice);
      onClose();
    } catch (ex) {
      setErr(ex.message || "The invoice could not be saved.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      as="form"
      onSubmit={onSubmit}
      size="lg"
      title="New invoice"
      description="Saved as a draft. It goes into the books when you say so."
      initialFocus={firstField}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-3">
          <Field label="Who is it to?" htmlFor="inv-customer">
            <input
              ref={firstField}
              id="inv-customer"
              value={form.customerName}
              onChange={set("customerName")}
              placeholder="Road Development Corporation Ltd"
              className={FIELD}
              autoComplete="off"
            />
          </Field>
          <Field label="Invoice number" htmlFor="inv-no">
            <input
              id="inv-no"
              value={invoiceNo}
              onChange={set("invoiceNo")}
              placeholder="INV-000001"
              className={`${FIELD} tabular`}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Their purchase order"
            htmlFor="inv-po"
            hint="Their accounts department matches on it. Without it, an invoice tends to sit unpaid."
          >
            <input
              id="inv-po"
              value={form.purchaseOrder}
              onChange={set("purchaseOrder")}
              placeholder="PO-RDC-2026-003151"
              className={`${FIELD} tabular`}
            />
          </Field>
          <Field label="What it covers" htmlFor="inv-subject">
            <input
              id="inv-subject"
              value={form.subject}
              onChange={set("subject")}
              placeholder="25 September 2026, 30 days"
              className={FIELD}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Issued" htmlFor="inv-issued">
            <input id="inv-issued" type="date" value={form.issueDate} onChange={set("issueDate")} className={`${FIELD} tabular`} />
          </Field>
          <Field label="Due" htmlFor="inv-due">
            <input id="inv-due" type="date" value={form.dueDate} onChange={set("dueDate")} className={`${FIELD} tabular`} />
          </Field>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-[var(--ink)] mb-2">Lines</legend>
          <div className="hidden sm:grid grid-cols-[1fr_72px_72px_110px_110px_44px] gap-2 px-1 pb-1.5 text-[11px] uppercase tracking-wider font-semibold text-[var(--ink-muted)]">
            <span>What</span>
            <span className="text-right">Qty</span>
            <span>Unit</span>
            <span className="text-right">Rate</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          <div className="space-y-2">
            {priced.map((line, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_72px_72px] sm:grid-cols-[1fr_72px_72px_110px_110px_44px] gap-2 items-center"
              >
                <input
                  aria-label={`Line ${i + 1}: what it is`}
                  value={line.description}
                  onChange={setLine(i, "description")}
                  placeholder="Excavator rental, Komatsu PC 56-7"
                  className={`${FIELD} col-span-3 sm:col-span-1`}
                />
                <input
                  aria-label={`Line ${i + 1}: quantity`}
                  value={line.quantity}
                  onChange={setLine(i, "quantity")}
                  inputMode="decimal"
                  className={`${FIELD} tabular text-right px-3`}
                />
                <input
                  aria-label={`Line ${i + 1}: unit`}
                  value={line.uom}
                  onChange={setLine(i, "uom")}
                  placeholder="DAY"
                  className={`${FIELD} px-3`}
                />
                <input
                  aria-label={`Line ${i + 1}: rate`}
                  value={line.rate}
                  onChange={setLine(i, "rate")}
                  inputMode="decimal"
                  placeholder="3,000.00"
                  className={`${FIELD} tabular text-right px-3`}
                />
                <span className="tabular text-[15px] text-right text-[var(--ink)] pr-1">
                  {line.amount ? show(line.amount) : "—"}
                </span>
                <button
                  type="button"
                  onClick={() => setLines((all) => (all.length > 1 ? all.filter((_, j) => j !== i) : all))}
                  disabled={lines.length === 1}
                  aria-label={`Remove line ${i + 1}`}
                  className="h-11 w-11 rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)] disabled:opacity-30"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setLines((all) => [...all, blankLine()])}
            className="mt-2"
          >
            <Plus size={16} /> Add a line
          </Button>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-[var(--ink)] mb-2">GST</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {TAX.map((choice) => (
              <label
                key={choice.value}
                className={`flex items-start gap-3 p-3 rounded-[var(--radius-control)] border cursor-pointer transition-colors ${
                  form.gstTreatment === choice.value
                    ? "border-[var(--ink)] bg-[var(--surface-2)]"
                    : "border-[var(--border)] hover:bg-[var(--surface-2)]"
                }`}
              >
                <input
                  type="radio"
                  name="inv-gst"
                  value={choice.value}
                  checked={form.gstTreatment === choice.value}
                  onChange={set("gstTreatment")}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--ink)]">{choice.label}</span>
                  <span className="block text-[13px] text-[var(--ink-muted)] mt-0.5 leading-snug">
                    {choice.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* The three figures the customer will check, right-aligned on one
            rule, in the order they appear on the paper. */}
        <dl className="ml-auto w-full sm:w-[300px] text-[15px] tabular">
          <div className="flex justify-between py-1.5">
            <dt className="text-[var(--ink-muted)]">Before GST</dt>
            <dd>{show(totals.net)}</dd>
          </div>
          <div className="flex justify-between py-1.5">
            <dt className="text-[var(--ink-muted)]">GST {RATE}%</dt>
            <dd>{show(totals.tax)}</dd>
          </div>
          <div className="flex justify-between py-2 border-t border-[var(--ink)] font-semibold">
            <dt>Total</dt>
            <dd>MVR {show(gross)}</dd>
          </div>
        </dl>
      </div>

      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">
          {err}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant={ready ? "accent" : "outline"} disabled={raise.isPending}>
          {raise.isPending && <Loader2 size={14} className="animate-spin" />}
          {commitment}
        </Button>
      </div>
    </Modal>
  );
}

function Field({ label, htmlFor, hint, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm font-medium text-[var(--ink)] mb-1.5 block">
        {label}
      </label>
      {children}
      {hint && <p className="text-[13px] text-[var(--ink-muted)] mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}
