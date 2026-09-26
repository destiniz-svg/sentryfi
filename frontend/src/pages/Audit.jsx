import { createContext, useContext, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, BadgeCheck, ChevronRight, Download, FileText, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { openFile } from "@/components/documents/Attachments";
import { Conversation } from "@/components/talk/Conversation";
import { useAuth } from "@/context/AuthContext";
import { FIELD } from "@/lib/shipments";
import { formatDate, today } from "@/lib/utils";

/**
 * The auditor's workspace. A period under audit with its seal checked; the
 * journal screened for the signs of override; samples drawn from it, kept
 * with their seed so they can be proved; each item opened onto its document,
 * entry, money and papers, and ticked as seen with a note. Nothing here
 * changes the books.
 */

// Once a period is signed off its work is kept as it was: the controls that write switch off (the database refuses anyway).
const Frozen = createContext(false);
function useAudit() {
  const { can } = useCompany();
  const frozen = useContext(Frozen);
  return can("audit") && !frozen;
}

const KIND = { bill: "Bills", invoice: "Invoices", entry: "Journal entries", payment: "Payments", receipt: "Receipts", credit_note: "Credit notes", claim: "Expense claims" };
const ONE = { bill: "Bill", invoice: "Invoice", entry: "Entry", payment: "Payment", receipt: "Receipt", credit_note: "Credit note", claim: "Expense claim" };
const HOW = [
  { key: "random", name: "So many at random", says: "Every item has the same chance." },
  { key: "over", name: "Every one over an amount", says: "All the large ones, nothing left to chance." },
  { key: "key", name: "Key items, then some at random", says: "The large ones, and a random look at the rest." },
  { key: "mus", name: "By monetary unit", says: "Every rufiyaa has the same chance, so larger items are likelier." },
  { key: "risk", name: "From the journal risks", says: "Entries that show signs of override (ISA 240)." },
];
const n = (s) => Number(String(s ?? "").replace(/,/g, ""));

function Label({ children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium block mb-1.5">
      {children}
    </label>
  );
}

function Progress({ done, of }) {
  const pct = of ? Math.round((done / of) * 100) : 0;
  return (
    <span className="flex items-center gap-2 min-w-[120px]" aria-label={`${done} of ${of} seen`}>
      <span className="h-1.5 flex-1 rounded-full bg-[var(--surface-2)] overflow-hidden border border-[var(--border)]">
        <span className={`block h-full rounded-full ${done === of && of ? "bg-[var(--success)]" : "bg-[var(--accent)]"}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={`text-[13px] font-semibold tabular whitespace-nowrap ${done === of && of ? "text-[var(--success)]" : ""}`}>
        {done}/{of}
      </span>
    </span>
  );
}

function Seal({ seal }) {
  if (!seal) return null;
  const inside = seal.problems.filter((p) => p.inPeriod);
  return seal.ok ? (
    <div className="flex items-start gap-3 rounded-2xl bg-[var(--success-soft)] px-4 py-3" data-testid="seal">
      <ShieldCheck size={20} className="text-[var(--success)] shrink-0 mt-0.5" />
      <p className="text-[14px]">
        <span className="font-semibold">The seal is intact.</span> All {seal.entries} entries in the period are as they were posted, and the chain around them is unbroken.{" "}
        <span className="text-[var(--ink-muted)]">Checked {formatDate(seal.at)}.</span>
      </p>
    </div>
  ) : (
    <div className="rounded-2xl bg-[var(--danger-soft)] px-4 py-3" data-testid="seal">
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

// ------------------------------------------------------------------ periods

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
      <PageHeader title="Audit" description="A period to audit, its seal checked, its journal screened, and samples drawn from it. Nothing here changes the books." />
      <AuditorAccess />
      {can("audit") && (
        <Card padding="lg" className="mb-4">
          <form onSubmit={onSubmit} className="grid sm:grid-cols-[minmax(0,1fr)_170px_170px_auto] gap-3 items-end" data-testid="new-period">
            <div>
              <Label htmlFor="audit-name">Period</Label>
              <input id="audit-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={FIELD} />
            </div>
            <div>
              <Label htmlFor="audit-from">From</Label>
              <input id="audit-from" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className={FIELD} />
            </div>
            <div>
              <Label htmlFor="audit-to">To</Label>
              <input id="audit-to" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={FIELD} />
            </div>
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
                      {p.signedOff ? ` · signed off by ${p.signedOff.by}, ${formatDate(p.signedOff.at)}` : ""}
                    </span>
                  </span>
                  {p.items > 0 && (
                    <span className="hidden sm:block w-40">
                      <Progress done={p.seen} of={p.items} />
                    </span>
                  )}
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

// ------------------------------------------------------------------ one period

function useRisk(id, enabled = true) {
  const { companyId } = useCompany();
  return useQuery({ queryKey: ["audit-risk", companyId, id], queryFn: () => apiClient.get(`/audit/${id}/risk`).then((r) => r.data), enabled: Boolean(companyId) && enabled, staleTime: 60000 });
}

function Period({ id }) {
  const { companyId, can } = useCompany();
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "overview";
  const key = ["audit", companyId, id];
  const { data: p, isLoading } = useQuery({ queryKey: key, queryFn: () => apiClient.get(`/audit/${id}`).then((r) => r.data), enabled: Boolean(companyId) });
  const [busy, setBusy] = useState(false);
  const go = (t) => setParams(t === "overview" ? {} : { tab: t }, { replace: true });

  async function reseal() {
    setBusy(true);
    try {
      await apiClient.post(`/audit/${id}/seal`);
      qc.invalidateQueries({ queryKey: key });
    } catch (ex) {
      toast.error("Not checked", ex.message);
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || !p) return <Skeleton className="h-60 rounded-2xl" />;
  const items = p.samples.reduce((s, x) => s + x.items, 0);
  const seen = p.samples.reduce((s, x) => s + x.seen, 0);
  return (
    <div>
      <PageHeader title={p.name} description={`${formatDate(p.from)} to ${formatDate(p.to)}.`} />
      <Tabs value={tab} onValueChange={go} className="mb-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="samples">Samples{p.samples.length ? ` · ${p.samples.length}` : ""}</TabsTrigger>
          <TabsTrigger value="risk">Journal risk</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="confirmations">Confirmations</TabsTrigger>
          <TabsTrigger value="count">Count</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
          <TabsTrigger value="pack">Audit pack</TabsTrigger>
          <TabsTrigger value="signoff">{p.signedOff ? "Signed off" : "Sign-off"}</TabsTrigger>
        </TabsList>
      </Tabs>

      <Frozen.Provider value={Boolean(p.signedOff)}>
      {p.signedOff && tab !== "signoff" && <SignedBanner s={p.signedOff} />}
      {tab === "overview" && (
        <div className="grid gap-4">
          <Seal seal={p.seal} />
          {can("audit") && !p.signedOff && (
            <p>
              <Button variant="outline" size="sm" onClick={reseal} disabled={busy}>
                {busy && <Loader2 size={13} className="animate-spin" />}
                Check the seal again
              </Button>
            </p>
          )}
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card padding="lg" className="grid gap-3 content-start">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold">Samples</h2>
                <button type="button" onClick={() => go("samples")} className="text-[13px] underline underline-offset-2 min-h-11">
                  Open
                </button>
              </div>
              {p.samples.length ? (
                <>
                  <Progress done={seen} of={items} />
                  <p className="text-[14px] text-[var(--ink-muted)]">
                    {p.samples.length} {p.samples.length === 1 ? "sample" : "samples"}, {items} items, {items - seen} still to see.
                  </p>
                </>
              ) : (
                <p className="text-[14px] text-[var(--ink-muted)]">None drawn yet.</p>
              )}
            </Card>
            <RiskGlance id={id} onOpen={() => go("risk")} />
            <QuestionsGlance id={id} onOpen={() => go("questions")} />
            <AdjustmentsGlance id={id} onOpen={() => go("adjustments")} />
            {!p.signedOff && <ReadinessGlance id={id} onOpen={() => go("signoff")} />}
          </div>
        </div>
      )}
      {tab === "samples" && <Samples p={p} />}
      {tab === "risk" && <Risk id={id} />}
      {tab === "questions" && <Questions p={p} />}
      {tab === "confirmations" && <Confirmations p={p} />}
      {tab === "count" && <Counting p={p} />}
      {tab === "adjustments" && <Adjustments p={p} />}
      {tab === "pack" && <Pack p={p} />}
      {tab === "signoff" && <SignOff p={p} />}
      </Frozen.Provider>
    </div>
  );
}

function RiskGlance({ id, onOpen }) {
  const { data: r } = useRisk(id);
  const top = r ? [...r.tests].filter((t) => t.count).sort((a, b) => b.weight - a.weight || b.count - a.count).slice(0, 3) : [];
  return (
    <Card padding="lg" className="grid gap-3 content-start" data-testid="risk-glance">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Journal risk</h2>
        <button type="button" onClick={onOpen} className="text-[13px] underline underline-offset-2 min-h-11">
          Open
        </button>
      </div>
      {!r ? (
        <Skeleton className="h-10 rounded-xl" />
      ) : (
        <>
          <p className="text-[14px]">
            <span className="font-semibold tabular">{r.flagged}</span> of {r.total} entries show at least one sign of override.
          </p>
          {top.length > 0 && (
            <ul className="grid gap-1 text-[13px] text-[var(--ink-muted)]">
              {top.map((t) => (
                <li key={t.key}>
                  {t.name}: <span className="tabular text-[var(--ink)]">{t.count}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ samples

function Samples({ p }) {
  const canAudit = useAudit();
  return (
    <div className="grid gap-4">
      {canAudit && <Draw periodId={p.id} />}
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] text-[13px] font-semibold">Samples</div>
        {!p.samples.length ? (
          <p className="px-5 py-4 text-[14px] text-[var(--ink-muted)]">None drawn yet. A sample keeps its seed and rule, so it can be re-drawn later and shown to be the same.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]" data-testid="samples">
            {p.samples.map((s) => (
              <li key={s.id}>
                <Link to={`/audit/samples/${s.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--surface-2)] min-h-11">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{s.said}</span>
                    <span className="block text-[13px] text-[var(--ink-muted)]">
                      MVR {s.value} drawn from {s.population}
                      {s.populationValue ? ` worth MVR ${s.populationValue}` : ""} · {s.by || "someone"}, {formatDate(s.at)}
                    </span>
                  </span>
                  <span className="w-36 hidden sm:block">
                    <Progress done={s.seen} of={s.items} />
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

function Draw({ periodId, preset }) {
  const nav = useNavigate();
  const toast = useToast();
  const { data: r } = useRisk(periodId);
  const [d, setD] = useState(preset || { kind: "bill", how: "random", size: "25", over: "", tests: [] });
  const [busy, setBusy] = useState(false);
  const how = (key) => setD({ ...d, how: key, kind: key === "risk" ? "entry" : d.kind });
  const toggle = (t) => setD({ ...d, tests: d.tests.includes(t) ? d.tests.filter((x) => x !== t) : [...d.tests, t] });
  const needsSize = ["random", "key", "mus"].includes(d.how);
  const needsOver = ["over", "key"].includes(d.how);
  const ready = (!needsSize || d.size) && (!needsOver || d.over) && (d.how !== "risk" || d.tests.length);

  async function onDraw(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { kind: d.kind, how: d.how, ...(needsSize || (d.how === "risk" && d.size) ? { size: d.size } : {}), ...(needsOver ? { over: d.over } : {}), ...(d.how === "risk" ? { tests: d.tests } : {}) };
      const res = await apiClient.post(`/audit/${periodId}/samples`, body);
      nav(`/audit/samples/${res.data.id}`);
    } catch (ex) {
      toast.error("Not drawn", ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding="lg">
      <form onSubmit={onDraw} className="grid gap-4" data-testid="draw">
        <h2 className="text-[15px] font-semibold">Draw a sample</h2>
        <fieldset>
          <legend className="text-sm font-medium mb-1.5">How</legend>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2" role="radiogroup">
            {HOW.map((h) => (
              <label
                key={h.key}
                className={`flex gap-3 items-start rounded-xl border px-3 py-2.5 cursor-pointer min-h-11 ${d.how === h.key ? "border-[var(--ink)] bg-[var(--surface-2)]" : "border-[var(--border)] hover:border-[var(--ink-muted)]"}`}
              >
                <input type="radio" name="draw-how" id={`draw-how-${h.key}`} value={h.key} checked={d.how === h.key} onChange={() => how(h.key)} className="mt-1 accent-[var(--ink)]" />
                <span>
                  <span className="block text-[14px] font-medium">{h.name}</span>
                  <span className="block text-[12.5px] text-[var(--ink-muted)]">{h.says}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <Label htmlFor="draw-kind">From</Label>
            <select id="draw-kind" value={d.kind} disabled={d.how === "risk"} onChange={(e) => setD({ ...d, kind: e.target.value })} className={`${FIELD} w-48`}>
              {Object.entries(KIND).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {needsOver && (
            <div>
              <Label htmlFor="draw-over">{d.how === "key" ? "Key items from (MVR)" : "At least (MVR)"}</Label>
              <input id="draw-over" value={d.over} onChange={(e) => setD({ ...d, over: e.target.value })} inputMode="decimal" placeholder="10000" className={`${FIELD} w-40 tabular`} />
            </div>
          )}
          {(needsSize || d.how === "risk") && (
            <div>
              <Label htmlFor="draw-size">{d.how === "key" ? "Of the rest, at random" : d.how === "risk" ? "How many (empty for all)" : "How many"}</Label>
              <input id="draw-size" value={d.size} onChange={(e) => setD({ ...d, size: e.target.value })} inputMode="numeric" className={`${FIELD} w-40 tabular`} />
            </div>
          )}
          <Button type="submit" variant="accent" disabled={busy || !ready}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            Draw it
          </Button>
        </div>
        {d.how === "risk" && (
          <div>
            <span className="text-sm font-medium block mb-1.5">Entries that show</span>
            <div className="flex flex-wrap gap-2">
              {(r?.tests || []).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={d.tests.includes(t.key)}
                  onClick={() => toggle(t.key)}
                  disabled={!t.count}
                  className={`h-9 px-3 rounded-full border text-[13px] disabled:opacity-40 ${d.tests.includes(t.key) ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--border)]"}`}
                >
                  {t.name} <span className="tabular opacity-70">{t.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="text-[12.5px] text-[var(--ink-muted)]">The seed is made when you draw, never chosen, and kept with the sample. Drawing again later with it proves the sample.</p>
      </form>
    </Card>
  );
}

// ------------------------------------------------------------------ journal risk

function Risk({ id }) {
  const canAudit = useAudit();
  const { data: r, isLoading } = useRisk(id);
  const [only, setOnly] = useState([]);
  const [drawing, setDrawing] = useState(false);
  if (isLoading || !r) return <Skeleton className="h-60 rounded-2xl" />;
  const shown = only.length ? r.entries.filter((e) => e.flags.some((x) => only.includes(x.test))) : r.entries;
  const toggle = (t) => setOnly(only.includes(t) ? only.filter((x) => x !== t) : [...only, t]);
  return (
    <div className="grid gap-4">
      <Card padding="lg" className="grid gap-3">
        <p className="text-[15px]">
          <span className="font-semibold tabular">{r.flagged}</span> of the period's {r.total} entries show at least one of the signs auditors look for when management might override the controls (ISA 240). The dots say how telling each sign is; the number on an entry adds up its signs, so the most telling come first. Pick signs to narrow the list.
        </p>
        <div className="flex flex-wrap gap-2" data-testid="risk-tests">
          {r.tests.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={only.includes(t.key)}
              onClick={() => toggle(t.key)}
              disabled={!t.count}
              className={`h-9 px-3 rounded-full border text-[13px] inline-flex items-center gap-1.5 disabled:opacity-40 ${only.includes(t.key) ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--border)] hover:border-[var(--ink-muted)]"}`}
            >
              <span aria-hidden="true" className="tracking-tighter">{"●".repeat(t.weight)}</span>
              {t.name} <span className="tabular opacity-70">{t.count}</span>
            </button>
          ))}
        </div>
        {canAudit && shown.length > 0 && (
          <p>
            <Button variant="accent" size="sm" onClick={() => setDrawing(true)}>
              Draw a sample from {only.length ? "these" : "the flagged entries"}
            </Button>
          </p>
        )}
      </Card>
      {drawing && (
        <Modal open onClose={() => setDrawing(false)} title="Draw from the journal risks" description="Every flagged entry, or so many of them at random. The sample keeps its seed.">
          <Draw periodId={id} preset={{ kind: "entry", how: "risk", size: "", over: "", tests: only.length ? only : r.tests.filter((t) => t.count).map((t) => t.key) }} />
        </Modal>
      )}
      <Card padding="none" className="overflow-hidden">
        {!shown.length ? (
          <p className="px-5 py-4 text-[14px] text-[var(--ink-muted)]">No entry in the period shows {only.length ? "those signs" : "any of the signs"}.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]" data-testid="risk-entries">
            {shown.slice(0, 200).map((e) => (
              <li key={e.id} className="px-5 py-3.5 grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-start">
                <span className={`mt-0.5 h-7 min-w-7 px-1.5 rounded-lg grid place-items-center text-[13px] font-semibold tabular ${e.score >= 5 ? "bg-[var(--danger-soft)] text-[var(--danger)]" : e.score >= 3 ? "bg-[var(--warning-soft)] text-[var(--warning)]" : "bg-[var(--surface-2)] text-[var(--ink-muted)]"}`} title="How many signs, weighted">
                  {e.score}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium truncate">
                    Entry {e.no} · {e.narrative || "no description"}
                  </span>
                  <span className="block text-[12.5px] text-[var(--ink-muted)]">
                    Dated {formatDate(e.on)} · posted {formatDate(e.postedOn)} {e.postedAt} by {e.postedBy} · {e.source.replace(/_/g, " ")}
                  </span>
                  <span className="flex flex-wrap gap-1.5 mt-1.5">
                    {e.flags.map((x) => (
                      <Badge key={x.test} tone={only.includes(x.test) ? "ink" : "neutral"} className="text-[12px]">
                        {x.said}
                      </Badge>
                    ))}
                  </span>
                </span>
                <span className="text-[14px] tabular">{e.amount}</span>
              </li>
            ))}
          </ul>
        )}
        {shown.length > 200 && <p className="px-5 py-3 text-[13px] text-[var(--ink-muted)] border-t border-[var(--border)]">The first 200 of {shown.length}, most telling first. Draw a sample to work through them.</p>}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ questions

const STATE = {
  late: { label: "Late", tone: "danger" },
  open: { label: "Open", tone: "warning" },
  answered: { label: "Answered", tone: "accent" },
  closed: { label: "Closed", tone: "success" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

function useQuestions(id) {
  const { companyId } = useCompany();
  return useQuery({ queryKey: ["audit-questions", companyId, id], queryFn: () => apiClient.get(`/audit/${id}/questions`).then((r) => r.data), enabled: Boolean(companyId), refetchInterval: 30_000 });
}

function QuestionsGlance({ id, onOpen }) {
  const { data: q } = useQuestions(id);
  return (
    <Card padding="lg" className="grid gap-3 content-start" data-testid="questions-glance">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Questions</h2>
        <button type="button" onClick={onOpen} className="text-[13px] underline underline-offset-2 min-h-11">
          Open
        </button>
      </div>
      {!q ? (
        <Skeleton className="h-10 rounded-xl" />
      ) : !q.questions.length ? (
        <p className="text-[14px] text-[var(--ink-muted)]">None asked yet.</p>
      ) : (
        <p className="flex flex-wrap gap-2">
          {["late", "open", "answered", "closed"].map((s) =>
            q.counts[s] ? (
              <Badge key={s} tone={STATE[s].tone}>
                {q.counts[s]} {STATE[s].label.toLowerCase()}
              </Badge>
            ) : null
          )}
        </p>
      )}
    </Card>
  );
}

/** Asks someone in the company a question, on a record or on the audit as a whole. */
function AskForm({ periodId, kind, recordId, onAsked, compact = false }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["audit-answerers", companyId, periodId], queryFn: () => apiClient.get(`/audit/${periodId}/answerers`).then((r) => r.data.people), staleTime: 60_000 });
  const [f, setF] = useState({ body: "", askOf: "", dueOn: "" });
  const [busy, setBusy] = useState(false);
  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiClient.post(`/audit/${periodId}/questions`, { kind, recordId: recordId || null, body: f.body, askOf: f.askOf, dueOn: f.dueOn || null });
      qc.invalidateQueries({ queryKey: ["audit-questions", companyId, periodId] });
      qc.invalidateQueries({ queryKey: ["comments", companyId] });
      setF({ body: "", askOf: f.askOf, dueOn: "" });
      toast.success("Asked", "They are told, and it waits for them in Needs you.");
      onAsked?.();
    } catch (ex) {
      toast.error("Not asked", ex.message);
    } finally {
      setBusy(false);
    }
  }
  const people = data || [];
  return (
    <form onSubmit={onSubmit} className="grid gap-3" data-testid="ask-form">
      <div>
        <Label htmlFor={`ask-body-${kind}`}>{compact ? "Ask the company about this" : "Request or question"}</Label>
        <textarea id={`ask-body-${kind}`} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={compact ? 2 : 3} placeholder={compact ? "Where is the delivery note for this?" : "Please send the loan agreement and the bank's confirmation of the balance."} className={`${FIELD} h-auto py-2.5`} />
      </div>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label htmlFor={`ask-of-${kind}`}>Who answers</Label>
          <select id={`ask-of-${kind}`} value={f.askOf} onChange={(e) => setF({ ...f, askOf: e.target.value })} className={`${FIELD} w-52`}>
            <option value="">Choose someone</option>
            {people.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`ask-due-${kind}`}>By (optional)</Label>
          <input id={`ask-due-${kind}`} type="date" value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} className={`${FIELD} w-44`} />
        </div>
        <Button type="submit" variant={compact ? "outline" : "accent"} disabled={busy || f.body.trim().length < 3 || !f.askOf}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          Ask
        </Button>
      </div>
      {!people.length && data && <p className="text-[13px] text-[var(--ink-muted)]">Nobody in the company keeps the books yet, so there is nobody to ask.</p>}
    </form>
  );
}

function Questions({ p }) {
  const canAudit = useAudit();
  const { data: q, isLoading } = useQuestions(p.id);
  const [open, setOpen] = useState(null);
  const [only, setOnly] = useState(null);
  if (isLoading || !q) return <Skeleton className="h-60 rounded-2xl" />;
  const shown = only ? q.questions.filter((x) => x.status === only) : q.questions;
  const current = q.questions.find((x) => x.id === open);
  return (
    <div className="grid gap-4">
      {canAudit && (
        <Card padding="lg">
          <AskForm periodId={p.id} kind="audit_period" />
          <p className="text-[12.5px] text-[var(--ink-muted)] mt-3">A general request sits on the audit itself. To ask about one bill, invoice or entry, open it from a sample and ask there, so the answer stays with it.</p>
        </Card>
      )}
      <div className="flex flex-wrap gap-2" data-testid="question-states">
        {["late", "open", "answered", "closed"].map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={only === s}
            onClick={() => setOnly(only === s ? null : s)}
            className={`h-9 px-3 rounded-full border text-[13px] ${only === s ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--border)] hover:border-[var(--ink-muted)]"}`}
          >
            {STATE[s].label} <span className="tabular opacity-70">{q.counts[s]}</span>
          </button>
        ))}
      </div>
      <Card padding="none" className="overflow-hidden">
        {!shown.length ? (
          <p className="px-5 py-4 text-[14px] text-[var(--ink-muted)]">{q.questions.length ? "None in that state." : "No questions yet. Each is asked of a named person, with a date if it matters, and waits for them in Needs you."}</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]" data-testid="questions">
            {shown.map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => setOpen(x.id)} className="w-full text-left px-5 py-3.5 hover:bg-[var(--surface-2)] grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
                  <span className="min-w-0">
                    <span className="block text-[12.5px] text-[var(--ink-muted)]">{x.about}</span>
                    <span className="block text-[14.5px] font-medium">{x.body}</span>
                    <span className="block text-[12.5px] text-[var(--ink-muted)] mt-0.5">
                      Asked of {x.of} by {x.by}, {formatDate(x.at)}
                      {x.dueOn ? ` · by ${formatDate(x.dueOn)}` : ""}
                      {x.replies ? ` · ${x.replies} ${x.replies === 1 ? "reply" : "replies"}` : ""}
                      {x.files ? ` · ${x.files} ${x.files === 1 ? "file" : "files"}` : ""}
                    </span>
                    {x.latest && (
                      <span className="block text-[13px] mt-1 border-l-2 border-[var(--border)] pl-2">
                        {x.latest.by}: {x.latest.body.length > 160 ? `${x.latest.body.slice(0, 159)}…` : x.latest.body}
                      </span>
                    )}
                  </span>
                  <Badge tone={STATE[x.status].tone} className="self-start">
                    {STATE[x.status].label}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {current && (
        <Modal open onClose={() => setOpen(null)} title={current.about} description={`${STATE[current.status].label} · asked of ${current.of}${current.dueOn ? `, by ${formatDate(current.dueOn)}` : ""}`}>
          {current.href && current.kind !== "audit_period" && (
            <Link to={current.href} className="text-[13px] underline underline-offset-2">
              Open the record
            </Link>
          )}
          <Conversation kind={current.kind} id={current.recordId} title="The conversation" className="mt-3" />
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ adjustments

const AJ_STATE = {
  proposed: { label: "Waiting for the company", tone: "warning" },
  accepted: { label: "Accepted and posted", tone: "success" },
  passed: { label: "Passed: left unbooked", tone: "neutral" },
  rejected: { label: "Rejected by the company", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};
const CLASS_SAYS = {
  factual: "No doubt about it: a known error.",
  judgemental: "A difference in an estimate or a choice of policy.",
  projected: "The best estimate for the whole population, from a sample.",
};
const STANDING = {
  unset: "Set materiality to measure it.",
  below: "Below performance materiality.",
  near: "Above performance materiality, still below overall materiality: look at it before signing.",
  material: "At or above overall materiality: the financial statements are materially misstated unless corrected.",
};

function useAdjustments(id) {
  const { companyId } = useCompany();
  return useQuery({ queryKey: ["audit-adjustments", companyId, id], queryFn: () => apiClient.get(`/audit/${id}/adjustments`).then((r) => r.data), enabled: Boolean(companyId) });
}

function AdjustmentsGlance({ id, onOpen }) {
  const { data: a } = useAdjustments(id);
  return (
    <Card padding="lg" className="grid gap-3 content-start" data-testid="adjustments-glance">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Adjustments</h2>
        <button type="button" onClick={onOpen} className="text-[13px] underline underline-offset-2 min-h-11">
          Open
        </button>
      </div>
      {!a ? (
        <Skeleton className="h-10 rounded-xl" />
      ) : !a.adjustments.length ? (
        <p className="text-[14px] text-[var(--ink-muted)]">None proposed.</p>
      ) : (
        <>
          <p className="text-[14px]">
            {a.counts.proposed ? `${a.counts.proposed} waiting for the company. ` : ""}Uncorrected: <span className="tabular font-semibold">MVR {a.uncorrected.profit}</span> on profit.
          </p>
          {a.uncorrected.standing && <p className="text-[13px] text-[var(--ink-muted)]">{STANDING[a.uncorrected.standing]}</p>}
        </>
      )}
    </Card>
  );
}

function Materiality({ p, m }) {
  const { companyId } = useCompany();
  const canAudit = useAudit();
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(!m);
  const [f, setF] = useState({ materiality: m?.overall.replace(/,/g, "") || "", performance: m?.performance.replace(/,/g, "") || "", trivial: m?.trivial.replace(/,/g, "") || "" });
  const [busy, setBusy] = useState(false);
  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiClient.put(`/audit/${p.id}/materiality`, { materiality: f.materiality, performance: f.performance || null, trivial: f.trivial || null });
      qc.invalidateQueries({ queryKey: ["audit-adjustments", companyId, p.id] });
      setEditing(false);
    } catch (ex) {
      toast.error("Not set", ex.message);
    } finally {
      setBusy(false);
    }
  }
  if (!editing || !canAudit) {
    return (
      <Card padding="lg" className="flex flex-wrap items-center gap-x-8 gap-y-3" data-testid="materiality">
        {m ? (
          [
            ["Overall materiality", m.overall],
            ["Performance", m.performance],
            ["Clearly trivial", m.trivial],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-[12px] uppercase tracking-wider font-semibold text-[var(--ink-muted)]">{k}</div>
              <div className="text-[18px] font-semibold tabular">MVR {v}</div>
            </div>
          ))
        ) : (
          <p className="text-[14px] text-[var(--ink-muted)]">The auditor has not set materiality for this period yet.</p>
        )}
        {canAudit && (
          <button type="button" onClick={() => setEditing(true)} className="text-[13px] underline underline-offset-2 min-h-11 ml-auto">
            Change
          </button>
        )}
      </Card>
    );
  }
  return (
    <Card padding="lg">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3" data-testid="materiality-form">
        <div>
          <Label htmlFor="mat-overall">Overall materiality (MVR)</Label>
          <input id="mat-overall" value={f.materiality} onChange={(e) => setF({ ...f, materiality: e.target.value })} inputMode="decimal" className={`${FIELD} w-44 tabular`} />
        </div>
        <div>
          <Label htmlFor="mat-performance">Performance (default 75%)</Label>
          <input id="mat-performance" value={f.performance} onChange={(e) => setF({ ...f, performance: e.target.value })} inputMode="decimal" className={`${FIELD} w-44 tabular`} />
        </div>
        <div>
          <Label htmlFor="mat-trivial">Clearly trivial (default 5%)</Label>
          <input id="mat-trivial" value={f.trivial} onChange={(e) => setF({ ...f, trivial: e.target.value })} inputMode="decimal" className={`${FIELD} w-44 tabular`} />
        </div>
        <Button type="submit" variant="accent" disabled={busy || !f.materiality}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          Set materiality
        </Button>
        {m && (
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
      </form>
    </Card>
  );
}

/** The summary of uncorrected misstatements (ISA 450), against materiality. */
function Uncorrected({ a }) {
  const u = a.uncorrected;
  const m = a.materiality;
  const worst = Math.max(Math.abs(n(u.profit)), Math.abs(n(u.assets)));
  const scale = m ? Math.max(n(m.overall) * 1.25, worst) : 1;
  const pct = (x) => `${Math.min(100, (x / scale) * 100)}%`;
  const tone = u.standing === "material" ? "var(--danger)" : u.standing === "near" ? "var(--warning)" : "var(--success)";
  return (
    <Card padding="lg" className="grid gap-3" data-testid="uncorrected">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Summary of uncorrected misstatements</h2>
        <span className="text-[13px] text-[var(--ink-muted)]">
          {u.count} passed or rejected{u.share !== null ? ` · ${u.share}% of materiality` : ""}
        </span>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 text-[14px]">
        <p>
          Effect on profit: <span className="font-semibold tabular">MVR {u.profit}</span>
        </p>
        <p>
          Effect on net assets: <span className="font-semibold tabular">MVR {u.assets}</span>
        </p>
      </div>
      {m && (
        <div aria-hidden="true" className="relative h-3 rounded-full bg-[var(--surface-2)] border border-[var(--border)] mt-1">
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(worst), background: tone }} />
          <span className="absolute -top-1 -bottom-1 w-px bg-[var(--ink-muted)]" style={{ left: pct(n(m.performance)) }} title="Performance materiality" />
          <span className="absolute -top-1.5 -bottom-1.5 w-0.5 bg-[var(--ink)]" style={{ left: pct(n(m.overall)) }} title="Overall materiality" />
        </div>
      )}
      <p className="text-[13.5px]" style={{ color: m ? tone : undefined }}>
        {u.standing ? STANDING[u.standing] : "The auditor measures this against materiality, which stays with the auditor."}
      </p>
      <p className="text-[13px] text-[var(--ink-muted)]">
        By class, on profit: factual MVR {u.byClass.factual} · judgemental MVR {u.byClass.judgemental} · projected MVR {u.byClass.projected}
      </p>
    </Card>
  );
}

function Propose({ p }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["audit-accounts", companyId], queryFn: () => apiClient.get("/audit/accounts").then((r) => r.data.accounts), staleTime: 300_000 });
  const blank = { accountId: "", debit: "", credit: "", memo: "" };
  const [f, setF] = useState({ klass: "factual", reason: "", lines: [{ ...blank }, { ...blank }] });
  const [busy, setBusy] = useState(false);
  const set = (i, patch) => setF({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const d = f.lines.reduce((s, l) => s + n(l.debit), 0);
  const c = f.lines.reduce((s, l) => s + n(l.credit), 0);
  const balanced = d > 0 && Math.abs(d - c) < 0.005;
  const two = (x) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await apiClient.post(`/audit/${p.id}/adjustments`, { class: f.klass, reason: f.reason, lines: f.lines.filter((l) => l.accountId).map((l) => ({ accountId: l.accountId, debit: l.debit || null, credit: l.credit || null, memo: l.memo || null })) });
      qc.invalidateQueries({ queryKey: ["audit-adjustments", companyId, p.id] });
      setF({ klass: f.klass, reason: "", lines: [{ ...blank }, { ...blank }] });
      toast.success(`AJ-${r.data.number} proposed`, "Those who may adjust the books are told. Nothing posts until one of them accepts it.");
    } catch (ex) {
      toast.error("Not proposed", ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card padding="lg">
      <form onSubmit={onSubmit} className="grid gap-4" data-testid="propose">
        <h2 className="text-[15px] font-semibold">Propose an adjustment</h2>
        <fieldset>
          <legend className="text-sm font-medium mb-1.5">Class</legend>
          <div className="grid sm:grid-cols-3 gap-2">
            {Object.entries(CLASS_SAYS).map(([k, says]) => (
              <label key={k} className={`flex gap-3 items-start rounded-xl border px-3 py-2.5 cursor-pointer ${f.klass === k ? "border-[var(--ink)] bg-[var(--surface-2)]" : "border-[var(--border)]"}`}>
                <input type="radio" name="aj-class" id={`aj-class-${k}`} checked={f.klass === k} onChange={() => setF({ ...f, klass: k })} className="mt-1 accent-[var(--ink)]" />
                <span>
                  <span className="block text-[14px] font-medium capitalize">{k}</span>
                  <span className="block text-[12.5px] text-[var(--ink-muted)]">{says}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <Label htmlFor="aj-reason">Why the books need it</Label>
          <textarea id="aj-reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} rows={2} placeholder="A December bill from Island Hardware, received in January, is not in the year." className={`${FIELD} h-auto py-2.5`} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[14px] min-w-[560px]">
            <thead>
              <tr className="text-[12px] uppercase tracking-wider text-[var(--ink-muted)]">
                <th className="text-left font-semibold pb-1.5">Account</th>
                <th className="text-right font-semibold pb-1.5 w-32">Debit</th>
                <th className="text-right font-semibold pb-1.5 w-32">Credit</th>
                <th className="text-left font-semibold pb-1.5 pl-2">Note</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {f.lines.map((l, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2">
                    <select aria-label={`Account, line ${i + 1}`} id={`aj-account-${i}`} value={l.accountId} onChange={(e) => set(i, { accountId: e.target.value })} className={FIELD}>
                      <option value="">Choose an account</option>
                      {(data || []).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 px-1">
                    <input aria-label={`Debit, line ${i + 1}`} id={`aj-debit-${i}`} value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} inputMode="decimal" className={`${FIELD} tabular text-right`} />
                  </td>
                  <td className="py-1 px-1">
                    <input aria-label={`Credit, line ${i + 1}`} id={`aj-credit-${i}`} value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} inputMode="decimal" className={`${FIELD} tabular text-right`} />
                  </td>
                  <td className="py-1 pl-2">
                    <input aria-label={`Note, line ${i + 1}`} value={l.memo} onChange={(e) => set(i, { memo: e.target.value })} className={FIELD} />
                  </td>
                  <td className="py-1 text-right">
                    {f.lines.length > 2 && (
                      <button type="button" aria-label={`Remove line ${i + 1}`} onClick={() => setF({ ...f, lines: f.lines.filter((_, j) => j !== i) })} className="h-9 w-9 rounded-full hover:bg-[var(--surface-2)] text-[var(--ink-muted)]">
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border)]">
                <td className="pt-2">
                  <button type="button" onClick={() => setF({ ...f, lines: [...f.lines, { ...blank }] })} className="text-[13px] underline underline-offset-2 min-h-9">
                    Add a line
                  </button>
                </td>
                <td className="pt-2 text-right tabular font-semibold">{two(d)}</td>
                <td className="pt-2 text-right tabular font-semibold">{two(c)}</td>
                <td className="pt-2 pl-2 text-[13px]" data-testid="aj-balance" style={{ color: balanced ? "var(--success)" : "var(--ink-muted)" }}>
                  {balanced ? "Balances" : d || c ? `Off by ${two(Math.abs(d - c))}` : ""}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div>
          <Button type="submit" variant="accent" disabled={busy || !balanced || f.reason.trim().length < 3 || f.lines.some((l) => (n(l.debit) || n(l.credit)) && !l.accountId)}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            Propose it
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Decide({ a, p }) {
  const { companyId, can } = useCompany();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [how, setHow] = useState(null);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => (p.to < today() ? p.to : today()));
  const [busy, setBusy] = useState(false);
  const frozen = useContext(Frozen);
  const mine = a.proposedById === user?.id;
  const decider = can("adjust") && !mine && !frozen;
  const withdrawer = can("audit") && mine && !frozen;
  if (a.status !== "proposed" || (!decider && !withdrawer)) return null;
  async function go() {
    setBusy(true);
    try {
      if (how === "withdraw") await apiClient.post(`/audit/adjustments/${a.id}/withdraw`, { note });
      else {
        const r = await apiClient.post(`/audit/adjustments/${a.id}/decide`, { how, note: note || null, date: how === "accept" ? date : null });
        if (r.data.entryNo) toast.success(`${a.ref} accepted`, `Posted as entry ${r.data.entryNo}, dated ${formatDate(date)}.`);
      }
      qc.invalidateQueries({ queryKey: ["audit-adjustments", companyId, p.id] });
      qc.invalidateQueries({ queryKey: ["attention", companyId] });
    } catch (ex) {
      toast.error("Not done", ex.message);
    } finally {
      setBusy(false);
    }
  }
  const needsNote = how === "pass" || how === "reject" || how === "withdraw";
  return (
    <div className="mt-3 grid gap-2" data-testid="decide">
      <div className="flex flex-wrap gap-2">
        {decider &&
          [
            ["accept", "Accept and post it"],
            ["pass", "Pass: leave it unbooked"],
            ["reject", "Reject it"],
          ].map(([k, label]) => (
            <Button key={k} type="button" size="sm" variant={how === k ? "accent" : "outline"} onClick={() => setHow(k)}>
              {label}
            </Button>
          ))}
        {withdrawer && (
          <Button type="button" size="sm" variant={how === "withdraw" ? "accent" : "outline"} onClick={() => setHow("withdraw")}>
            Withdraw it
          </Button>
        )}
      </div>
      {how && (
        <div className="flex flex-wrap items-end gap-2">
          {how === "accept" && (
            <div>
              <Label htmlFor={`aj-date-${a.id}`}>Dated</Label>
              <input id={`aj-date-${a.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${FIELD} w-44`} />
            </div>
          )}
          <div className="flex-1 min-w-[220px]">
            <Label htmlFor={`aj-note-${a.id}`}>{how === "accept" ? "Note (optional)" : how === "pass" ? "Why it is left unbooked" : how === "reject" ? "Why the company disagrees" : "Why it is withdrawn"}</Label>
            <input id={`aj-note-${a.id}`} value={note} onChange={(e) => setNote(e.target.value)} className={FIELD} />
          </div>
          <Button type="button" variant="accent" disabled={busy || (needsNote && note.trim().length < 3)} onClick={go}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            {how === "accept" ? "Post it" : "Record it"}
          </Button>
        </div>
      )}
      {how === "accept" && <p className="text-[12.5px] text-[var(--ink-muted)]">It goes into the books on that date. A closed month takes it, with this adjustment as the reason, so the audited year shows it.</p>}
    </div>
  );
}

function Adjustments({ p }) {
  const canAudit = useAudit();
  const { data: a, isLoading } = useAdjustments(p.id);
  if (isLoading || !a) return <Skeleton className="h-60 rounded-2xl" />;
  return (
    <div className="grid gap-4">
      {a.seesMateriality && <Materiality key={a.materiality ? "set" : "unset"} p={p} m={a.materiality} />}
      <Uncorrected a={a} />
      {canAudit && <Propose p={p} />}
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] text-[13px] font-semibold">Proposed adjustments</div>
        {!a.adjustments.length ? (
          <p className="px-5 py-4 text-[14px] text-[var(--ink-muted)]">None yet. Nothing the auditor proposes is posted until someone in the company who may adjust the books accepts it; what is passed or rejected is kept and summed above.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]" data-testid="adjustments">
            {a.adjustments.map((x) => (
              <li key={x.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{x.ref}</span>
                      <Badge tone="neutral">{x.className}</Badge>
                      <Badge tone={AJ_STATE[x.status].tone}>{AJ_STATE[x.status].label}</Badge>
                      {x.trivial && <Badge tone="neutral">Clearly trivial</Badge>}
                    </div>
                    <p className="text-[14.5px] mt-1">{x.reason}</p>
                    <p className="text-[12.5px] text-[var(--ink-muted)] mt-0.5">
                      Proposed by {x.proposedBy}, {formatDate(x.proposedAt)}
                      {x.decidedBy ? ` · ${x.status} by ${x.decidedBy}, ${formatDate(x.decidedAt)}` : ""}
                      {x.entryNo ? ` · entry ${x.entryNo}` : ""}
                      {x.note ? ` · “${x.note}”` : ""}
                    </p>
                  </div>
                  <div className="text-right text-[13px]">
                    <div className="tabular font-semibold text-[15px]">MVR {x.amount}</div>
                    <div className="text-[var(--ink-muted)] tabular">profit {x.profitEffect}</div>
                  </div>
                </div>
                <Amounts rows={[["", "Debit", "Credit"], ...x.lines.map((l) => [l.account + (l.memo ? ` · ${l.memo}` : ""), l.debit === "0.00" ? "" : l.debit, l.credit === "0.00" ? "" : l.credit])]} />
                <Decide a={x} p={p} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ confirmations (ISA 505)

const CONF_STATE = {
  draft: { label: "Waiting for the company to authorise", tone: "warning" },
  authorised: { label: "Authorised, not sent", tone: "accent" },
  refused: { label: "Refused by the company", tone: "danger" },
  sent: { label: "Sent, no reply yet", tone: "neutral" },
  replied: { label: "Replied", tone: "accent" },
  closed: { label: "Concluded", tone: "success" },
};
const OUTCOME = { agreed: "Agreed", explained: "Difference explained", alternative: "Other procedures instead" };
const SIDE = { receivable: "owes the company", payable: "is owed by the company" };

function useConfirmations(id) {
  const { companyId } = useCompany();
  return useQuery({ queryKey: ["audit-confirmations", companyId, id], queryFn: () => apiClient.get(`/audit/${id}/confirmations`).then((r) => r.data), enabled: Boolean(companyId), refetchInterval: 30_000 });
}

/** The auditor's choice of whom to ask: suggested with reasons, picked by hand. */
function Suggest({ p }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["audit-suggest", companyId, p.id], queryFn: () => apiClient.get(`/audit/${p.id}/confirmations/suggest`).then((r) => r.data.suggestions) });
  const [picked, setPicked] = useState({});
  const [form, setForm] = useState("blank");
  const [busy, setBusy] = useState(false);
  const key = (s) => `${s.counterpartyId}:${s.side}`;
  const chosen = (data || []).filter((s) => picked[key(s)]);
  async function add() {
    setBusy(true);
    try {
      const r = await apiClient.post(`/audit/${p.id}/confirmations`, { items: chosen.map((s) => ({ counterpartyId: s.counterpartyId, side: s.side, form })) });
      qc.invalidateQueries({ queryKey: ["audit-confirmations", companyId, p.id] });
      qc.invalidateQueries({ queryKey: ["audit-suggest", companyId, p.id] });
      setPicked({});
      toast.success(`${r.data.made} to confirm`, "The company is asked to authorise them. Check each address before sending.");
    } catch (ex) {
      toast.error("Not added", ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card padding="lg" className="grid gap-3" data-testid="suggest">
      <div>
        <h2 className="text-[15px] font-semibold">Whom to confirm</h2>
        <p className="text-[13px] text-[var(--ink-muted)] mt-0.5">Suggested from the ledger at {formatDate(p.to)}: the largest balances, balances on the wrong side, large suppliers showing nothing owed, and new parties. The choice is yours.</p>
      </div>
      {!data ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : !data.length ? (
        <p className="text-[14px] text-[var(--ink-muted)]">Nothing to suggest: every party with a balance worth asking about is already on the list, or there are none.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-xl overflow-hidden">
          {data.map((s) => (
            <li key={key(s)}>
              <label className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--surface-2)]">
                <input type="checkbox" checked={Boolean(picked[key(s)])} onChange={(e) => setPicked({ ...picked, [key(s)]: e.target.checked })} className="mt-1 h-4 w-4 accent-[var(--ink)]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium">
                    {s.name} <span className="font-normal text-[var(--ink-muted)]">{SIDE[s.side]}</span>
                  </span>
                  <span className="block text-[12.5px] text-[var(--ink-muted)]">{s.why.join(" · ")}{s.email ? "" : " · no email on file"}</span>
                </span>
                <span className="text-[14px] tabular">{s.book}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="What they are asked" value={form} onChange={(e) => setForm(e.target.value)} className={`${FIELD} w-auto`}>
          <option value="blank">They state the balance (stronger)</option>
          <option value="balance">They agree or not with the company's figure</option>
        </select>
        <Button variant="accent" disabled={busy || !chosen.length} onClick={add}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          Add {chosen.length || ""} to confirm
        </Button>
      </div>
    </Card>
  );
}

function ConfirmationRow({ c, p }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const [email, setEmail] = useState(c.email || "");
  const [how, setHow] = useState(c.emailCheckNote || "");
  const [checked, setChecked] = useState(c.emailChecked);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["audit-confirmations", companyId, p.id] });
  const act = async (fn, said) => {
    setBusy(true);
    try {
      const r = await fn();
      refresh();
      if (said) toast.success(...said(r));
    } catch (ex) {
      toast.error("Not done", ex.message);
    } finally {
      setBusy(false);
    }
  };
  const frozen = useContext(Frozen);
  const editable = !frozen && ["draft", "authorised", "refused"].includes(c.status);
  // No reply is concluded only after following up: a reminder, or two weeks.
  const [now] = useState(() => Date.now());
  const followedUp = c.requests >= 2 || (c.sentAt && now - new Date(c.sentAt).getTime() > 14 * 864e5);
  const saveAddress = () => act(() => apiClient.patch(`/audit/confirmations/${c.id}`, { email, emailChecked: checked, emailCheckNote: checked ? how : null }), () => ["Address kept", checked ? "Marked as checked independently." : "Not yet marked as checked."]);
  const send = () =>
    act(
      () => apiClient.post(`/audit/confirmations/${c.id}/send`),
      (r) => {
        if (r.data.link) setLink(r.data.link);
        return r.data.emailed ? [r.data.reminder ? "Reminder sent" : "Sent", `To ${c.email}, from you. Their reply comes only to you.`] : ["Not emailed", "Send the private link below yourself."];
      }
    );
  const conclude = (outcome) => act(() => apiClient.post(`/audit/confirmations/${c.id}/conclude`, { outcome, note }), () => ["Concluded", OUTCOME[outcome]]);
  return (
    <li className="px-5 py-4 grid gap-3" data-testid="confirmation">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{c.party}</span>
            <span className="text-[13px] text-[var(--ink-muted)]">{SIDE[c.side]}</span>
            <Badge tone={CONF_STATE[c.status].tone}>{c.outcome ? OUTCOME[c.outcome] : CONF_STATE[c.status].label}</Badge>
          </div>
          <p className="text-[12.5px] text-[var(--ink-muted)] mt-0.5">
            {c.form === "blank" ? "They state the balance" : "They agree or not with the company's figure"}
            {c.authorisedBy ? ` · ${c.status === "refused" ? "refused" : "authorised"} by ${c.authorisedBy}` : ""}
            {c.sentAt ? ` · sent ${formatDate(c.sentAt)}${c.requests > 1 ? `, ${c.requests} requests` : ""}` : ""}
            {c.openedAt && c.status === "sent" ? ` · opened ${formatDate(c.openedAt)}` : ""}
          </p>
          {c.refusedReason && <p className="text-[13px] text-[var(--danger)] mt-1">The company's reason: {c.refusedReason}</p>}
        </div>
        <div className="text-right">
          <div className="text-[12px] text-[var(--ink-muted)]">In the books</div>
          <div className="tabular font-semibold">MVR {c.book}</div>
        </div>
      </div>

      {editable && (
        <div className="grid gap-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] p-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[220px]">
              <Label htmlFor={`conf-email-${c.id}`}>Send to</Label>
              <input id={`conf-email-${c.id}`} value={email} onChange={(e) => (setEmail(e.target.value), setChecked(false))} placeholder="accounts@customer.mv" className={FIELD} />
            </div>
            <Button size="sm" variant="outline" disabled={busy} onClick={saveAddress}>
              Keep
            </Button>
          </div>
          <label className="flex items-start gap-2 text-[13.5px]">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--ink)]" />
            <span>I checked this address independently of the company's records</span>
          </label>
          {checked && <input aria-label="How it was checked" value={how} onChange={(e) => setHow(e.target.value)} placeholder="Their letterhead; a call to the number on their website" className={FIELD} />}
          {c.email && !c.emailChecked && <p className="text-[12.5px] text-[var(--ink-muted)]">This address comes from the company's own records. The company could have changed it: confirm it another way before sending.</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!frozen && (c.status === "authorised" || c.status === "sent") && (
          <Button size="sm" variant={c.status === "sent" ? "outline" : "accent"} disabled={busy || !c.emailChecked} onClick={send}>
            {busy && <Loader2 size={13} className="animate-spin" />}
            {c.status === "sent" ? "Send a reminder" : "Send the request"}
          </Button>
        )}
      </div>
      {link && (
        <div className="rounded-xl border border-[var(--border)] p-3 text-[13px] grid gap-1.5">
          <span>No email went out. Send this private link to {c.email} yourself; it works once, for 60 days.</span>
          <span className="font-mono break-all select-all">{link}</span>
        </div>
      )}

      {c.reply && (
        <div className="rounded-xl bg-[var(--surface-2)] border border-[var(--border)] p-3 grid gap-1.5 text-[14px]" data-testid="reply">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>
              Their figure: <span className="font-semibold tabular">{c.reply.theirs === null ? (c.reply.agrees ? "agrees" : "—") : `MVR ${c.reply.theirs}`}</span>
            </span>
            {c.reply.difference !== null && (
              <span className={n(c.reply.difference) === 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}>
                Difference: <span className="font-semibold tabular">MVR {c.reply.difference}</span>
              </span>
            )}
          </div>
          <span className="text-[13px] text-[var(--ink-muted)]">
            From {c.reply.by}
            {c.reply.role ? `, ${c.reply.role}` : ""}, {formatDate(c.reply.at)}
          </span>
          {c.reply.note && <span className="text-[13.5px]">“{c.reply.note}”</span>}
          {c.reply.file && (
            <button type="button" onClick={() => openFile(`/audit/confirmations/${c.id}/file`).catch((ex) => toast.error("Not opened", ex.message))} className="inline-flex items-center gap-1.5 text-[13px] underline underline-offset-2 min-h-9 self-start">
              <FileText size={14} /> {c.reply.file}
            </button>
          )}
        </div>
      )}
      {c.status === "sent" && n(c.afterPeriod) > 0 && (
        <p className="text-[13px] text-[var(--ink-muted)]">
          No reply yet. After the period, MVR {c.afterPeriod} {c.side === "receivable" ? "came in from them" : "was paid to them"}: evidence for other procedures if they never answer.
        </p>
      )}
      {c.status === "sent" && !followedUp && <p className="text-[13px] text-[var(--ink-muted)]">If no reply comes, send a reminder; other procedures are open after a reminder, or two weeks.</p>}
      {!frozen && (c.status === "replied" || c.status === "refused" || (c.status === "sent" && followedUp)) && (
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[220px]">
            <Label htmlFor={`conf-note-${c.id}`}>{c.status === "replied" ? "Conclusion (a note is needed for a difference)" : "What was done instead"}</Label>
            <input id={`conf-note-${c.id}`} value={note} onChange={(e) => setNote(e.target.value)} className={FIELD} />
          </div>
          {c.status === "replied" ? (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => conclude("agreed")}>
                Agreed
              </Button>
              <Button size="sm" variant="outline" disabled={busy || note.trim().length < 3} onClick={() => conclude("explained")}>
                Difference explained
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" disabled={busy || note.trim().length < 3} onClick={() => conclude("alternative")}>
              Other procedures instead
            </Button>
          )}
        </div>
      )}
      {c.outcomeNote && <p className="text-[13px] text-[var(--ink-muted)]">Concluded by {c.outcomeBy}: {c.outcomeNote}</p>}
    </li>
  );
}

/** The company's side: authorise the auditor's requests, or refuse with a reason. It sees states, never replies. */
function Authorise({ p, list }) {
  const { companyId, can } = useCompany();
  const frozen = useContext(Frozen);
  const toast = useToast();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const waiting = list.filter((c) => c.status === "draft" || c.status === "refused");
  async function decide(allow) {
    setBusy(true);
    try {
      await apiClient.post(`/audit/${p.id}/confirmations/authorise`, { ids: waiting.map((c) => c.id), allow, reason: allow ? null : reason });
      qc.invalidateQueries({ queryKey: ["audit-confirmations", companyId, p.id] });
      toast.success(allow ? "Authorised" : "Refused", allow ? "Your auditor can now send the requests. Replies go only to them." : "Your auditor sees your reason.");
    } catch (ex) {
      toast.error("Not done", ex.message);
    } finally {
      setBusy(false);
    }
  }
  if (!waiting.length || !can("approve") || frozen) return null;
  return (
    <Card padding="lg" className="grid gap-3" data-testid="authorise">
      <h2 className="text-[15px] font-semibold">Your auditor asks to confirm {waiting.length === 1 ? "a balance" : `${waiting.length} balances`}</h2>
      <p className="text-[14px] text-[var(--ink-muted)]">
        The auditor writes to these customers and suppliers, from their own address, asking what they owed or were owed at {formatDate(p.to)}. Their replies go only to the auditor. Authorising is usual; if you refuse, say why, and the auditor will weigh it.
      </p>
      <ul className="text-[14px] grid gap-1">
        {waiting.map((c) => (
          <li key={c.id}>
            {c.party} <span className="text-[var(--ink-muted)]">{SIDE[c.side]}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 items-end">
        <Button variant="accent" disabled={busy} onClick={() => decide(true)}>
          Authorise the requests
        </Button>
        <input aria-label="Why the auditor may not ask" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, if refusing" className={`${FIELD} w-64`} />
        <Button variant="outline" disabled={busy || reason.trim().length < 3} onClick={() => decide(false)}>
          Refuse
        </Button>
      </div>
    </Card>
  );
}

function Confirmations({ p }) {
  const frozen = useContext(Frozen);
  const { data, isLoading } = useConfirmations(p.id);
  if (isLoading || !data) return <Skeleton className="h-60 rounded-2xl" />;
  const list = data.confirmations;
  return (
    <div className="grid gap-4">
      {data.auditor ? !frozen && <Suggest p={p} /> : <Authorise p={p} list={list} />}
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] text-[13px] font-semibold flex flex-wrap justify-between gap-2">
          <span>Balance confirmations</span>
          <span className="font-normal text-[var(--ink-muted)]">{data.auditor ? "Replies come only to you." : "Replies go only to the auditor."}</span>
        </div>
        {!list.length ? (
          <p className="px-5 py-4 text-[14px] text-[var(--ink-muted)]">None yet. {data.auditor ? "Pick whom to confirm above." : "Your auditor chooses whom to ask; you authorise the requests here."}</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]" data-testid="confirmations">
            {list.map((c) =>
              data.auditor ? (
                <ConfirmationRow key={c.id} c={c} p={p} />
              ) : (
                <li key={c.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2" data-testid="confirmation">
                  <span>
                    <span className="font-medium">{c.party}</span> <span className="text-[13px] text-[var(--ink-muted)]">{SIDE[c.side]}</span>
                  </span>
                  <Badge tone={CONF_STATE[c.status].tone}>{c.outcome ? "Concluded" : CONF_STATE[c.status].label}</Badge>
                </li>
              )
            )}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ the year-end count (ISA 501)

const FINDING = {
  agrees: { label: "Agrees", tone: "success" },
  differs: { label: "Count differs", tone: "danger" },
  missing: { label: "Not on the sheet", tone: "danger" },
  uncounted: { label: "Not counted", tone: "warning" },
};
const COUNT_STATUS = { counting: "Being counted", submitted: "Submitted", posted: "Posted", cancelled: "Cancelled" };

function CutoffLine({ label, d }) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-2 text-[13.5px] py-1 border-t border-[var(--border)] first:border-t-0">
      <span className="text-[var(--ink-muted)]">{label}</span>
      <span>{d ? `${d.no || d.order_no || d.item || ""}${d.kind ? ` (${d.kind})` : ""} · dated ${formatDate(d.day)} · entered ${formatDate(d.created_at)}` : "None yet"}</span>
    </div>
  );
}

function TestRow({ t, oid, locked }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const [qty, setQty] = useState(t.qty || "");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await apiClient.post(`/audit/observations/${oid}/tests`, { itemId: t.itemId, direction: t.direction, qty });
      qc.invalidateQueries({ queryKey: ["audit-observation", companyId, oid] });
    } catch (ex) {
      toast.error("Not kept", ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="px-4 py-3 grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center" data-testid="test-count">
      <span className="min-w-0">
        <span className="block text-[14px] font-medium">{t.name}</span>
        <span className="block text-[12.5px] text-[var(--ink-muted)]">
          {t.direction === "sheet_to_floor" ? `From the sheet: ${t.why || "picked"}` : `Seen on the floor${t.note ? `: ${t.note}` : ""}`}
          {t.counted !== null ? ` · counter ${t.counted}` : ""}
          {t.book !== null ? ` · books ${t.book}` : ""}
        </span>
        {t.finding && (
          <span className="flex flex-wrap items-center gap-2 mt-1">
            <Badge tone={FINDING[t.finding.kind].tone}>{FINDING[t.finding.kind].label}</Badge>
            {t.finding.kind !== "agrees" && <span className="text-[12.5px]">{t.finding.said}{t.finding.value ? ` About MVR ${t.finding.value}.` : ""}</span>}
          </span>
        )}
      </span>
      <span className="flex items-center gap-2">
        <input aria-label={`Counted: ${t.name}`} value={qty} onChange={(e) => setQty(e.target.value)} disabled={locked} inputMode="decimal" placeholder="Counted" className={`${FIELD} w-28 tabular text-right`} />
        <span className="text-[13px] text-[var(--ink-muted)] w-10">{t.unit}</span>
        {!locked && (
          <Button size="sm" variant={t.qty === null ? "accent" : "outline"} disabled={busy || qty === "" || qty === t.qty} onClick={save}>
            {t.qty === null ? "Keep" : "Change"}
          </Button>
        )}
      </span>
    </li>
  );
}

function Observation({ oid, onBack }) {
  const { companyId } = useCompany();
  const frozen = useContext(Frozen);
  const toast = useToast();
  const qc = useQueryClient();
  const key = ["audit-observation", companyId, oid];
  const { data: o } = useQuery({ queryKey: key, queryFn: () => apiClient.get(`/audit/observations/${oid}`).then((r) => r.data), refetchInterval: 20_000 });
  const { data: items } = useQuery({ queryKey: ["stock", companyId, "audit-pick"], queryFn: () => apiClient.get("/stock").then((r) => r.data.items), staleTime: 300_000 });
  const [floor, setFloor] = useState({ itemId: "", qty: "", note: "" });
  const [notes, setNotes] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!o) return <Skeleton className="h-60 rounded-2xl" />;
  const n0 = notes || { instructions: o.instructions || "", conclusion: o.conclusion || "" };
  const locked = Boolean(o.concludedAt) || frozen;
  async function addFloor(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiClient.post(`/audit/observations/${oid}/tests`, { itemId: floor.itemId, direction: "floor_to_sheet", qty: floor.qty, note: floor.note || null });
      setFloor({ itemId: "", qty: "", note: "" });
      qc.invalidateQueries({ queryKey: key });
    } catch (ex) {
      toast.error("Not kept", ex.message);
    } finally {
      setBusy(false);
    }
  }
  async function conclude() {
    setBusy(true);
    try {
      await apiClient.post(`/audit/observations/${oid}/conclude`, n0);
      qc.invalidateQueries({ queryKey: key });
      toast.success("Concluded", "The test counts stand as they are.");
    } catch (ex) {
      toast.error("Not concluded", ex.message);
    } finally {
      setBusy(false);
    }
  }
  const sheet = o.tests.filter((t) => t.direction === "sheet_to_floor");
  const seen = o.tests.filter((t) => t.direction === "floor_to_sheet");
  return (
    <div className="grid gap-4" data-testid="observation">
      <p>
        <button type="button" onClick={onBack} className="text-[14px] underline underline-offset-2 min-h-11">
          All counts
        </button>
      </p>
      <Card padding="lg" className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[16px] font-semibold">
            {o.place}, counted by {o.counter}
          </h2>
          <Badge tone={o.countStatus === "counting" ? "warning" : "success"}>{COUNT_STATUS[o.countStatus]}</Badge>
        </div>
        <p className="text-[13px] text-[var(--ink-muted)]">
          Attended by {o.observer}, arrived {formatDate(o.startedAt)}. Your test counts are yours alone: nobody counting sees them. The counter's figures show here once their count is submitted.
        </p>
        {o.summary.counted && (
          <p className={`text-[14.5px] font-medium ${o.summary.wrong ? "text-[var(--danger)]" : "text-[var(--success)]"}`} data-testid="count-summary">
            {o.summary.done} of {o.summary.tests} tested; {o.summary.wrong ? `${o.summary.wrong} with a finding, about MVR ${o.summary.wrongValue}` : "every test agrees with the count"}.
          </p>
        )}
      </Card>

      <Card padding="lg" className="grid gap-1">
        <h3 className="text-[14px] font-semibold mb-1">Cut-off, as recorded when you arrived</h3>
        <CutoffLine label="Last goods received" d={o.cutoff.goodsIn} />
        <CutoffLine label="Last goods despatched" d={o.cutoff.goodsOut} />
        <CutoffLine label="Last bill" d={o.cutoff.bill} />
        <CutoffLine label="Last invoice" d={o.cutoff.invoice} />
        <CutoffLine label="Last stock move" d={o.cutoff.move} />
        {o.cutoffExceptions.length > 0 && (
          <div className="mt-3 rounded-xl bg-[var(--warning-soft)] px-3 py-2.5 text-[13.5px]" data-testid="cutoff-exceptions">
            <p className="font-semibold">Dated on or before the count, entered after you arrived</p>
            <ul className="list-disc ml-5 mt-1">
              {o.cutoffExceptions.map((x, i) => (
                <li key={i}>
                  {x.what} {x.no}, dated {formatDate(x.day)}, entered {formatDate(x.entered)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="text-[14px] font-semibold">Sheet to floor</h3>
          <p className="text-[12.5px] text-[var(--ink-muted)]">Picked from the count sheet: the most valuable, and some at random (seed {o.seed}). Find each one and count it: does what is recorded exist?</p>
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {sheet.map((t) => (
            <TestRow key={t.id} t={t} oid={oid} locked={locked} />
          ))}
        </ul>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="text-[14px] font-semibold">Floor to sheet</h3>
          <p className="text-[12.5px] text-[var(--ink-muted)]">Pick things you see on the floor and count them: is everything that exists recorded?</p>
        </div>
        {seen.length > 0 && (
          <ul className="divide-y divide-[var(--border)]">
            {seen.map((t) => (
              <TestRow key={t.id} t={t} oid={oid} locked={locked} />
            ))}
          </ul>
        )}
        {!locked && (
          <form onSubmit={addFloor} className="px-4 py-3 flex flex-wrap gap-2 items-end border-t border-[var(--border)]" data-testid="floor-form">
            <div className="min-w-[200px] flex-1">
              <Label htmlFor="floor-item">Item on the floor</Label>
              <select id="floor-item" value={floor.itemId} onChange={(e) => setFloor({ ...floor, itemId: e.target.value })} className={FIELD}>
                <option value="">Choose the item</option>
                {(items || []).filter((i) => i.counted).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="floor-qty">Counted</Label>
              <input id="floor-qty" value={floor.qty} onChange={(e) => setFloor({ ...floor, qty: e.target.value })} inputMode="decimal" className={`${FIELD} w-28 tabular`} />
            </div>
            <div className="min-w-[160px] flex-1">
              <Label htmlFor="floor-note">Where (optional)</Label>
              <input id="floor-note" value={floor.note} onChange={(e) => setFloor({ ...floor, note: e.target.value })} placeholder="Behind the door, aisle 3" className={FIELD} />
            </div>
            <Button type="submit" variant="outline" disabled={busy || !floor.itemId || floor.qty === ""}>
              Add
            </Button>
          </form>
        )}
      </Card>

      <Card padding="lg" className="grid gap-3">
        <div>
          <Label htmlFor="obs-instructions">The count instructions, and how they were followed</Label>
          <textarea id="obs-instructions" value={n0.instructions} disabled={locked} onChange={(e) => setNotes({ ...n0, instructions: e.target.value })} rows={2} className={`${FIELD} h-auto py-2.5`} placeholder="Tags on counted items, a sheet per aisle, damaged goods set apart…" />
        </div>
        <div>
          <Label htmlFor="obs-conclusion">What the count showed</Label>
          <textarea id="obs-conclusion" value={n0.conclusion} disabled={locked} onChange={(e) => setNotes({ ...n0, conclusion: e.target.value })} rows={2} className={`${FIELD} h-auto py-2.5`} />
        </div>
        {locked ? (
          <p className="text-[13px] text-[var(--ink-muted)]">Concluded {formatDate(o.concludedAt)}. The test counts stand as they are.</p>
        ) : (
          <p>
            <Button variant="accent" disabled={busy || n0.conclusion.trim().length < 3} onClick={conclude}>
              Conclude the count
            </Button>
          </p>
        )}
      </Card>
    </div>
  );
}

function Counting({ p }) {
  const { companyId } = useCompany();
  const frozen = useContext(Frozen);
  const toast = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const oid = params.get("obs");
  const { data, isLoading } = useQuery({ queryKey: ["audit-counts", companyId, p.id], queryFn: () => apiClient.get(`/audit/${p.id}/counts`).then((r) => r.data) });
  const [busy, setBusy] = useState(null);
  const open = (id) => setParams({ tab: "count", obs: id }, { replace: true });
  async function attend(countId) {
    setBusy(countId);
    try {
      const r = await apiClient.post(`/audit/${p.id}/observations`, { countId });
      qc.invalidateQueries({ queryKey: ["audit-counts", companyId, p.id] });
      open(r.data.id);
    } catch (ex) {
      toast.error("Not attended", ex.message);
    } finally {
      setBusy(null);
    }
  }
  if (oid && data?.auditor) return <Observation oid={oid} onBack={() => setParams({ tab: "count" }, { replace: true })} />;
  if (isLoading || !data) return <Skeleton className="h-60 rounded-2xl" />;
  if (!data.auditor) {
    return (
      <Card padding="lg">
        <h2 className="text-[15px] font-semibold">The year-end count</h2>
        {data.attended.length ? (
          <ul className="mt-2 text-[14px] grid gap-1" data-testid="attended">
            {data.attended.map((a) => (
              <li key={a.id}>
                {a.observer} attended the count at {a.place}, {formatDate(a.startedAt)}
                {a.concludedAt ? ", and has concluded." : "."}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-[var(--ink-muted)] mt-1">Your auditor has not attended a count for this period. Start the count in Inventory, Counts; the auditor attends it here.</p>
        )}
      </Card>
    );
  }
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 border-b border-[var(--border)]">
        <h2 className="text-[15px] font-semibold">Counts around {formatDate(p.to)}</h2>
        <p className="text-[12.5px] text-[var(--ink-muted)]">The company's counts within three weeks of the period end. Attend one to capture the cut-off and make your own test counts.</p>
      </div>
      {!data.counts.length ? (
        <p className="px-5 py-4 text-[14px] text-[var(--ink-muted)]">No count near the period end yet. Ask the company to start one (Inventory, Counts), then attend it here.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]" data-testid="counts-near">
          {data.counts.map((c) => (
            <li key={c.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <span>
                <span className="block text-[14.5px] font-medium">
                  {c.place} · {c.kind} count
                </span>
                <span className="block text-[12.5px] text-[var(--ink-muted)]">
                  {c.counter} · {c.lines} items · started {formatDate(c.createdAt)} · {COUNT_STATUS[c.status]}
                </span>
              </span>
              {c.observationId ? (
                <Button size="sm" variant="outline" onClick={() => open(c.observationId)}>
                  Open
                </Button>
              ) : frozen ? (
                <span className="text-[13px] text-[var(--ink-muted)]">Not attended</span>
              ) : (
                <Button size="sm" variant="accent" disabled={busy === c.id} onClick={() => attend(c.id)}>
                  {busy === c.id && <Loader2 size={13} className="animate-spin" />}
                  Attend this count
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ sign-off

const OPINION = { unmodified: "Unmodified", qualified: "Qualified", adverse: "Adverse", disclaimer: "Disclaimer of opinion" };
const READY = {
  done: { tone: "success", label: "Done" },
  warn: { tone: "warning", label: "Not finished" },
  block: { tone: "danger", label: "Blocks sign-off" },
  "block-clean": { tone: "danger", label: "Blocks a clean opinion" },
};

function SignedBanner({ s }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-[var(--success-soft)] px-4 py-3 mb-4" data-testid="signed-banner">
      <BadgeCheck size={20} className="text-[var(--success)] shrink-0 mt-0.5" />
      <p className="text-[14px]">
        <span className="font-semibold">Signed off by {s.by}, {formatDate(s.at)}.</span> Opinion: {OPINION[s.opinion]}. The period's audit work is kept as it was; the pack can still be made.
      </p>
    </div>
  );
}

function ReadinessGlance({ id, onOpen }) {
  const { data: r } = useReadiness(id);
  const count = (s) => (r ? r.items.filter((i) => s.includes(i.state)).length : 0);
  return (
    <Card padding="lg" className="grid gap-3 content-start" data-testid="readiness-glance">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Sign-off</h2>
        <button type="button" onClick={onOpen} className="text-[13px] underline underline-offset-2 min-h-11">
          Open
        </button>
      </div>
      {!r ? (
        <Skeleton className="h-10 rounded-xl" />
      ) : (
        <>
          <Progress done={count(["done"])} of={r.items.length} />
          <p className="text-[13.5px] text-[var(--ink-muted)]">
            {count(["block"]) ? `${count(["block"])} blocking. ` : ""}
            {count(["warn", "block-clean"]) ? `${count(["warn", "block-clean"])} not finished.` : "Everything done."}
          </p>
        </>
      )}
    </Card>
  );
}

function useReadiness(id) {
  const { companyId } = useCompany();
  return useQuery({ queryKey: ["audit-readiness", companyId, id], queryFn: () => apiClient.get(`/audit/${id}/readiness`).then((r) => r.data) });
}

function SignOff({ p }) {
  const { companyId, roles } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: r } = useReadiness(p.id);
  const [opinion, setOpinion] = useState("unmodified");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // Signing is the auditor's alone: the Auditor role, not the owner's general audit permission.
  const auditor = (roles || []).includes("auditor");
  if (p.signedOff) {
    const s = p.signedOff;
    return (
      <Card padding="lg" className="grid gap-2" data-testid="signed">
        <h2 className="text-[16px] font-semibold">Signed off</h2>
        <p className="text-[14px]">
          By {s.by}, {formatDate(s.at)}. Opinion: <span className="font-semibold">{OPINION[s.opinion]}</span>.
        </p>
        {s.note && <p className="text-[14px]">“{s.note}”</p>}
        {s.head?.no && (
          <p className="text-[12.5px] text-[var(--ink-muted)]">
            It covers the books up to entry {s.head.no}; the chain's seal there: <span className="font-mono break-all">{s.head.hash}</span>. The seal was {s.head.sealOk ? "intact" : "broken"} when signed.
          </p>
        )}
      </Card>
    );
  }
  if (!r) return <Skeleton className="h-60 rounded-2xl" />;
  const blocks = r.items.filter((i) => i.state === "block" || (i.state === "block-clean" && opinion === "unmodified"));
  const loose = r.items.filter((i) => i.state === "warn" || i.state === "block-clean");
  async function sign() {
    setBusy(true);
    try {
      await apiClient.post(`/audit/${p.id}/signoff`, { opinion, note: note || null });
      qc.invalidateQueries({ queryKey: ["audit", companyId] });
      qc.invalidateQueries({ queryKey: ["audit", companyId, p.id] });
      toast.success("Signed off", "The period's audit work is now kept as it was.");
    } catch (ex) {
      toast.error("Not signed off", ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-4">
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] text-[13px] font-semibold">Before signing</div>
        <ul className="divide-y divide-[var(--border)]" data-testid="readiness">
          {r.items.map((i) => (
            <li key={i.key} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="block text-[14.5px] font-medium">{i.name}</span>
                <span className="block text-[13px] text-[var(--ink-muted)]">{i.said}</span>
              </span>
              <Badge tone={READY[i.state].tone}>{READY[i.state].label}</Badge>
            </li>
          ))}
        </ul>
      </Card>
      {auditor && (
        <Card padding="lg" className="grid gap-3" data-testid="sign">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label htmlFor="signoff-opinion">Opinion</Label>
              <select id="signoff-opinion" value={opinion} onChange={(e) => setOpinion(e.target.value)} className={`${FIELD} w-60`}>
                {Object.entries(OPINION).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="signoff-note">{loose.length ? "Why you sign with work unfinished (needed)" : "Note (optional)"}</Label>
            <textarea id="signoff-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={`${FIELD} h-auto py-2.5`} />
          </div>
          {blocks.length > 0 && <p className="text-[13.5px] text-[var(--danger)]">Not yet: {blocks.map((b) => b.name.toLowerCase()).join(", ")}.</p>}
          <p className="text-[12.5px] text-[var(--ink-muted)]">Signing re-checks the seal and records the chain's last entry, so the sign-off says which state of the books it covers. After it, nothing in this period's audit work changes.</p>
          <p>
            <Button variant="accent" disabled={busy || blocks.length > 0 || (loose.length > 0 && note.trim().length < 10)} onClick={sign}>
              {busy && <Loader2 size={14} className="animate-spin" />}
              Sign off {p.name}
            </Button>
          </p>
        </Card>
      )}
    </div>
  );
}

/** The company's view of who audits it, and until when; those who manage people set or end it. */
function AuditorAccess() {
  const { companyId } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["audit-auditors", companyId], queryFn: () => apiClient.get("/audit/access/auditors").then((r) => r.data) });
  const [dates, setDates] = useState({});
  if (!data || !data.auditors.length) return null;
  async function set(id, body) {
    try {
      await apiClient.put(`/companies/current/people/${id}/access`, body);
      qc.invalidateQueries({ queryKey: ["audit-auditors", companyId] });
      toast.success(body.endNow ? "Access ended" : "Access set", body.endNow ? "They can no longer open these books." : "It ends by itself at the end of that day.");
    } catch (ex) {
      toast.error("Not changed", ex.message);
    }
  }
  return (
    <Card padding="none" className="overflow-hidden mb-4" data-testid="auditor-access">
      <div className="px-5 py-3 border-b border-[var(--border)]">
        <h2 className="text-[15px] font-semibold">Your auditors' access</h2>
        <p className="text-[12.5px] text-[var(--ink-muted)]">Access given for a time ends by itself; after it, they cannot open these books.</p>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {data.auditors.map((a) => (
          <li key={a.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
            <span>
              <span className="block text-[14.5px] font-medium">{a.name}</span>
              <span className="block text-[12.5px] text-[var(--ink-muted)]">
                {a.email} · {a.ended ? `access ended ${formatDate(a.until)}` : a.until ? `until ${formatDate(a.until)}` : "no end set"}
              </span>
            </span>
            {data.manage && (
              <span className="flex flex-wrap items-center gap-2">
                <input type="date" aria-label={`Last day of access for ${a.name}`} value={dates[a.id] || ""} onChange={(e) => setDates({ ...dates, [a.id]: e.target.value })} className={`${FIELD} w-44`} />
                <Button size="sm" variant="outline" disabled={!dates[a.id]} onClick={() => set(a.id, { until: dates[a.id] })}>
                  {a.until ? "Change" : "Set an end"}
                </Button>
                {!a.ended && (
                  <Button size="sm" variant="ghost" onClick={() => set(a.id, { endNow: true })}>
                    End now
                  </Button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ------------------------------------------------------------------ the pack

const CONTENTS = [
  ["01", "Trial balance", "Opening, the period's debits and credits, and closing, per account."],
  ["02", "General ledger", "Every line in the period, in the AICPA Audit Data Standards layout: the date it is for, when and by whom it was entered, whether it came from a document."],
  ["03", "Chart of accounts", "Every account, with its type."],
  ["04–05", "Receivables and payables ageing", "What was open at the period end, by days past due."],
  ["06", "Fixed asset register", "Cost, depreciation charged through the period end, and book value."],
  ["07", "Stock by place", "Quantities and value at the period end, and whether they agree with the Stock account."],
  ["08", "Bank reconciliations", "As kept when each month in the period was closed."],
  ["09", "GST returns filed", "Output, input and net for each return in the period."],
  ["10", "Sample register", "Every sample with its rule, seed and population fingerprint, and each item: why drawn, seen by whom, the note."],
  ["11", "Journal risk", "The entries that show signs of override, most telling first."],
  ["12", "Seal", "The check over the whole journal, and the chain's last hash."],
  ["papers/", "Papers", "The documents attached to sampled items, as filed."],
];

function Pack({ p }) {
  const { companyId, can } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ["audit-packs", companyId, p.id];
  const { data } = useQuery({ queryKey: key, queryFn: () => apiClient.get(`/audit/${p.id}/packs`).then((r) => r.data) });
  const [busy, setBusy] = useState(false);

  async function make() {
    setBusy(true);
    try {
      const r = await apiClient.get(`/audit/${p.id}/pack`, { responseType: "blob" });
      const name = /filename="([^"]+)"/.exec(r.headers["content-disposition"] || "")?.[1] || "Audit pack.zip";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(r.data);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["audit", companyId, p.id] });
      toast.success("Audit pack made", `Its fingerprint begins ${String(r.headers["x-pack-sha256"] || "").slice(0, 12)}.`);
    } catch (ex) {
      toast.error("Not made", ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card padding="lg" className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-[62ch]">
            <h2 className="text-[15px] font-semibold">One download for {p.name}</h2>
            <p className="text-[14px] text-[var(--ink-muted)] mt-1">Balances as at {formatDate(p.to)}. Spreadsheet files audit software takes in as they are, with a manifest giving each file's SHA-256, so nothing in it can be changed unnoticed. The seal is checked again as it is made.</p>
          </div>
          {can("audit") && (
            <Button variant="accent" onClick={make} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Make the pack
            </Button>
          )}
        </div>
        <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 text-[14px]" data-testid="pack-contents">
          {CONTENTS.map(([no, t, d]) => (
            <li key={t} className="grid grid-cols-[52px_minmax(0,1fr)] gap-2">
              <span className="text-[12px] tabular text-[var(--ink-muted)] pt-0.5" title="Its name in the zip">{no}</span>
              <span>
                <span className="font-medium">{t}</span>
                <span className="block text-[13px] text-[var(--ink-muted)]">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] text-[13px] font-semibold">Packs made</div>
        {!data?.packs.length ? (
          <p className="px-5 py-4 text-[14px] text-[var(--ink-muted)]">None yet. Each pack made is kept on record by its fingerprint, so what was handed over can be shown later.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]" data-testid="packs">
            {data.packs.map((k) => (
              <li key={k.sha256 + k.at} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px]">
                <span className="font-medium">{formatDate(k.at)}</span>
                <span className="text-[var(--ink-muted)]">
                  {k.by} · {k.files} files · {k.size >= 1048576 ? `${(k.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(k.size / 1024))} KB`}
                </span>
                <span className="font-mono text-[12px] break-all text-[var(--ink-muted)]" title="SHA-256 of the whole zip">
                  {k.sha256}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ a sample

function Amounts({ rows }) {
  return (
    <div className="overflow-x-auto">
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
    </div>
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

/** Everything behind one item, and its tick. "Seen, next" (or Enter in the note) goes on to the next not yet seen. */
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

  const d = ev?.document;
  return (
    <Modal open onClose={onClose} title={`${ONE[sample.kind]}${item.no ? ` ${item.no}` : ""}`} description={`${item.party || ""}${item.party ? " · " : ""}${formatDate(item.on)} · MVR ${item.amount}`}>
      {!ev ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : (
        <div data-testid="evidence">
          {(item.why || item.changed || ev.flags.length > 0) && (
            <div className="rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-3 py-2.5 grid gap-1.5 text-[13px]" data-testid="look-twice">
              {item.why && <p>Drawn because: {item.why}</p>}
              {item.changed && (
                <p className="text-[var(--danger)] flex gap-1.5 items-start">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {item.changed}
                </p>
              )}
              {ev.flags.length > 0 && (
                <div>
                  <span className="font-semibold">Look twice:</span>
                  <ul className="list-disc ml-5">
                    {ev.flags.map((x) => (
                      <li key={x.test}>{x.said}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {d && (
            <Part title={`The ${d.title.toLowerCase()}`}>
              {d.note && <p className="text-[13px] text-[var(--ink-muted)] mb-1">{d.note}</p>}
              <Amounts
                rows={[
                  ...(ev.lines.length ? [["", "Net", "GST"]] : []),
                  ...ev.lines.map((l) => [`${l.description || "A line"}${l.quantity && n(l.quantity) !== 1 ? ` × ${n(l.quantity)}` : ""}`, l.net, l.tax]),
                  ...(d.net !== undefined ? [["Before tax", "", d.net], ["GST", "", d.tax]] : []),
                  [<span key="t" className="font-semibold">Total</span>, "", <span key="v" className="font-semibold">MVR {d.gross}</span>],
                ]}
              />
              <Link to={d.href} className="text-[13px] underline underline-offset-2 mt-1 inline-block">
                Open the {d.title.toLowerCase()}
              </Link>
            </Part>
          )}
          {ev.entry ? (
            <Part title={`Entry ${ev.entry.no}, ${formatDate(ev.entry.on)}`}>
              <p className="text-[13px] text-[var(--ink-muted)] mb-1">
                {ev.entry.narrative} · posted {formatDate(ev.entry.posted_at)} by {ev.entry.posted_by}
                {ev.entry.reverses ? ` · reverses entry ${ev.entry.reverses}` : ""}
                {ev.entry.reversed_by ? ` · reversed by entry ${ev.entry.reversed_by}${ev.entry.reversal_reason ? ` (${ev.entry.reversal_reason})` : ""}` : ""}
              </p>
              <Amounts rows={[["", "Debit", "Credit"], ...ev.entry.lines.map((l) => [l.account + (l.memo ? ` · ${l.memo}` : ""), l.debit === "0.00" ? "" : l.debit, l.credit === "0.00" ? "" : l.credit])]} />
            </Part>
          ) : (
            <Part title="Entry">
              <p className="text-[13px] text-[var(--danger)]">No entry found for this document.</p>
            </Part>
          )}
          {ev.money && (
            <Part title={ev.money.title}>
              {ev.money.rows.length ? <Amounts rows={ev.money.rows.map((m) => [`${m.on ? `${formatDate(m.on)} · ` : ""}${m.what}${m.undone ? " (undone)" : ""}`, "", m.amount])} /> : <p className="text-[13px] text-[var(--ink-muted)]">Nothing yet.</p>}
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
      {canTick && (
        <details className="mt-5 rounded-xl border border-[var(--border)] px-3 py-2 group">
          <summary className="cursor-pointer text-[14px] font-medium min-h-9 flex items-center">Ask the company about this</summary>
          <div className="pt-2 pb-1">
            <AskForm periodId={sample.periodId} kind={sample.kind} recordId={item.docId} compact />
          </div>
        </details>
      )}
      {canTick ? (
        <>
          <div className="mt-5">
            <Label htmlFor="audit-note">Note</Label>
            <input
              id="audit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) {
                  e.preventDefault();
                  tick(true, true);
                }
              }}
              placeholder="What it was agreed to, or what is missing. Enter: seen, next"
              className={FIELD}
            />
          </div>
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

function Sample({ sid }) {
  const { companyId, can } = useCompany();
  const toast = useToast();
  const { data: s, isLoading } = useQuery({ queryKey: ["audit-sample", companyId, sid], queryFn: () => apiClient.get(`/audit/samples/${sid}`).then((r) => r.data), enabled: Boolean(companyId) });
  const [open, setOpen] = useState(null);
  const [proof, setProof] = useState(null);
  const [proving, setProving] = useState(false);
  if (isLoading || !s) return <Skeleton className="h-60 rounded-2xl" />;
  const seen = s.items.filter((i) => i.seen).length;
  const current = s.items.find((i) => i.id === open);
  const next = () => {
    const after = s.items.findIndex((i) => i.id === open);
    const nx = [...s.items.slice(after + 1), ...s.items.slice(0, after)].find((i) => !i.seen && i.id !== open);
    setOpen(nx ? nx.id : null);
  };
  async function prove() {
    setProving(true);
    try {
      setProof((await apiClient.post(`/audit/samples/${sid}/prove`)).data);
    } catch (ex) {
      toast.error("Not re-drawn", ex.message);
    } finally {
      setProving(false);
    }
  }
  return (
    <div>
      <PageHeader title={s.said} description={`${s.period} · drawn from ${s.population}${s.populationValue ? ` worth MVR ${s.populationValue}` : ""}`} />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Link to={`/audit/${s.periodId}?tab=samples`} className="text-[14px] underline underline-offset-2 min-h-11 inline-flex items-center">
          Back to {s.period}
        </Link>
        <span className="w-44">
          <Progress done={seen} of={s.items.length} />
        </span>
        {s.seed && (
          <span className="text-[12.5px] text-[var(--ink-muted)]">
            Seed <span className="font-mono text-[var(--ink)]">{s.seed}</span>
          </span>
        )}
        <Button variant="outline" size="sm" onClick={prove} disabled={proving}>
          {proving && <Loader2 size={13} className="animate-spin" />}
          Prove it: draw again
        </Button>
      </div>
      {proof && (
        <div className={`rounded-2xl px-4 py-3 mb-4 flex gap-3 items-start text-[14px] ${proof.sameItems && proof.samePopulation ? "bg-[var(--success-soft)]" : "bg-[var(--warning-soft)]"}`} data-testid="proof">
          {proof.sameItems && proof.samePopulation ? <BadgeCheck size={20} className="text-[var(--success)] shrink-0" /> : <AlertTriangle size={20} className="text-[var(--warning)] shrink-0" />}
          <p>{proof.said}</p>
        </div>
      )}
      <Card padding="none" className="overflow-hidden">
        <ul className="divide-y divide-[var(--border)]" data-testid="sample-items">
          {s.items.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => setOpen(i.id)} className="w-full text-left flex items-center gap-3 px-5 py-3 hover:bg-[var(--surface-2)] min-h-11" data-testid="sample-item">
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${i.seen ? "bg-[var(--success)]" : "border border-[var(--ink-muted)]"}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium truncate">
                    {i.no ? `${i.no} · ` : ""}
                    {i.party || "—"}
                  </span>
                  <span className="block text-[12px] text-[var(--ink-muted)] truncate">
                    {formatDate(i.on)}
                    {i.seen ? ` · seen by ${i.seen.by}` : " · not seen"}
                    {i.note ? ` · ${i.note}` : ""}
                  </span>
                  {(i.changed || (i.why && s.how !== "random")) && (
                    <span className="flex flex-wrap gap-1.5 mt-1">
                      {i.changed && <Badge tone="danger" className="text-[11.5px]">{i.changed}</Badge>}
                      {i.why && s.how !== "random" && <Badge tone="neutral" className="text-[11.5px]">{i.why}</Badge>}
                    </span>
                  )}
                </span>
                <span className="text-[14px] tabular">{i.amount}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {current && <Evidence key={current.id} sample={s} item={current} onClose={() => setOpen(null)} onNext={next} canTick={can("audit") && !s.signedOff} />}
    </div>
  );
}

export default function Audit() {
  const { id, sid } = useParams();
  if (sid) return <Sample sid={sid} />;
  if (id) return <Period id={id} />;
  return <Periods />;
}
