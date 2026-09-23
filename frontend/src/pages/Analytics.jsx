import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Loader2 } from "lucide-react";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { Money } from "@/components/ui/Money";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDate } from "@/lib/utils";

/**
 * Analytics: the questions a founder asks, answered from the books.
 *
 * What the others do not: one period drives the whole page (not a dropdown
 * per widget); the twelve-month chart is how you move through time (tap a
 * month to look at it); and every figure opens onto the entries behind it,
 * which add up to the figure in front of you. Ranked bars rather than pies,
 * a sentence on each card saying what it means, and the things that would
 * cost extra elsewhere (profit by site, who pays late, where the month is
 * heading, what is committed) are simply here.
 */

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lastDay = (y, m) => new Date(y, m + 1, 0);
const short = (laari) => {
  const n = Math.abs(laari) / 100;
  const s = n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}m` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n));
  return laari < 0 ? `-${s}` : s;
};
const MONTH = { Jan: "January", Feb: "February", Mar: "March", Apr: "April", May: "May", Jun: "June", Jul: "July", Aug: "August", Sep: "September", Oct: "October", Nov: "November", Dec: "December" };

function presets() {
  const t = new Date();
  const y = t.getFullYear();
  const m = t.getMonth();
  const q = Math.floor(m / 3) * 3;
  return [
    { key: "month", label: "This month", from: ymd(new Date(y, m, 1)), to: ymd(t) },
    { key: "last", label: "Last month", from: ymd(new Date(y, m - 1, 1)), to: ymd(lastDay(y, m - 1)) },
    { key: "quarter", label: "This quarter", from: ymd(new Date(y, q, 1)), to: ymd(t) },
    { key: "ytd", label: "Year to date", from: ymd(new Date(y, 0, 1)), to: ymd(t) },
    { key: "12m", label: "12 months", from: ymd(new Date(y, m - 11, 1)), to: ymd(t) },
  ];
}
const span = (p) => (p.from.slice(0, 7) === p.to.slice(0, 7) ? formatDate(p.from).replace(/^\d+\s/, "") : `${formatDate(p.from)} – ${formatDate(p.to)}`);

export default function Analytics() {
  const { companyId } = useCompany();
  const all = useMemo(() => presets(), []);
  const [period, setPeriod] = useState(all[3]);
  const [open, setOpen] = useState(null); // the figure whose entries are showing
  const { data: a, isFetching } = useQuery({
    queryKey: ["analytics", companyId, period.from, period.to],
    queryFn: () => apiClient.get(`/analytics?from=${period.from}&to=${period.to}`).then((r) => r.data),
    enabled: Boolean(companyId),
    placeholderData: (prev) => prev,
  });
  const look = (figure) => setOpen({ from: period.from, to: period.to, ...figure });
  const pickMonth = (m) => {
    const [y, mo] = m.ym.split("-").map(Number);
    setPeriod({ key: `m:${m.ym}`, label: `${MONTH[m.label]} ${y}`, from: `${m.ym}-01`, to: ymd(lastDay(y, mo - 1)) });
  };

  return (
    <div className="space-y-4 min-w-0">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[30px] font-semibold tracking-tight leading-none">Analytics</h1>
          <p className="text-[14px] text-[var(--ink-muted)] mt-1.5">
            {span(period)}, against the {a ? `${formatDate(a.previous.from)} – ${formatDate(a.previous.to)}` : "period"} before it. Every figure opens onto its entries.
          </p>
        </div>
        {isFetching && <Loader2 size={16} className="animate-spin text-[var(--ink-muted)]" aria-label="Updating" />}
      </header>

      <PeriodBar all={all} period={period} onPick={setPeriod} />

      {!a ? (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-28 rounded-[20px]" />)}
          <Skeleton className="h-64 rounded-[24px] col-span-2 lg:col-span-5" />
        </div>
      ) : (
        <>
          <Kpis a={a} look={look} />
          <MonthsCard months={a.months} period={period} onPick={pickMonth} />
          <div className="grid gap-4 lg:grid-cols-2 items-start">
            <Ranked
              title="Where the money came from"
              said={said.incomeBy(a)}
              rows={a.incomeBy}
              empty="Nothing earned in this period."
              onRow={(r) => look({ type: "income", counterpartyId: r.id || "none", what: `Income from ${r.name}`, amount: r.amount })}
            />
            <Ranked
              title="Where it went"
              said={said.costsBy(a)}
              rows={a.costsBy}
              empty="Nothing spent in this period."
              changeIsBad
              onRow={(r) => look({ type: "expense", accountId: r.id, what: r.name, amount: r.amount })}
            />
            <Sites sites={a.sites} look={look} />
            <Payers payers={a.payers} />
            <ThisMonth m={a.month} />
            <Committed c={a.committed} />
          </div>
        </>
      )}

      {open && <Entries figure={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// ------------------------------------------------------------------ sentences

const said = {
  incomeBy(a) {
    const total = a.incomeBy.reduce((s, r) => s + r.raw, 0);
    const top = a.incomeBy[0];
    if (!top || total <= 0) return null;
    const share = Math.round((top.raw / total) * 100);
    return share >= 50 ? `${top.name} is ${share}% of what came in. One customer that large is a risk worth knowing.` : `${top.name} leads, at ${share}% of what came in.`;
  },
  costsBy(a) {
    const up = a.costsBy.filter((r) => r.change !== null && r.change >= 25).sort((x, y) => y.raw - x.raw)[0];
    if (up) return `${up.name} is up ${Math.round(up.change)}% on the period before.`;
    const top = a.costsBy[0];
    return top ? `${top.name} is the biggest cost.` : null;
  },
};

// ------------------------------------------------------------------ the period

function PeriodBar({ all, period, onPick }) {
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const picked = period.key.startsWith("m:");
  return (
    <div>
      <div role="tablist" aria-label="Period" className="flex flex-wrap gap-1 p-1 rounded-[22px] bg-[var(--surface)] lift w-fit max-w-full">
        {[...all, ...(picked ? [period] : []), { key: "custom", label: "Custom" }].map((p) => {
          const on = p.key === "custom" ? custom : !custom && p.key === period.key;
          return (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => (p.key === "custom" ? setCustom(true) : (setCustom(false), onPick(p)))}
              className={`relative h-9 px-3.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${on ? "text-[var(--surface)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}
            >
              {on && <motion.span layoutId="analytics-period" className="absolute inset-0 rounded-full bg-[var(--ink)]" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              <span className="relative">{p.label}</span>
            </button>
          );
        })}
      </div>
      {custom && (
        <form
          className="flex flex-wrap items-center gap-2 mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to && from <= to) onPick({ key: `c:${from}:${to}`, label: "Custom", from, to });
          }}
        >
          <input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 px-3 rounded-full bg-[var(--surface)] lift text-[13px]" />
          <span className="text-[13px] text-[var(--ink-muted)]">to</span>
          <input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 px-3 rounded-full bg-[var(--surface)] lift text-[13px]" />
          <button type="submit" disabled={!from || !to || from > to} className="h-9 px-4 rounded-full bg-[var(--ink)] text-[var(--surface)] text-[13px] font-medium disabled:opacity-40">
            Look
          </button>
        </form>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ the headline figures

function Change({ value, bad }) {
  if (value === null || value === undefined) return <span className="text-[12px] text-[var(--ink-muted)]">nothing to compare</span>;
  const up = value > 0;
  const good = bad ? !up : up;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[12px] font-semibold ${value === 0 ? "text-[var(--ink-muted)]" : good ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
      {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {Math.abs(value)}%
    </span>
  );
}

function Spark({ values, tone = "var(--ink)" }) {
  const kept = values.filter((v) => v !== null);
  if (kept.length < 2) return null;
  const max = Math.max(...kept, 1);
  const min = Math.min(...kept, 0);
  const pts = values.map((v, i) => (v === null ? null : `${(i / (values.length - 1)) * 100},${28 - ((v - min) / (max - min || 1)) * 26}`)).filter(Boolean);
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-7 mt-2" aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke={tone} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Kpis({ a, look }) {
  const k = a.kpis;
  const series = (fn) => a.months.map((m) => (m.beforeBooks ? null : fn(m)));
  const tiles = [
    { label: "Income", v: k.income.now, change: k.income.change, spark: series((m) => m.income), open: { type: "income", what: "Income", amount: k.income.now } },
    { label: "Costs", v: k.costs.now, change: k.costs.change, bad: true, spark: series((m) => m.costs), open: { type: "expense", what: "Costs", amount: k.costs.now } },
    { label: "Profit", v: k.profit.now, change: k.profit.change, note: k.margin.now !== null ? `${k.margin.now}% margin` : null, spark: series((m) => m.income - m.costs) },
    { label: "Cash now", v: k.cash.now, change: k.cash.change, note: "change since the period began", open: { type: "cash", what: "Money in and out of cash and bank", amount: null, allTime: true } },
    { label: "Owed to you", v: k.owed.now, note: k.owed.overdueRaw > 0 ? `${k.owed.overdue} overdue` : "nothing overdue", to: "/invoices", tone: k.owed.overdueRaw > 0 },
  ];
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
      {tiles.map((t, i) => {
        const body = (
          <>
            <div className="text-[12px] text-[var(--ink-muted)]">{t.label}</div>
            <div className="text-[21px] font-semibold tracking-[-0.02em] mt-1 tabular truncate">
              <Money amount={t.v} />
            </div>
            <div className="flex items-center gap-2 mt-0.5 min-h-[18px]">
              {"change" in t && <Change value={t.change} bad={t.bad} />}
              {t.note && <span className={`text-[12px] truncate ${t.tone ? "text-[var(--danger)]" : "text-[var(--ink-muted)]"}`}>{t.note}</span>}
            </div>
            {t.spark && <Spark values={t.spark} tone={t.bad ? "var(--ink-muted)" : "var(--ink)"} />}
          </>
        );
        const cls = `text-left rounded-[20px] bg-[var(--surface)] lift p-4 min-w-0 transition-transform hover:-translate-y-0.5 ${i === 4 ? "col-span-2 lg:col-span-1" : ""}`;
        return t.to ? (
          <Link key={t.label} to={t.to} className={cls}>{body}</Link>
        ) : (
          <button key={t.label} type="button" disabled={!t.open} onClick={() => t.open && look(t.open)} className={`${cls} disabled:hover:translate-y-0`} data-testid={`kpi-${t.label.toLowerCase().replace(/ /g, "-")}`}>
            {body}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ twelve months, to move through time

function MonthsCard({ months, period, onPick }) {
  const reduce = useReducedMotion();
  const [at, setAt] = useState(null);
  const max = Math.max(1, ...months.map((m) => Math.max(m.income, m.costs)));
  const inPeriod = (m) => m.ym >= period.from.slice(0, 7) && m.ym <= period.to.slice(0, 7);
  const shown = months[at ?? months.length - 1];
  const profit = shown.income - shown.costs;
  return (
    <section aria-labelledby="months" className="rounded-[24px] bg-[#141414] text-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="months" className="text-[16px] font-semibold">Income and costs, month by month</h2>
          <p className="text-[13px] text-white/60 mt-0.5">Tap a month to look at it. The months in the period are lit.</p>
        </div>
        <div className="flex items-center gap-4 text-[12px] text-white/70">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-white" aria-hidden="true" />Income</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-white/35" aria-hidden="true" />Costs</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--accent)]" aria-hidden="true" />Profit</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1" aria-live="polite">
        <span className="text-[13px] text-white/60">{MONTH[shown.label]} {shown.ym.slice(0, 4)}</span>
        {shown.beforeBooks ? (
          <span className="text-[14px] text-white/60">Before these books</span>
        ) : (
          <>
            <span className="text-[14px]">in <b className="font-semibold tabular">{short(shown.income)}</b></span>
            <span className="text-[14px]">out <b className="font-semibold tabular">{short(shown.costs)}</b></span>
            <span className="text-[14px]">
              profit <b className={`font-semibold tabular ${profit < 0 ? "text-[#FF8A7A]" : "text-[var(--accent)]"}`}>{short(profit)}</b>
            </span>
          </>
        )}
      </div>

      <div className="relative mt-4 h-[180px] flex items-end gap-1 sm:gap-2" onMouseLeave={() => setAt(null)}>
        {months.map((m, i) => {
          const lit = inPeriod(m);
          const p = m.income - m.costs;
          return (
            <button
              key={m.ym}
              type="button"
              disabled={m.beforeBooks}
              aria-label={`${MONTH[m.label]} ${m.ym.slice(0, 4)}: ${m.beforeBooks ? "before these books" : `income ${short(m.income)}, costs ${short(m.costs)}, profit ${short(p)}. Look at this month.`}`}
              onMouseEnter={() => setAt(i)}
              onFocus={() => setAt(i)}
              onClick={() => onPick(m)}
              className={`group relative flex-1 h-full flex flex-col justify-end items-center rounded-xl transition-colors ${at === i ? "bg-white/[0.07]" : ""} disabled:cursor-default`}
            >
              {m.beforeBooks ? (
                <span className="block w-3 h-1.5 mb-6 rounded-full border border-dashed border-white/25" />
              ) : (
                <>
                  <span className="flex items-end gap-[3px] h-[140px]" style={{ opacity: lit ? 1 : 0.45 }}>
                    <motion.span className="block w-[6px] sm:w-2 rounded-full bg-white" initial={reduce ? false : { height: 0 }} animate={{ height: `${Math.max(2, (m.income / max) * 100)}%` }} transition={{ type: "spring", stiffness: 130, damping: 20, delay: reduce ? 0 : i * 0.03 }} />
                    <motion.span className="block w-[6px] sm:w-2 rounded-full bg-white/35" initial={reduce ? false : { height: 0 }} animate={{ height: `${Math.max(2, (m.costs / max) * 100)}%` }} transition={{ type: "spring", stiffness: 130, damping: 20, delay: reduce ? 0 : i * 0.03 + 0.05 }} />
                  </span>
                  <span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${p >= 0 ? "bg-[var(--accent)]" : "bg-[#FF8A7A]"}`} style={{ opacity: lit ? 1 : 0.45 }} aria-hidden="true" />
                </>
              )}
              <span className={`mt-1.5 text-[11px] ${lit ? "text-white" : "text-white/45"}`}>{m.label.slice(0, 1)}<span className="hidden sm:inline">{m.label.slice(1, 3)}</span></span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ ranked lists

function Card({ title, said: line, right, children, id }) {
  return (
    <section aria-labelledby={id} className="rounded-[24px] bg-[var(--surface)] lift p-5 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <h2 id={id} className="text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
        {right}
      </div>
      {line && <p className="text-[13px] text-[var(--ink-muted)] mt-1 leading-snug">{line}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Ranked({ title, said: line, rows, empty, onRow, changeIsBad }) {
  const [all, setAll] = useState(false);
  const id = title.toLowerCase().replace(/\W+/g, "-");
  const max = Math.max(1, ...rows.map((r) => r.raw));
  const shown = all ? rows : rows.slice(0, 6);
  return (
    <Card title={title} said={line} id={id}>
      {!rows.length ? (
        <p className="text-[14px] text-[var(--ink-muted)]">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {shown.map((r, i) => (
            <li key={r.id || r.name}>
              <button type="button" onClick={() => onRow(r)} className="w-full text-left rounded-xl px-2 py-2 -mx-2 hover:bg-[var(--surface-2)] transition-colors group">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] min-w-0 truncate">{r.name}</span>
                  <span className="flex items-baseline gap-2 shrink-0">
                    {"change" in r && r.change !== null && <Change value={r.change} bad={changeIsBad} />}
                    <span className="text-[14px] font-semibold tabular"><Money amount={r.amount} /></span>
                    <ChevronRight size={14} className="self-center text-[var(--ink-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                </div>
                <span className="block h-1.5 mt-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <motion.span className={`block h-full rounded-full ${i === 0 ? "bg-[var(--ink)]" : "bg-[var(--ink-muted)]/45"}`} initial={{ width: 0 }} animate={{ width: `${Math.max(1.5, (r.raw / max) * 100)}%` }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: i * 0.03 }} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 6 && (
        <button type="button" onClick={() => setAll(!all)} className="mt-2 text-[13px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]">
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ which site made money

const SITE = { project: "Projects", branch: "Branches", machine: "Machines" };
function Sites({ sites, look }) {
  const kinds = Object.keys(SITE).filter((k) => sites[k]?.length);
  const [kind, setKind] = useState(kinds[0] || "project");
  const rows = sites[kind] || [];
  const max = Math.max(1, ...rows.flatMap((r) => [r.raw.income, r.raw.costs]));
  const losing = rows.filter((r) => r.raw.income < r.raw.costs);
  const best = [...rows].sort((a, b) => b.raw.income - b.raw.costs - (a.raw.income - a.raw.costs))[0];
  const line = !rows.length ? null : losing.length ? `${losing.map((r) => r.name).join(", ")} cost more than ${losing.length > 1 ? "they" : "it"} earned in this period.` : best ? `${best.name} made the most.` : null;
  const filter = (r) => (kind === "project" ? { projectId: r.id } : { dimensionId: r.id });
  return (
    <Card
      title="Which site made money"
      id="sites"
      said={line}
      right={
        kinds.length > 1 && (
          <div role="tablist" aria-label="Split by" className="flex gap-1 p-0.5 rounded-full bg-[var(--surface-2)] shrink-0">
            {kinds.map((k) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={`h-7 px-2.5 rounded-full text-[12px] font-medium ${kind === k ? "bg-[var(--ink)] text-[var(--surface)]" : "text-[var(--ink-muted)]"}`}>
                {SITE[k]}
              </button>
            ))}
          </div>
        )
      }
    >
      {!rows.length ? (
        <p className="text-[14px] text-[var(--ink-muted)]">Tag bills, invoices and spending with a project, branch or machine, and each one's profit shows here.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] font-medium min-w-0 truncate">{r.name}</span>
                <span className={`text-[14px] font-semibold tabular shrink-0 ${r.raw.income < r.raw.costs ? "text-[var(--danger)]" : ""}`}>
                  <Money amount={r.profit} />
                  {r.margin !== null && <span className="ml-1.5 text-[12px] font-normal text-[var(--ink-muted)]">{r.margin}%</span>}
                </span>
              </div>
              <div className="mt-1.5 grid gap-1">
                {[
                  ["in", r.raw.income, r.income, "income", "bg-[var(--ink)]"],
                  ["out", r.raw.costs, r.costs, "expense", "bg-[var(--ink-muted)]/45"],
                ].map(([word, raw, amount, type, tone]) => (
                  <button key={word} type="button" disabled={!raw} onClick={() => look({ type, ...filter(r), what: `${r.name}: ${type === "income" ? "income" : "costs"}`, amount })} className="flex items-center gap-2 group disabled:cursor-default" aria-label={`${r.name} ${word} ${amount}: open its entries`}>
                    <span className="w-6 text-[11px] text-[var(--ink-muted)] text-left">{word}</span>
                    <span className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                      <motion.span className={`block h-full rounded-full ${tone} group-hover:opacity-80`} initial={{ width: 0 }} animate={{ width: `${Math.max(raw ? 1.5 : 0, (raw / max) * 100)}%` }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} />
                    </span>
                    <span className="w-16 text-right text-[12px] tabular text-[var(--ink-muted)]">{short(raw)}</span>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ who pays late

function Payers({ payers }) {
  const late = payers.filter((p) => p.overdue !== "0.00" || (p.daysLate ?? 0) > 0);
  const worst = payers[0];
  const line = !payers.length ? null : worst && worst.overdue !== "0.00" ? `${worst.name} owes MVR ${worst.overdue} past its due date.` : "Nobody is overdue.";
  return (
    <Card title="Who pays late" id="payers" said={line}>
      {!payers.length ? (
        <p className="text-[14px] text-[var(--ink-muted)]">Once customers pay, how long each takes shows here.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {(late.length ? late : payers).slice(0, 6).map((p) => (
            <li key={p.id || p.name} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] font-medium min-w-0 truncate">{p.name}</span>
                {p.overdue !== "0.00" ? (
                  <span className="text-[14px] font-semibold tabular text-[var(--danger)] shrink-0"><Money amount={p.overdue} /> overdue</span>
                ) : (
                  <span className="text-[13px] text-[var(--ink-muted)] shrink-0">nothing overdue</span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--ink-muted)]">
                {p.daysToPay !== null && <span>pays in {p.daysToPay} days on average</span>}
                {p.onTimePct !== null && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-14 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden"><span className="block h-full bg-[var(--success)]" style={{ width: `${p.onTimePct}%` }} /></span>
                    {p.onTimePct}% on time
                  </span>
                )}
                {p.invoices.map((i) => (
                  <Link key={i.id} to={`/documents/invoice/${i.id}`} className="underline underline-offset-2 hover:text-[var(--ink)]">
                    {i.number} · {i.daysOver}d late
                  </Link>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ this month, before it ends

function ThisMonth({ m }) {
  const r = m.raw;
  const scale = Math.max(1, r.pace, r.lastMonth, r.soFar + r.due);
  const vs = r.lastMonth > 0 ? Math.round(((r.pace - r.lastMonth) / r.lastMonth) * 100) : null;
  const monthName = new Date(`${m.from}T00:00:00`).toLocaleString("en-GB", { month: "long" });
  const line = r.soFar === 0 ? `Nothing spent in ${monthName} yet.` : `At this pace ${monthName} comes to MVR ${m.pace}${vs !== null ? `, ${Math.abs(vs)}% ${vs >= 0 ? "above" : "below"} last month` : ""}.`;
  return (
    <Card title="This month, before it ends" id="this-month" said={line}>
      <div className="relative h-3 rounded-full bg-[var(--surface-2)]" role="img" aria-label={`Spent ${m.soFar} so far, day ${m.day} of ${m.days}; pace ${m.pace}; last month ${m.lastMonth}`}>
        <motion.span className="absolute inset-y-0 left-0 rounded-full bg-[var(--ink)]" initial={{ width: 0 }} animate={{ width: `${(r.soFar / scale) * 100}%` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
        <motion.span className="absolute inset-y-0 rounded-r-full bg-[var(--ink)]/20" initial={{ width: 0 }} animate={{ left: `${(r.soFar / scale) * 100}%`, width: `${(Math.max(0, r.pace - r.soFar) / scale) * 100}%` }} transition={{ duration: 0.6, delay: 0.15 }} />
        {r.lastMonth > 0 && <span className="absolute -top-1 -bottom-1 w-0.5 bg-[var(--accent)]" style={{ left: `${(r.lastMonth / scale) * 100}%` }} title="Last month" />}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
        <span><span className="block text-[var(--ink-muted)]">So far, day {m.day} of {m.days}</span><b className="text-[14px] tabular"><Money amount={m.soFar} /></b></span>
        <span><span className="block text-[var(--ink-muted)]">At this pace</span><b className="text-[14px] tabular"><Money amount={m.pace} /></b></span>
        <span><span className="block text-[var(--ink-muted)] inline-flex items-center gap-1"><span className="h-2 w-0.5 bg-[var(--accent)]" />Last month</span><b className="text-[14px] tabular"><Money amount={m.lastMonth} /></b></span>
      </div>
      {m.stillDue.length > 0 && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-medium">Still to pay this month</span>
            <span className="font-semibold tabular"><Money amount={m.dueTotal} /></span>
          </div>
          <ul className="mt-1.5 space-y-1">
            {m.stillDue.slice(0, 6).map((d) => (
              <li key={`${d.kind}:${d.id}`} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate">
                  <span className={d.late ? "text-[var(--danger)]" : "text-[var(--ink-muted)]"}>{d.late ? "late" : formatDate(d.on).replace(/\s\d{4}$/, "")}</span> · {d.what}
                </span>
                <span className="tabular shrink-0"><Money amount={d.amount} /></span>
              </li>
            ))}
          </ul>
          <Link to="/payments" className="inline-flex items-center gap-1 mt-2 text-[13px] font-medium hover:underline">Pay them <ChevronRight size={14} /></Link>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ committed, not yet spent

function Committed({ c }) {
  return (
    <Card title="Committed, not yet spent" id="committed" said={c.rows.length ? `MVR ${c.total} agreed with suppliers and not yet billed: money already spoken for.` : "Nothing ordered and waiting to be billed."}>
      {c.rows.length > 0 && (
        <ul className="divide-y divide-[var(--border)]">
          {c.rows.slice(0, 8).map((r) => (
            <li key={`${r.kind}:${r.id}`}>
              <Link to={r.kind === "order" ? `/orders/${r.id}` : "/projects"} className="flex items-baseline justify-between gap-3 py-2 group">
                <span className="min-w-0">
                  <span className="block text-[14px] truncate group-hover:underline">{r.what}</span>
                  <span className="block text-[12px] text-[var(--ink-muted)]">{r.kind === "order" ? "Purchase order" : "Subcontract"}{r.project ? ` · ${r.project}` : ""}</span>
                </span>
                <span className="text-[14px] font-semibold tabular shrink-0"><Money amount={r.open} /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ the entries behind a figure

function Entries({ figure, onClose }) {
  const { companyId } = useCompany();
  const q = new URLSearchParams({ type: figure.type, ...(figure.allTime ? { from: "2000-01-01" } : { from: figure.from }), to: figure.to });
  for (const k of ["accountId", "counterpartyId", "projectId", "dimensionId"]) if (figure[k]) q.set(k, figure[k]);
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-entries", companyId, q.toString()],
    queryFn: () => apiClient.get(`/analytics/entries?${q}`).then((r) => r.data),
  });
  return (
    <Modal open onClose={onClose} title={figure.what} description={figure.allTime ? "Every movement of cash and bank, newest first." : `${formatDate(figure.from)} – ${formatDate(figure.to)}`} size="lg">
      {isLoading || !data ? (
        <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-11 rounded-xl" />)}</div>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3 rounded-2xl bg-[var(--surface-2)] px-4 py-3" data-testid="entries-total">
            <span className="text-[13px] text-[var(--ink-muted)]">{data.count} {data.count === 1 ? "entry adds" : "entries add"} up to</span>
            <span className="text-[18px] font-semibold tabular"><Money amount={data.total} /></span>
          </div>
            <ul className="mt-3 divide-y divide-[var(--border)] max-h-[55vh] overflow-y-auto -mx-1 px-1">
              {data.entries.map((e, i) => (
                <motion.li key={e.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.02 }} className="py-2.5 flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-[14px] truncate">{e.narrative}</span>
                    <span className="block text-[12px] text-[var(--ink-muted)] truncate">{formatDate(e.on)} · entry {e.entryNo} · {e.accounts}</span>
                  </span>
                  <span className="text-[14px] font-semibold tabular shrink-0"><Money amount={e.amount} /></span>
                </motion.li>
              ))}
            </ul>
          {data.count > data.entries.length && <p className="text-[12px] text-[var(--ink-muted)] mt-2">The newest {data.entries.length} of {data.count} are listed; the total is all of them.</p>}
        </>
      )}
    </Modal>
  );
}
