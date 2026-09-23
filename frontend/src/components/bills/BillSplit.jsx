import { useEffect, useState } from "react";
import { Check, HelpCircle, Loader2, Plus, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Segments } from "@/components/mobile/parts";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";

/**
 * What a bill was for, charge by charge: stock (an item and how many), a cost
 * (which kind), or something used for years (onto the asset register). The
 * adviser fills each line in and says why; a line it is unsure of is marked as
 * a question. What is saved is remembered, so the same charge from the same
 * supplier goes in by itself next time.
 */

const BOX =
  "h-11 px-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] text-[var(--ink)] outline-none focus:border-[var(--ink)]";
const FIELD = `w-full ${BOX}`;
const n = (s) => Number(String(s ?? "").replace(/,/g, "")) || 0;
const two = (x) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const KINDS = [
  { value: "cost", label: "Cost" },
  { value: "stock", label: "Stock" },
  { value: "asset", label: "Asset" },
];
const blank = () => ({ kind: "cost", description: "", amount: "", itemId: "", quantity: "", accountId: "", category: "", lifeYears: "", sure: true, because: null });

export function BillSplit({ bill, onClose }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiClient
      .get(`/bills/${bill.id}/split`)
      .then((r) => {
        setData(r.data);
        setRows(r.data.lines.map((l) => ({ ...blank(), ...l, itemId: l.itemId || "", accountId: l.accountId || "", category: l.category || "", lifeYears: l.lifeYears ?? "" })));
      })
      .catch((ex) => setErr(ex.message));
  }, [bill.id]);

  const set = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch, sure: true } : r)));
  const covered = rows.reduce((a, r) => a + n(r.amount), 0);
  const rest = data ? n(data.net) - covered : 0;
  const asking = rows.filter((r) => !r.sure).length;
  const o = data?.options;

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const lines = rows
        .filter((r) => n(r.amount) > 0)
        .map((r) => ({
          kind: r.kind,
          description: r.description,
          amount: String(r.amount).replace(/,/g, ""),
          itemId: r.kind === "stock" ? r.itemId || null : null,
          quantity: r.kind === "stock" ? String(r.quantity) : null,
          accountId: r.kind === "cost" ? r.accountId || null : null,
          category: r.kind === "asset" ? r.category || null : null,
          lifeYears: r.kind === "asset" && r.lifeYears !== "" ? Number(r.lifeYears) : null,
        }));
      await apiClient.put(`/bills/${bill.id}/split`, { lines });
      qc.invalidateQueries({ queryKey: ["bills", companyId] });
      toast.success("Saved, and remembered", "The same charges from this supplier go in by themselves next time.");
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
      title="What was it for?"
      description={
        data
          ? `${bill.supplier_name || "This bill"}, ${data.currency} ${data.net} before tax.${asking ? ` ${asking === 1 ? "One line needs" : `${asking} lines need`} you.` : ""}`
          : "Reading the bill…"
      }
    >
      {!data ? (
        err ? null : <Loader2 size={18} className="animate-spin text-[var(--ink-muted)]" />
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} data-testid="split-line" className={`rounded-xl border p-3 space-y-2.5 ${r.sure ? "border-[var(--border)]" : "border-[var(--accent)] bg-[var(--accent-soft)]"}`}>
              <div className="flex items-start gap-2">
                <input
                  aria-label={`Line ${i + 1}: what it is`}
                  value={r.description}
                  onChange={(e) => set(i, { description: e.target.value })}
                  placeholder="What it is"
                  className={`${BOX} flex-1 min-w-0`}
                />
                <input
                  aria-label={`Line ${i + 1}: amount`}
                  value={r.amount}
                  onChange={(e) => set(i, { amount: e.target.value })}
                  inputMode="decimal"
                  className={`${BOX} w-28 shrink-0 tabular text-right`}
                />
                <button
                  type="button"
                  aria-label={`Remove line ${i + 1}`}
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  className="h-11 w-11 shrink-0 rounded-full inline-flex items-center justify-center hover:bg-[var(--surface-2)] text-[var(--ink-muted)]"
                >
                  <X size={15} />
                </button>
              </div>
              <Segments label={`Line ${i + 1}: kind`} value={r.kind} onChange={(kind) => set(i, { kind })} options={KINDS} />
              {r.kind === "cost" && (
                <select aria-label={`Line ${i + 1}: kind of cost`} value={r.accountId} onChange={(e) => set(i, { accountId: e.target.value })} className={FIELD}>
                  <option value="">Which kind of cost?</option>
                  {o.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}
              {r.kind === "stock" &&
                (o.items.length ? (
                  <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                    <select aria-label={`Line ${i + 1}: item`} value={r.itemId} onChange={(e) => set(i, { itemId: e.target.value })} className={FIELD}>
                      <option value="">Which item?</option>
                      {o.items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`Line ${i + 1}: how many`}
                      value={r.quantity}
                      onChange={(e) => set(i, { quantity: e.target.value })}
                      inputMode="decimal"
                      placeholder="How many"
                      className={`${FIELD} tabular`}
                    />
                  </div>
                ) : (
                  <p className="text-[13px] text-[var(--ink-muted)]">Add the item on the Stock page first.</p>
                ))}
              {r.kind === "asset" && (
                <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
                  <select
                    aria-label={`Line ${i + 1}: kind of asset`}
                    value={r.category}
                    onChange={(e) => set(i, { category: e.target.value, lifeYears: o.categories.find((c) => c.key === e.target.value)?.years ?? "" })}
                    className={FIELD}
                  >
                    <option value="">Which kind?</option>
                    {o.categories.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`Line ${i + 1}: years it will be used`}
                    value={r.lifeYears}
                    onChange={(e) => set(i, { lifeYears: e.target.value })}
                    inputMode="decimal"
                    placeholder="Years"
                    className={`${FIELD} tabular`}
                  />
                </div>
              )}
              {r.because && (
                <p className="text-[13px] text-[var(--ink-muted)] flex items-start gap-1.5" data-testid="split-because">
                  {r.sure ? <Check size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> : <HelpCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />}
                  <span>
                    {r.sure ? "" : "A suggestion. "}
                    {r.because}
                  </span>
                </p>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Button type="button" variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, { ...blank(), amount: rest > 0.004 ? two(rest) : "" }])}>
              <Plus size={14} /> Another line
            </Button>
            <p className={`text-[14px] ${rest < -0.004 ? "text-[var(--danger)]" : "text-[var(--ink-muted)]"}`} data-testid="split-rest">
              {rest < -0.004
                ? `${data.currency} ${two(-rest)} more than the bill.`
                : rest > 0.004
                  ? `${data.currency} ${two(rest)} not said: a general cost.`
                  : "Every laari is accounted for."}
            </p>
          </div>
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
        <Button type="submit" variant="accent" disabled={busy || !data || rest < -0.004}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          Save
        </Button>
      </div>
    </Modal>
  );
}
