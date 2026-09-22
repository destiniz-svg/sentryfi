import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { formatDate } from "@/lib/utils";

/**
 * Loans: money borrowed, and money a director owes the business. What is still
 * owed comes from the journal; each repayment is split into what reduced the
 * debt and what it cost, so the profit and loss only ever carries the cost.
 */

const FIELD =
  "w-full h-11 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15";

const today = () => new Date().toISOString().slice(0, 10);

function useRefresh() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return () => {
    for (const k of ["loans", "figures", "attention", "bank", "assets"]) qc.invalidateQueries({ queryKey: [k, companyId] });
  };
}

function rateLine(l) {
  if (!l.ratePct) return "No interest";
  if (l.rateBasis === "flat") return `${l.ratePct}% flat — really about ${l.effectivePct}% a year on what is owed`;
  return `${l.ratePct}% a year on what is still owed`;
}

export default function Loans() {
  const { companyId, can } = useCompany();
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(null);
  const [open, setOpen] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["loans", companyId],
    queryFn: () => apiClient.get("/loans").then((r) => r.data),
    enabled: Boolean(companyId),
  });
  const list = data?.loans || [];

  return (
    <div>
      <PageHeader
        title="Loans"
        description="What the business has borrowed, what it still owes, and what each repayment cost."
        actions={
          can("adjust") && (
            <Button variant="accent" onClick={() => setAdding(true)}>
              <Plus size={16} /> Add a loan
            </Button>
          )
        }
      />

      {isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : list.length === 0 ? (
        <Card padding="lg">
          <p className="text-[16px] font-semibold">No loans yet</p>
          <p className="text-[14px] text-[var(--ink-muted)] mt-1.5 max-w-prose">
            A bank loan, hire purchase on a vehicle, a trust receipt on an import, murabaha or ijara, or money a director put in or
            took out. Add one and every repayment is split for you: the part that pays down the debt, and the part that is its
            cost. Only the cost is an expense.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((l) => (
            <Card key={l.id} padding="none" className="overflow-hidden" data-testid="loan">
              <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[16px] font-semibold">{l.name}</span>
                      <Badge tone="neutral">{l.kindName}</Badge>
                      {l.settled && <Badge tone="success">Paid off</Badge>}
                      {l.next?.late && <Badge tone="danger">Instalment due</Badge>}
                    </div>
                    <div className="text-[13px] text-[var(--ink-muted)] mt-1">{rateLine(l)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] text-[var(--ink-muted)]">{l.lent ? "Still owed to us" : "Still owed"}</div>
                    <div className="text-[22px] font-semibold">
                      <Money amount={l.owed} />
                    </div>
                  </div>
                </div>
                <div className="grid sm:grid-cols-3 gap-3 mt-4 text-[14px]">
                  <div>
                    <div className="text-[13px] text-[var(--ink-muted)]">Borrowed</div>
                    <Money amount={l.principal} /> <span className="text-[var(--ink-muted)]">on {formatDate(l.startsOn)}</span>
                  </div>
                  <div>
                    <div className="text-[13px] text-[var(--ink-muted)]">{l.costName === "interest" ? "Interest" : l.costName[0].toUpperCase() + l.costName.slice(1)} paid so far</div>
                    <Money amount={l.paidInterest} /> <span className="text-[var(--ink-muted)]">· {l.payments} {l.payments === 1 ? "payment" : "payments"}</span>
                  </div>
                  {l.next && (
                    <div>
                      <div className="text-[13px] text-[var(--ink-muted)]">Next, due {formatDate(l.next.due)}</div>
                      <Money amount={l.next.payment} />{" "}
                      <span className="text-[var(--ink-muted)]">
                        ({l.next.principal} off the debt, {l.next.interest} {l.costName})
                      </span>
                    </div>
                  )}
                </div>
                {l.assetBacked && l.owed === "0.00" && l.payments === 0 && (
                  <p className="text-[13px] mt-3">
                    Nothing is owed on it yet.{" "}
                    <Link to="/assets" className="underline underline-offset-2">
                      Add what it paid for on Fixed assets
                    </Link>{" "}
                    and pick this loan under how it was paid for.
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mt-4">
                  {can("record") && !l.settled && (
                    <Button variant="outline" onClick={() => setPaying(l)}>
                      {l.lent ? "Record money repaid to us" : "Record a repayment"}
                    </Button>
                  )}
                  {l.schedule.length > 0 && (
                    <Button variant="ghost" onClick={() => setOpen(open === l.id ? null : l.id)} aria-expanded={open === l.id}>
                      {open === l.id ? "Hide the schedule" : "The lender's schedule"}
                    </Button>
                  )}
                </div>
              </div>
              {open === l.id && <Schedule rows={l.schedule} costName={l.costName} />}
            </Card>
          ))}
        </div>
      )}

      {adding && data && <AddLoan data={data} onClose={() => setAdding(false)} />}
      {paying && data && <Repay loan={paying} places={data.places} onClose={() => setPaying(null)} />}
    </div>
  );
}

function Schedule({ rows, costName }) {
  const cols = "grid grid-cols-[40px_100px_1fr_1fr_1fr_1fr] gap-3";
  return (
    <div className="border-t border-[var(--border)] overflow-x-auto">
      <div className="min-w-[560px]">
        <div className={`${cols} px-5 py-2.5 font-display text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]`}>
          <span>#</span>
          <span>Due</span>
          <span className="text-right">Payment</span>
          <span className="text-right">Off the debt</span>
          <span className="text-right">{costName}</span>
          <span className="text-right">Owed after</span>
        </div>
        {rows.map((r) => (
          <div key={r.n} className={`${cols} px-5 py-2 border-t border-[var(--border)] text-[14px]`}>
            <span className="text-[var(--ink-muted)] tabular">{r.n}</span>
            <span className="tabular">{formatDate(r.due)}</span>
            <span className="text-right"><Money amount={r.payment} /></span>
            <span className="text-right"><Money amount={r.principal} /></span>
            <span className="text-right text-[var(--ink-muted)]"><Money amount={r.interest} /></span>
            <span className="text-right"><Money amount={r.closing} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddLoan({ data, onClose }) {
  const toast = useToast();
  const refresh = useRefresh();
  const [f, setF] = useState({ name: "", kind: "bank_term", principal: "", ratePct: "", rateBasis: "reducing", method: "annuity", termMonths: "", startsOn: today(), fee: "", intoAccountId: "" });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const kind = data.kinds.find((k) => k.key === f.kind);
  const director = f.kind === "director_in" || f.kind === "director_out";
  const save = useMutation({ mutationFn: (body) => apiClient.post("/loans", body).then((r) => r.data) });

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      await save.mutateAsync({
        name: f.name,
        kind: f.kind,
        principal: f.principal,
        ratePct: f.ratePct ? Number(f.ratePct) : 0,
        rateBasis: f.rateBasis,
        method: director && !f.termMonths ? "none" : f.method,
        termMonths: f.termMonths ? Number(f.termMonths) : null,
        startsOn: f.startsOn,
        fee: f.fee || null,
        intoAccountId: kind?.assetBacked ? null : f.intoAccountId,
      });
      refresh();
      toast.success(`${f.name.trim()} is added`, kind?.assetBacked ? "Now add what it paid for on Fixed assets, paid for by this loan." : "Every repayment will be split for you.");
      onClose();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title="Add a loan" description="Put the terms in the way the lender wrote them.">
      <div className="grid gap-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Kind</span>
            <select id="loan-kind" value={f.kind} onChange={set("kind")} className={FIELD}>
              {data.kinds.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Name</span>
            <input id="loan-name" value={f.name} onChange={set("name")} placeholder={director ? "Director Ahmed" : "BML term loan"} className={FIELD} />
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">{f.kind === "director_out" ? "Amount taken" : "Amount borrowed"}</span>
            <input id="loan-principal" value={f.principal} onChange={set("principal")} inputMode="decimal" placeholder="120,000.00" className={`${FIELD} tabular`} />
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Received on</span>
            <input id="loan-date" type="date" value={f.startsOn} onChange={set("startsOn")} className={FIELD} />
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">{kind?.islamic ? `Rate of ${kind.islamic}, % a year` : "Interest, % a year"}</span>
            <input id="loan-rate" value={f.ratePct} onChange={set("ratePct")} inputMode="decimal" placeholder={director ? "0" : "12"} className={FIELD} />
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">The rate is</span>
            <select id="loan-basis" value={f.rateBasis} onChange={set("rateBasis")} className={FIELD}>
              <option value="reducing">On what is still owed (reducing balance)</option>
              <option value="flat">On the whole amount, for the whole term (flat)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Repaid over, in months{director ? " (optional)" : ""}</span>
            <input id="loan-term" value={f.termMonths} onChange={set("termMonths")} inputMode="numeric" placeholder="36" className={FIELD} />
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Instalments</span>
            <select id="loan-method" value={f.method} onChange={set("method")} className={FIELD}>
              <option value="annuity">The same each month</option>
              <option value="equal_principal">The same off the debt each month, falling</option>
            </select>
          </label>
          {!director && !kind?.assetBacked && (
            <label className="block">
              <span className="text-sm font-medium block mb-1.5">Fee taken at the start (optional)</span>
              <input id="loan-fee" value={f.fee} onChange={set("fee")} inputMode="decimal" placeholder="0.00" className={`${FIELD} tabular`} />
            </label>
          )}
          {!kind?.assetBacked && (
            <label className="block">
              <span className="text-sm font-medium block mb-1.5">{f.kind === "director_out" ? "Paid out of" : "Paid into"}</span>
              <select id="loan-into" value={f.intoAccountId} onChange={set("intoAccountId")} className={FIELD}>
                <option value="">Pick one</option>
                {data.places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {f.rateBasis === "flat" && (
          <p className="text-[13px]">
            A flat rate is charged on the whole amount even as you pay it down, so it costs about twice what it says. Sentryfi
            shows the real yearly rate beside it.
          </p>
        )}
        {kind?.assetBacked && (
          <p className="text-[13px]">
            No money comes to you: the lender pays for the asset. Add the loan, then add the asset on Fixed assets and pick this
            loan under how it was paid for.
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
        <Button type="submit" variant="accent" disabled={save.isPending || !f.name.trim() || !f.principal}>
          {save.isPending && <Loader2 size={14} className="animate-spin" />}
          Add {f.principal ? `MVR ${f.principal}` : "it"}
        </Button>
      </div>
    </Modal>
  );
}

function Repay({ loan, places, onClose }) {
  const toast = useToast();
  const refresh = useRefresh();
  const [on, setOn] = useState(today());
  const [amount, setAmount] = useState(loan.next?.payment || "");
  const [from, setFrom] = useState("");
  const [interest, setInterest] = useState("");
  const [err, setErr] = useState("");
  const go = useMutation({ mutationFn: (body) => apiClient.post(`/loans/${loan.id}/repay`, body).then((r) => r.data) });

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      const r = await go.mutateAsync({ on, amount, fromAccountId: from, interest: interest.trim() || null });
      refresh();
      toast.success(`MVR ${amount} recorded`, `${r.principal} off the debt, ${r.cost} ${r.costName}. Still owed: MVR ${r.owedAfter}.`);
      onClose();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title={loan.lent ? `${loan.name}: money repaid to us` : `${loan.name}: a repayment`} description={`Still owed: MVR ${loan.owed}.`}>
      <div className="grid gap-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Paid on</span>
            <input id="repay-on" type="date" value={on} onChange={(e) => setOn(e.target.value)} className={FIELD} />
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Amount</span>
            <input id="repay-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={`${FIELD} tabular`} />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">{loan.lent ? "Paid into" : "Paid from"}</span>
          <select id="repay-from" value={from} onChange={(e) => setFrom(e.target.value)} className={FIELD}>
            <option value="">Pick one</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">Of which {loan.costName}, if the lender says (optional)</span>
          <input id="repay-interest" value={interest} onChange={(e) => setInterest(e.target.value)} inputMode="decimal" placeholder="Worked out for you" className={`${FIELD} tabular`} />
          <span className="block text-[13px] text-[var(--ink-muted)] mt-1.5">
            Left empty, it is worked out from the rate and the days since the last payment. The lender's statement always wins.
          </span>
        </label>
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
        <Button type="submit" variant="accent" disabled={go.isPending || !amount || !from}>
          {go.isPending && <Loader2 size={14} className="animate-spin" />}
          Record MVR {amount || "0.00"}
        </Button>
      </div>
    </Modal>
  );
}
