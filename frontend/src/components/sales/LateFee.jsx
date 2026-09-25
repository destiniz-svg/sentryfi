import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Clock, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { apiClient } from "@/api/client";
import { salesApi } from "@/api/sales";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { FIELD } from "@/lib/shipments";

/**
 * A late fee on an overdue invoice: its own invoice to the same customer,
 * "Late payment fee on INV-…", put in the books when made. Whether it carries
 * GST is chosen each time, because MIRA's treatment of late charges is still
 * with the accountant (docs/domain/to-confirm.md); nothing is charged by itself.
 */
export function LateFee({ invoiceId, number, customer }) {
  const { companyId, can } = useCompany();
  const { data: aged } = useQuery({ queryKey: ["aged", companyId], queryFn: salesApi.aged, enabled: Boolean(companyId) && can("record") });
  const [open, setOpen] = useState(false);
  const late = aged?.invoices?.find((i) => i.id === invoiceId && i.daysOver > 0);
  if (!late || !can("record")) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="late-fee">
        <Clock size={15} /> Late fee
      </Button>
      {open && <LateFeeForm late={late} number={number} customer={customer} onClose={() => setOpen(false)} />}
    </>
  );
}

function LateFeeForm({ late, number, customer, onClose }) {
  const toast = useToast();
  const nav = useNavigate();
  const owed = Number(String(late.outstanding).replace(/,/g, ""));
  const [pct, setPct] = useState("2");
  const [amount, setAmount] = useState(((owed * 2) / 100).toFixed(2));
  const [gst, setGst] = useState("none_unregistered");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fromPct = (p) => {
    setPct(p);
    const n = Number(p);
    if (n >= 0) setAmount(((owed * n) / 100).toFixed(2));
  };

  async function save(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await apiClient.post("/sales", {
        clientRef: crypto.randomUUID(),
        customerName: customer,
        subject: `Late payment fee on ${number}`,
        gstTreatment: gst,
        lines: [{ description: `Late payment fee on ${number}, ${late.daysOver} days late on MVR ${late.outstanding}`, quantity: 1, unitPrice: String(amount).replace(/,/g, "") }],
      });
      await salesApi.post(r.data.invoice.id);
      toast.success(`${r.data.invoice.invoiceNo}: late fee charged`, "It is in the books and on the customer's account.");
      nav(`/documents/invoice/${r.data.invoice.id}`);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} as="form" onSubmit={save} title={`A late fee on ${number}`} description={`${late.daysOver} days late, MVR ${late.outstanding} still owed. The fee goes on its own invoice to ${customer}.`}>
      <div className="grid gap-4">
        <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium">Of what is owed</span>
            <span className="relative">
              <input value={pct} onChange={(e) => fromPct(e.target.value)} inputMode="decimal" aria-label="Percent of what is owed" className={`${FIELD} pr-7 tabular text-right`} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none">%</span>
            </span>
          </label>
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium">Fee, MVR</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={`${FIELD} tabular`} />
          </label>
        </div>
        <fieldset className="grid gap-2">
          <legend className="text-[13px] font-medium mb-1">GST on the fee</legend>
          {[
            ["none_unregistered", "No GST", "The fee as compensation for paying late"],
            ["exclusive", "Add GST", "The fee as part of what the supply cost"],
          ].map(([v, label, hint]) => (
            <label key={v} className="flex items-start gap-2.5 text-[14px] cursor-pointer">
              <input type="radio" name="late-gst" checked={gst === v} onChange={() => setGst(v)} className="mt-1 accent-[var(--ink)]" />
              <span>
                <b className="font-semibold">{label}</b> <span className="text-[var(--ink-muted)]">· {hint}</span>
              </span>
            </label>
          ))}
          <span className="text-[12px] text-[var(--ink-muted)]">Which is right is with your accountant; choose what your contract with them says.</span>
        </fieldset>
        {err && (
          <p role="alert" className="text-[13px] text-[var(--danger)]">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" disabled={busy || !(Number(amount) > 0)}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            Charge MVR {Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
