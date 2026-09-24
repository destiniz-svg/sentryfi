import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, Printer } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { formatDate } from "@/lib/utils";
import { monthName, nationalityName } from "@/pages/Payroll";

/**
 * A payslip: what the Employment Act asks one to show (the gross, each
 * deduction and why, the net), with how each figure was reached, what the
 * company paid on top, and the year so far. On paper it is the page and
 * nothing else; print it, or save it as a PDF from the print window.
 *
 * The same page serves the payroll office (a run's slip) and the person paid
 * (their own, once the run's payslips are out).
 */

const n = (s) => Number(String(s ?? "").replace(/,/g, "")) || 0;
const PRINT = `@media print{
  @page{size:A4;margin:14mm}
  html,body{background:#fff !important}
  body *{visibility:hidden !important}
  .payslip,.payslip *{visibility:visible !important}
  .payslip{position:absolute;inset:0 auto auto 0;width:100%;box-shadow:none !important;border:0 !important}
}`;

export default function Payslip({ mine = false }) {
  const { runId, employeeId } = useParams();
  const { companyId } = useCompany();
  const url = mine ? `/payroll/mine/${runId}` : `/payroll/runs/${runId}/slips/${employeeId}`;
  const { data: p, isLoading, error } = useQuery({ queryKey: ["payroll", companyId, "slip", url], queryFn: () => apiClient.get(url).then((r) => r.data), enabled: Boolean(companyId) });

  if (error) return <Card padding="lg"><p className="text-[14px]">{error.message}</p></Card>;
  if (isLoading || !p) return <Skeleton className="h-[640px] rounded-3xl max-w-3xl" />;
  const s = p.slip;
  const who = p.person;
  const facts = [
    ["Staff number", who.employeeNo],
    ["Job", who.jobTitle],
    ["Nationality", nationalityName(who.nationality)],
    ["ID card or passport", who.idNumber],
    ["TIN", who.tin],
    ["Started", who.joinedOn && formatDate(who.joinedOn)],
    ["Days paid", `${s.paidDays} of ${s.daysInMonth}`],
    ["Paid into", who.bankAccount ? `${who.bankName ? `${who.bankName} ` : ""}${who.bankAccount}` : "By hand"],
  ].filter(([, v]) => v);

  return (
    <div className="max-w-3xl">
      <style>{PRINT}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 print:hidden">
        <Link to={mine ? "/payslips" : `/payroll/runs/${runId}`} className="inline-flex items-center gap-1.5 text-[14px] text-[var(--ink-muted)] hover:text-[var(--ink)]">
          <ArrowLeft size={15} /> {mine ? "My payslips" : `${monthName(p.period)} payroll`}
        </Link>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer size={15} /> Print or save as PDF
        </Button>
      </div>

      <article className="payslip rounded-3xl bg-[var(--surface)] lift overflow-hidden" aria-label={`Payslip for ${who.name}, ${monthName(p.period)}`}>
        <header className="px-7 pt-7 pb-5 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)]">
          <div>
            <div className="text-[13px] text-[var(--ink-muted)]">{p.company.name}{p.company.tin ? ` · TIN ${p.company.tin}` : ""}</div>
            <h1 className="text-[26px] font-semibold tracking-tight mt-1">{who.name}</h1>
          </div>
          <div className="text-right">
            <div className="text-[13px] text-[var(--ink-muted)]">Payslip</div>
            <div className="text-[18px] font-semibold">{monthName(p.period)}</div>
            <div className="text-[13px] text-[var(--ink-muted)]">paid {formatDate(p.payDate)}</div>
          </div>
        </header>

        <dl className="px-7 py-4 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 border-b border-[var(--border)]">
          {facts.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[12px] text-[var(--ink-muted)]">{k}</dt>
              <dd className="text-[14px] truncate tabular">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="px-7 py-5 grid sm:grid-cols-2 gap-8">
          <Lines title="Pay" rows={s.earnings} total={["Gross pay", s.gross]} />
          <Lines title="Kept back" rows={s.deductions} total={["Kept back", String(n(s.gross) - n(s.net))]} minus empty="Nothing kept back." />
        </div>

        <div className="mx-7 rounded-2xl bg-[#141414] text-white px-6 py-5 flex flex-wrap items-baseline justify-between gap-3 on-ink">
          <span className="text-[15px] text-white/75">Paid to you</span>
          <span className="text-[34px] font-semibold tabular leading-none">
            <span className="text-[15px] text-white/60 mr-2">{p.currency}</span>
            <Money amount={s.net} />
          </span>
        </div>

        <div className="px-7 py-5 grid sm:grid-cols-2 gap-8">
          {s.employer.length > 0 ? <Lines title="Your employer also paid" rows={s.employer} /> : <div />}
          <div>
            <div className="text-[12px] font-medium text-[var(--ink-muted)] mb-1">This year so far</div>
            <dl className="divide-y divide-[var(--border)] text-[14px]">
              {[["Gross pay", p.ytd.gross], ["Tax", p.ytd.tax], ["Your pension", p.ytd.pension], ["Paid to you", p.ytd.net]].filter(([, v]) => n(v) > 0 || v === p.ytd.net).map(([k, v]) => (
                <div key={k} className="py-2 flex justify-between">
                  <dt>{k}</dt>
                  <dd className="tabular"><Money amount={v} /></dd>
                </div>
              ))}
              {p.advanceOwed && n(p.advanceOwed) > 0 && (
                <div className="py-2 flex justify-between">
                  <dt>Advance still owed</dt>
                  <dd className="tabular"><Money amount={p.advanceOwed} /></dd>
                </div>
              )}
            </dl>
          </div>
        </div>
        <footer className="px-7 pb-6 text-[12px] text-[var(--ink-muted)]">
          Figures in {p.currency}. {p.pack === "MV" ? "Tax is worked out on pay after your own pension, band by band, as MIRA sets." : ""} Ask the payroll office about anything on it.
        </footer>
      </article>
    </div>
  );
}

function Lines({ title, rows, total, minus, empty }) {
  return (
    <div>
      <div className="text-[12px] font-medium text-[var(--ink-muted)] mb-1">{title}</div>
      {!rows.length ? (
        <p className="text-[14px] text-[var(--ink-muted)] py-2">{empty}</p>
      ) : (
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
      )}
      {total && rows.length > 0 && (
        <div className="pt-2 mt-1 border-t-2 border-[var(--ink)] flex justify-between text-[14px] font-semibold">
          <span>{total[0]}</span>
          <span className="tabular">{minus ? "−" : ""}<Money amount={Number(String(total[1]).replace(/,/g, "")).toLocaleString("en-US", { minimumFractionDigits: 2 })} /></span>
        </div>
      )}
    </div>
  );
}

/** A person's own payslips, once the payroll office has given them out. */
export function MyPayslips() {
  const { companyId } = useCompany();
  const { data, isLoading } = useQuery({ queryKey: ["payroll", companyId, "mine"], queryFn: () => apiClient.get("/payroll/mine").then((r) => r.data.slips), enabled: Boolean(companyId) });
  return (
    <div className="max-w-2xl">
      <PageHeader title="My payslips" description="Every month's payslip from this company, to read, print or keep." />
      {isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : !data.length ? (
        <Card padding="lg">
          <p className="text-[15px] font-semibold">No payslips yet</p>
          <p className="text-[14px] text-[var(--ink-muted)] mt-1">They appear here once the payroll office gives them out, if your sign-in is linked to you on the payroll.</p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-[var(--border)]">
            {data.map((s) => (
              <li key={s.runId}>
                <Link to={`/payslips/${s.runId}`} className="px-5 py-4 flex items-center gap-3 hover:bg-[var(--surface-2)]">
                  <span className="flex-1">
                    <span className="block text-[15px] font-semibold">{monthName(s.period)}</span>
                    <span className="block text-[13px] text-[var(--ink-muted)]">paid {formatDate(s.payDate)} · gross {s.gross}</span>
                  </span>
                  <span className="text-[16px] font-semibold"><Money amount={s.net} /></span>
                  <ChevronRight size={16} className="text-[var(--ink-muted)]" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
