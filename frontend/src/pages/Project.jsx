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
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { formatDate, today } from "@/lib/utils";
import { FIELD } from "@/lib/shipments";

/**
 * One project: spent, committed, claimed, certified and retained, each open
 * to the entries behind it; cost against budget by kind; the claims and what
 * was certified and invoiced for each; and what is committed to suppliers.
 */

const n = (s) => Number(String(s ?? "").replace(/,/g, "")) || 0;

export default function Project() {
  const { id } = useParams();
  const { companyId, can } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(null); // which dialog
  const [looking, setLooking] = useState(null); // which figure's entries
  const { data: p, isLoading } = useQuery({
    queryKey: ["projects", companyId, id],
    queryFn: () => apiClient.get(`/projects/${id}`).then((r) => r.data),
    enabled: Boolean(companyId),
  });
  const refresh = () => {
    for (const k of ["projects", "sales", "figures", "attention", "bills"]) qc.invalidateQueries({ queryKey: [k, companyId] });
  };
  const act = useMutation({ mutationFn: ({ method, url, body }) => apiClient[method](url, body).then((r) => r.data) });
  const run = async (req, said) => {
    try {
      const r = await act.mutateAsync(req);
      refresh();
      if (said) toast.success(...said(r));
      return true;
    } catch (ex) {
      toast.error("Not yet", ex.message);
      return false;
    }
  };

  if (isLoading || !p) return <Skeleton className="h-60 rounded-2xl" />;
  const record = can("record");
  const last = p.claims[p.claims.length - 1];
  const waiting = last && last.certified === null ? last : null;
  const customer = p.customers.find((c) => c.id === p.customerId);
  const figures = [
    ["Contract", p.contract, null],
    ["Spent", p.spent, { figure: "spent" }],
    ["Committed", p.committed, "commitments"],
    ["Claimed", p.claimed, "claims"],
    ["Certified", p.certified, { figure: "revenue" }],
    ["Retention held", p.retentionHeld, { figure: "retention" }],
    ["Heading for", p.forecastMargin, null],
  ];

  return (
    <div>
      <Link to="/projects" className="inline-flex items-center gap-1.5 text-[14px] text-[var(--ink-muted)] hover:text-[var(--ink)] mb-2">
        <ArrowLeft size={14} /> Projects
      </Link>
      <PageHeader
        title={p.name}
        description={
          p.contract
            ? `For ${customer?.name || "a customer"}. ${p.retentionPct}% retention${p.retentionCapPct !== null ? `, up to ${p.retentionCapPct}% of the contract` : ""}.`
            : "Set up its contract to claim against it."
        }
        actions={
          record && (
            <>
              <Button variant="outline" onClick={() => setOpen("contract")}>
                {p.contract ? "Contract" : "Set up the contract"}
              </Button>
              {p.contract && !waiting && (
                <Button variant="accent" onClick={() => setOpen("claim")}>
                  <Plus size={16} /> Progress claim
                </Button>
              )}
              {waiting && (
                <Button variant="accent" onClick={() => setOpen("certify")}>
                  Certify claim {waiting.number}
                </Button>
              )}
            </>
          )
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
        {figures.map(([label, value, opens]) => (
          <button
            key={label}
            type="button"
            disabled={!opens}
            data-testid={`fig-${label.toLowerCase().replace(/ /g, "-")}`}
            onClick={() => (typeof opens === "string" ? document.getElementById(`card-${opens}`)?.scrollIntoView({ behavior: "smooth" }) : setLooking({ ...opens, label }))}
            className="text-left rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 enabled:hover:border-[var(--ink)] disabled:cursor-default"
          >
            <div className="text-[12px] text-[var(--ink-muted)]">{label}</div>
            <div className="text-[17px] font-semibold mt-0.5">{value === null || value === undefined ? <span className="text-[var(--ink-muted)]">—</span> : <Money amount={value} />}</div>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card padding="lg" id="card-budget" className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Cost against budget</CardTitle>
            {record && (
              <Button variant="outline" size="sm" onClick={() => setOpen("budget")}>
                Budget
              </Button>
            )}
          </div>
          <p className="text-[13px] text-[var(--ink-muted)] mt-1">
            Heading for MVR {p.forecastCost}: MVR {p.costToComplete} still to spend
            {p.percentComplete !== null ? `, ${p.percentComplete}% spent` : ""}.
          </p>
          {p.lines.length === 0 ? (
            <p className="text-[14px] text-[var(--ink-muted)] mt-3">No budget and nothing spent yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto -mx-1" data-testid="budget-lines">
              <table className="w-full text-[14px] tabular">
                <thead>
                  <tr className="text-[12px] text-[var(--ink-muted)] text-right">
                    <th className="text-left font-medium px-1 pb-1.5">Kind</th>
                    <th className="font-medium px-1 pb-1.5">Budget</th>
                    <th className="font-medium px-1 pb-1.5">Spent</th>
                    <th className="font-medium px-1 pb-1.5">Committed</th>
                    <th className="font-medium px-1 pb-1.5">Heading for</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {p.lines.map((l) => (
                    <tr key={l.accountId} className="text-right">
                      <td className="text-left px-1 py-2">
                        {l.name} {l.over && <Badge tone="danger">Over</Badge>}
                      </td>
                      <td className="px-1 py-2 text-[var(--ink-muted)]">
                        <Money amount={l.budget} />
                      </td>
                      <td className="px-1 py-2">
                        <button type="button" className="hover:underline" onClick={() => setLooking({ figure: "spent", accountId: l.accountId, label: `Spent on ${l.name.toLowerCase()}` })}>
                          <Money amount={l.spent} />
                        </button>
                      </td>
                      <td className="px-1 py-2">
                        <Money amount={l.committed} />
                      </td>
                      <td className={`px-1 py-2 font-semibold ${l.over ? "text-[var(--danger)]" : ""}`}>
                        <Money amount={l.forecast} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card padding="lg" id="card-claims" className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Claims and certificates</CardTitle>
            {record && n(p.retentionHeld) > 0 && (
              <Button variant="outline" size="sm" onClick={() => setOpen("release")}>
                Release retention
              </Button>
            )}
          </div>
          <p className="text-[13px] text-[var(--ink-muted)] mt-1">
            Each claim is all the work done to date. Its certificate, less retention, is invoiced; the retention is invoiced when released.
          </p>
          {p.claims.length === 0 ? (
            <p className="text-[14px] text-[var(--ink-muted)] mt-3">No claims yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] mt-2" data-testid="claims">
              {p.claims.map((c) => (
                <li key={c.id} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px] font-medium">
                      Claim {c.number} <span className="text-[13px] font-normal text-[var(--ink-muted)]">to {formatDate(c.periodTo)}</span>
                    </span>
                    {c.certified === null ? <Badge tone="accent">Waiting for its certificate</Badge> : <Badge tone="success">Certified {formatDate(c.certifiedOn)}</Badge>}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1.5 text-[13px] tabular">
                    <span>
                      <span className="text-[var(--ink-muted)]">claimed </span>
                      <Money amount={c.claimed} />
                    </span>
                    {c.certified !== null && (
                      <>
                        <span>
                          <span className="text-[var(--ink-muted)]">certified </span>
                          <Money amount={c.certified} />
                        </span>
                        <span>
                          <span className="text-[var(--ink-muted)]">retention </span>
                          <Money amount={c.retention} />
                        </span>
                        <span>
                          <span className="text-[var(--ink-muted)]">invoiced </span>
                          <Money amount={c.invoiced} />
                        </span>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[13px] text-[var(--ink-muted)] mt-3">
            Invoiced MVR {p.invoiced} with GST, MVR {p.received} received.
          </p>
        </Card>

        <Card padding="lg" id="card-commitments" className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Committed</CardTitle>
            {record && (
              <Button variant="outline" size="sm" onClick={() => setOpen("commit")}>
                <Plus size={14} /> Order or subcontract
              </Button>
            )}
          </div>
          <p className="text-[13px] text-[var(--ink-muted)] mt-1">What the project has agreed to pay and not yet been billed for.</p>
          {p.commitments.length === 0 ? (
            <p className="text-[14px] text-[var(--ink-muted)] mt-3">Nothing committed.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] mt-2" data-testid="commitments">
              {p.commitments.map((c) => (
                <li key={c.id} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px] min-w-0 truncate">{c.description}</span>
                    <Money amount={c.open} className="text-[15px] font-semibold" />
                  </div>
                  <div className="text-[12px] text-[var(--ink-muted)]">
                    {c.supplier ? `${c.supplier} · ` : ""}
                    {c.account} · MVR {c.amount} agreed, {c.billed} billed
                  </div>
                  {record && n(c.open) > 0 && p.bills.length > 0 && (
                    <select
                      aria-label={`A bill against ${c.description}`}
                      value=""
                      onChange={(e) =>
                        e.target.value &&
                        run({ method: "put", url: `/projects/${id}/commitments/${c.id}/bills/${e.target.value}` }, () => ["Billed against it", "Once the bill is in the books it counts as spent, not committed."])
                      }
                      className={`${FIELD} h-9 text-[13px] mt-1.5`}
                    >
                      <option value="">A bill against it…</option>
                      {p.bills.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.supplier || "Supplier"}
                          {b.billNo ? ` · ${b.billNo}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="lg" id="card-variations" className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Variations</CardTitle>
            {record && p.contract && (
              <Button variant="outline" size="sm" onClick={() => setOpen("vary")}>
                <Plus size={14} /> Variation
              </Button>
            )}
          </div>
          <p className="text-[13px] text-[var(--ink-muted)] mt-1">
            {p.originalContract && p.originalContract !== p.contract
              ? `Signed at MVR ${p.originalContract}; MVR ${p.contract} with the approved variations.`
              : "Changes to the work. Only an approved variation changes the contract."}
            {n(p.variationsPending) !== 0 ? ` MVR ${p.variationsPending} proposed and waiting.` : ""}
          </p>
          {p.variations.length === 0 ? (
            <p className="text-[14px] text-[var(--ink-muted)] mt-3">None yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] mt-2" data-testid="variations">
              {p.variations.map((v) => (
                <li key={v.id} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px] min-w-0 truncate">
                      <span className="text-[var(--ink-muted)]">VO-{v.number}</span> {v.description}
                    </span>
                    <Money amount={v.amount} className="text-[15px] font-semibold" />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mt-1">
                    {v.status === "approved" ? (
                      <Badge tone="success">Approved {formatDate(v.decidedOn)}</Badge>
                    ) : v.status === "rejected" ? (
                      <Badge>Rejected</Badge>
                    ) : (
                      <Badge tone="accent">Waiting for the customer</Badge>
                    )}
                    {record && v.status === "proposed" && (
                      <span className="flex gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => run({ method: "post", url: `/projects/${id}/variations/${v.id}/decide`, body: { approved: true, on: today() } }, () => [`VO-${v.number} approved`, "It is part of the contract now, and claims can include it."])}>
                          Approved
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => run({ method: "post", url: `/projects/${id}/variations/${v.id}/decide`, body: { approved: false, on: today() } }, () => [`VO-${v.number} rejected`, "The contract is unchanged."])}>
                          Rejected
                        </Button>
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="lg" id="card-boq" className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Bill of quantities</CardTitle>
            {record && (
              <Button variant="outline" size="sm" onClick={() => setOpen("boq")}>
                {p.boq.length ? "Change" : <><Plus size={14} /> Add items</>}
              </Button>
            )}
          </div>
          <p className="text-[13px] text-[var(--ink-muted)] mt-1">
            {p.boq.length ? `MVR ${p.boqTotal} priced. Claims are measured from it: how much of each item is done.` : "What the contract is priced from, item by item. With it, a claim is measured rather than typed."}
          </p>
          {p.boq.length > 0 && (
            <ul className="divide-y divide-[var(--border)] mt-2" data-testid="boq">
              {p.boq.map((b) => (
                <li key={b.id} className="py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[14px] min-w-0 truncate">
                      {b.ref && <span className="text-[var(--ink-muted)]">{b.ref} </span>}
                      {b.description}
                    </span>
                    <Money amount={b.amount} className="text-[14px]" />
                  </div>
                  <div className="text-[12px] text-[var(--ink-muted)] tabular">
                    {b.quantity} {b.unit} at {b.rate} · done {b.done} ({b.doneValue})
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="lg" id="card-hours" className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Hours</CardTitle>
            {record && (
              <Button variant="outline" size="sm" onClick={() => setOpen("hours")}>
                <Plus size={14} /> Hours worked
              </Button>
            )}
          </div>
          <p className="text-[13px] text-[var(--ink-muted)] mt-1">
            {n(p.hours.total) > 0 ? `${p.hours.total} hours${n(p.hours.value) > 0 ? `, worth MVR ${p.hours.value} at their rates` : ""}. ` : ""}
            Kept for the project, not posted: wages reach the books through bills or payroll.
          </p>
          {p.hours.entries.length > 0 && (
            <ul className="divide-y divide-[var(--border)] mt-2" data-testid="hours">
              {p.hours.entries.map((h) => (
                <li key={h.id} className="py-2 flex items-center justify-between gap-3">
                  <span className="text-[14px] min-w-0">
                    <span className="block truncate">{h.who}</span>
                    <span className="block truncate text-[12px] text-[var(--ink-muted)]">{formatDate(h.on)}{h.note ? ` · ${h.note}` : ""}</span>
                  </span>
                  <span className="flex items-baseline gap-2 text-[14px] tabular shrink-0">
                    {h.hours} h{h.rate ? <span className="text-[12px] text-[var(--ink-muted)]">at {h.rate}</span> : null}
                    {record && (
                      <button type="button" aria-label={`Remove ${h.who}'s hours on ${formatDate(h.on)}`} onClick={() => run({ method: "delete", url: `/projects/${id}/hours/${h.id}` })} className="text-[12px] text-[var(--ink-muted)] hover:text-[var(--danger)]">
                        Remove
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {open === "vary" && <VaryDialog p={p} onClose={() => setOpen(null)} run={run} />}
      {open === "boq" && <BoqDialog p={p} onClose={() => setOpen(null)} run={run} />}
      {open === "hours" && <HoursDialog p={p} onClose={() => setOpen(null)} run={run} />}
      {open === "contract" && <ContractDialog p={p} onClose={() => setOpen(null)} run={run} />}
      {open === "budget" && <BudgetDialog p={p} onClose={() => setOpen(null)} run={run} />}
      {open === "commit" && <CommitDialog p={p} onClose={() => setOpen(null)} run={run} />}
      {open === "claim" && <ClaimDialog p={p} onClose={() => setOpen(null)} run={run} />}
      {open === "certify" && waiting && <CertifyDialog p={p} claim={waiting} onClose={() => setOpen(null)} run={run} />}
      {open === "release" && <ReleaseDialog p={p} onClose={() => setOpen(null)} run={run} />}
      {looking && <Entries projectId={id} look={looking} onClose={() => setLooking(null)} />}
    </div>
  );
}

function Dialog({ title, description, onClose, onSubmit, busy, disabled, action, children }) {
  const [err, setErr] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      as="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr("");
        const ok = await onSubmit(setErr);
        if (ok) onClose();
      }}
      title={title}
      description={description}
    >
      <div className="grid gap-4">{children}</div>
      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">
          {err}
        </p>
      )}
      <div className="flex justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="accent" disabled={busy || disabled}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          {action}
        </Button>
      </div>
    </Modal>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium block mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[13px] text-[var(--ink-muted)] mt-1.5">{hint}</span>}
    </label>
  );
}

function ContractDialog({ p, onClose, run }) {
  const [f, setF] = useState({
    counterpartyId: p.customerId || "",
    contract: p.contract ? String(n(p.contract)) : "",
    retentionPct: String(p.retentionPct ?? 10),
    retentionCapPct: p.retentionCapPct === null ? "5" : String(p.retentionCapPct),
    startsOn: p.startsOn || "",
    endsOn: p.endsOn || "",
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Dialog
      title="The contract"
      description="Who it is for, what it is worth, and what the customer keeps back from each certificate."
      onClose={onClose}
      action="Save"
      disabled={!f.counterpartyId || !f.contract}
      onSubmit={() =>
        run(
          { method: "put", url: `/projects/${p.id}/contract`, body: { ...f, retentionCapPct: f.retentionCapPct === "" ? null : f.retentionCapPct, startsOn: f.startsOn || null, endsOn: f.endsOn || null } },
          () => ["Contract saved", "Claims are made against it."]
        )
      }
    >
      <Field label="Customer" hint={p.customers.length ? null : "Raise an invoice to them once, and they appear here."}>
        <select id="contract-customer" value={f.counterpartyId} onChange={set("counterpartyId")} className={FIELD}>
          <option value="">Pick one</option>
          {p.customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Contract value, MVR">
          <input id="contract-value" value={f.contract} onChange={set("contract")} inputMode="decimal" className={`${FIELD} tabular`} />
        </Field>
        <Field label="Retention, %">
          <input id="contract-retention" value={f.retentionPct} onChange={set("retentionPct")} inputMode="decimal" className={`${FIELD} tabular`} />
        </Field>
        <Field label="Up to, % of contract">
          <input id="contract-cap" value={f.retentionCapPct} onChange={set("retentionCapPct")} inputMode="decimal" placeholder="no cap" className={`${FIELD} tabular`} />
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Starts">
          <input type="date" value={f.startsOn} onChange={set("startsOn")} className={FIELD} />
        </Field>
        <Field label="Due to finish">
          <input type="date" value={f.endsOn} onChange={set("endsOn")} className={FIELD} />
        </Field>
      </div>
    </Dialog>
  );
}

function BudgetDialog({ p, onClose, run }) {
  const existing = Object.fromEntries(p.lines.map((l) => [l.accountId, String(n(l.budget) || "")]));
  const [amounts, setAmounts] = useState(existing);
  const total = Object.values(amounts).reduce((a, v) => a + n(v), 0);
  return (
    <Dialog
      title="Budget"
      description={`By kind of cost. Total MVR ${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}${p.contract ? ` against a contract of MVR ${p.contract}` : ""}.`}
      onClose={onClose}
      action="Save the budget"
      onSubmit={() =>
        run(
          { method: "put", url: `/projects/${p.id}/budget`, body: { lines: Object.entries(amounts).filter(([, v]) => n(v) > 0).map(([accountId, amount]) => ({ accountId, amount: String(amount).replace(/,/g, "") })) } },
          () => ["Budget saved", "Spent and committed are measured against it."]
        )
      }
    >
      <div className="grid gap-2">
        {p.accounts.map((a) => (
          <div key={a.id} className="grid grid-cols-[minmax(0,1fr)_150px] gap-3 items-center">
            <span className="text-[14px]">{a.name}</span>
            <input
              aria-label={`Budget for ${a.name}`}
              value={amounts[a.id] || ""}
              onChange={(e) => setAmounts((x) => ({ ...x, [a.id]: e.target.value }))}
              inputMode="decimal"
              placeholder="0.00"
              className={`${FIELD} tabular text-right`}
            />
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function CommitDialog({ p, onClose, run }) {
  const [f, setF] = useState({ description: "", counterpartyId: "", accountId: "", amount: "" });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Dialog
      title="An order or subcontract"
      description="Money the project has agreed to pay. It counts as committed until bills arrive against it."
      onClose={onClose}
      action="Commit it"
      disabled={!f.description.trim() || !f.accountId || !(n(f.amount) > 0)}
      onSubmit={() => run({ method: "post", url: `/projects/${p.id}/commitments`, body: { ...f, counterpartyId: f.counterpartyId || null } }, () => ["Committed", `MVR ${f.amount} against ${p.name}.`])}
    >
      <Field label="What">
        <input id="commit-what" value={f.description} onChange={set("description")} placeholder="Roofing subcontract" className={FIELD} />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="With (optional)">
          <select id="commit-who" value={f.counterpartyId} onChange={set("counterpartyId")} className={FIELD}>
            <option value="">Not said</option>
            {p.suppliers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kind of cost">
          <select id="commit-kind" value={f.accountId} onChange={set("accountId")} className={FIELD}>
            <option value="">Pick one</option>
            {p.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Amount, MVR, before tax">
        <input id="commit-amount" value={f.amount} onChange={set("amount")} inputMode="decimal" className={`${FIELD} tabular`} />
      </Field>
    </Dialog>
  );
}

function ClaimDialog({ p, onClose, run }) {
  const last = p.claims[p.claims.length - 1];
  const [f, setF] = useState({ periodTo: today(), claimedToDate: "" });
  const [done, setDone] = useState(() => Object.fromEntries(p.boq.map((b) => [b.id, b.done])));
  if (p.boq.length) {
    const measured = p.boq.reduce((a, b) => a + Math.round(n(done[b.id]) * n(b.rate) * 100), 0) / 100 + n(f.claimedToDate);
    return (
      <Dialog
        title={`Progress claim ${(last?.number || 0) + 1}`}
        description={`Measured: how much of each item is done to date. Comes to MVR ${measured.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${last ? `, against ${last.claimed} last time` : ""}.`}
        onClose={onClose}
        action="Make the claim"
        disabled={!(measured > 0)}
        onSubmit={() =>
          run(
            { method: "post", url: `/projects/${p.id}/claims`, body: { periodTo: f.periodTo, claimedToDate: f.claimedToDate || null, measured: p.boq.map((b) => ({ boqId: b.id, done: String(done[b.id] || "0").trim() || "0" })) } },
            (r) => [`Claim ${r.number} made, MVR ${r.claimed}`, "When the engineer certifies it, certify it here and it is invoiced."]
          )
        }
      >
        <div className="grid gap-2 max-h-[45vh] overflow-y-auto" data-testid="measure">
          {p.boq.map((b) => (
            <label key={b.id} className="flex items-center gap-3">
              <span className="flex-1 min-w-0 text-[14px] truncate">
                {b.ref && <span className="text-[var(--ink-muted)]">{b.ref} </span>}
                {b.description} <span className="text-[var(--ink-muted)]">· of {b.quantity} {b.unit}</span>
              </span>
              <input aria-label={`${b.ref || b.description}: done to date`} value={done[b.id]} onChange={(e) => setDone({ ...done, [b.id]: e.target.value })} inputMode="decimal" className={`${FIELD.replace("w-full", "w-28")} tabular text-right`} />
            </label>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Approved variations done, MVR" hint="Optional, on top of the measured work.">
            <input value={f.claimedToDate} onChange={(e) => setF({ ...f, claimedToDate: e.target.value })} inputMode="decimal" className={`${FIELD} tabular`} />
          </Field>
          <Field label="As at">
            <input type="date" value={f.periodTo} onChange={(e) => setF({ ...f, periodTo: e.target.value })} className={FIELD} />
          </Field>
        </div>
      </Dialog>
    );
  }
  return (
    <Dialog
      title={`Progress claim ${(last?.number || 0) + 1}`}
      description={`The value of all work done to date${last ? `: at least the MVR ${last.claimed} claimed last time` : ""}, out of a contract of MVR ${p.contract}.`}
      onClose={onClose}
      action="Make the claim"
      disabled={!(n(f.claimedToDate) > 0)}
      onSubmit={() => run({ method: "post", url: `/projects/${p.id}/claims`, body: f }, (r) => [`Claim ${r.number} made`, "When the engineer certifies it, certify it here and it is invoiced."])}
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Work done to date, MVR">
          <input id="claim-value" value={f.claimedToDate} onChange={(e) => setF({ ...f, claimedToDate: e.target.value })} inputMode="decimal" className={`${FIELD} tabular`} />
        </Field>
        <Field label="As at">
          <input id="claim-to" type="date" value={f.periodTo} onChange={(e) => setF({ ...f, periodTo: e.target.value })} className={FIELD} />
        </Field>
      </div>
    </Dialog>
  );
}

function CertifyDialog({ p, claim, onClose, run }) {
  const [f, setF] = useState({ certifiedToDate: String(n(claim.claimed)), on: today() });
  return (
    <Dialog
      title={`Certify claim ${claim.number}`}
      description={`MVR ${claim.claimed} was claimed. Enter what the engineer certified to date. The certificate less retention is invoiced to the customer now.`}
      onClose={onClose}
      action="Certify and invoice"
      disabled={!(n(f.certifiedToDate) > 0)}
      onSubmit={() =>
        run({ method: "post", url: `/projects/${p.id}/claims/${claim.id}/certify`, body: f }, (r) => [
          `Certificate MVR ${r.certificate}`,
          `MVR ${r.invoiced} invoiced; MVR ${r.retention} kept back as retention.`,
        ])
      }
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Certified to date, MVR">
          <input id="certify-value" value={f.certifiedToDate} onChange={(e) => setF({ ...f, certifiedToDate: e.target.value })} inputMode="decimal" className={`${FIELD} tabular`} />
        </Field>
        <Field label="Certified on">
          <input id="certify-on" type="date" value={f.on} onChange={(e) => setF({ ...f, on: e.target.value })} className={FIELD} />
        </Field>
      </div>
    </Dialog>
  );
}

function ReleaseDialog({ p, onClose, run }) {
  const [f, setF] = useState({ amount: String(n(p.retentionHeld) / 2), on: today() });
  return (
    <Dialog
      title="Release retention"
      description={`MVR ${p.retentionHeld} is held by the customer. Usually half at completion, half at the end of the defects period. What is released is invoiced now.`}
      onClose={onClose}
      action="Release and invoice"
      disabled={!(n(f.amount) > 0)}
      onSubmit={() => run({ method: "post", url: `/projects/${p.id}/retention`, body: f }, () => [`MVR ${f.amount} of retention released`, "It is invoiced to the customer."])}
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Amount, MVR">
          <input id="release-amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} inputMode="decimal" className={`${FIELD} tabular`} />
        </Field>
        <Field label="Released on">
          <input id="release-on" type="date" value={f.on} onChange={(e) => setF({ ...f, on: e.target.value })} className={FIELD} />
        </Field>
      </div>
    </Dialog>
  );
}

function Entries({ projectId, look, onClose }) {
  const { companyId } = useCompany();
  const q = new URLSearchParams({ figure: look.figure, ...(look.accountId ? { accountId: look.accountId } : {}) });
  const { data, isLoading } = useQuery({
    queryKey: ["projects", companyId, projectId, "entries", q.toString()],
    queryFn: () => apiClient.get(`/projects/${projectId}/entries?${q}`).then((r) => r.data.entries),
  });
  return (
    <Modal open onClose={onClose} title={look.label} description="The entries in the books behind this figure.">
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : !data?.length ? (
        <p className="text-[14px] text-[var(--ink-muted)]">Nothing yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]" data-testid="entries">
          {data.map((e, k) => (
            <li key={k} className="py-2.5 flex items-baseline gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] truncate">{e.memo || e.narrative}</div>
                <div className="text-[12px] text-[var(--ink-muted)]">
                  {formatDate(e.on)} · entry {e.entryNo} · {e.account}
                </div>
              </div>
              <Money amount={e.amount.startsWith("-") ? e.amount.slice(1) : e.amount} className="text-[14px]" />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function VaryDialog({ p, onClose, run }) {
  const [f, setF] = useState({ description: "", amount: "" });
  return (
    <Dialog
      title={`Variation VO-${p.variations.length + 1}`}
      description="Proposed until the customer approves it; only then does it change the contract. Work taken out is a minus amount."
      onClose={onClose}
      action="Propose it"
      disabled={!f.description.trim() || !(Math.abs(n(f.amount)) > 0)}
      onSubmit={() => run({ method: "post", url: `/projects/${p.id}/variations`, body: f }, (r) => [`VO-${r.number} proposed`, "Mark it approved when the customer agrees."])}
    >
      <Field label="What changes">
        <input id="vary-what" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Extra boundary wall on the east side" className={FIELD} />
      </Field>
      <Field label="By how much, MVR" hint="For work taken out, put a minus: -20000.">
        <input id="vary-amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} inputMode="decimal" className={`${FIELD} tabular`} />
      </Field>
    </Dialog>
  );
}

function BoqDialog({ p, onClose, run }) {
  const blank = { ref: "", description: "", unit: "", quantity: "", rate: "" };
  const [items, setItems] = useState(() => (p.boq.length ? p.boq.map((b) => ({ ref: b.ref || "", description: b.description, unit: b.unit, quantity: b.quantity, rate: b.rate.replace(/,/g, "") })) : [{ ...blank }]));
  const set = (i, k, v) => setItems(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const filled = items.filter((it) => it.description.trim());
  const total = filled.reduce((a, it) => a + Math.round(n(it.quantity) * n(it.rate) * 100), 0) / 100;
  const cell = `${FIELD} h-9 px-2 text-[13px]`;
  return (
    <Dialog
      title="Bill of quantities"
      description={`MVR ${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} priced${p.contract ? `, against a contract of MVR ${p.contract}` : ""}. It stays as it is once a claim is measured against it.`}
      onClose={onClose}
      action="Save it"
      disabled={!filled.length}
      onSubmit={() => run({ method: "put", url: `/projects/${p.id}/boq`, body: { items: filled } }, (r) => ["Bill of quantities saved", `MVR ${r.total} priced.`])}
    >
      <div className="grid gap-2 max-h-[50vh] overflow-y-auto" data-testid="boq-edit">
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-[3.5rem_minmax(0,1fr)] sm:grid-cols-[3.5rem_minmax(0,1fr)_4rem_5rem_6rem] gap-1.5">
            <input aria-label={`Item ${i + 1}: ref`} value={it.ref} onChange={(e) => set(i, "ref", e.target.value)} placeholder="1.1" className={cell} />
            <input aria-label={`Item ${i + 1}: description`} value={it.description} onChange={(e) => set(i, "description", e.target.value)} placeholder="Excavation" className={cell} />
            <input aria-label={`Item ${i + 1}: unit`} value={it.unit} onChange={(e) => set(i, "unit", e.target.value)} placeholder="m3" className={cell} />
            <input aria-label={`Item ${i + 1}: quantity`} value={it.quantity} onChange={(e) => set(i, "quantity", e.target.value)} inputMode="decimal" placeholder="Qty" className={`${cell} tabular text-right`} />
            <input aria-label={`Item ${i + 1}: rate`} value={it.rate} onChange={(e) => set(i, "rate", e.target.value)} inputMode="decimal" placeholder="Rate" className={`${cell} tabular text-right`} />
          </div>
        ))}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={() => setItems([...items, { ...blank }])} className="justify-self-start">
        <Plus size={14} /> Another item
      </Button>
    </Dialog>
  );
}

function HoursDialog({ p, onClose, run }) {
  const [f, setF] = useState({ workedOn: today(), who: "", hours: "", rate: "", note: "" });
  return (
    <Dialog
      title="Hours worked"
      description={`On ${p.name}. Kept for the project; nothing is posted.`}
      onClose={onClose}
      action="Keep them"
      disabled={!f.who.trim() || !(n(f.hours) > 0)}
      onSubmit={() => run({ method: "post", url: `/projects/${p.id}/hours`, body: { ...f, rate: f.rate || null, note: f.note || null } }, () => ["Hours kept", `${f.hours} h for ${f.who}.`])}
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Who">
          <input id="hours-who" value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })} placeholder="Site foreman" className={FIELD} />
        </Field>
        <Field label="On">
          <input type="date" value={f.workedOn} onChange={(e) => setF({ ...f, workedOn: e.target.value })} className={FIELD} />
        </Field>
        <Field label="Hours">
          <input id="hours-count" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} inputMode="decimal" className={`${FIELD} tabular`} />
        </Field>
        <Field label="Rate an hour, MVR" hint="Optional.">
          <input value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} inputMode="decimal" className={`${FIELD} tabular`} />
        </Field>
      </div>
      <Field label="Note (optional)">
        <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Block 3 foundations" className={FIELD} />
      </Field>
    </Dialog>
  );
}
