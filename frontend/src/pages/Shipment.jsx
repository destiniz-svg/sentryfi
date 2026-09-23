import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { Segments } from "@/components/mobile/parts";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { formatDate, today } from "@/lib/utils";
import { BASIS, FIELD } from "@/lib/shipments";

/**
 * One shipment: the bills that are its goods, which container each came in,
 * every cost of landing it, and what each unit really cost once those are
 * shared in. Sharing posts the waiting costs onto the goods.
 */

const KIND = { freight: "Freight", clearing: "Clearing", duty: "Customs", bank: "Bank charges", other: "Other" };
const n = (s) => Number(String(s ?? "").replace(/,/g, "")) || 0;

export default function Shipment() {
  const { id } = useParams();
  const { companyId, can } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);
  const key = ["shipments", companyId, id];
  const { data: s, isLoading } = useQuery({ queryKey: key, queryFn: () => apiClient.get(`/shipments/${id}`).then((r) => r.data), enabled: Boolean(companyId) });
  const refresh = () => {
    for (const k of ["shipments", "stock", "bills", "figures", "attention"]) qc.invalidateQueries({ queryKey: [k, companyId] });
  };
  const act = useMutation({ mutationFn: ({ method, url, body }) => apiClient[method](url, body).then((r) => r.data) });
  const run = async (req, said) => {
    try {
      const r = await act.mutateAsync(req);
      refresh();
      if (said) toast.success(...said(r));
    } catch (ex) {
      toast.error("Not yet", ex.message);
    }
  };

  if (isLoading || !s) return <Skeleton className="h-60 rounded-2xl" />;
  const waiting = n(s.waiting);
  const record = can("record");

  return (
    <div>
      <Link to="/shipments" className="inline-flex items-center gap-1.5 text-[14px] text-[var(--ink-muted)] hover:text-[var(--ink)] mb-2">
        <ArrowLeft size={14} /> Shipments
      </Link>
      <PageHeader
        title={s.reference}
        description={s.description || "Goods bought abroad and what it cost to land them."}
        actions={
          record &&
          waiting > 0 && (
            <Button
              variant="accent"
              disabled={act.isPending}
              onClick={() =>
                run({ method: "post", url: `/shipments/${id}/allocate`, body: { on: today() } }, (r) => [
                  `MVR ${r.total} shared into the goods`,
                  n(r.toSold) > 0 ? `Entry ${r.entryNo}. MVR ${r.toSold} of it was on goods already sold, so it went to cost of goods sold.` : `Entry ${r.entryNo}. Each item's cost now carries its share.`,
                ])
              }
            >
              {act.isPending && <Loader2 size={14} className="animate-spin" />}
              Share MVR {s.waiting} into the goods
            </Button>
          )
        }
      />

      <div className="grid grid-cols-3 gap-3 mb-4 max-w-xl">
        {[
          ["Goods", s.goodsValue],
          ["Landing costs", s.landed],
          ["On top", s.landedPercent === null ? "—" : `${s.landedPercent}%`],
        ].map(([label, v]) => (
          <Card key={label} padding="md">
            <div className="text-[13px] text-[var(--ink-muted)]">{label}</div>
            <div className="text-[19px] font-semibold mt-0.5 tabular" data-testid={`ship-${label.toLowerCase().replace(/ /g, "-")}`}>
              {label === "On top" ? v : <Money amount={v} />}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card padding="lg">
          <CardTitle>What each unit cost</CardTitle>
          <p className="text-[13px] text-[var(--ink-muted)] mt-1">The supplier's price, and with every landing cost shared in by value. Price from the second.</p>
          {s.items.length === 0 ? (
            <p className="text-[14px] text-[var(--ink-muted)] mt-3">No goods yet. Link the supplier's bill below, say which of its lines are stock, and put it in the books.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] mt-2" data-testid="ship-items">
              {s.items.map((i) => (
                <li key={i.itemId} className="py-2.5 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-baseline">
                  <div className="min-w-0">
                    <div className="text-[15px] truncate">{i.name}</div>
                    <div className="text-[12px] text-[var(--ink-muted)]">
                      {i.quantity} {i.unit}
                    </div>
                  </div>
                  <div className="text-[13px] text-[var(--ink-muted)] tabular text-right">
                    <Money amount={i.perUnit} />
                  </div>
                  <div className="text-[15px] font-semibold tabular text-right min-w-[92px]">
                    <Money amount={i.perUnitLanded} />
                    <span className="block text-[11px] font-normal text-[var(--ink-muted)]">a {i.unit}, landed</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="lg">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Landing costs</CardTitle>
            {record && (
              <Button variant="outline" size="sm" onClick={() => setPaying(true)}>
                <Plus size={14} /> Paid directly
              </Button>
            )}
          </div>
          <p className="text-[13px] text-[var(--ink-muted)] mt-1">
            Freight, the clearing agent, Customs, the bank. On a bill, say its lines were for this shipment in What it was for.
          </p>
          {s.costs.length === 0 ? (
            <p className="text-[14px] text-[var(--ink-muted)] mt-3">None yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] mt-2" data-testid="ship-costs">
              {s.costs.map((c) => (
                <li key={c.id} className="py-2.5 flex items-baseline gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] truncate">{c.description || KIND[c.kind]}</div>
                    <div className="text-[12px] text-[var(--ink-muted)]">
                      {KIND[c.kind]} · {c.billNo ? `bill ${c.billNo}` : "paid directly"} · {formatDate(c.paidOn)}
                    </div>
                  </div>
                  <Money amount={c.value} className="text-[15px]" />
                  {c.shared ? <Badge tone="success">Shared</Badge> : <Badge tone="accent">Waiting</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="lg">
          <CardTitle>How costs are shared</CardTitle>
          <div className="mt-3">
            <Segments
              label="Share landing costs"
              value={s.basis}
              onChange={(basis) => record && run({ method: "patch", url: `/shipments/${id}`, body: { basis } })}
              options={BASIS.map((b) => ({ value: b.value, label: b.label.replace("By ", "") }))}
            />
          </div>
          <p className="text-[13px] text-[var(--ink-muted)] mt-2">{BASIS.find((b) => b.value === s.basis)?.hint}</p>
          {s.containers.length > 0 && (
            <ul className="mt-3 text-[14px] space-y-1">
              {s.containers.map((c) => (
                <li key={c.id} className="flex justify-between gap-3 tabular">
                  <span>{c.number}</span>
                  <span className="text-[var(--ink-muted)]">
                    {c.size ? `${c.size} ft · ` : ""}
                    {c.cbm ? `${c.cbm} m³` : "CBM not given"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="lg">
          <CardTitle>Bills and goods</CardTitle>
          {s.bills.length > 0 && (
            <ul className="divide-y divide-[var(--border)] mt-2">
              {s.bills.map((b) => (
                <li key={b.id} className="py-2 flex items-baseline gap-3 text-[14px]">
                  <span className="flex-1 min-w-0 truncate">
                    {b.supplier || "Supplier"} {b.billNo ? `· ${b.billNo}` : ""}
                  </span>
                  <Money amount={b.gross} />
                  <Badge tone={b.status === "posted" ? "success" : "neutral"}>{b.status === "posted" ? "In the books" : "Not in the books yet"}</Badge>
                </li>
              ))}
            </ul>
          )}
          {record && s.candidates.length > 0 && (
            <select
              aria-label="Link a bill to this shipment"
              value=""
              onChange={(e) => e.target.value && run({ method: "put", url: `/shipments/${id}/bills/${e.target.value}`, body: { linked: true } })}
              className={`${FIELD} mt-3`}
            >
              <option value="">Link a bill: the supplier's, the agent's…</option>
              {s.candidates.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.supplier || "Supplier"}
                  {b.billNo ? ` · ${b.billNo}` : ""}
                  {b.issueDate ? ` · ${formatDate(b.issueDate)}` : ""}
                </option>
              ))}
            </select>
          )}
          {s.goods.length > 0 && s.containers.length > 0 && (
            <div className="mt-4">
              <div className="text-[13px] font-medium mb-1.5">Which container each came in</div>
              <ul className="space-y-2">
                {s.goods.map((g) => (
                  <li key={g.lineId} className="grid grid-cols-[minmax(0,1fr)_150px] gap-2 items-center text-[14px]">
                    <span className="truncate">
                      {g.name} · {g.quantity} {g.unit}
                    </span>
                    <select
                      aria-label={`Container for ${g.name}`}
                      value={g.containerId || ""}
                      disabled={!record}
                      onChange={(e) => run({ method: "put", url: `/shipments/${id}/goods/${g.lineId}`, body: { containerId: e.target.value || null } })}
                      className={`${FIELD} h-10 text-[14px]`}
                    >
                      <option value="">Not said</option>
                      {s.containers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.number}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {paying && <PayDirect shipment={s} onClose={() => setPaying(false)} onDone={refresh} />}
    </div>
  );
}

function PayDirect({ shipment, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ kind: "duty", description: "", amount: "", gstAmount: "", fromAccountId: "", on: today() });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const go = useMutation({ mutationFn: (body) => apiClient.post(`/shipments/${shipment.id}/costs`, body).then((r) => r.data) });

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      const r = await go.mutateAsync({ ...f, gstAmount: f.kind === "duty" && f.gstAmount ? f.gstAmount : null, description: f.description || null });
      onDone();
      toast.success("Added to the landing costs", `Entry ${r.entryNo}. It waits on the shipment until it is shared into the goods.`);
      onClose();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title="A cost paid directly" description="Customs, the bank's charges: anything paid for this shipment without a bill.">
      <div className="grid gap-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">What for</span>
            <select id="pay-kind" value={f.kind} onChange={set("kind")} className={FIELD}>
              <option value="duty">Customs duty</option>
              <option value="bank">Bank charges (transfer, LC)</option>
              <option value="freight">Freight</option>
              <option value="clearing">Clearing</option>
              <option value="other">Something else</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Paid on</span>
            <input id="pay-on" type="date" value={f.on} onChange={set("on")} className={FIELD} />
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">{f.kind === "duty" ? "Duty" : "Amount"}, MVR</span>
            <input id="pay-amount" value={f.amount} onChange={set("amount")} inputMode="decimal" placeholder="0.00" className={`${FIELD} tabular`} />
          </label>
          {f.kind === "duty" && (
            <label className="block">
              <span className="text-sm font-medium block mb-1.5">GST paid at Customs, MVR</span>
              <input id="pay-gst" value={f.gstAmount} onChange={set("gstAmount")} inputMode="decimal" placeholder="0.00" className={`${FIELD} tabular`} />
            </label>
          )}
        </div>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">Paid from</span>
          <select id="pay-from" value={f.fromAccountId} onChange={set("fromAccountId")} className={FIELD}>
            <option value="">Pick one</option>
            {shipment.payFrom.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">Note (optional)</span>
          <input id="pay-desc" value={f.description} onChange={set("description")} placeholder="Customs declaration number" className={FIELD} />
        </label>
        {f.kind === "duty" && (
          <p className="text-[13px] text-[var(--ink-muted)]">
            A GST-registered company claims the GST back, so it is kept apart from the goods. Otherwise it is part of what they cost.
          </p>
        )}
      </div>
      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">
          {err}
        </p>
      )}
      <div className="flex justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="accent" disabled={go.isPending || !(n(f.amount) > 0 || n(f.gstAmount) > 0) || !f.fromAccountId}>
          {go.isPending && <Loader2 size={14} className="animate-spin" />}
          Add it
        </Button>
      </div>
    </Modal>
  );
}
