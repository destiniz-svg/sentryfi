import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, Plus, UserRound } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { formatDate, today } from "@/lib/utils";
import { Attachments } from "@/components/documents/Attachments";

/**
 * Payroll: the month in hand, the runs, and the people paid.
 *
 * One black card carries the month that needs doing: what reaches the staff,
 * what it costs the company, and the next thing due, with the hazard stripe
 * only on that deadline. Below it, the runs as a ruled list, the people with
 * what each is paid and owes back, and the few settings the law needs.
 */

export const FIELD =
  "w-full h-11 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15";
const CHEVRONS = "repeating-linear-gradient(135deg, var(--accent) 0 8px, #141414 8px 16px)";

const n = (s) => Number(String(s ?? "").replace(/,/g, "")) || 0;
export const monthName = (period) => new Date(`${period}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const thisMonth = () => today().slice(0, 7);
const daysTo = (d) => Math.round((new Date(`${d}T00:00:00`) - new Date(`${today()}T00:00:00`)) / 86400000);
const COUNTRY = { MV: "Maldivian", BD: "Bangladeshi", IN: "Indian", LK: "Sri Lankan", NP: "Nepali", PK: "Pakistani", PH: "Filipino", AE: "Emirati", GB: "British", CN: "Chinese" };
export const nationalityName = (c) => COUNTRY[c] || c;

export function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-medium block mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[13px] text-[var(--ink-muted)] mt-1.5">{hint}</span>}
    </label>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return () => {
    for (const k of ["payroll", "figures", "attention", "statements"]) qc.invalidateQueries({ queryKey: [k, companyId] });
  };
}

export default function Payroll() {
  const { companyId } = useCompany();
  const [tab, setTab] = useState("runs");
  const [editing, setEditing] = useState(null);
  const [lending, setLending] = useState(null);
  const refresh = useRefresh();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["payroll", companyId],
    queryFn: () => apiClient.get("/payroll").then((r) => r.data),
    enabled: Boolean(companyId),
  });

  const period = thisMonth();
  const current = data?.runs.find((r) => r.period === period && r.kind === "regular");
  const active = (data?.people || []).filter((p) => !p.archived);
  const start = useMutation({ mutationFn: (body) => apiClient.post("/payroll/runs", body).then((r) => r.data) });

  async function run() {
    if (current) return navigate(`/payroll/runs/${current.id}`);
    try {
      const r = await start.mutateAsync({ period });
      refresh();
      navigate(`/payroll/runs/${r.id}`);
    } catch (ex) {
      toast.error("Not started", ex.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Payroll"
        description="Pay your people, keep the tax and pension right, and give everyone a payslip."
        actions={
          active.length > 0 && (
            <Button variant="accent" onClick={run} disabled={start.isPending}>
              {start.isPending ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              {current ? (current.status === "draft" ? `Carry on with ${monthName(period).split(" ")[0]}` : `Open ${monthName(period).split(" ")[0]}`) : `Run ${monthName(period).split(" ")[0]} payroll`}
            </Button>
          )
        }
      />

      {isLoading ? (
        <Skeleton className="h-48 rounded-3xl" />
      ) : (
        <>
          <MonthCard data={data} current={current} period={period} peopleCount={active.length} onAdd={() => setEditing({})} />
          <Tabs value={tab} onValueChange={setTab} className="mt-6 mb-4">
            <TabsList>
              <TabsTrigger value="runs">Pay runs</TabsTrigger>
              <TabsTrigger value="people">People · {active.length}</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
          </Tabs>
          {tab === "runs" && <Runs runs={data.runs} people={active.length} onDone={refresh} />}
          {tab === "people" && <People people={data.people} rules={data.rules} onEdit={setEditing} onLend={setLending} />}
          {tab === "settings" && <Settings data={data} onDone={refresh} />}
        </>
      )}

      {editing && data && <PersonForm person={editing.id ? editing : null} data={data} onClose={() => setEditing(null)} onDone={refresh} />}
      {lending && data && <Advance person={lending} payFrom={data.payFrom} onClose={() => setLending(null)} onDone={refresh} />}
    </div>
  );
}

/** The month in hand: the one black card. */
function MonthCard({ data, current, period, peopleCount, onAdd }) {
  if (!peopleCount) {
    return (
      <Card padding="lg" className="max-w-3xl">
        <p className="text-[17px] font-semibold">Add the people you pay</p>
        <p className="text-[14px] text-[var(--ink-muted)] mt-1.5 max-w-prose">
          Their basic salary, allowances and bank account, once. Each month Sentryfi works out overtime, the {data.rules.tax ? `${data.rules.tax.name.toLowerCase()}, ` : ""}
          {data.rules.pension ? "pension " : ""}and what reaches each account, puts the totals in the books, and gives every person a payslip.
        </p>
        <Button className="mt-4" variant="outline" onClick={onAdd}>
          <Plus size={16} /> Add a person
        </Button>
      </Card>
    );
  }
  const r = current;
  // The next unpaid thing due, from any approved run.
  const due = data.runs
    .flatMap((x) => (x.owes || []).filter((o) => !o.paid).map((o) => ({ ...o, period: x.period })))
    .filter((o) => o.due)
    .sort((a, b) => a.due.localeCompare(b.due))[0];
  return (
    <section className="rounded-3xl bg-[#141414] text-white overflow-hidden on-ink" aria-label={`${monthName(period)} payroll`}>
      <div className="p-6 sm:p-7 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] items-end">
        <div>
          <div className="text-[14px] text-white/70">{monthName(period)}</div>
          <div className="mt-1 text-[30px] font-semibold tabular leading-tight">
            {r ? <Money amount={r.net} /> : "Not run yet"}
            {r && <span className="text-[15px] text-white/60 ml-2">{data.settings.currency} to staff</span>}
          </div>
          <div className="text-[14px] mt-1 text-[var(--accent)]">
            {r ? (r.status === "draft" ? `A draft for ${r.people} ${r.people === 1 ? "person" : "people"}${r.blockers ? ` · ${r.blockers} to fix` : ""}` : "Approved and in the books") : `${peopleCount} ${peopleCount === 1 ? "person" : "people"} to pay`}
          </div>
        </div>
        <div>
          <div className="text-[13px] text-white/60">What it costs the company</div>
          <div className="text-[19px] font-semibold tabular mt-0.5">{r ? <Money amount={r.employerCost} /> : "—"}</div>
          <div className="text-[13px] text-white/60 mt-0.5">pay, plus the employer&apos;s pension{data.rules.gratuity ? " and gratuity" : ""}</div>
        </div>
        <div>
          <div className="text-[13px] text-white/60">Due by law</div>
          <div className="text-[15px] mt-0.5">{data.rules.tax ? `${data.rules.tax.form} and pension by the ${data.rules.tax.dueDay}th` : data.rules.pension ? `Pension by the ${data.rules.pension.dueDay}th` : "Pay by the pay day"}</div>
        </div>
      </div>
      {due && (
        <Link to={`/payroll/runs/${data.runs.find((x) => x.period === due.period)?.id}`} className="flex items-center gap-3 h-11 pr-5 bg-black/40 hover:bg-black/60 transition-colors">
          <span className="w-11 self-stretch" style={{ background: CHEVRONS }} aria-hidden="true" />
          <span className="text-[14px] font-medium flex-1 min-w-0 truncate">
            {due.label} for {monthName(due.period)}: {data.settings.currency} {due.amount}, due {formatDate(due.due, { day: "numeric", month: "short" })}
          </span>
          <span className="text-[13px] text-[var(--accent)] tabular whitespace-nowrap">{daysTo(due.due) < 0 ? `${-daysTo(due.due)} days late` : daysTo(due.due) === 0 ? "today" : `${daysTo(due.due)} days`}</span>
        </Link>
      )}
    </section>
  );
}

const STANDING = (r) => {
  if (r.status === "draft") return r.blockers ? ["Draft · fix first", "text-[var(--danger)]"] : ["Draft", "text-[var(--ink-muted)]"];
  const open = (r.owes || []).filter((o) => !o.paid);
  return open.length ? [`Approved · ${open.length} to pay`, "text-[var(--warning)]"] : ["Paid", "text-[var(--success)]"];
};

function Runs({ runs, people, onDone }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [f, setF] = useState({ period: thisMonth(), kind: "adjustment" });
  async function make(e) {
    e.preventDefault();
    try {
      const r = await apiClient.post("/payroll/runs", f);
      onDone();
      navigate(`/payroll/runs/${r.data.id}`);
    } catch (ex) {
      toast.error("Not made", ex.message);
    }
  }
  return (
    <>
      {!runs.length ? (
        <Card padding="lg">
          <p className="text-[15px] font-semibold">No pay runs yet</p>
          <p className="text-[14px] text-[var(--ink-muted)] mt-1">{people ? "Run this month's payroll from the button at the top." : "Add the people you pay first."}</p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="hidden lg:grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_80px_140px_140px_140px] gap-4 px-5 py-3 border-b border-[var(--border)] text-[12px] font-medium text-[var(--ink-muted)]">
            <span>Month</span>
            <span>Standing</span>
            <span className="text-right">People</span>
            <span className="text-right">Gross pay</span>
            <span className="text-right">To staff</span>
            <span className="text-right">Cost to company</span>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {runs.map((r) => {
              const [word, tone] = STANDING(r);
              return (
                <li key={r.id}>
                  <Link to={`/payroll/runs/${r.id}`} className="grid grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_80px_140px_140px_140px] gap-x-4 gap-y-1 px-5 py-4 items-center hover:bg-[var(--surface-2)] transition-colors">
                    <span className="text-[15px] font-semibold">
                      {monthName(r.period)}
                      {r.kind === "adjustment" && <span className="text-[13px] font-normal text-[var(--ink-muted)]"> · adjustment</span>}
                    </span>
                    <span className={`text-[13px] font-medium text-right lg:text-left ${tone}`}>{word}</span>
                    <span className="hidden lg:block text-[14px] text-right tabular">{r.people}</span>
                    <span className="hidden lg:block text-[14px] text-right text-[var(--ink-muted)]"><Money amount={r.gross} /></span>
                    <span className="text-[15px] font-semibold lg:text-right"><Money amount={r.net} /></span>
                    <span className="text-[14px] text-right text-[var(--ink-muted)]"><Money amount={r.employerCost} /></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {runs.length > 0 && (
        <div className="mt-4">
          {!asking ? (
            <Button variant="ghost" size="sm" onClick={() => setAsking(true)}>
              <Plus size={14} /> An adjustment run, or another month
            </Button>
          ) : (
            <form onSubmit={make} className="flex flex-wrap items-end gap-3">
              <Field label="Month">
                <input type="month" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} className={`${FIELD} w-48`} />
              </Field>
              <Field label="Kind">
                <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className={`${FIELD} w-64`}>
                  <option value="adjustment">Adjustment: put a month right</option>
                  <option value="regular">The month&apos;s regular run</option>
                </select>
              </Field>
              <Button type="submit" variant="outline">Make it</Button>
            </form>
          )}
        </div>
      )}
    </>
  );
}

function People({ people, rules, onEdit, onLend }) {
  const [shown, setShown] = useState("now");
  const list = people.filter((p) => (shown === "now" ? !p.archived && !(p.leftOn && p.leftOn < today()) : true));
  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex gap-2 text-[13px]">
          {[["now", "Working here"], ["all", "Everyone, with leavers"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setShown(k)} className={`h-9 px-3.5 rounded-full border ${shown === k ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--border)] text-[var(--ink-muted)]"}`}>
              {l}
            </button>
          ))}
        </div>
        <Button variant="outline" onClick={() => onEdit({})}>
          <Plus size={16} /> Add a person
        </Button>
      </div>
      {!list.length ? (
        <Card padding="lg">
          <p className="text-[14px] text-[var(--ink-muted)]">Nobody here yet.</p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="hidden xl:grid grid-cols-[minmax(0,1.6fr)_130px_130px_120px_120px_180px] gap-4 px-5 py-3 border-b border-[var(--border)] text-[12px] font-medium text-[var(--ink-muted)]">
            <span>Person</span>
            <span className="text-right">Basic a month</span>
            <span>Pension</span>
            <span className="text-right">Leave left</span>
            <span className="text-right">Advance owed</span>
            <span />
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {list.map((p) => {
              const national = rules.pension && p.nationality === rules.pension.national;
              const inPension = p.pensionMember ?? national;
              return (
                <li key={p.id} className="grid grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_130px_130px_120px_120px_180px] gap-x-4 gap-y-1 px-5 py-4 items-center" data-testid="payroll-person">
                  <button type="button" onClick={() => onEdit(p)} className="col-span-2 xl:col-span-1 min-w-0 text-left flex items-start gap-3">
                    <span className="mt-0.5 h-9 w-9 shrink-0 rounded-full bg-[var(--surface-2)] inline-flex items-center justify-center text-[var(--ink-muted)]" aria-hidden="true">
                      <UserRound size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold truncate hover:underline">{p.name}</span>
                      <span className="block text-[13px] text-[var(--ink-muted)] truncate">
                        {[p.jobTitle, nationalityName(p.nationality), p.leftOn ? `left ${formatDate(p.leftOn)}` : `since ${formatDate(p.joinedOn, { month: "short", year: "numeric" })}`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                  <span className="text-[15px] font-semibold xl:text-right"><Money amount={p.basic} /></span>
                  <span className="text-[13px] text-right xl:text-left text-[var(--ink-muted)]">{rules.pension ? (inPension ? "In the scheme" : "Not in it") : "—"}</span>
                  <span className="text-[13px] xl:text-right tabular text-[var(--ink-muted)]">{p.leave ? `${p.leave.left} days` : "—"}</span>
                  <span className="text-[13px] text-right tabular">{n(p.advanceOwed) > 0 ? <Money amount={p.advanceOwed} /> : <span className="text-[var(--ink-muted)]">—</span>}</span>
                  <span className="col-span-2 xl:col-span-1 flex gap-2 xl:justify-end">
                    <Button variant="outline" size="sm" onClick={() => onLend(p)}>Lend an advance</Button>
                    <Button variant="ghost" size="sm" onClick={() => onEdit(p)}>Change</Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

const blankItem = (kind) => ({ kind, name: "", amount: "", pensionable: false });

/** Adding or changing a person: who they are, what they are paid, where it goes. */
function PersonForm({ person, data, onClose, onDone }) {
  const toast = useToast();
  const { rules } = data;
  const [f, setF] = useState(() => ({
    name: person?.name || "", employeeNo: person?.employeeNo || "", jobTitle: person?.jobTitle || "",
    nationality: person?.nationality || rules.pension?.national || "MV", idNumber: person?.idNumber || "", tin: person?.tin || "", dob: person?.dob || "",
    email: person?.email || "", phone: person?.phone || "",
    joinedOn: person?.joinedOn || today(), leftOn: person?.leftOn || "",
    basic: person ? person.basic.replace(/,/g, "") : "",
    pensionMember: person?.pensionMember ?? null, pensionScheme: person?.pensionScheme || "",
    serviceCharge: person?.serviceCharge || false,
    bankName: person?.bankName || "", bankAccount: person?.bankAccount || "", bankAccountName: person?.bankAccountName || "",
    wpsPersonId: person?.wpsPersonId || "", wpsRoutingCode: person?.wpsRoutingCode || "",
    projectId: person?.projectId || "", userId: person?.userId || "",
    items: person?.items?.length ? person.items.map((i) => ({ ...i, amount: i.amount.replace(/,/g, "") })) : [],
  }));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const put = (patch) => setF((x) => ({ ...x, ...patch }));
  const set = (k) => (e) => put({ [k]: e.target.value });
  const national = rules.pension && f.nationality.toUpperCase() === rules.pension.national;
  const setItem = (i, patch) => put({ items: f.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });

  async function save(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const body = { ...f, nationality: f.nationality.toUpperCase(), leftOn: f.leftOn || null, dob: f.dob || null, projectId: f.projectId || null, userId: f.userId || null };
      if (person) await apiClient.put(`/payroll/people/${person.id}`, body);
      else await apiClient.post("/payroll/people", body);
      onDone();
      toast.success(person ? `${f.name.trim()} changed` : `${f.name.trim()} added`, person ? "Draft runs pick the change up at once." : "They are on the next run for any month they worked.");
      onClose();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} as="form" onSubmit={save} title={person ? person.name : "Add a person"} description="Set once; each month's run starts from this." size="lg">
      <div className="grid gap-5">
        <fieldset className="grid sm:grid-cols-[minmax(0,1fr)_140px] gap-4">
          <Field label="Name">
            <input id="person-name" value={f.name} onChange={set("name")} placeholder="Aishath Rasheed" className={FIELD} autoFocus />
          </Field>
          <Field label="Staff number">
            <input value={f.employeeNo} onChange={set("employeeNo")} placeholder="E-014" className={FIELD} />
          </Field>
          <Field label="Job">
            <input value={f.jobTitle} onChange={set("jobTitle")} placeholder="Site supervisor" className={FIELD} />
          </Field>
          <Field label="Nationality" hint={national ? "Pension applies" : "Code, like MV, BD, IN"}>
            <input id="person-nationality" value={f.nationality} onChange={set("nationality")} maxLength={2} className={`${FIELD} uppercase`} />
          </Field>
        </fieldset>

        <fieldset className="grid sm:grid-cols-3 gap-4">
          <Field label="Started">
            <input id="person-joined" type="date" value={f.joinedOn} onChange={set("joinedOn")} className={FIELD} />
          </Field>
          <Field label="Left (if they have)">
            <input type="date" value={f.leftOn} onChange={set("leftOn")} className={FIELD} />
          </Field>
          <Field label="Date of birth" hint={rules.pension ? "For the pension ages" : null}>
            <input type="date" value={f.dob} onChange={set("dob")} className={FIELD} />
          </Field>
        </fieldset>

        <div className="rounded-2xl bg-[var(--surface-2)] p-4 grid gap-4">
          <Field label={`Basic salary a month (${data.settings.currency})`} hint={rules.pension?.base === "basic" ? "Pension is worked out on this alone" : null}>
            <input id="person-basic" value={f.basic} onChange={set("basic")} inputMode="decimal" placeholder="0.00" className={`${FIELD} tabular max-w-[240px]`} />
          </Field>
          <div className="grid gap-2">
            {f.items.map((it, i) => (
              <div key={i} className="grid grid-cols-[110px_minmax(0,1fr)_130px_auto] gap-2 items-center">
                <select aria-label={`Pay item ${i + 1}: kind`} value={it.kind} onChange={(e) => setItem(i, { kind: e.target.value })} className={FIELD}>
                  <option value="allowance">Allowance</option>
                  <option value="deduction">Deduction</option>
                </select>
                <input aria-label={`Pay item ${i + 1}: name`} value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} placeholder={it.kind === "allowance" ? "Island allowance" : "Staff housing"} className={FIELD} />
                <input aria-label={`Pay item ${i + 1}: amount`} value={it.amount} onChange={(e) => setItem(i, { amount: e.target.value })} inputMode="decimal" placeholder="0.00" className={`${FIELD} tabular`} />
                <Button type="button" variant="ghost" size="sm" onClick={() => put({ items: f.items.filter((_, j) => j !== i) })}>Remove</Button>
                {it.kind === "allowance" && rules.pension?.base === "pensionable" && (
                  <label className="col-start-2 col-span-3 text-[13px] text-[var(--ink-muted)] flex items-center gap-2">
                    <input type="checkbox" checked={it.pensionable} onChange={(e) => setItem(i, { pensionable: e.target.checked })} /> Counts for pension (housing, cost of living, social)
                  </label>
                )}
              </div>
            ))}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => put({ items: [...f.items, blankItem("allowance")] })}>
                <Plus size={14} /> An allowance
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => put({ items: [...f.items, blankItem("deduction")] })}>
                <Plus size={14} /> A deduction they agreed to
              </Button>
            </div>
          </div>
        </div>

        {rules.pension && (
          <fieldset className="grid sm:grid-cols-2 gap-4">
            <Field label="Pension" hint={`${rules.pension.name}: ${national ? "nationals are in it by law" : "open to others if you agree"}`}>
              <select value={f.pensionMember === null ? "" : String(f.pensionMember)} onChange={(e) => put({ pensionMember: e.target.value === "" ? null : e.target.value === "true" })} className={FIELD}>
                <option value="">As the law says ({national ? "in" : "not in"})</option>
                <option value="true">In the scheme</option>
                <option value="false">Not in the scheme</option>
              </select>
            </Field>
            {rules.pension.schemes.length > 1 && (
              <Field label="Registered">
                <select value={f.pensionScheme} onChange={set("pensionScheme")} className={FIELD}>
                  <option value="">{rules.pension.schemes[0].label}</option>
                  {rules.pension.schemes.slice(1).map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </Field>
            )}
          </fieldset>
        )}

        <fieldset className="grid sm:grid-cols-3 gap-4">
          <Field label="Bank">
            <input value={f.bankName} onChange={set("bankName")} placeholder="BML" className={FIELD} />
          </Field>
          <Field label="Account number" className="sm:col-span-2">
            <input id="person-account" value={f.bankAccount} onChange={set("bankAccount")} inputMode="numeric" placeholder="7701234567890" className={`${FIELD} tabular`} />
          </Field>
          {rules.bankFile === "wps" && (
            <>
              <Field label="MOHRE person id">
                <input value={f.wpsPersonId} onChange={set("wpsPersonId")} className={FIELD} />
              </Field>
              <Field label="Bank routing code">
                <input value={f.wpsRoutingCode} onChange={set("wpsRoutingCode")} className={FIELD} />
              </Field>
            </>
          )}
        </fieldset>

        <fieldset className="grid sm:grid-cols-3 gap-4">
          <Field label="ID card or passport">
            <input value={f.idNumber} onChange={set("idNumber")} placeholder="A123456" className={FIELD} />
          </Field>
          {rules.tax && (
            <Field label="TIN (optional)">
              <input value={f.tin} onChange={set("tin")} className={FIELD} />
            </Field>
          )}
          {data.projects.length > 0 && (
            <Field label="Cost goes to">
              <select value={f.projectId} onChange={set("projectId")} className={FIELD}>
                <option value="">The company</option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Sees their payslips as">
            <select value={f.userId} onChange={set("userId")} className={FIELD}>
              <option value="">Nobody signs in</option>
              {data.users.map((u) => (
                <option key={u.id} value={u.id}>{u.name || u.email}</option>
              ))}
            </select>
          </Field>
        </fieldset>
        {person && <Attachments kind="employee" id={person.id} title="Papers: contract, ID, work permit" compact />}
        {rules.serviceCharge && (
          <label className="flex items-center gap-2.5 text-[14px]">
            <input type="checkbox" checked={f.serviceCharge} onChange={(e) => put({ serviceCharge: e.target.checked })} className="h-4 w-4" />
            Shares in the service charge
          </label>
        )}
      </div>
      {err && <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">{err}</p>}
      <div className="flex justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="accent" disabled={busy || !f.name.trim() || !f.basic || !f.joinedOn}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          {!f.name.trim() ? "Add their name" : !f.basic ? "Add their basic salary" : person ? "Save" : `Add ${f.name.trim().split(" ")[0]}`}
        </Button>
      </div>
    </Modal>
  );
}

function Advance({ person, payFrom, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ amount: "", instalment: "", givenOn: today(), fromAccountId: payFrom[0]?.id || "", note: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const months = n(f.amount) && n(f.instalment) ? Math.ceil(n(f.amount) / n(f.instalment)) : null;
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await apiClient.post(`/payroll/people/${person.id}/advance`, { ...f, instalment: f.instalment || f.amount });
      onDone();
      toast.success(`Advance to ${person.name}`, `Paid from ${r.data.from}, entry ${r.data.entryNo}. It comes off their pay from the next run.`);
      onClose();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} as="form" onSubmit={save} title={`Lend ${person.name} an advance`} description="Paid now, and taken back from their pay a month at a time.">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="How much">
          <input value={f.amount} onChange={set("amount")} inputMode="decimal" placeholder="0.00" className={`${FIELD} tabular`} autoFocus />
        </Field>
        <Field label="Taken back each month" hint={months ? `${months} ${months === 1 ? "month" : "months"}` : "Leave empty to take it all next month"}>
          <input value={f.instalment} onChange={set("instalment")} inputMode="decimal" placeholder={f.amount || "0.00"} className={`${FIELD} tabular`} />
        </Field>
        <Field label="Paid from">
          <select value={f.fromAccountId} onChange={set("fromAccountId")} className={FIELD}>
            {payFrom.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>
        <Field label="On">
          <input type="date" value={f.givenOn} onChange={set("givenOn")} className={FIELD} />
        </Field>
      </div>
      <p className="text-[13px] text-[var(--ink-muted)] mt-4">By law the person agrees to it in writing, and what comes off in a month stays within the limit the law sets; the run warns if it does not.</p>
      {err && <p role="alert" className="text-[13px] text-[var(--danger)] mt-3">{err}</p>}
      <div className="flex justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="accent" disabled={busy || !n(f.amount) || !f.fromAccountId}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          {n(f.amount) ? `Lend ${f.amount}` : "Add the amount"}
        </Button>
      </div>
    </Modal>
  );
}

function Settings({ data, onDone }) {
  const toast = useToast();
  const s = data.settings;
  const [f, setF] = useState({ size: s.size, payDay: s.payDay || "", wpsEmployerId: s.wpsEmployerId || "", wpsRoutingCode: s.wpsRoutingCode || "" });
  async function save(e) {
    e.preventDefault();
    try {
      await apiClient.put("/payroll/settings", { ...f, payDay: f.payDay ? Number(f.payDay) : null });
      onDone();
      toast.success("Payroll settings saved");
    } catch (ex) {
      toast.error("Not saved", ex.message);
    }
  }
  const r = data.rules;
  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <Card padding="lg">
        <form onSubmit={save} className="grid gap-4">
          {data.rules.pack === "MV" && (
            <Field label="Size of the business" hint={s.tourism ? "Tourism pays the medium minimum wage whatever its size." : "Sets the minimum wage the run checks Maldivian pay against."}>
              <select value={f.size} onChange={(e) => setF({ ...f, size: e.target.value })} className={FIELD}>
                <option value="small">Small (minimum MVR 4,500)</option>
                <option value="medium">Medium (minimum MVR 7,000)</option>
                <option value="large">Large (minimum MVR 8,000)</option>
              </select>
            </Field>
          )}
          {r.bankFile === "wps" && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="MOHRE establishment id">
                <input value={f.wpsEmployerId} onChange={(e) => setF({ ...f, wpsEmployerId: e.target.value })} className={FIELD} />
              </Field>
              <Field label="Your bank's routing code">
                <input value={f.wpsRoutingCode} onChange={(e) => setF({ ...f, wpsRoutingCode: e.target.value })} className={FIELD} />
              </Field>
            </div>
          )}
          <div>
            <Button type="submit" variant="outline">Save</Button>
          </div>
        </form>
      </Card>
      <Card padding="lg">
        <p className="text-[15px] font-semibold">The rules the runs follow</p>
        <ul className="mt-3 space-y-2 text-[14px] text-[var(--ink-muted)]">
          {r.tax && <li>{r.tax.name}: worked out band by band each month{r.pack === "MV" ? ", after the employee's own pension" : ""}; {r.tax.form} to {r.tax.authority} by the {r.tax.dueDay}th of the next month.</li>}
          {r.pension && <li>{r.pension.name}: on {r.pension.base === "basic" ? "the basic salary" : "basic and pensionable allowances"}; paid to {r.pension.authority} by the {r.pension.dueDay}th.</li>}
          {r.overtime.map((o) => <li key={o.key}>{o.label}: {o.percent}% of the hourly rate.</li>)}
          {r.gratuity && <li>End-of-service gratuity set aside each month: 21 days&apos; basic a year for the first five years, 30 after.</li>}
          {r.finalPayDays && <li>Final pay for a leaver within {r.finalPayDays} days.</li>}
          {!r.tax && !r.pension && <li>No statutory tax or pension for this country: gross to net with your own deductions.</li>}
        </ul>
        <p className="text-[13px] text-[var(--ink-muted)] mt-3">Have your accountant confirm these before the first run is filed.</p>
      </Card>
    </div>
  );
}
