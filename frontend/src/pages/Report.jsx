import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { formatDate, today as todayIso, cn } from "@/lib/utils";

/**
 * One report over the dates chosen: a table at the desk, rows on a phone, the
 * total under a rule, and the same figures as a spreadsheet file.
 */
const iso = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
function periods() {
  const t = new Date(todayIso());
  const y = t.getFullYear();
  const m = t.getMonth();
  const q = Math.floor(m / 3) * 3;
  return [
    { key: "month", label: "This month", from: iso(new Date(y, m, 1)), to: iso(t) },
    { key: "last", label: "Last month", from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) },
    { key: "quarter", label: "This quarter", from: iso(new Date(y, q, 1)), to: iso(t) },
    { key: "year", label: "This year", from: iso(new Date(y, 0, 1)), to: iso(t) },
  ];
}

export default function Report() {
  const { key } = useParams();
  const { companyId } = useCompany();
  const all = periods();
  const [p, setP] = useState(all[0]);
  const [from, setFrom] = useState(all[0].from);
  const [to, setTo] = useState(all[0].to);
  const range = p.key === "custom" ? { from, to } : p;
  const { data, error, isLoading } = useQuery({
    queryKey: ["report", companyId, key, range.from, range.to],
    queryFn: () => apiClient.get(`/reports/${key}?from=${range.from}&to=${range.to}`).then((r) => r.data),
    enabled: Boolean(companyId) && range.from <= range.to,
    placeholderData: (prev) => (prev?.key === key ? prev : undefined),
  });

  function download() {
    const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const lines = [data.columns.map((c) => cell(c.label)).join(","), ...data.rows.map((r) => data.columns.map((c) => cell(c.money ? String(r[c.key]).replace(/,/g, "") : r[c.key])).join(","))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `${key}-${data.from}-to-${data.to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  const cols = data?.columns || [];
  return (
    <div className="max-w-[1080px]">
      <Link to="/reports" className="inline-flex items-center gap-1.5 h-11 px-3 -ml-3 rounded-full text-[14px] text-[var(--ink-muted)] hover:text-[var(--ink)]">
        <ArrowLeft size={16} /> Reports
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mt-1 mb-5">
        <div>
          <h1 className="font-display text-[28px] font-semibold tracking-tight">{data?.title || " "}</h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1">{data ? `${data.about} ${formatDate(data.from)} to ${formatDate(data.to)}.` : ""}</p>
        </div>
        {data?.rows.length > 0 && (
          <Button variant="outline" onClick={download}>
            <Download size={15} /> Download
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div role="tablist" aria-label="Dates" className="flex flex-wrap gap-2">
          {[...all, { key: "custom", label: "Choose dates" }].map((x) => (
            <button key={x.key} type="button" role="tab" aria-selected={p.key === x.key} onClick={() => setP(x)} className={cn("h-10 px-3.5 sm:h-11 sm:px-4 rounded-full border text-[14px] whitespace-nowrap", p.key === x.key ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-semibold" : "bg-[var(--surface)] border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)]")}>
              {x.label}
            </button>
          ))}
        </div>
        {p.key === "custom" && (
          <span className="flex items-center gap-2">
            <input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 px-3 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[14px]" />
            <span className="text-[13px] text-[var(--ink-muted)]">to</span>
            <input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 px-3 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[14px]" />
          </span>
        )}
      </div>

      {error ? (
        <p className="text-[15px] text-[var(--ink-muted)]">{error.message}</p>
      ) : isLoading || !data ? (
        <Skeleton className="h-64 rounded-[20px]" />
      ) : !data.rows.length ? (
        <p className="rounded-[20px] bg-[var(--surface)] lift px-5 py-10 text-center text-[15px] text-[var(--ink-muted)]">Nothing in these dates.</p>
      ) : (
        <div className="rounded-[20px] bg-[var(--surface)] lift overflow-hidden" data-testid="report">
          {/* The desk reads a table; a phone reads each row as a card with its amount at the right. */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {cols.map((c) => (
                    <th key={c.key} className={cn("px-5 h-11 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)] whitespace-nowrap", c.money || c.num ? "text-right" : "text-left")}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    {cols.map((c) => (
                      <td key={c.key} className={cn("px-5 py-3", c.money || c.num ? "text-right tabular" : "", c === cols[0] && "font-medium")}>
                        {c.money ? <Money amount={r[c.key]} /> : c.date ? formatDate(r[c.key]) : r[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--ink)] font-semibold">
                  {cols.map((c, i) => (
                    <td key={c.key} className={cn("px-5 py-3.5", c.money || c.num ? "text-right tabular" : "")}>
                      {i === 0 ? "Total" : data.totals[c.key] !== undefined ? c.money ? <Money amount={data.totals[c.key]} /> : data.totals[c.key] : ""}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          <ul className="md:hidden divide-y divide-[var(--border)]">
            {data.rows.map((r, i) => {
              const amount = [...cols].reverse().find((c) => c.money);
              const rest = cols.slice(1).filter((c) => c !== amount && r[c.key] !== "" && r[c.key] !== null);
              return (
                <li key={i} className="px-5 py-3.5 flex items-start gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{cols[0].date ? formatDate(r[cols[0].key]) : r[cols[0].key]}</span>
                    <span className="block text-[13px] text-[var(--ink-muted)]">{rest.map((c) => `${c.label} ${c.date ? formatDate(r[c.key]) : r[c.key]}`).join(" · ")}</span>
                  </span>
                  {amount && <Money amount={r[amount.key]} className="text-[15px] font-semibold" />}
                </li>
              );
            })}
            <li className="px-5 py-3.5 flex justify-between border-t-2 border-[var(--ink)] font-semibold">
              <span>Total</span>
              <Money amount={data.totals[[...cols].reverse().find((c) => c.money)?.key]} />
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
