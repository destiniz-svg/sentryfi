import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronRight, FileText, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { openFile } from "@/components/documents/Attachments";
import { FIELD } from "@/lib/shipments";
import { formatDate } from "@/lib/utils";

/**
 * The auditor's workspace. A period under audit with its seal checked; samples
 * drawn from it, kept as drawn; each item opened onto its document, entry,
 * money and papers, and ticked as seen with a note. Nothing here changes the
 * books.
 */

const KIND = { bill: "Bills", invoice: "Invoices", entry: "Journal entries" };
const ONE = { bill: "bill", invoice: "invoice", entry: "entry" };

function Label({ children, hint }) {
  return (
    <span className="block">
      <span className="text-sm font-medium block mb-1.5">{children}</span>
      {hint}
    </span>
  );
}

function Seal({ seal }) {
  if (!seal) return null;
  const inside = seal.problems.filter((p) => p.inPeriod);
  return seal.ok ? (
    <div className="flex items-start gap-3 rounded-2xl bg-[var(--success)]/10 px-4 py-3 mb-4" data-testid="seal">
      <ShieldCheck size={20} className="text-[var(--success)] shrink-0 mt-0.5" />
      <p className="text-[14px]">
        <span className="font-semibold">The seal is intact.</span> All {seal.entries} entries in the period are as they were posted, and the chain around them is unbroken.{" "}
        <span className="text-[var(--ink-muted)]">Checked {formatDate(seal.at)}.</span>
      </p>
    </div>
  ) : (
    <div className="rounded-2xl bg-[var(--danger)]/10 px-4 py-3 mb-4" data-testid="seal">
      <p className="text-[14px] flex items-start gap-3">
        <ShieldAlert size={20} className="text-[var(--danger)] shrink-0 mt-0.5" />
        <span>
          <span className="font-semibold">The seal is broken</span>: {inside.length} of the period's {seal.entries} entries, and {seal.problems.length - inside.length} elsewhere, do not match what was posted.
        </span>
      </p>
      <ul className="mt-2 ml-8 text-[13px] list-disc">
        {seal.problems.slice(0, 20).map((p, i) => (
          <li key={i}>
            Entry {p.entryNo}
            {p.inPeriod ? "" : " (outside the period)"}: {p.problem}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The periods under audit, and a new one. */
function Periods() {
  const { companyId, can } = useCompany();
  const nav = useNavigate();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["audit", companyId], queryFn: () => apiClient.get("/audit").then((r) => r.data), enabled: Boolean(companyId) });
  const year = new Date().getFullYear() - 1;
  const [f, setF] = useState({ name: `Year to 31 Dec ${year}`, from: `${year}-01-01`, to: `${year}-12-31` });
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await apiClient.post("/audit", f);
      nav(`/audit/${r.data.id}`);
    } catch (ex) {
      toast.error("Not opened", ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Audit" description="A period to audit, with its seal checked, and samples drawn from it. Nothing here changes the books." />
      {can("audit") && (
        <Card padding="lg" className="mb-4">
          <form onSubmit={onSubmit} className="grid sm:grid-cols-[minmax(0,1fr)_170px_170px_auto] gap-3 items-end" data-testid="new-period">
            <label className="block">
              <Label>Period</Label>
              <input id="audit-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={FIELD} />
            </label>
            <label className="block">
              <Label>From</Label>
              <input id="audit-from" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className={FIELD} />
            </label>
            <label className="block">
              <Label>To</Label>
              <input id="audit-to" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={FIELD} />
            </label>
            <Button type="submit" variant="accent" className="justify-self-start" disabled={busy || !f.from || !f.to}>
              {busy && <Loader2 size={14} className="animate-spin" />}
              Open and check the seal
            </Button>
          </form>
        </Card>
      )}
      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : !data?.periods.length ? (
        <Card padding="lg">
          <p className="text-[16px] font-semibold">No period under audit yet</p>
          <p className="text-[14px] text-[var(--ink-muted)] mt-1.5">Open one, usually a closed year. Its seal is checked at once: every entry intact since it was posted, or exactly which one is not.</p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-[var(--border)]">
            {data.periods.map((p) => (
              <li key={p.id}>
                <Link to={`/audit/${p.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-[var(--surface-2)] min-h-11">
                  {p.seal?.ok === false ? <ShieldAlert size={18} className="text-[var(--danger)] shrink-0" /> : <ShieldCheck size={18} className="text-[var(--success)] shrink-0" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold truncate">{p.name}</span>
                    <span className="block text-[13px] text-[var(--ink-muted)]">
                      {formatDate(p.from)} to {formatDate(p.to)} · {p.seal ? (p.seal.ok ? "seal intact" : "seal broken") : "seal not checked"}
                    </span>
                  </span>
                  <ChevronRight size={16} className="text-[var(--ink-muted)]" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** One period: its seal, and its samples. */
function Period({ id }) {
  const { companyId, can } = useCompany();
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const key = ["audit", companyId, id];
  const { data: p, isLoading } = useQuery({ queryKey: key, queryFn: () => apiClient.get(`/audit/${id}`).then((r) => r.data), enabled: Boolean(companyId) });
  const [d, setD] = useState({ kind: "bill", how: "random", size: "25", over: "" });
  const [busy, setBusy] = useState(null);

  async function reseal() {
    setBusy("seal");
    try {
      await apiClient.post(`/audit/${id}/seal`);
      qc.invalidateQueries({ queryKey: key });
    } catch (ex) {
      toast.error("Not checked", ex.message);
    } finally {
      setBusy(null);
    }
  }
  async function onDraw(e) {
    e.preventDefault();
    setBusy("draw");
    try {
      const r = await apiClient.post(`/audit/${id}/samples`, d.how === "random" ? { kind: d.kind, how: "random", size: d.size } : { kind: d.kind, how: "over", over: d.over });
      nav(`/audit/samples/${r.data.id}`);
    } catch (ex) {
      toast.error("Not drawn", ex.message);
    } finally {
      setBusy(null);
    }
  }

  if (isLoading || !p) return <Skeleton className="h-60 rounded-2xl" />;
  return (
    <div>
      <PageHeader title={p.name} description={`${formatDate(p.from)} to ${formatDate(p.to)}.`} />
      <Seal seal={p.seal} />
      {can("audit") && (
        <p className="mb-4">
          <Button variant="outline" size="sm" onClick={reseal} disabled={busy === "seal"}>
            {busy === "seal" && <Loader2 size={13} className="animate-spin" />}
            Check the seal again
          </Button>
        </p>
      )}

      {can("audit") && (
        <Card padding="lg" className="mb-4">
          <h2 className="text-[15px] font-semibold mb-3">Draw a sample</h2>
          <form onSubmit={onDraw} className="grid sm:grid-cols-[180px_200px_160px_auto] gap-3 items-end" data-testid="draw">
            <label className="block">
              <Label>From</Label>
              <select id="draw-kind" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value })} className={FIELD}>
                {Object.entries(KIND).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <Label>How</Label>
              <select id="draw-how" value={d.how} onChange={(e) => setD({ ...d, how: e.target.value })} className={FIELD}>
                <option value="random">So many at random</option>
                <option value="over">Every one over an amount</option>
              </select>
            </label>
            {d.how === "random" ? (
              <label className="block">
                <Label>How many</Label>
                <input id="draw-size" value={d.size} onChange={(e) => setD({ ...d, size: e.target.value })} inputMode="numeric" className={`${FIELD} tabular`} />
              </label>
            ) : (
              <label className="block">
                <Label>At least (MVR)</Label>
                <input id="draw-over" value={d.over} onChange={(e) => setD({ ...d, over: e.target.value })} inputMode="decimal" placeholder="10000" className={`${FIELD} tabular`} />
              </label>
            )}
            <Button type="submit" variant="accent" className="justify-self-start" disabled={busy === "draw" || (d.how === "random" ? !d.size : !d.over)}>
              {busy === "draw" && <Loader2 size={14} className="animate-spin" />}
              Draw it
            </Button>
          </form>
        </Card>
      )}

      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] text-[13px] font-semibold">Samples</div>
        {!p.samples.length ? (
          <p className="px-5 py-4 text-[14px] text-[var(--ink-muted)]">None drawn yet. A sample is kept once drawn, so it can be shown again as it was.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]" data-testid="samples">
            {p.samples.map((s) => (
              <li key={s.id}>
                <Link to={`/audit/samples/${s.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-[var(--surface-2)] min-h-11">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">
                      {KIND[s.kind]}: {s.how === "random" ? `${s.items} at random` : `every one of MVR ${s.over} or more (${s.items})`}
                    </span>
                    <span className="block text-[13px] text-[var(--ink-muted)]">
                      Out of {s.population} in the period · drawn by {s.by || "someone"}, {formatDate(s.at)}
                    </span>
                  </span>
                  <span className={`text-[13px] font-semibold tabular ${s.seen === s.items ? "text-[var(--success)]" : ""}`}>
                    {s.seen} of {s.items} seen
                  </span>
                  <ChevronRight size={16} className="text-[var(--ink-muted)]" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Amounts({ rows }) {
  return (
    <table className="w-full text-[13px] tabular">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-[var(--border)] first:border-t-0">
            {r.map((c, j) => (
              <td key={j} className={`py-1.5 ${j === 0 ? "pr-2" : "text-right pl-2 whitespace-nowrap"}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Part({ title, children }) {
  return (
    <section className="mt-4">
      <h3 className="text-[12px] uppercase tracking-wider font-semibold text-[var(--ink-muted)] mb-1.5">{title}</h3>
      {children}
    </section>
  );
}

/** Everything behind one item, and its tick. "Seen, next" goes on to the next not yet seen. */
function Evidence({ sample, item, onClose, onNext, canTick }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: ev } = useQuery({ queryKey: ["audit-item", companyId, item.id], queryFn: () => apiClient.get(`/audit/samples/${sample.id}/items/${item.id}`).then((r) => r.data) });
  const [note, setNote] = useState(item.note || "");
  const [busy, setBusy] = useState(false);

  async function tick(seen, next) {
    setBusy(true);
    try {
      await apiClient.post(`/audit/samples/${sample.id}/items/${item.id}/seen`, { seen, note });
      await qc.invalidateQueries({ queryKey: ["audit-sample", companyId, sample.id] });
      qc.invalidateQueries({ queryKey: ["audit", companyId, sample.periodId] });
      next ? onNext() : onClose();
    } catch (ex) {
      toast.error("Not saved", ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${ONE[sample.kind] === "entry" ? "Entry" : ONE[sample.kind] === "bill" ? "Bill" : "Invoice"} ${item.no}`} description={`${item.party || ""}${item.party ? " · " : ""}${formatDate(item.on)} · MVR ${item.amount}`}>
      {!ev ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : (
        <div data-testid="evidence">
          {ev.document && (
            <Part title="The document">
              <Amounts
                rows={[
                  ...(ev.lines.length ? [["", "Net", "GST"]] : []),
                  ...ev.lines.map((l) => [`${l.description || "A line"}${l.quantity && Number(l.quantity) !== 1 ? ` × ${Number(l.quantity)}` : ""}`, l.net, l.tax]),
                  ["Before tax", "", ev.document.net],
                  ["GST", "", ev.document.tax],
                  [<span className="font-semibold">Total</span>, "", <span className="font-semibold">MVR {ev.document.gross}</span>],
                ]}
              />
              {ev.kind === "bill" && (
                <Link to={ev.document.href} className="text-[13px] underline underline-offset-2 mt-1 inline-block">
                  Open the bill
                </Link>
              )}
            </Part>
          )}
          {ev.entry ? (
            <Part title={`Entry ${ev.entry.no}, ${formatDate(ev.entry.on)}`}>
              {ev.entry.narrative && <p className="text-[13px] text-[var(--ink-muted)] mb-1">{ev.entry.narrative}</p>}
              <Amounts rows={[["", "Debit", "Credit"], ...ev.entry.lines.map((l) => [l.account + (l.memo ? ` · ${l.memo}` : ""), l.debit === "0.00" ? "" : l.debit, l.credit === "0.00" ? "" : l.credit])]} />
            </Part>
          ) : (
            <Part title="Entry">
              <p className="text-[13px] text-[var(--danger)]">No entry found for this document.</p>
            </Part>
          )}
          {ev.money && (
            <Part title={ev.kind === "bill" ? "Paid" : "Received"}>
              {ev.money.length ? <Amounts rows={ev.money.map((m) => [`${formatDate(m.on)} · ${m.what}${m.undone ? " (undone)" : ""}`, "", m.amount])} /> : <p className="text-[13px] text-[var(--ink-muted)]">Nothing yet.</p>}
            </Part>
          )}
          <Part title="Papers">
            {ev.files.length ? (
              <ul className="grid gap-1">
                {ev.files.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => openFile(`/attachments/${a.id}/file`).catch((ex) => toast.error("Not opened", ex.message))} className="inline-flex items-center gap-1.5 text-[13px] underline underline-offset-2 min-h-11">
                      <FileText size={14} /> {a.filename}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-[var(--ink-muted)]">None attached.</p>
            )}
          </Part>
        </div>
      )}
      {canTick ? (
        <>
          <label className="block mt-5">
            <Label>Note</Label>
            <input id="audit-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What it was agreed to, or what is missing" className={FIELD} />
          </label>
          <div className="flex justify-end gap-2 mt-4 flex-wrap">
            {item.seen && (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => tick(false, false)}>
                Not seen after all
              </Button>
            )}
            <Button type="button" variant="outline" disabled={busy} onClick={() => tick(true, false)}>
              Seen
            </Button>
            <Button type="button" variant="accent" disabled={busy} onClick={() => tick(true, true)}>
              {busy && <Loader2 size={14} className="animate-spin" />}
              Seen, next
            </Button>
          </div>
        </>
      ) : (
        item.note && <p className="text-[13px] mt-4">Note: {item.note}</p>
      )}
    </Modal>
  );
}

/** A sample as drawn: each item, seen or not. */
function Sample({ sid }) {
  const { companyId, can } = useCompany();
  const { data: s, isLoading } = useQuery({ queryKey: ["audit-sample", companyId, sid], queryFn: () => apiClient.get(`/audit/samples/${sid}`).then((r) => r.data), enabled: Boolean(companyId) });
  const [open, setOpen] = useState(null);
  if (isLoading || !s) return <Skeleton className="h-60 rounded-2xl" />;
  const seen = s.items.filter((i) => i.seen).length;
  const current = s.items.find((i) => i.id === open);
  const next = () => {
    const after = s.items.findIndex((i) => i.id === open);
    const n = [...s.items.slice(after + 1), ...s.items.slice(0, after)].find((i) => !i.seen && i.id !== open);
    setOpen(n ? n.id : null);
  };
  return (
    <div>
      <PageHeader
        title={`${KIND[s.kind]}: ${s.how === "random" ? `${s.items.length} at random` : `MVR ${s.over} or more`}`}
        description={`${s.period} · out of ${s.population} · ${seen} of ${s.items.length} seen`}
      />
      <p className="mb-3 text-[14px]">
        <Link to={`/audit/${s.periodId}`} className="underline underline-offset-2">
          Back to {s.period}
        </Link>
      </p>
      <Card padding="none" className="overflow-hidden">
        <ul className="divide-y divide-[var(--border)]" data-testid="sample-items">
          {s.items.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => setOpen(i.id)} className="w-full text-left flex items-center gap-3 px-5 py-3 hover:bg-[var(--surface-2)] min-h-11" data-testid="sample-item">
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${i.seen ? "bg-[var(--success)]" : "border border-[var(--ink-muted)]"}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium truncate">
                    {i.no} · {i.party || "—"}
                  </span>
                  <span className="block text-[12px] text-[var(--ink-muted)] truncate">
                    {formatDate(i.on)}
                    {i.seen ? ` · seen by ${i.seen.by}` : " · not seen"}
                    {i.note ? ` · ${i.note}` : ""}
                  </span>
                </span>
                <span className="text-[14px] tabular">{i.amount}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {current && <Evidence key={current.id} sample={s} item={current} onClose={() => setOpen(null)} onNext={next} canTick={can("audit")} />}
    </div>
  );
}

export default function Audit() {
  const { id, sid } = useParams();
  if (sid) return <Sample sid={sid} />;
  if (id) return <Period id={id} />;
  return <Periods />;
}
