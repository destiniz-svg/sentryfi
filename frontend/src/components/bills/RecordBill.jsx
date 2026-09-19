import { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle, Camera, Paperclip, FileText, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useBillMutations } from "@/hooks/useBills";
import { billsApi } from "@/api/bills";
import { useToast } from "@/context/UIContext";
import { today } from "@/lib/utils";

/**
 * Getting a bill in.
 *
 * The shape of this follows one rule from the build plan: getting the bill in
 * must never be blocked by a question. The person holding it is often standing
 * on a site. So the form asks for what is on the paper — who, how much, when —
 * and the one thing that cannot be guessed afterwards.
 *
 * That one thing is how the tax was quoted. The same printed MVR 4,250.50 is
 * MVR 3,935.65 plus 314.85 when the price includes tax, and MVR 4,590.54 when
 * the tax goes on top. Reading it the wrong way overstates the claim by 8%, so
 * the app refuses to guess. "I am not sure" is a real answer and keeps the
 * bill out of the books until someone decides, rather than quietly picking one.
 *
 * Recording and posting are separate acts. This records.
 */

const TAX_CHOICES = [
  {
    value: "inclusive",
    label: "Included in the price",
    hint: "The total on the bill already has GST in it. Most suppliers here.",
  },
  {
    value: "exclusive",
    label: "Added on top",
    hint: "GST is charged on top of the figure shown.",
  },
  {
    value: "none_unregistered",
    label: "No GST charged",
    hint: "The supplier is not registered, so there is nothing to claim back.",
  },
  {
    value: "unknown",
    label: "I am not sure",
    hint: "It waits for someone to decide. Nothing is guessed.",
  },
];

export function RecordBill({ open, onClose }) {
  const { record } = useBillMutations();
  const toast = useToast();
  const cameraButton = useRef(null);

  const [form, setForm] = useState(blank());
  const [err, setErr] = useState("");
  const [duplicates, setDuplicates] = useState([]);
  const [reading, setReading] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [readIt, setReadIt] = useState(false);
  // Everything attached to this bill. A supplier invoice is often more than
  // one page, and a delivery note photographed beside it belongs to the same
  // record. The first is what gets read; all of them get kept.
  const [files, setFiles] = useState([]);
  const [supplierFacts, setSupplierFacts] = useState(null);
  const cameraInputRef = useRef(null);
  const libraryInputRef = useRef(null);

  function blank() {
    return {
      supplierName: "",
      amount: "",
      billNo: "",
      issueDate: today(),
      gstTreatment: "inclusive",
    };
  }

  useEffect(() => {
    if (open) {
      setForm(blank());
      setErr("");
      setDuplicates([]);
      setQuestions([]);
      setReadIt(false);
      setFiles([]);
      setSupplierFacts(null);
    }
  }, [open]);

  /**
   * Takes whatever arrives — a photograph, a picture already on the phone, a
   * PDF that came by email — and lets the app fill in what it can read.
   *
   * What comes back is put in the form rather than recorded, so the person
   * sees what was read off their own paper before any of it becomes a record.
   * Anything the reading was unsure about is listed underneath, because the
   * rule is to ask only about what is genuinely doubtful and handle the rest.
   */
  async function onFiles(e) {
    const picked = Array.from(e.target.files || []);
    // Clear the input so picking the same file twice still fires a change.
    e.target.value = "";
    if (!picked.length) return;

    const all = [...files, ...picked];
    setFiles(all);

    // Only the first page is read. Reading every page would cost more and say
    // the same thing, and the pages that are not read are still kept.
    const first = all[0];
    setReading(true);
    setErr("");
    setQuestions([]);
    try {
      const result = await billsApi.scan(first);
      const extracted = result.read || {};

      setForm((f) => ({
        ...f,
        supplierName: result.supplier?.name || extracted.supplierName || f.supplierName,
        amount: extracted.grossAmount || f.amount,
        billNo: extracted.billNo || f.billNo,
        issueDate: extracted.issueDate || f.issueDate,
        gstTreatment: extracted.gstTreatment || f.gstTreatment,
      }));
      setQuestions(result.questions || []);
      setReadIt(true);
      setSupplierFacts({
        tin: extracted.supplierTin || undefined,
        gst_number: extracted.supplierGstNumber || undefined,
        address: extracted.supplierAddress || undefined,
        phone: extracted.supplierPhone || undefined,
        email: extracted.supplierEmail || undefined,
        bank_account: extracted.supplierBankAccount || undefined,
      });
    } catch (ex) {
      setErr(ex.message || "That could not be read. Type it in instead.");
    } finally {
      setReading(false);
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");

    if (!form.supplierName.trim()) return setErr("Who is the bill from?");
    if (!(Number(String(form.amount).replace(/,/g, "")) > 0)) {
      return setErr("How much is it for?");
    }

    try {
      const result = await record.mutateAsync({
        supplierName: form.supplierName.trim(),
        amount: String(form.amount).replace(/,/g, ""),
        billNo: form.billNo.trim() || null,
        issueDate: form.issueDate || null,
        gstTreatment: form.gstTreatment,
        gstRateBp:
          form.gstTreatment === "inclusive" || form.gstTreatment === "exclusive" ? 800 : null,
        // Whatever the photograph told us about the supplier. The record fills
        // itself in from this over time rather than anybody typing it.
        supplier: supplierFacts || undefined,
      });

      // File the paper against the bill now that the bill exists, every page
      // in the order it was added. This happens even when a duplicate was
      // found, because the paper belongs to the record either way and whoever
      // sorts the duplicate out will want to see both documents.
      //
      // A failure here does not lose the bill. The bill is recorded and the
      // paper can be added again, which is better than rolling back work
      // somebody has already done.
      let paperKept = true;
      for (const file of files) {
        try {
          await billsApi.attach(result.bill.id, file);
        } catch {
          paperKept = false;
        }
      }

      // A duplicate is worth stopping for, but not worth losing the bill over:
      // it is already recorded, and this says so rather than discarding it.
      if (result.duplicates?.length) {
        setDuplicates(result.duplicates);
        return;
      }

      toast.success(
        `Recorded ${result.bill.gross} from ${form.supplierName.trim()}`,
        !paperKept
          ? "The figures are saved, but the paper was not. Add it again from the bill."
          : form.gstTreatment === "unknown"
            ? "It is waiting for someone to say how its tax was quoted."
            : "Check it, then put it in the books."
      );
      onClose();
    } catch (ex) {
      setErr(ex.message || "Could not record the bill");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      as="form"
      onSubmit={onSubmit}
      title="Record a bill"
      description="What is on the paper. You can correct any of it afterwards."
      initialFocus={cameraButton}
    >
      {/* Two ways in, because they are genuinely different jobs and one input
          cannot do both. `capture` tells a phone to open the camera straight
          away, which is right when the bill is in your hand — and it is also
          why, with only that input, a bill already sitting in the gallery or
          arriving as a PDF by email could not be attached at all.
          The second input deliberately has no `capture`, so the phone offers
          the gallery, the files app, and whatever else it has. */}
      <div className="mb-5">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onFiles}
        />
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={onFiles}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button
            type="button"
            ref={cameraButton}
            variant="outline"
            onClick={() => cameraInputRef.current?.click()}
            disabled={reading}
            className="h-12"
          >
            {reading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            {reading ? "Reading it…" : "Photograph it"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => libraryInputRef.current?.click()}
            disabled={reading}
            className="h-12"
          >
            <Paperclip size={16} />
            Choose a file
          </Button>
        </div>

        {files.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 text-[13px] text-[var(--ink)]"
              >
                <FileText size={14} className="shrink-0 text-[var(--ink-muted)]" />
                <span className="truncate">{f.name}</span>
                <span className="text-[var(--ink-muted)] tabular shrink-0">
                  {Math.round(f.size / 1024)} KB
                </span>
                {i === 0 && files.length > 1 && (
                  <span className="text-[11px] uppercase tracking-wider text-[var(--ink-muted)] shrink-0">
                    read from this one
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setFiles((list) => list.filter((_, n) => n !== i))}
                  aria-label={`Remove ${f.name}`}
                  className="ml-auto h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--danger)]"
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[13px] text-[var(--ink-muted)] mt-2 leading-snug">
          {readIt
            ? "Read off the first page. Check it against the paper — anything wrong, just change it."
            : "A photo, a picture already on the phone, or a PDF. Several pages are fine. Nothing is recorded until you say so."}
        </p>
      </div>

      {questions.length > 0 && (
        <div role="status" className="mb-5 rounded-[var(--radius-control)] border border-[var(--border)] p-4">
          <p className="text-sm font-semibold text-[var(--ink)]">
            {questions.length === 1 ? "One thing to check" : `${questions.length} things to check`}
          </p>
          <ul className="mt-2 space-y-2">
            {questions.map((q) => (
              <li key={q.field} className="text-[13px] leading-snug">
                <span className="text-[var(--ink)]">{q.asks}</span>{" "}
                <span className="text-[var(--ink-muted)]">{q.because}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        <Field label="Who is it from?" htmlFor="bill-supplier">
          <input
            id="bill-supplier"
            value={form.supplierName}
            onChange={set("supplierName")}
            placeholder="Lily Enterprises"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="How much?" htmlFor="bill-amount">
            <input
              id="bill-amount"
              value={form.amount}
              onChange={set("amount")}
              inputMode="decimal"
              placeholder="4,250.50"
              className={`${inputClass} tabular`}
            />
          </Field>
          <Field label="Dated" htmlFor="bill-date">
            <input
              id="bill-date"
              type="date"
              value={form.issueDate}
              onChange={set("issueDate")}
              className={`${inputClass} tabular`}
            />
          </Field>
        </div>

        <Field
          label="Bill number"
          htmlFor="bill-no"
          hint="Worth having: it is how a supplier billing twice gets caught."
        >
          <input
            id="bill-no"
            value={form.billNo}
            onChange={set("billNo")}
            placeholder="INV-8841"
            className={`${inputClass} tabular`}
          />
        </Field>

        <fieldset>
          <legend className="text-sm font-medium text-[var(--ink)] mb-2">
            How was the GST quoted?
          </legend>
          <div className="space-y-1.5">
            {TAX_CHOICES.map((choice) => (
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
                  name="gstTreatment"
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
      </div>

      {duplicates.length > 0 && (
        <div
          role="alert"
          className="mt-4 rounded-[var(--radius-control)] bg-[var(--accent-soft)] p-4"
        >
          <p className="flex items-start gap-2 text-sm font-semibold text-[var(--accent-strong)]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            You may have this one already
          </p>
          <ul className="mt-2 space-y-1">
            {duplicates.map((d) => (
              <li key={d.billId} className="text-[13px] text-[var(--ink)] leading-snug">
                {d.because}
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-[var(--ink-muted)] mt-2.5 leading-snug">
            It has been recorded either way, so nothing is lost. It will not go into the books
            until someone sorts out which one is right.
          </p>
          <div className="mt-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Right, I will look
            </Button>
          </div>
        </div>
      )}

      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">
          {err}
        </p>
      )}

      {duplicates.length === 0 && (
        <div className="flex items-center justify-end gap-2 mt-6">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" disabled={record.isPending}>
            {record.isPending && <Loader2 size={14} className="animate-spin" />}
            Record it
          </Button>
        </div>
      )}
    </Modal>
  );
}

const inputClass =
  "w-full h-11 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15";

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
