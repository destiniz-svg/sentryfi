import { useState } from "react";
import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Money } from "@/components/ui/Money";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { statementsApi } from "@/api/statements";
import { useCompany } from "@/context/CompanyContext";
import { apiClient } from "@/api/client";
import { useTags } from "@/components/ui/TagPicker";
import { today } from "@/lib/utils";

/**
 * The statements an accountant checks the work with.
 *
 * Every figure is a sum over the journal for the dates asked, worked out when
 * this page asks. Nothing here is stored, so asking for last March gives last
 * March's answer and cannot disagree with the entries behind it. The line at
 * the foot of each says whether it balances, and says so in words, because an
 * accountant's first question is whether it does.
 */

const FIELD =
  "h-11 px-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] text-[var(--ink)] outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15 tabular";

const TABS = [
  { key: "trial", label: "Trial balance" },
  { key: "pl", label: "Profit and loss" },
  { key: "bs", label: "Balance sheet" },
];

const yearStart = () => `${today().slice(0, 4)}-01-01`;
const niceDate = (iso) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** A spreadsheet for whoever wants one: the accountant will. */
function download(name, rows) {
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const blob = new Blob([rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Statements() {
  const { companyId } = useCompany();
  const [tab, setTab] = useState("trial");
  const [asAt, setAsAt] = useState(today());
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());

  const key = tab === "pl" ? [from, to] : [asAt];
  const { data, isLoading } = useQuery({
    queryKey: ["statements", companyId, tab, ...key],
    queryFn: () =>
      tab === "trial" ? statementsApi.trialBalance(asAt) : tab === "pl" ? statementsApi.profitAndLoss(from, to) : statementsApi.balanceSheet(asAt),
    enabled: Boolean(companyId),
  });

  return (
    <div>
      <PageHeader
        title="Statements"
        description="From the journal, for the date you ask."
        actions={
          <Link to="/import" className="inline-flex items-center min-h-[44px] text-[14px] underline underline-offset-2">
            Bring history in
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex flex-wrap gap-2" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`h-11 px-4 rounded-full text-[13px] border transition-colors ${
                tab === t.key
                  ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-semibold"
                  : "bg-[var(--surface)] text-[var(--ink-muted)] border-[var(--border)] hover:text-[var(--ink)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2 text-[13px] text-[var(--ink-muted)]">
          {tab === "pl" ? (
            <>
              <label className="flex items-center gap-2">
                From <input id="st-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={FIELD} />
              </label>
              <label className="flex items-center gap-2">
                To <input id="st-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={FIELD} />
              </label>
            </>
          ) : (
            <label className="flex items-center gap-2">
              As at <input id="st-asat" type="date" value={asAt} onChange={(e) => setAsAt(e.target.value)} className={FIELD} />
            </label>
          )}
        </div>
      </div>

      {isLoading || !data ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : tab === "trial" ? (
        <Trial t={data} />
      ) : tab === "pl" ? (
        <>
          <ProfitAndLoss p={data} />
          <SplitBy from={from} to={to} />
        </>
      ) : (
        <BalanceSheet b={data} />
      )}
    </div>
  );
}

const TH = "px-5 py-3 text-[12px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold";
const ROW = "grid gap-2 sm:gap-4 px-5 py-2.5 border-t border-[var(--border)] text-[14px]";

function Verdict({ ok, yes, no }) {
  return (
    <p
      role={ok ? undefined : "alert"}
      data-testid="verdict"
      className={`px-5 py-4 text-[14px] border-t border-[var(--border)] ${ok ? "text-[var(--ink)]" : "text-[var(--danger)] font-medium"}`}
    >
      {ok ? yes : no}
    </p>
  );
}

function Trial({ t }) {
  const cols = "grid-cols-[minmax(0,1fr)_84px_84px] sm:grid-cols-[70px_minmax(0,1fr)_130px_130px]";
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4">
        <h2 className="text-[15px] font-semibold">Trial balance as at {niceDate(t.asAt)}</h2>
        <Button
          variant="outline"
          onClick={() =>
            download(`trial-balance-${t.asAt}.csv`, [
              ["Code", "Account", "Debit", "Credit"],
              ...t.rows.map((r) => [r.code, r.name, r.debit ?? "", r.credit ?? ""]),
              ["", "Total", t.debit, t.credit],
            ])
          }
        >
          <Download size={15} /> CSV
        </Button>
      </div>
      <div className={`grid ${cols} gap-2 sm:gap-4 ${TH} mt-2`}>
        <span className="hidden sm:block">Code</span>
        <span>Account</span>
        <span className="text-right">Debit</span>
        <span className="text-right">Credit</span>
      </div>
      {t.rows.length === 0 && <p className="px-5 py-6 text-[14px] text-[var(--ink-muted)] border-t border-[var(--border)]">Nothing has been posted by this date.</p>}
      {t.rows.map((r) => (
        <div key={r.code} className={`${ROW} ${cols}`}>
          <span className="hidden sm:block tabular text-[var(--ink-muted)]">{r.code}</span>
          <span className="break-words">{r.name}</span>
          <span className="text-right">{r.debit ? <Money amount={r.debit} /> : ""}</span>
          <span className="text-right">{r.credit ? <Money amount={r.credit} /> : ""}</span>
        </div>
      ))}
      <div className={`${ROW} ${cols} font-semibold`}>
        <span className="hidden sm:block" />
        <span>Total</span>
        <span className="text-right"><Money amount={t.debit} /></span>
        <span className="text-right"><Money amount={t.credit} /></span>
      </div>
      <Verdict ok={t.balances} yes="Debits equal credits, to the laari." no={`Debits and credits differ by ${t.difference}. An entry got in that should have been refused.`} />
    </Card>
  );
}

const rowKey = (r) => r.code || r.name;

function PriorCell({ v }) {
  return (
    <span className="hidden sm:block text-right text-[var(--ink-muted)]">
      <Money amount={v ?? "0.00"} />
    </span>
  );
}

/** Rows, and beside them the same rows a year before when there is a prior. */
function Section({ title, rows, total, totalLabel, cols, prior, priorTotal }) {
  const before = new Map((prior || []).map((r) => [rowKey(r), r.amount]));
  // A line that only existed last year still shows, with nothing this year.
  const all = prior ? [...rows, ...prior.filter((p) => !rows.some((r) => rowKey(r) === rowKey(p))).map((p) => ({ ...p, amount: "0.00" }))] : rows;
  return (
    <>
      <div className={`px-5 pt-5 pb-2 ${TH.replace("px-5 py-3 ", "")}`}>{title}</div>
      {all.length === 0 && <div className="px-5 py-2.5 text-[14px] text-[var(--ink-muted)] border-t border-[var(--border)]">None</div>}
      {all.map((r) => (
        <div key={rowKey(r)} className={`${ROW} ${cols}`}>
          <span className="hidden sm:block tabular text-[var(--ink-muted)]">{r.code}</span>
          <span className="break-words">{r.name}</span>
          <span className="text-right"><Money amount={r.amount} /></span>
          {prior && <PriorCell v={before.get(rowKey(r))} />}
        </div>
      ))}
      <div className={`${ROW} ${cols} font-semibold`}>
        <span className="hidden sm:block" />
        <span>{totalLabel}</span>
        <span className="text-right"><Money amount={total} /></span>
        {prior && <PriorCell v={priorTotal} />}
      </div>
    </>
  );
}

/** Column heads when two periods sit side by side. */
function Heads({ cols, now, then }) {
  return (
    <div className={`hidden sm:grid ${cols} gap-x-4 px-5 pt-3 ${TH.replace("px-5 py-3 ", "")}`}>
      <span />
      <span />
      <span className="text-right">{now}</span>
      <span className="text-right">{then}</span>
    </div>
  );
}

function ProfitAndLoss({ p }) {
  const q = p.prior;
  const cols = q ? "grid-cols-[minmax(0,1fr)_110px] sm:grid-cols-[70px_minmax(0,1fr)_150px_150px]" : "grid-cols-[minmax(0,1fr)_110px] sm:grid-cols-[70px_minmax(0,1fr)_150px]";
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4">
        <h2 className="text-[15px] font-semibold">
          Profit and loss, {niceDate(p.from)} to {niceDate(p.to)}
        </h2>
        <Button
          variant="outline"
          onClick={() =>
            download(`profit-and-loss-${p.from}-${p.to}.csv`, [
              ["Code", "Account", "Amount"],
              ["", "Income", ""],
              ...p.income.map((r) => [r.code, r.name, r.amount]),
              ["", "Total income", p.totalIncome],
              ["", "Expenses", ""],
              ...p.expenses.map((r) => [r.code, r.name, r.amount]),
              ["", "Total expenses", p.totalExpenses],
              ["", p.loss ? "Loss" : "Profit", p.profit],
            ])
          }
        >
          <Download size={15} /> CSV
        </Button>
      </div>
      {q && <Heads cols={cols} now={p.to.slice(0, 4)} then={q.to.slice(0, 4)} />}
      <Section title="Income" rows={p.income} total={p.totalIncome} totalLabel="Total income" cols={cols} prior={q?.income} priorTotal={q?.totalIncome} />
      <Section title="Expenses" rows={p.expenses} total={p.totalExpenses} totalLabel="Total expenses" cols={cols} prior={q?.expenses} priorTotal={q?.totalExpenses} />
      <div className={`${ROW} ${cols} text-[16px] font-semibold`}>
        <span className="hidden sm:block" />
        <span>{p.loss ? "Loss" : "Profit"}</span>
        <span className={`tabular text-right ${p.loss ? "text-[var(--danger)]" : ""}`} data-testid="profit">
          {p.profit}
        </span>
        {q && <span className="hidden sm:block tabular text-right text-[var(--ink-muted)]">{q.profit}</span>}
      </div>
      <p className="px-5 py-4 text-[13px] text-[var(--ink-muted)] border-t border-[var(--border)]">
        From entries dated in these days. GST is not income or expense: what you charge is owed to the tax authority, and what you pay is claimable, so neither appears here.
      </p>
    </Card>
  );
}

const equityOf = (b) => [
  ...b.equity,
  { code: "", name: "Retained earnings, earlier years", amount: b.earnedBefore },
  { code: "", name: "Result for this year", amount: b.earnedThisYear },
];

function BalanceSheet({ b }) {
  const q = b.prior;
  const cols = q ? "grid-cols-[minmax(0,1fr)_110px] sm:grid-cols-[70px_minmax(0,1fr)_150px_150px]" : "grid-cols-[minmax(0,1fr)_110px] sm:grid-cols-[70px_minmax(0,1fr)_150px]";
  const equity = equityOf(b);
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4">
        <h2 className="text-[15px] font-semibold">Balance sheet as at {niceDate(b.asAt)}</h2>
        <Button
          variant="outline"
          onClick={() =>
            download(`balance-sheet-${b.asAt}.csv`, [
              ["Code", "Account", "Amount"],
              ["", "Assets", ""],
              ...b.assets.map((r) => [r.code, r.name, r.amount]),
              ["", "Total assets", b.totalAssets],
              ["", "Liabilities", ""],
              ...b.liabilities.map((r) => [r.code, r.name, r.amount]),
              ["", "Total liabilities", b.totalLiabilities],
              ["", "Equity", ""],
              ...equity.map((r) => [r.code, r.name, r.amount]),
              ["", "Total equity", b.totalEquity],
            ])
          }
        >
          <Download size={15} /> CSV
        </Button>
      </div>
      {q && <Heads cols={cols} now={niceDate(b.asAt)} then={niceDate(q.asAt)} />}
      <Section title="What the business holds" rows={b.assets} total={b.totalAssets} totalLabel="Total assets" cols={cols} prior={q?.assets} priorTotal={q?.totalAssets} />
      <Section title="What it owes" rows={b.liabilities} total={b.totalLiabilities} totalLabel="Total liabilities" cols={cols} prior={q?.liabilities} priorTotal={q?.totalLiabilities} />
      <Section title="What the owners have" rows={equity} total={b.totalEquity} totalLabel="Total equity" cols={cols} prior={q && equityOf(q)} priorTotal={q?.totalEquity} />
      <Verdict
        ok={b.balances}
        yes="Assets equal what it owes plus what the owners have, to the laari."
        no={`Assets and liabilities plus equity differ by ${b.difference}. An entry got in that should have been refused.`}
      />
    </Card>
  );
}

const SPLIT_NAMES = { project: "project", branch: "branch", department: "department", machine: "machine or boat", other: "tag" };

/**
 * The same profit and loss, one row per project, branch, department or
 * machine, with what carries none as its own row so the rows add up to the
 * whole. Offered only for kinds the company has switched on.
 */
function SplitBy({ from, to }) {
  const { companyId } = useCompany();
  const { data: tags } = useTags();
  const live = (tags?.values || []).filter((v) => !v.archived);
  const kinds = (tags?.kinds || []).filter((k) => live.some((v) => v.kind === k));
  const [kind, setKind] = useState("");
  const pick = kind || kinds[0] || "";
  const { data } = useQuery({
    queryKey: ["statements", companyId, "by", pick, from, to],
    queryFn: () => apiClient.get("/statements/profit-by", { params: { kind: pick, from, to } }).then((r) => r.data),
    enabled: Boolean(companyId && pick),
  });
  if (!kinds.length) return null;
  const cols = "grid grid-cols-[minmax(0,1fr)_100px_100px_110px] sm:grid-cols-[minmax(0,1fr)_150px_150px_150px] gap-3";
  return (
    <Card padding="none" className="overflow-hidden mt-4" data-testid="split">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-2">
        <h2 className="text-[15px] font-semibold">Profit by {SPLIT_NAMES[pick]}</h2>
        {kinds.length > 1 && (
          <select id="split-by" value={pick} onChange={(e) => setKind(e.target.value)} className="h-10 px-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[14px]">
            {kinds.map((k) => (
              <option key={k} value={k}>
                By {SPLIT_NAMES[k]}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className={`${cols} px-5 py-2 ${TH.replace("px-5 py-3 ", "")}`}>
        <span />
        <span className="text-right">Income</span>
        <span className="text-right">Costs</span>
        <span className="text-right">Profit</span>
      </div>
      {(data?.rows || []).map((r) => (
        <div key={r.id || "none"} className={`${ROW} ${cols}`}>
          <span className={r.id ? "break-words" : "text-[var(--ink-muted)]"}>{r.name}</span>
          <span className="text-right"><Money amount={r.income} /></span>
          <span className="text-right"><Money amount={r.costs} /></span>
          <span className="text-right font-semibold"><Money amount={r.profit} /></span>
        </div>
      ))}
    </Card>
  );
}
