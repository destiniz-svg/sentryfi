import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Undo2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { FIELD } from "@/lib/shipments";
import { formatDate, today } from "@/lib/utils";

/**
 * Goods or a charge sent back to the supplier on this bill. Goods go back at
 * what they came in at; a charge goes back with its GST, in the bill's shares.
 * What is owed on the bill falls by the return, and the GST return takes the
 * input tax back off in the month it went back.
 */
export function SupplierReturns({ billId }) {
  const { companyId, can } = useCompany();
  const [open, setOpen] = useState(false);
  const key = ["bill-returns", companyId, billId];
  const { data } = useQuery({ queryKey: key, queryFn: () => apiClient.get(`/bills/${billId}/returns`).then((r) => r.data), enabled: Boolean(companyId) });
  if (!data) return null;
  const may = can("record") && !data.can?.refused && Number(String(data.can?.left || "0").replace(/,/g, "")) > 0;
  if (!data.returns.length && !may) return null;
  return (
    <section className="rounded-[20px] bg-[var(--surface)] lift p-5" aria-label="Sent back to the supplier" data-testid="supplier-returns">
      <div className="flex items-center gap-2 flex-wrap">
        <Undo2 size={16} className="text-[var(--ink-muted)]" aria-hidden="true" />
        <h2 className="text-[15px] font-semibold">Sent back to the supplier</h2>
        {may && (
          <Button variant="outline" size="sm" className="ml-auto h-9 px-3.5 text-[13px]" onClick={() => setOpen(true)}>
            Send something back
          </Button>
        )}
      </div>
      {data.returns.length === 0 ? (
        <p className="text-[14px] text-[var(--ink-muted)] mt-2">Damaged, wrong or not needed? Send it back here: what you owe them, the cost and the GST claimed all come down.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {data.returns.map((r) => (
            <li key={r.id} className="py-2.5 flex items-start gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">
                  {r.number} · {r.reason}
                </span>
                <span className="block text-[13px] text-[var(--ink-muted)]">
                  {formatDate(r.on)}
                  {r.items?.length ? ` · ${r.items.map((i) => `${i.quantity} ${i.name}`).join(", ")}` : ""}
                  {r.supplierRef ? ` · their note ${r.supplierRef}` : ""}
                </span>
              </span>
              <Money amount={`−${r.gross}`} className="text-[15px] font-semibold" />
            </li>
          ))}
        </ul>
      )}
      {open && <ReturnForm billId={billId} can={data.can} onClose={() => setOpen(false)} />}
    </section>
  );
}

function ReturnForm({ billId, can, onClose }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [on, setOn] = useState(today());
  const [ref, setRef] = useState("");
  const [qty, setQty] = useState({});
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const items = Object.entries(qty).filter(([, q]) => Number(q) > 0).map(([itemId, quantity]) => ({ itemId, quantity: String(quantity) }));
  const ready = reason.trim() && (items.length || Number(String(amount).replace(/,/g, "")) > 0);

  async function save(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await apiClient.post(`/bills/${billId}/returns`, { reason, items, amount: amount || null, issueDate: on, supplierRef: ref || null });
      toast.success(`${r.data.number}: MVR ${r.data.gross} back to the supplier`, "What you owe them, the cost and the GST claimed came down.");
      qc.invalidateQueries({ queryKey: ["bill-returns", companyId, billId] });
      qc.invalidateQueries({ queryKey: ["bill", companyId, billId] });
      qc.invalidateQueries({ queryKey: ["contacts", companyId] });
      onClose();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} as="form" onSubmit={save} title="Send something back" description={`Up to MVR ${can.left}, what is still owed on this bill.`}>
      <div className="grid gap-4">
        <label className="grid gap-1.5">
          <span className="text-[13px] font-medium">Why it is going back</span>
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Five bags arrived split" className={FIELD} />
        </label>
        {can.items?.length > 0 && (
          <fieldset className="grid gap-2">
            <legend className="text-[13px] font-medium mb-1.5">Goods going back</legend>
            {can.items.map((it) => (
              <label key={it.itemId} className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-3">
                <span className="text-[14px]">
                  {it.name} <span className="text-[var(--ink-muted)]">· up to {it.left} {it.unit || ""}</span>
                </span>
                <input aria-label={`${it.name}: how many going back`} value={qty[it.itemId] || ""} onChange={(e) => setQty({ ...qty, [it.itemId]: e.target.value })} inputMode="decimal" placeholder="0" className={`${FIELD} tabular text-right`} />
              </label>
            ))}
          </fieldset>
        )}
        <label className="grid gap-1.5">
          <span className="text-[13px] font-medium">{can.items?.length ? "And an amount of the other charges (optional)" : "Amount going back, with GST"}</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={can.items?.length ? "0.00" : can.left} className={`${FIELD} tabular`} />
        </label>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium">Dated</span>
            <input type="date" value={on} onChange={(e) => setOn(e.target.value)} className={FIELD} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium">Their credit note number (optional)</span>
            <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} className={FIELD} />
          </label>
        </div>
        {err && (
          <p role="alert" className="text-[13px] text-[var(--danger)]">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" disabled={busy || !ready}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            {!reason.trim() ? "Say why" : !ready ? "Say what goes back" : "Send it back"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
