import { useState } from "react";
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
import { FIELD } from "@/lib/shipments";
import { formatDate } from "@/lib/utils";

/**
 * The auditor's workspace. A period under audit with its seal checked; the
 * journal screened for the signs of override; samples drawn from it, kept
 * with their seed so they can be proved; each item opened onto its document,
 * entry, money and papers, and ticked as seen with a note. Nothing here
 * changes the books.
 */

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
          <TabsTrigger value="pack">Audit pack</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "overview" && (
        <div className="grid gap-4">
          <Seal seal={p.seal} />
          {can("audit") && (
            <p>
              <Button variant="outline" size="sm" onClick={reseal} disabled={busy}>
                {busy && <Loader2 size={13} className="animate-spin" />}
                Check the seal again
              </Button>
            </p>
          )}
          <div className="grid md:grid-cols-2 gap-4">
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
          </div>
        </div>
      )}
      {tab === "samples" && <Samples p={p} />}
      {tab === "risk" && <Risk id={id} />}
      {tab === "pack" && <Pack p={p} />}
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
  const { can } = useCompany();
  return (
    <div className="grid gap-4">
      {can("audit") && <Draw periodId={p.id} />}
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
  const { can } = useCompany();
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
        {can("audit") && shown.length > 0 && (
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
