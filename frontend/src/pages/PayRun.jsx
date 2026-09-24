import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check, ChevronRight, Download, FileText, Loader2, OctagonAlert, Plus, Send, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { formatDate, today } from "@/lib/utils";
import { FIELD, Field, monthName } from "@/pages/Payroll";
import { Conversation } from "@/components/talk/Conversation";

/**
 * One month's pay run, in the order it is done: enter what happened in the
 * month, check it against last month, approve it into the books, pay and file
 * what it owes, and give out the payslips.
 *
 * The month is entered in a grid, one row a person, like the spreadsheet it
 * replaces: tab along a row, every figure recalculated from the rules as it is
 * left. Nothing is approved while anything blocks it, and the approve button
 * names the money. Once approved the run is frozen; a mistake after that is
 * put right by an adjustment run.
 */

const n = (s) => Number(String(s ?? "").replace(/,/g, "")) || 0;
const two = (x) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CHEVRONS = "repeating-linear-gradient(135deg, var(--accent) 0 8px, #141414 8px 16px)";
const STEPS = ["Enter the month", "Check", "Approve", "Pay and file", "Payslips"];

async function download(url, fallback) {
  const r = await apiClient.get(url, { responseType: "blob" });
  const name = /filename="([^"]+)"/.exec(r.headers["content-disposition"] || "")?.[1] || fallback;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(r.data);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function PayRun() {
  const { id } = useParams();
  const { companyId } = useCompany();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [looking, setLooking] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reopening, setReopening] = useState(false);

  const { data: s, isLoading } = useQuery({ queryKey: ["payroll", companyId, "run", id], queryFn: () => apiClient.get(`/payroll/runs/${id}`).then((r) => r.data), enabled: Boolean(companyId) });
  const { data: base } = useQuery({ queryKey: ["payroll", companyId], queryFn: () => apiClient.get("/payroll").then((r) => r.data), enabled: Boolean(companyId) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["payroll", companyId] });

  if (isLoading || !s || !base) return <Skeleton className="h-96 rounded-3xl" />;
  const rules = base.rules;
  const draft = s.status === "draft";
  const unpaid = s.owes.filter((o) => !o.paid);
  const step = draft ? (s.blockers.length ? 0 : 2) : unpaid.length ? 3 : 4;

  async function approve() {
    setBusy(true);
    try {
      const r = await apiClient.post(`/payroll/runs/${id}/approve`);
      refresh();
      for (const k of ["figures", "attention", "statements"]) qc.invalidateQueries({ queryKey: [k, companyId] });
      toast.success(`${monthName(s.period)} approved`, r.data.entryNo ? `Entry ${r.data.entryNo} is in the books. Pay and file below.` : "Nothing to post.");
    } catch (ex) {
      toast.error("Not approved", ex.message);
    } finally {
      setBusy(false);
    }
  }
  async function discard() {
    if (!window.confirm(`Throw away this draft for ${monthName(s.period)}? What was entered goes with it.`)) return;
    await apiClient.delete(`/payroll/runs/${id}`);
    refresh();
    navigate("/payroll");
  }

  return (
    <div className="pb-28">
      <Link to="/payroll" className="inline-flex items-center gap-1.5 text-[14px] text-[var(--ink-muted)] hover:text-[var(--ink)] mb-4">
        <ArrowLeft size={15} /> Payroll
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight leading-tight">
            {monthName(s.period)} {s.kind === "adjustment" ? "adjustment" : "payroll"}
          </h1>
          <p className="text-[14px] text-[var(--ink-muted)] mt-1">
            {s.lines.length} {s.lines.length === 1 ? "person" : "people"} · pay day {formatDate(s.payDate)}
            {s.entryNo ? ` · entry ${s.entryNo}` : ""}
          </p>
        </div>
        {draft && (
          <Button variant="ghost" size="sm" onClick={discard}>
            <Trash2 size={14} /> Throw away this draft
          </Button>
        )}
      </div>

      <ol className="mt-6 mb-6 grid grid-cols-5 gap-1.5" aria-label="Where this run is">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined} className="min-w-0">
            <span className={`block h-1.5 rounded-full ${i < step ? "bg-[var(--ink)]" : i === step ? "bg-[var(--accent)]" : "bg-[var(--surface-2)]"}`} />
            <span className={`block mt-2 text-[12px] sm:text-[13px] truncate ${i === step ? "font-semibold text-[var(--ink)]" : "text-[var(--ink-muted)]"}`}>
              {i < step && <Check size={12} className="inline -mt-0.5 mr-1" aria-hidden="true" />}
              {label}
            </span>
          </li>
        ))}
      </ol>

      {draft ? (
        <>
          <Grid run={s} rules={rules} onChanged={refresh} onLook={setLooking} />
          {rules.serviceCharge && s.lines.some((l) => l.person.serviceCharge) && <ServiceCharge run={s} onDone={refresh} />}
          <Checks run={s} rules={rules} onLook={setLooking} />
          <AddPerson run={s} people={base.people} onDone={refresh} />
        </>
      ) : (
        <>
          <Summary run={s} />
          <PayAndFile run={s} payFrom={base.payFrom} rules={rules} onDone={refresh} />
          <Payslips run={s} onDone={refresh} />
        </>
      )}
      <Books run={s} />
      <Conversation kind="pay_run" id={id} />
      {!draft && !s.owes.some((o) => o.paid) && (
        <div className="mt-6">
          <Button variant="outline" size="sm" className="border-[var(--danger)] text-[var(--danger)]" onClick={() => setReopening(true)}>
            Reopen this run
          </Button>
        </div>
      )}

      {draft && (
        <div className="fixed bottom-[88px] md:bottom-0 inset-x-0 md:left-[72px] lg:left-[216px] z-30 px-4 sm:px-6 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)] to-transparent pointer-events-none">
          <div className="max-w-[1200px] mx-auto flex items-center justify-end gap-3 pointer-events-auto">
            {s.blockers.length > 0 && (
              <span role="alert" className="text-[13px] text-[var(--danger)] truncate min-w-0">
                {s.blockers[0]}
              </span>
            )}
            <Button variant="accent" size="lg" onClick={approve} disabled={busy || s.blockers.length > 0 || !s.lines.length}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {s.blockers.length ? `Fix ${s.blockers.length} first` : `Approve ${s.currency} ${s.totals.net} for ${s.lines.length} ${s.lines.length === 1 ? "person" : "people"}`}
            </Button>
          </div>
        </div>
      )}

      {looking && <Person run={s} line={s.lines.find((l) => l.person.id === looking)} onClose={() => setLooking(null)} onChanged={refresh} />}
      {reopening && <Reopen run={s} onClose={() => setReopening(false)} onDone={refresh} />}
    </div>
  );
}

// ------------------------------------------------------------------ the grid

/** The inputs a column edits, and how it reads and writes them. */
function columnsFor(rules, run) {
  const cols = [{ key: "unpaidDays", label: "Unpaid days", hint: "days", width: 84 }];
  for (const o of rules.overtime) cols.push({ key: `ot:${o.key}`, label: o.key === "normal" ? "Overtime" : o.key === "holiday" ? "OT holiday" : "OT night", hint: `hours at ${o.percent}%`, width: 84 });
  cols.push({ key: "bonus", label: "Bonus", money: true, width: 110 });
  if (rules.serviceCharge && run.lines.some((l) => l.person.serviceCharge)) cols.push({ key: "serviceCharge", label: "Service charge", money: true, width: 116 });
  cols.push({ key: "advance", label: "Advance back", money: true, width: 110 });
  cols.push({ key: "leaveTaken", label: "Leave taken", hint: "paid days off", width: 84 });
  return cols;
}
const read = (inputs, key) => (key.startsWith("ot:") ? inputs?.overtime?.[key.slice(3)] : inputs?.[key]) ?? "";
/** Just the one field that changed; the server keeps the rest. */
const write = (_, key, value) => (key.startsWith("ot:") ? { overtime: { [key.slice(3)]: value } } : { [key]: value });

function Grid({ run, rules, onChanged, onLook }) {
  const toast = useToast();
  const cols = useMemo(() => columnsFor(rules, run), [rules, run]);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(null);
  const cell = (l, key) => edits[l.person.id]?.[key] ?? String(read(l.inputs, key)).replace(/,/g, "");

  async function save(l, key) {
    const value = edits[l.person.id]?.[key];
    if (value === undefined || value === String(read(l.inputs, key)).replace(/,/g, "")) return;
    setSaving(l.person.id);
    try {
      await apiClient.put(`/payroll/runs/${run.id}/lines/${l.person.id}`, write({}, key, value));
      await onChanged();
      // Saved: the cell reads the run again.
      setEdits((x) => ({ ...x, [l.person.id]: Object.fromEntries(Object.entries(x[l.person.id] || {}).filter(([k]) => k !== key)) }));
    } catch (ex) {
      toast.error(`${l.person.name}: not saved`, ex.message);
    } finally {
      setSaving(null);
    }
  }
  const template = `minmax(200px,1.6fr) ${cols.map((c) => `${c.width}px`).join(" ")} 130px`;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)]">
        <h2 className="text-[16px] font-semibold">What happened this month</h2>
        <p className="text-[13px] text-[var(--ink-muted)]">Type in a cell and move on; everything works itself out. Open a person for anything else.</p>
      </div>
      <div className="overflow-x-auto">
        <div role="table" aria-label="This month's pay, a row a person" className="min-w-max">
          <div role="row" className="grid gap-3 px-5 py-2.5 text-[12px] font-medium text-[var(--ink-muted)] bg-[var(--surface-2)]/60" style={{ gridTemplateColumns: template }}>
            <span role="columnheader">Person</span>
            {cols.map((c) => (
              <span role="columnheader" key={c.key} className="text-right" title={c.hint}>
                {c.label}
              </span>
            ))}
            <span role="columnheader" className="text-right">To them</span>
          </div>
          {run.lines.map((l) => {
            const warn = l.slip.warnings?.length > 0;
            const block = l.slip.blockers?.length > 0;
            return (
              <div role="row" key={l.person.id} className="grid gap-3 px-5 py-2 items-center border-t border-[var(--border)] hover:bg-[var(--surface-2)]/40" style={{ gridTemplateColumns: template }} data-testid="run-row">
                <span role="cell" className="min-w-0">
                <button type="button" onClick={() => onLook(l.person.id)} className="w-full min-w-0 text-left group">
                  <span className="flex items-center gap-1.5 text-[15px] font-semibold truncate group-hover:underline">
                    {block ? <OctagonAlert size={14} className="text-[var(--danger)] shrink-0" aria-label="Blocks the run" /> : warn ? <AlertTriangle size={14} className="text-[var(--warning)] shrink-0" aria-label="Worth a look" /> : null}
                    {l.person.name}
                  </span>
                  <span className="block text-[12px] text-[var(--ink-muted)] truncate">
                    {l.slip.paidDays < l.slip.daysInMonth ? `${l.slip.paidDays} of ${l.slip.daysInMonth} days · ` : ""}
                    gross {l.slip.gross}
                  </span>
                </button>
                </span>
                {cols.map((c) => (
                  <span role="cell" key={c.key}>
                  <input
                    aria-label={`${l.person.name}: ${c.label}`}
                    value={cell(l, c.key)}
                    onChange={(e) => setEdits((x) => ({ ...x, [l.person.id]: { ...(x[l.person.id] || {}), [c.key]: e.target.value } }))}
                    onBlur={() => save(l, c.key)}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    inputMode="decimal"
                    placeholder={c.money ? "0.00" : "0"}
                    className="w-full h-10 px-2.5 rounded-[10px] border border-transparent bg-transparent text-right text-[15px] tabular hover:border-[var(--border)] focus:border-[var(--ink)] focus:bg-[var(--surface)] outline-none placeholder:text-[var(--ink-muted)]/30"
                  />
                  </span>
                ))}
                <span role="cell" className="text-right text-[15px] font-semibold">
                  {saving === l.person.id ? <Loader2 size={14} className="animate-spin inline" /> : <Money amount={l.slip.net} />}
                </span>
              </div>
            );
          })}
          <div role="row" className="grid gap-3 px-5 py-3 items-center border-t-2 border-[var(--ink)]" style={{ gridTemplateColumns: template }}>
            <span role="cell" className="text-[13px] font-semibold">Together</span>
            {cols.map((c) => (
              <span role="cell" key={c.key} className="text-right text-[13px] text-[var(--ink-muted)] tabular">
                {c.money ? two(run.lines.reduce((a, l) => a + n(read(l.inputs, c.key)), 0)) : run.lines.reduce((a, l) => a + n(read(l.inputs, c.key)), 0) || ""}
              </span>
            ))}
            <span role="cell" className="text-right text-[15px] font-semibold"><Money amount={run.totals.net} /></span>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ checks

function Delta({ now, before }) {
  if (before === null || before === undefined) return <span className="text-[12px] text-[var(--ink-muted)]">first run</span>;
  const d = n(now) - n(before);
  if (Math.abs(d) < 0.005) return <span className="text-[12px] text-[var(--ink-muted)]">same as last month</span>;
  return <span className="text-[12px] text-[var(--ink-muted)] tabular">{d > 0 ? "+" : "−"}{two(Math.abs(d))} on last month</span>;
}

function Checks({ run, rules, onLook }) {
  const t = run.totals;
  const b = run.before;
  const figures = [
    ["Gross pay", t.gross, b?.gross],
    ["Kept back", two(n(t.tax) + n(t.employeePension) + n(t.advance) + n(t.otherDeductions)), b ? two(n(b.tax) + n(b.employeePension) + n(b.advance) + n(b.otherDeductions)) : null],
    ["To staff", t.net, b?.net],
    ["Cost to the company", t.employerCost, b?.employerCost],
  ];
  const issues = run.lines.flatMap((l) => [
    ...(l.slip.blockers || []).map((m) => ({ who: l.person, m, block: true })),
    ...(l.slip.warnings || []).map((m) => ({ who: l.person, m })),
  ]);
  const moved = run.lines.filter((l) => l.change !== null && Math.abs(n(l.change)) > 0.1 * Math.max(1, n(l.slip.net) - n(l.change)));
  const fresh = run.lines.filter((l) => l.isNew);
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
      <Card padding="lg">
        <h2 className="text-[16px] font-semibold">Against last month</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4">
          {figures.map(([label, now, before]) => (
            <div key={label}>
              <dt className="text-[13px] text-[var(--ink-muted)]">{label}</dt>
              <dd className="text-[20px] font-semibold tabular mt-0.5"><Money amount={now} /></dd>
              <dd><Delta now={now} before={before} /></dd>
            </div>
          ))}
        </dl>
        {(moved.length > 0 || fresh.length > 0) && (
          <ul className="mt-4 pt-3 border-t border-[var(--border)] space-y-1.5 text-[14px]">
            {fresh.map((l) => (
              <li key={`n${l.person.id}`}>
                <button type="button" className="hover:underline text-left" onClick={() => onLook(l.person.id)}>{l.person.name}</button>
                <span className="text-[var(--ink-muted)]"> is new this month</span>
              </li>
            ))}
            {moved.map((l) => (
              <li key={`m${l.person.id}`}>
                <button type="button" className="hover:underline text-left" onClick={() => onLook(l.person.id)}>{l.person.name}</button>
                <span className="text-[var(--ink-muted)] tabular"> gets {n(l.change) > 0 ? "+" : "−"}{two(Math.abs(n(l.change)))} on last month</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card padding="lg">
        <h2 className="text-[16px] font-semibold">{issues.length ? `${issues.length} to look at` : "Nothing to look at"}</h2>
        {issues.length === 0 ? (
          <p className="text-[14px] text-[var(--ink-muted)] mt-1.5">
            Every person&apos;s pay is inside the law as far as the books can tell{rules.tax ? `, the ${rules.tax.name.toLowerCase()} is worked out` : ""}
            {rules.pension ? ", and pension is taken where it applies" : ""}.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--border)]">
            {issues.map((x, i) => (
              <li key={i} className="py-2.5 flex items-start gap-2.5">
                {x.block ? <OctagonAlert size={16} className="text-[var(--danger)] mt-0.5 shrink-0" aria-hidden="true" /> : <AlertTriangle size={16} className="text-[var(--warning)] mt-0.5 shrink-0" aria-hidden="true" />}
                <span className="min-w-0 text-[14px]">
                  <button type="button" className="font-semibold hover:underline" onClick={() => onLook(x.who.id)}>{x.who.name}</button>
                  <span className="text-[var(--ink-muted)]"> · {x.block ? "blocks the run: " : ""}{x.m}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ServiceCharge({ run, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ collected: "", adminFeePercent: "1" });
  const [busy, setBusy] = useState(false);
  const who = run.lines.filter((l) => l.person.serviceCharge);
  const pool = n(f.collected) * (1 - n(f.adminFeePercent) / 100);
  async function share(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await apiClient.post(`/payroll/runs/${run.id}/service-charge`, f);
      onDone();
      toast.success(`${r.data.pool} shared among ${r.data.people}`, `${r.data.fee} kept as the admin fee. Each share is by days worked.`);
    } catch (ex) {
      toast.error("Not shared", ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card padding="lg" className="mt-4">
      <form onSubmit={share} className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_180px_150px_auto] items-end">
        <div>
          <h2 className="text-[16px] font-semibold">Share last month&apos;s service charge</h2>
          <p className="text-[13px] text-[var(--ink-muted)] mt-1">
            Split equally among the {who.length} who share in it, by days worked. Up to 1% may be kept as an admin fee; the rest is theirs, by the end of this month.
          </p>
        </div>
        <Field label="Collected">
          <input aria-label="Service charge collected" value={f.collected} onChange={(e) => setF({ ...f, collected: e.target.value })} inputMode="decimal" placeholder="0.00" className={`${FIELD} tabular`} />
        </Field>
        <Field label="Admin fee %">
          <input value={f.adminFeePercent} onChange={(e) => setF({ ...f, adminFeePercent: e.target.value })} inputMode="decimal" className={`${FIELD} tabular`} />
        </Field>
        <Button type="submit" variant="outline" disabled={busy || !n(f.collected)}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          {n(f.collected) ? `Share ${two(pool)}` : "Add what was collected"}
        </Button>
      </form>
    </Card>
  );
}

function AddPerson({ run, people, onDone }) {
  const toast = useToast();
  const on = new Set(run.lines.map((l) => l.person.id));
  const others = people.filter((p) => !on.has(p.id) && !p.archived);
  const [pick, setPick] = useState("");
  if (!others.length) return null;
  async function add() {
    try {
      await apiClient.post(`/payroll/runs/${run.id}/lines`, { employeeId: pick });
      setPick("");
      onDone();
    } catch (ex) {
      toast.error("Not added", ex.message);
    }
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <select aria-label="Someone else to pay on this run" value={pick} onChange={(e) => setPick(e.target.value)} className={`${FIELD} w-72`}>
        <option value="">Someone else on this run…</option>
        {others.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      {pick && (
        <Button variant="outline" size="sm" onClick={add}>
          <Plus size={14} /> Add them
        </Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ one person

function Person({ run, line, onClose, onChanged }) {
  const toast = useToast();
  const draft = run.status === "draft";
  const [x, setX] = useState(() => ({
    other: line.inputs?.other || [],
    otherDeductions: line.inputs?.otherDeductions || [],
    leaveDays: line.inputs?.leaveDays || "",
    noticePay: line.inputs?.noticePay || "",
  }));
  const [busy, setBusy] = useState(false);
  const s = line.slip;
  async function save() {
    setBusy(true);
    try {
      const strip = (list) => list.filter((i) => i.name || n(i.amount)).map((i) => ({ name: i.name, amount: String(i.amount).replace(/,/g, "") }));
      await apiClient.put(`/payroll/runs/${run.id}/lines/${line.person.id}`, { other: strip(x.other), otherDeductions: strip(x.otherDeductions), leaveDays: x.leaveDays, noticePay: String(x.noticePay).replace(/,/g, "") });
      await onChanged();
      onClose();
    } catch (ex) {
      toast.error("Not saved", ex.message);
    } finally {
      setBusy(false);
    }
  }
  const rows = ({ title, rows, total, minus }) => (
    <div>
      <div className="text-[12px] font-medium text-[var(--ink-muted)] mb-1">{title}</div>
      <ul className="divide-y divide-[var(--border)]">
        {rows.map((r, i) => (
          <li key={i} className="py-2 flex items-baseline justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-[14px]">{r.label}</span>
              {r.note && <span className="block text-[12px] text-[var(--ink-muted)]">{r.note}</span>}
            </span>
            <span className="text-[14px] tabular shrink-0">{minus ? "−" : ""}<Money amount={r.amount} /></span>
          </li>
        ))}
      </ul>
      {total && (
        <div className="pt-2 mt-1 border-t-2 border-[var(--ink)] flex justify-between text-[14px] font-semibold">
          <span>{total[0]}</span>
          <Money amount={total[1]} />
        </div>
      )}
    </div>
  );
  const list = ({ k, label, placeholder }) => (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      {x[k].map((it, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_120px_auto] gap-2">
          <input aria-label={`${label} ${i + 1}: what`} value={it.name} onChange={(e) => setX({ ...x, [k]: x[k].map((o, j) => (j === i ? { ...o, name: e.target.value } : o)) })} placeholder={placeholder} className={FIELD} />
          <input aria-label={`${label} ${i + 1}: amount`} value={String(it.amount).replace(/,/g, "")} onChange={(e) => setX({ ...x, [k]: x[k].map((o, j) => (j === i ? { ...o, amount: e.target.value } : o)) })} inputMode="decimal" placeholder="0.00" className={`${FIELD} tabular`} />
          <Button type="button" variant="ghost" size="sm" onClick={() => setX({ ...x, [k]: x[k].filter((_, j) => j !== i) })}>Remove</Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setX({ ...x, [k]: [...x[k], { name: "", amount: "" }] })}>
          <Plus size={14} /> Add one
        </Button>
      </div>
    </div>
  );
  return (
    <Modal open onClose={onClose} title={line.person.name} description={`${monthName(run.period)} · ${s.paidDays} of ${s.daysInMonth} days paid${line.person.jobTitle ? ` · ${line.person.jobTitle}` : ""}`} size="lg">
      {[...(s.blockers || []), ...(s.warnings || [])].length > 0 && (
        <ul className="mb-4 space-y-1.5">
          {(s.blockers || []).map((m, i) => <li key={`b${i}`} className="text-[13px] text-[var(--danger)] flex gap-2"><OctagonAlert size={15} className="shrink-0 mt-0.5" aria-hidden="true" />{m}</li>)}
          {(s.warnings || []).map((m, i) => <li key={`w${i}`} className="text-[13px] text-[var(--ink)] flex gap-2"><AlertTriangle size={15} className="shrink-0 mt-0.5 text-[var(--warning)]" aria-hidden="true" />{m}</li>)}
        </ul>
      )}
      <div className="grid sm:grid-cols-2 gap-6">
        {rows({ title: "Pay", rows: s.earnings, total: ["Gross", s.gross] })}
        <div className="grid gap-5 content-start">
          {rows({ title: "Kept back", rows: s.deductions, minus: true })}
          {s.employer.length > 0 && rows({ title: "The company also pays", rows: s.employer })}
        </div>
      </div>
      <div className="mt-5 rounded-2xl bg-[#141414] text-white px-5 py-4 flex items-baseline justify-between on-ink">
        <span className="text-[14px] text-white/70">To {line.person.name.split(" ")[0]}{line.person.bankAccount ? ` · account ${line.person.bankAccount}` : ""}</span>
        <span className="text-[24px] font-semibold tabular"><Money amount={s.net} /></span>
      </div>
      {draft ? (
        <div className="mt-6 grid gap-5 pt-5 border-t border-[var(--border)]">
          {list({ k: "other", label: "Other pay this month", placeholder: "Ramadan allowance" })}
          {list({ k: "otherDeductions", label: "Other deductions this month", placeholder: "Damage to company phone" })}
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Annual leave paid out (days)" hint="For a leaver: the days owed, at a day's basic">
              <input value={x.leaveDays} onChange={(e) => setX({ ...x, leaveDays: e.target.value })} inputMode="decimal" className={`${FIELD} tabular`} />
            </Field>
            <Field label="Pay in place of notice">
              <input value={String(x.noticePay).replace(/,/g, "")} onChange={(e) => setX({ ...x, noticePay: e.target.value })} inputMode="decimal" placeholder="0.00" className={`${FIELD} tabular`} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={async () => { await apiClient.delete(`/payroll/runs/${run.id}/lines/${line.person.id}`); await onChanged(); onClose(); }}>Take off this run</Button>
            <Button variant="outline" onClick={save} disabled={busy}>
              {busy && <Loader2 size={14} className="animate-spin" />} Save and work it out
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex justify-end">
          <Link to={`/payroll/runs/${run.id}/slips/${line.person.id}`} className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[#0F4C5C] hover:underline">
            <FileText size={15} /> Open the payslip
          </Link>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ approved

function Summary({ run }) {
  const t = run.totals;
  const rows = [
    ["Gross pay", t.gross],
    ["Tax kept back", t.tax],
    ["Pension, both shares", String(n(t.employeePension) + n(t.employerPension))],
    ["To staff", t.net],
    ["Cost to the company", t.employerCost],
  ].filter(([, v]) => n(v) > 0);
  return (
    <Card padding="lg">
      <dl className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-4">
        {rows.map(([label, v]) => (
          <div key={label}>
            <dt className="text-[13px] text-[var(--ink-muted)]">{label}</dt>
            <dd className="text-[19px] font-semibold tabular mt-0.5"><Money amount={two(n(v))} /></dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function PayAndFile({ run, payFrom, rules, onDone }) {
  const next = run.owes.filter((o) => !o.paid).sort((a, b) => a.due.localeCompare(b.due))[0];
  return (
    <section className="mt-4" aria-labelledby="pay-and-file">
      <h2 id="pay-and-file" className="text-[16px] font-semibold mb-3">Pay and file</h2>
      <div className="grid gap-3 lg:grid-cols-3">
        {run.owes.map((o) => (
          <Owe key={o.kind} run={run} o={o} payFrom={payFrom} rules={rules} next={next?.kind === o.kind} onDone={onDone} />
        ))}
      </div>
    </section>
  );
}

function Owe({ run, o, payFrom, rules, next, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ fromAccountId: payFrom[0]?.id || "", paidOn: today(), reference: "" });
  const [busy, setBusy] = useState(false);
  const left = Math.round((new Date(`${o.due}T00:00:00`) - new Date(`${today()}T00:00:00`)) / 86400000);
  const file = { wages: ["bank", rules.bankFile === "wps" ? "WPS salary file" : "Bank transfers"], tax: ["tax", `${rules.tax?.form || "Tax"} schedule`], pension: ["pension", "Pension schedule"] }[o.kind];
  async function pay(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await apiClient.post(`/payroll/runs/${run.id}/pay`, { kind: o.kind, ...f, reference: f.reference || null });
      onDone();
      toast.success(`${run.currency} ${r.data.amount} paid from ${r.data.from}`, `Entry ${r.data.entryNo}.`);
    } catch (ex) {
      toast.error("Not paid", ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card padding="none" className="overflow-hidden flex flex-col">
      {next && !o.paid && (
        <div className="flex items-center gap-3 h-9 pr-4 bg-[#141414] text-[var(--accent)] text-[13px] font-medium on-ink">
          <span className="w-9 self-stretch" style={{ background: CHEVRONS }} aria-hidden="true" />
          Next due · {left < 0 ? `${-left} days late` : left === 0 ? "today" : `${left} days`}
        </div>
      )}
      <div className="p-5 flex-1 flex flex-col">
        <div className="text-[14px] text-[var(--ink-muted)]">{o.label}</div>
        <div className="text-[22px] font-semibold tabular mt-0.5"><Money amount={o.amount} /></div>
        <div className="text-[13px] text-[var(--ink-muted)] mt-0.5">
          {o.to ? `to ${o.to}${o.portal ? ` on ${o.portal}` : ""}, ` : ""}due {formatDate(o.due)}
        </div>
        <button type="button" onClick={() => download(`/payroll/runs/${run.id}/files/${file[0]}`, `${file[0]}.csv`)} className="mt-3 self-start inline-flex items-center gap-1.5 text-[14px] font-medium text-[#0F4C5C] hover:underline">
          <Download size={15} /> {file[1]}
        </button>
        {o.paid ? (
          <p className="mt-auto pt-4 text-[14px] text-[var(--success)] flex items-center gap-1.5">
            <Check size={15} /> Paid {formatDate(o.paid.paid_on)} from {o.paid.from_name}
          </p>
        ) : (
          <form onSubmit={pay} className="mt-auto pt-4 grid gap-2">
            <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-2">
              <select aria-label={`${o.label}: paid from`} value={f.fromAccountId} onChange={(e) => setF({ ...f, fromAccountId: e.target.value })} className={FIELD}>
                {payFrom.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <input aria-label={`${o.label}: paid on`} type="date" value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} className={FIELD} />
            </div>
            <Button type="submit" variant="outline" disabled={busy || !f.fromAccountId}>
              {busy && <Loader2 size={14} className="animate-spin" />}
              Paid {o.amount}
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}

function Payslips({ run, onDone }) {
  const [sending, setSending] = useState(false);
  return (
    <section className="mt-6" aria-labelledby="slips">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 id="slips" className="text-[16px] font-semibold">Payslips</h2>
        <span className="flex items-center gap-3">
          {run.publishedAt && <span className="text-[13px] text-[var(--success)] flex items-center gap-1.5"><Check size={14} /> Out since {formatDate(run.publishedAt)}</span>}
          <Button variant="outline" size="sm" onClick={() => setSending(true)}>
            <Send size={14} /> {run.publishedAt ? "Send payslips again" : "Send everyone their payslip"}
          </Button>
        </span>
      </div>
      <Card padding="none" className="overflow-hidden">
        <ul className="divide-y divide-[var(--border)]">
          {run.lines.map((l) => (
            <li key={l.person.id}>
              <Link to={`/payroll/runs/${run.id}/slips/${l.person.id}`} className="px-5 py-3 flex items-center gap-3 hover:bg-[var(--surface-2)]">
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] truncate">{l.person.name}</span>
                  <span className="block text-[12px] text-[var(--ink-muted)]">gross {l.slip.gross}{n(l.slip.tax) ? ` · tax ${l.slip.tax}` : ""}</span>
                </span>
                <span className="text-[15px] font-semibold"><Money amount={l.slip.net} /></span>
                <ChevronRight size={16} className="text-[var(--ink-muted)]" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      {sending && <SendPayslips run={run} onClose={() => setSending(false)} onDone={onDone} />}
    </section>
  );
}

/** Digits WhatsApp takes: a Maldivian seven-digit number gets 960 in front. */
const wa = (phone) => {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length === 7 ? `960${d}` : d;
};

/**
 * Everyone's payslip as a private link: most people on a site or a resort do
 * not sign in to anything, so each gets theirs on WhatsApp (to their number),
 * by email where there is an address, or as a link to pass on.
 */
function SendPayslips({ run, onClose, onDone }) {
  const toast = useToast();
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState(null);
  const withEmail = run.lines.filter((l) => l.person.email).length;
  async function make(email) {
    setBusy(email ? "email" : "links");
    try {
      const r = await apiClient.post(`/payroll/runs/${run.id}/send`, { email });
      setSent(r.data.sent);
      onDone();
      const mailed = r.data.sent.filter((x) => x.emailed).length;
      toast.success(mailed ? `${mailed} emailed` : "Links made", "Send the rest on WhatsApp below. Anyone who signs in also sees theirs under My payslips.");
    } catch (ex) {
      toast.error("Not sent", ex.message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <Modal open onClose={onClose} title={`${monthName(run.period)} payslips`} description="Each person gets a private link to their own payslip, to read, print or keep." size="lg">
      {!sent ? (
        <div className="grid gap-3">
          <p className="text-[14px] text-[var(--ink-muted)]">
            {run.lines.length} {run.lines.length === 1 ? "person" : "people"}; {withEmail} with an email address, {run.lines.filter((l) => l.person.phone).length} with a phone number.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="accent" onClick={() => make(true)} disabled={Boolean(busy) || !withEmail}>
              {busy === "email" && <Loader2 size={14} className="animate-spin" />} Email {withEmail}, and make links for the rest
            </Button>
            <Button variant="outline" onClick={() => make(false)} disabled={Boolean(busy)}>
              {busy === "links" && <Loader2 size={14} className="animate-spin" />} Just make the links
            </Button>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)] -mx-1" data-testid="payslip-links">
          {sent.map((x) => (
            <li key={x.lineId} className="px-1 py-2.5 flex items-center gap-2">
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] truncate">{x.name}</span>
                <span className="block text-[12px] text-[var(--ink-muted)]">{x.emailed ? `Emailed to ${x.email}` : x.phone ? x.phone : "No phone or email on file"}</span>
              </span>
              <Button variant="outline" size="sm" onClick={() => window.open(`https://wa.me/${wa(x.phone)}?text=${encodeURIComponent(`${x.text}\n${x.url}`)}`, "_blank", "noopener")}>
                WhatsApp
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(x.url).catch(() => {});
                  setCopied(x.lineId);
                }}
              >
                {copied === x.lineId ? "Copied" : "Copy"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function Books({ run }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-6">
      <button type="button" onClick={() => setOpen(!open)} className="text-[14px] font-medium text-[#0F4C5C] hover:underline" aria-expanded={open}>
        {open ? "Hide" : "See"} what {run.status === "draft" ? "approving puts" : "this run put"} in the books
      </button>
      {open && (
        <Card padding="none" className="mt-3 overflow-hidden max-w-2xl">
          <div className="grid grid-cols-[minmax(0,1fr)_130px_130px] gap-3 px-5 py-2.5 text-[12px] font-medium text-[var(--ink-muted)] border-b border-[var(--border)]">
            <span>Account</span>
            <span className="text-right">Debit</span>
            <span className="text-right">Credit</span>
          </div>
          {run.books.map((b) => (
            <div key={b.account} className="grid grid-cols-[minmax(0,1fr)_130px_130px] gap-3 px-5 py-2.5 border-b border-[var(--border)] text-[14px]">
              <span>{b.account}</span>
              <span className="text-right tabular">{n(b.debit) ? <Money amount={b.debit} /> : ""}</span>
              <span className="text-right tabular">{n(b.credit) ? <Money amount={b.credit} /> : ""}</span>
            </div>
          ))}
          <p className="px-5 py-3 text-[12px] text-[var(--ink-muted)]">Totals only, dated the month&apos;s last day, so reading the books never shows one person&apos;s pay.</p>
        </Card>
      )}
    </section>
  );
}

function Reopen({ run, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiClient.post(`/payroll/runs/${run.id}/reopen`, { reason });
      onDone();
      toast.success("Reopened", "Its entry is reversed in the books. Change what you need and approve it again.");
      onClose();
    } catch (ex) {
      toast.error("Not reopened", ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} as="form" onSubmit={go} title={`Reopen ${monthName(run.period)}`} description="Nothing from it has been paid, so it can go back to a draft. Its entry is reversed, not erased.">
      <Field label="Why">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Overtime for the jetty crew was left out" className={FIELD} autoFocus />
      </Field>
      <div className="flex justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="outline" className="border-[var(--danger)] text-[var(--danger)]" disabled={busy || reason.trim().length < 3}>
          {busy && <Loader2 size={14} className="animate-spin" />} {reason.trim().length < 3 ? "Say why" : "Reopen it"}
        </Button>
      </div>
    </Modal>
  );
}
