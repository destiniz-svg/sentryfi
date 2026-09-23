import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, X } from "lucide-react";
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

/**
 * Raising an invoice.
 *
 * Shaped after Altura's own: a customer, their purchase order, a subject line
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
    hint: "GST on top of the line totals. How Altura's invoices are written.",
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
  const { companyId } = useCompany();
  const design = useDesign("invoice");
  const [view, setView] = useState("form");
  const toast = useToast();
  const { raise } = useSalesMutations();
  const firstField = useRef(null);
  useEffect(() => firstField.current?.focus(), []);

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

  // A line can sell a stock item: picking one fills in its name, unit and
  // price, and posting takes it out of stock at its average cost.
  const { data: stockItems } = useQuery({
    queryKey: ["stock", companyId],
    queryFn: () => apiClient.get("/stock").then((r) => r.data.items),
    enabled: Boolean(companyId) && open,
  });
  const forSale = (stockItems || []).filter((i) => !i.archived);
  const pickItem = (i) => (e) => {
    const item = forSale.find((it) => it.id === e.target.value);
    setLines((all) =>
      all.map((l, j) =>
        j !== i
          ? l
          : item
            ? {
                ...l,
                itemId: item.id,
                description: item.name,
                uom: item.unit,
                rate: item.salePrice || l.rate,
              }
            : { ...l, itemId: "" },
      ),
    );
  };

  const priced = lines.map((l) => {
    const rate = laari(l.rate);
    const qty = Number(String(l.quantity).replace(/,/g, ""));
    const amount = rate !== null && qty > 0 ? Math.round(rate * qty) : null;
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
    ? "Who is it to?"
    : usable.length === 0
      ? "Add a line with a rate"
      : !rateOk
        ? `At what rate? MVR for one ${form.currency}`
        : `Save ${invoiceNo || "invoice"} · ${unit} ${show(gross)}`;
  const ready = form.customerName.trim() && usable.length > 0 && rateOk;

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
          itemId: l.itemId || null,
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
            : "It has no purchase order. Their accounts department may not be able to match it.",
      );
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
          project: null,
          to: { name: form.customerName.trim() || "Who is it to?" },
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
            description: l.description.trim(),
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
        <div
          className={cn(
            "space-y-4 min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5",
            view === "preview" && "hidden lg:block",
          )}
        >
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
              if (r.lines?.length) setLines(r.lines.map((l) => ({ ...blankLine(), ...l })));
            }}
          />
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
            <TagPicker
              value={form.tags}
              onChange={(tags) => setForm((x) => ({ ...x, tags }))}
              fieldClass={FIELD}
              className="sm:col-span-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Issued" htmlFor="inv-issued">
              <input
                id="inv-issued"
                type="date"
                value={form.issueDate}
                onChange={set("issueDate")}
                className={`${FIELD} tabular`}
              />
            </Field>
            <Field label="Due" htmlFor="inv-due">
              <input
                id="inv-due"
                type="date"
                value={form.dueDate}
                onChange={set("dueDate")}
                className={`${FIELD} tabular`}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="In" htmlFor="inv-currency">
              <select
                id="inv-currency"
                value={form.currency}
                onChange={(e) =>
                  setForm((x) => ({
                    ...x,
                    currency: e.target.value,
                    fxRate: "",
                  }))
                }
                className={FIELD}
              >
                <option value="">MVR</option>
                {["USD", "EUR", "GBP", "AED", "INR", "CNY", "SGD", "JPY"].map(
                  (c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ),
                )}
              </select>
            </Field>
            {form.currency && (
              <Field
                label={`MVR for 1 ${form.currency}`}
                htmlFor="inv-rate"
                hint={
                  gross > 0 && Number(form.fxRate) > 0
                    ? `MVR ${show(Math.round(gross * Number(form.fxRate)))} in the books.`
                    : "The rate on the invoice date."
                }
              >
                <input
                  id="inv-rate"
                  value={form.fxRate}
                  onChange={set("fxRate")}
                  inputMode="decimal"
                  placeholder="15.42"
                  className={`${FIELD} tabular`}
                />
              </Field>
            )}
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-[var(--ink)] mb-2">
              Lines
            </legend>
            <div className="space-y-2">
              {priced.map((line, i) => (
                // Two rows at any width: what it is, then how many at what rate.
                <div
                  key={i}
                  className="grid grid-cols-[64px_72px_minmax(0,1fr)_minmax(0,1fr)_40px] gap-2 items-center rounded-xl border border-[var(--border)] p-2"
                >
                  {forSale.length > 0 && (
                    <select
                      aria-label={`Line ${i + 1}: from stock`}
                      value={line.itemId}
                      onChange={pickItem(i)}
                      className={`${FIELD} col-span-5 h-10 text-[14px]`}
                    >
                      <option value="">Not from stock</option>
                      {forSale.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name} · {it.onHand} {it.unit} on hand
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    aria-label={`Line ${i + 1}: what it is`}
                    value={line.description}
                    onChange={setLine(i, "description")}
                    placeholder="Excavator rental, Komatsu PC 56-7"
                    className={`${FIELD} col-span-5`}
                  />
                  <input
                    aria-label={`Line ${i + 1}: quantity`}
                    value={line.quantity}
                    onChange={setLine(i, "quantity")}
                    inputMode="decimal"
                    placeholder="Qty"
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
                    onClick={() =>
                      setLines((all) =>
                        all.length > 1 ? all.filter((_, j) => j !== i) : all,
                      )
                    }
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
            <legend className="text-sm font-medium text-[var(--ink)] mb-2">
              GST
            </legend>
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
                    <span className="block text-sm font-medium text-[var(--ink)]">
                      {choice.label}
                    </span>
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
              <dt className="text-[var(--ink-muted)]">
                GST {rateBp === null ? "…" : `${rateBp / 100}%`}
              </dt>
              <dd>{show(totals.tax)}</dd>
            </div>
            <div className="flex justify-between py-2 border-t border-[var(--ink)] font-semibold">
              <dt>Total</dt>
              <dd>
                {unit} {show(gross)}
              </dd>
            </div>
          </dl>

          {err && (
            <p role="alert" className="text-[13px] text-[var(--danger)]">
              {err}
            </p>
          )}
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
    </form>
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
