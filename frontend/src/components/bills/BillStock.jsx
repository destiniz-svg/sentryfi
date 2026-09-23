import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";

/**
 * Which stock a bill brought in, set before it goes in the books: the items,
 * how many, and what each cost before tax, as printed. What the items do not
 * cover (delivery, say) stays a cost when the bill is posted.
 */

const FIELD =
  "w-full h-11 px-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] text-[var(--ink)] outline-none focus:border-[var(--ink)]";
const n = (s) => Number(String(s ?? "").replace(/,/g, "")) || 0;
const two = (x) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BillStock({ bill, onClose }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: items } = useQuery({
    queryKey: ["stock", companyId],
    queryFn: () => apiClient.get("/stock").then((r) => r.data.items),
  });
  useEffect(() => {
    apiClient.get(`/bills/${bill.id}/stock`).then((r) =>
      setRows(r.data.lines.length ? r.data.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, amount: l.amount })) : [{ itemId: "", quantity: "", amount: "" }])
    );
  }, [bill.id]);

  const cur = bill.fc_net !== null && bill.fc_net !== undefined ? bill.currency : "MVR";
  const printedNet = bill.fc_net !== null && bill.fc_net !== undefined ? Number(bill.fc_net) / 100 : n(bill.net);
  const covered = (rows || []).reduce((a, r) => a + n(r.amount), 0);
  const rest = printedNet - covered;
  const set = (i, k) => (e) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)));
  const live = (items || []).filter((i) => !i.archived);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const lines = rows.filter((r) => r.itemId).map((r) => ({ itemId: r.itemId, quantity: String(r.quantity).trim(), amount: String(r.amount).replace(/,/g, "") }));
      await apiClient.put(`/bills/${bill.id}/stock`, { lines });
      qc.invalidateQueries({ queryKey: ["bills", companyId] });
      toast.success(lines.length ? "Stock noted on the bill" : "No stock on this bill", "It moves into stock when the bill goes in the books.");
      onClose();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      as="form"
      onSubmit={onSubmit}
      title={`Stock on the bill from ${bill.supplier_name || "this supplier"}`}
      description={`${cur} ${two(printedNet)} before tax. Say which items it brought in and what each cost, as printed.`}
    >
      {!rows || !items ? (
        <Loader2 size={18} className="animate-spin text-[var(--ink-muted)]" />
      ) : live.length === 0 ? (
        <p className="text-[14px] text-[var(--ink-muted)]">Add the items you stock first, on the Stock page.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_80px_110px_auto] gap-2 items-end">
              <label className="block min-w-0">
                {i === 0 && <span className="text-[13px] font-medium block mb-1">Item</span>}
                <select aria-label="Item" value={r.itemId} onChange={set(i, "itemId")} className={FIELD}>
                  <option value="">Pick one</option>
                  {live.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                {i === 0 && <span className="text-[13px] font-medium block mb-1">How many</span>}
                <input aria-label="How many" value={r.quantity} onChange={set(i, "quantity")} inputMode="decimal" className={`${FIELD} tabular`} />
              </label>
              <label className="block">
                {i === 0 && <span className="text-[13px] font-medium block mb-1">Cost, {cur}</span>}
                <input aria-label="Cost before tax" value={r.amount} onChange={set(i, "amount")} inputMode="decimal" className={`${FIELD} tabular`} />
              </label>
              <button
                type="button"
                aria-label="Remove this line"
                onClick={() => setRows((rs) => (rs.length === 1 ? [{ itemId: "", quantity: "", amount: "" }] : rs.filter((_, j) => j !== i)))}
                className="h-11 w-11 rounded-full inline-flex items-center justify-center hover:bg-[var(--surface-2)] text-[var(--ink-muted)]"
              >
                <X size={15} />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Button type="button" variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, { itemId: "", quantity: "", amount: "" }])}>
              <Plus size={14} /> Another item
            </Button>
            {rows.length === 1 && !rows[0].amount && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setRows([{ ...rows[0], amount: two(printedNet) }])}>
                All of it is this item
              </Button>
            )}
          </div>
          <p className={`text-[14px] ${rest < -0.004 ? "text-[var(--danger)]" : "text-[var(--ink-muted)]"}`} data-testid="bill-stock-rest">
            {rest < -0.004
              ? `The items come to ${cur} ${two(-rest)} more than the bill.`
              : rest > 0.004
                ? `${cur} ${two(rest)} left over stays a cost (delivery, say).`
                : "The whole bill is stock."}
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
        <Button type="submit" variant="accent" disabled={busy || !rows || !live.length || rest < -0.004}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          Save
        </Button>
      </div>
    </Modal>
  );
}
