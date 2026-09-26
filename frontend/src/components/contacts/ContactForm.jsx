import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { FIELD } from "@/lib/shipments";
import { cn } from "@/lib/utils";

/**
 * Adding or changing a customer or supplier. The essentials first (who, which
 * side, how to reach them on WhatsApp), the tax numbers and terms under them.
 * A name, TIN or phone that matches one already on file is stopped with the
 * match shown, because a second record for the same business splits what it
 * owes in two.
 */

// The groups owners here sort their customers into. Any other word works too.
export const SUGGESTED_TAGS = ["Resort", "Government", "Contractor", "Guesthouse", "Retail", "Individual"];

function Field({ label, hint, children, className }) {
  return (
    <label className={cn("block", className)}>
      <span className="block text-[13px] font-medium mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[12px] text-[var(--ink-muted)] mt-1">{hint}</span>}
    </label>
  );
}

function Side({ on, onChange, children }) {
  return (
    <button type="button" aria-pressed={on} onClick={() => onChange(!on)} className={cn("h-11 px-4 rounded-full border text-[14px] font-medium transition-colors", on ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "bg-[var(--surface)] border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)]")}>
      {children}
    </button>
  );
}

export function ContactForm({ contact, side = "customers", onClose, onSaved }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const d = contact?.details || {};
  const [f, setF] = useState({
    name: contact?.name || "",
    customer: contact ? contact.customer : side !== "suppliers",
    supplier: contact ? contact.supplier : side === "suppliers",
    phone: d.phone || "",
    email: d.email || "",
    tin: d.tin || "",
    gstNumber: d.gstNumber || "",
    address: d.address || "",
    paymentTermsDays: d.paymentTermsDays ?? "",
    billControl: d.billControl || "received",
    creditLimit: d.creditLimit ? d.creditLimit.replace(/,/g, "") : "",
    tags: d.tags || [],
    notes: d.notes || "",
  });
  const [more, setMore] = useState(Boolean(contact));
  const [owedBefore, setOwedBefore] = useState("");
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [like, setLike] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleTag = (t) => setF({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] });

  async function save(e, force = false) {
    e?.preventDefault?.();
    setErr("");
    setBusy(true);
    const body = { ...f, paymentTermsDays: f.paymentTermsDays === "" ? null : Number(f.paymentTermsDays), creditLimit: f.creditLimit || null, force };
    try {
      const id = contact ? (await apiClient.patch(`/contacts/${contact.id}`, body), contact.id) : (await apiClient.post("/contacts", body)).data.id;
      if (!contact && Number(String(owedBefore).replace(/,/g, "")) > 0) {
        await apiClient.post(`/contacts/${id}/opening`, { side: f.customer ? "customer" : "supplier", amount: owedBefore, on: new Date().toISOString().slice(0, 10) }).catch((ex) => toast.error("Added, but the opening balance was not set", ex.message));
      }
      qc.invalidateQueries({ queryKey: ["contacts", companyId] });
      toast.success(contact ? "Saved" : `${f.name.trim()} added`);
      onSaved?.(id);
    } catch (ex) {
      if (ex.status === 409 && ex.details?.lookalikes) setLike(ex.details.lookalikes);
      else setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  const who = f.customer && f.supplier ? "contact" : f.supplier ? "supplier" : "customer";
  return (
    <Modal open onClose={onClose} as="form" onSubmit={save} size="lg" title={contact ? `Change ${contact.name}` : `Add a ${who}`} description={contact ? null : "A name and a phone number are enough to start. Everything else can wait."}>
      <div className="grid gap-4">
        <Field label="Business or person">
          <input autoFocus value={f.name} onChange={set("name")} maxLength={200} placeholder="Lagoon View Resort" className={FIELD} required />
        </Field>
        <div>
          <span className="block text-[13px] font-medium mb-1.5">They</span>
          <div className="flex flex-wrap gap-2">
            <Side on={f.customer} onChange={(v) => setF({ ...f, customer: v })}>
              Buy from you
            </Side>
            <Side on={f.supplier} onChange={(v) => setF({ ...f, supplier: v })}>
              Sell to you
            </Side>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Phone or WhatsApp" hint="A 7-digit Maldivian number gets +960 on WhatsApp.">
            <input value={f.phone} onChange={set("phone")} inputMode="tel" autoComplete="off" placeholder="+960 777 1234" className={FIELD} />
          </Field>
          <Field label="Email">
            <input value={f.email} onChange={set("email")} type="email" autoComplete="off" placeholder="accounts@lagoonview.mv" className={FIELD} />
          </Field>
        </div>

        {!more ? (
          <button type="button" onClick={() => setMore(true)} className="justify-self-start text-[14px] font-medium text-[var(--deep)] underline underline-offset-4">
            Add tax numbers, terms and groups
          </button>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="TIN" hint="Their tax identification number (a TRN in the UAE).">
                <input value={f.tin} onChange={set("tin")} className={FIELD} />
              </Field>
              <Field label="GST number" hint="Only if they are registered for GST or VAT.">
                <input value={f.gstNumber} onChange={set("gstNumber")} className={FIELD} />
              </Field>
              <Field label="Pays within (days)" hint="Leave empty for 30.">
                <input value={f.paymentTermsDays} onChange={set("paymentTermsDays")} inputMode="numeric" pattern="[0-9]*" placeholder="30" className={FIELD} />
              </Field>
              {f.supplier && (
                <Field label="Their bills are for" hint="Checked against the order when a bill is made from it.">
                  <select id="contact-bill-control" value={f.billControl} onChange={set("billControl")} className={FIELD}>
                    <option value="received">What arrived</option>
                    <option value="ordered">What was ordered (paid ahead)</option>
                  </select>
                </Field>
              )}
              {f.customer && (
                <Field label="Credit limit (MVR)" hint="A warning when what they owe goes over it.">
                  <input value={f.creditLimit} onChange={set("creditLimit")} inputMode="decimal" placeholder="50000" className={FIELD} />
                </Field>
              )}
            </div>
            {!contact && (
              <Field label={f.customer ? "Already owes you, MVR (optional)" : "You already owe them, MVR (optional)"} hint="From before Sentryfi. It is kept apart from sales and purchases, and never counts for GST.">
                <input value={owedBefore} onChange={(e) => setOwedBefore(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${FIELD} tabular sm:max-w-[240px]`} />
              </Field>
            )}
            <Field label="Address">
              <textarea value={f.address} onChange={set("address")} rows={2} className={`${FIELD} h-auto py-2.5`} />
            </Field>
            <div>
              <span className="block text-[13px] font-medium mb-1.5">Groups</span>
              <div className="flex flex-wrap gap-2">
                {[...new Set([...SUGGESTED_TAGS, ...f.tags])].map((t) => (
                  <button key={t} type="button" aria-pressed={f.tags.includes(t)} onClick={() => toggleTag(t)} className={cn("h-9 px-3.5 rounded-full border text-[13px] font-medium", f.tags.includes(t) ? "bg-[var(--accent-soft)] border-transparent text-[var(--accent-strong)]" : "border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)]")}>
                    {t}
                  </button>
                ))}
                <input
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && tag.trim()) {
                      e.preventDefault();
                      if (!f.tags.includes(tag.trim())) setF({ ...f, tags: [...f.tags, tag.trim().slice(0, 30)] });
                      setTag("");
                    }
                  }}
                  aria-label="Another group"
                  placeholder="Another…"
                  className="h-9 w-32 px-3.5 rounded-full border border-dashed border-[var(--border)] bg-transparent text-[13px] outline-none focus:border-[var(--ink)]"
                />
              </div>
            </div>
            <Field label="Notes">
              <textarea value={f.notes} onChange={set("notes")} rows={2} placeholder="Invoices need their PO number. Pays on the 25th." className={`${FIELD} h-auto py-2.5`} />
            </Field>
          </>
        )}

        {like && (
          <div role="alert" className="rounded-2xl bg-[var(--warning-soft)] px-4 py-3 text-[14px]">
            <p className="font-semibold">This may already be on file</p>
            <ul className="mt-1.5 grid gap-1">
              {like.map((l) => (
                <li key={l.id}>
                  <Link to={`/contacts/${l.id}`} onClick={onClose} className="underline underline-offset-2 font-medium">
                    {l.name}
                  </Link>{" "}
                  <span className="text-[var(--ink-muted)]">· {l.why}</span>
                </li>
              ))}
            </ul>
            <Button type="button" variant="outline" size="sm" className="mt-2.5" disabled={busy} onClick={(e) => save(e, true)}>
              It is a different business: add it
            </Button>
          </div>
        )}
        {err && (
          <p role="alert" className="text-[13px] text-[var(--danger)]">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" disabled={busy || !f.name.trim() || (!f.customer && !f.supplier)}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            {!f.name.trim() ? "Add the name" : !f.customer && !f.supplier ? "Choose a side" : contact ? "Save" : `Add ${f.name.trim().length > 22 ? who : f.name.trim()}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
