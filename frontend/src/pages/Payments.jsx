import { useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { formatDate, today } from "@/lib/utils";
import { FIELD } from "@/lib/shipments";

/**
 * Payment runs: tick the supplier bills and expense claims to pay, say from
 * which account and when, and they are paid in one entry. Then the list of
 * transfers to make at the bank, to copy or download.
 */

const n = (s) => Number(String(s ?? "").replace(/,/g, "")) || 0;
const two = (x) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function download(transfers, paidOn) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = ["Payee,Account number,Amount (MVR),Reference", ...transfers.map((t) => [t.payee, t.bankAccount || "", t.amount.replace(/,/g, ""), t.reference].map(esc).join(","))].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `transfers-${paidOn}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Payments() {
  const { companyId } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["payments", companyId], queryFn: () => apiClient.get("/payments").then((r) => r.data), enabled: Boolean(companyId) });
  const [picked, setPicked] = useState({});
  const [f, setF] = useState({ fromAccountId: "", paidOn: today(), reference: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const chosen = useMemo(() => (data?.unpaid || []).filter((u) => picked[u.id] !== undefined), [data, picked]);
  const total = chosen.reduce((a, u) => a + n(picked[u.id]), 0);

  async function pay() {
    setBusy(true);
    try {
      const r = await apiClient.post("/payments", {
        ...f,
        reference: f.reference || null,
        items: chosen.map((u) => ({ [u.kind === "bill" ? "billId" : "claimId"]: u.id, amount: String(picked[u.id]).replace(/,/g, "") })),
      });
      setDone({ ...r.data, paidOn: f.paidOn });
      setPicked({});
      for (const k of ["payments", "bills", "claims", "figures", "attention", "bank"]) qc.invalidateQueries({ queryKey: [k, companyId] });
      toast.success(`MVR ${r.data.total} paid from ${r.data.from}`, `Entry ${r.data.entryNo}. Make the transfers below at the bank.`);
    } catch (ex) {
      toast.error("Not paid", ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Payments" description="Pay suppliers and claims in one run, and get the transfers to make at the bank." />
      {done && (
        <Card padding="lg" className="mb-4" data-testid="transfers">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle>Transfers to make · MVR {done.total}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => download(done.transfers, done.paidOn)}>
              <Download size={14} /> Download for the bank
            </Button>
          </div>
          <ul className="divide-y divide-[var(--border)] mt-2 text-[14px]">
            {done.transfers.map((t, i) => (
              <li key={i} className="py-2 flex items-baseline gap-3">
                <span className="flex-1 min-w-0 truncate">
                  {t.payee}
                  <span className="block text-[12px] text-[var(--ink-muted)] tabular">{t.bankAccount ? `Account ${t.bankAccount}` : "No account number on file"} · {t.reference}</span>
                </span>
                <Money amount={t.amount} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      {isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : !data.unpaid.length ? (
        <Card padding="lg">
          <p className="text-[16px] font-semibold">Nothing to pay</p>
          <p className="text-[14px] text-[var(--ink-muted)] mt-1.5">Bills in the books and approved claims that are still owed come here.</p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-[var(--border)]" data-testid="unpaid">
            {data.unpaid.map((u) => {
              const on = picked[u.id] !== undefined;
              return (
                <li key={u.id} className="px-5 py-3 flex items-center gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Pay ${u.payee} ${u.reference || ""}`}
                    checked={on}
                    onChange={() => setPicked((p) => (on ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== u.id)) : { ...p, [u.id]: u.owed.replace(/,/g, "") }))}
                    className="h-5 w-5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] truncate">{u.payee}</div>
                    <div className="text-[12px] text-[var(--ink-muted)]">
                      {u.kind === "claim" ? "Expense claim" : "Bill"} {u.reference || ""}
                      {u.due ? ` · ${formatDate(u.due)}` : ""} · MVR {u.owed} owed
                    </div>
                  </div>
                  {on ? (
                    <input aria-label={`Amount to pay ${u.payee}`} value={picked[u.id]} onChange={(e) => setPicked((p) => ({ ...p, [u.id]: e.target.value }))} inputMode="decimal" className={`${FIELD} w-32 tabular text-right`} />
                  ) : (
                    <Money amount={u.owed} className="text-[15px]" />
                  )}
                </li>
              );
            })}
          </ul>
          <div className="px-5 py-4 border-t border-[var(--border)] grid sm:grid-cols-[1fr_160px_160px_auto] gap-3 items-end">
            <label className="block">
              <span className="text-[13px] font-medium block mb-1">Pay from</span>
              <select id="pay-from" value={f.fromAccountId} onChange={(e) => setF({ ...f, fromAccountId: e.target.value })} className={FIELD}>
                <option value="">Pick one</option>
                {data.from.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[13px] font-medium block mb-1">On</span>
              <input type="date" value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} className={FIELD} />
            </label>
            <label className="block">
              <span className="text-[13px] font-medium block mb-1">Reference (optional)</span>
              <input id="pay-ref" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} className={FIELD} />
            </label>
            <Button variant="accent" disabled={busy || !chosen.length || !f.fromAccountId || total <= 0} onClick={pay}>
              {busy && <Loader2 size={14} className="animate-spin" />}
              Pay MVR {two(total)}
            </Button>
          </div>
        </Card>
      )}
      {data?.runs?.length > 0 && (
        <div className="mt-6">
          <h2 className="text-[13px] font-display font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)] mb-2">Earlier runs</h2>
          <Card padding="none">
            <ul className="divide-y divide-[var(--border)] text-[14px]">
              {data.runs.map((r) => (
                <li key={r.id} className="px-5 py-3 flex items-baseline gap-3">
                  <span className="flex-1">
                    {formatDate(r.paidOn)} · {r.items} {r.items === 1 ? "payment" : "payments"} from {r.from}
                    {r.reference ? ` · ${r.reference}` : ""} · entry {r.entryNo}
                  </span>
                  <Money amount={r.total} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
