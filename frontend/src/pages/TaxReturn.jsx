import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { gstApi } from "@/api/gst";
import { apiClient } from "@/api/client";
import { Money } from "@/components/ui/Money";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";

/**
 * The GST return, ready before the deadline.
 *
 * Open it any day: what the return says so far, how long is left, what would
 * make it wrong if it were filed now, and what is not in the books yet. The
 * figures are keyed into MIRAconnect by hand; the two statements are uploaded
 * as they are. Nothing is filed from here, because MIRA has no filing API.
 */

const niceDate = (iso) =>
  new Date(String(iso).slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function TaxReturn() {
  const { companyId, can, company } = useCompany();
  // The country's words (backend ledger/tax.js): GST, MIRA and MIRAconnect here; VAT, the FTA and EmaraTax in the UAE.
  const w = company?.tax || { tax: "GST", authority: "MIRA", portal: "MIRAconnect", statements: true };
  const toast = useToast();
  const queryClient = useQueryClient();
  const [key, setKey] = useState("current");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState("");

  const { data: r, isLoading } = useQuery({
    queryKey: ["gst", companyId, key],
    queryFn: () => gstApi.get(key),
    enabled: Boolean(companyId),
  });
  const filed = useMutation({ mutationFn: () => gstApi.markFiled(r.period.key, reference.trim() || null) });

  if (isLoading || !r) return <Skeleton className="h-64 rounded-2xl" />;

  const p = r.period;
  const left = p.daysLeft;
  const clock =
    r.filed ? `Filed ${niceDate(r.filed.at)}${r.filed.who ? ` by ${r.filed.who}` : ""}`
    : !p.over ? `The period is still running. Due ${niceDate(p.due)}`
    : left < 0 ? `${-left} ${left === -1 ? "day" : "days"} late. It was due ${niceDate(p.due)}`
    : left === 0 ? "Due today"
    : `${left} ${left === 1 ? "day" : "days"} left. Due ${niceDate(p.due)}`;

  async function download(which) {
    setBusy(which);
    try {
      await (which === "input" ? gstApi.inputStatement(p.key) : gstApi.outputStatement(p.key));
    } catch (ex) {
      toast.error("Not downloaded", ex.message);
    } finally {
      setBusy("");
    }
  }

  async function markFiled() {
    try {
      await filed.mutateAsync();
      queryClient.invalidateQueries({ queryKey: ["gst", companyId] });
      queryClient.invalidateQueries({ queryKey: ["attention", companyId] });
      toast.success(`${p.label} marked as filed`, "If the books change for this period now, the return will say so.");
    } catch (ex) {
      toast.error("Not marked", ex.message);
    }
  }

  return (
    <div>
      <PageHeader title={`${w.tax} return`} description={`What you owe so far, and everything ${w.portal || w.authority} asks for.`} />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          id="gst-period"
          aria-label="Period"
          value={p.key}
          onChange={(e) => setKey(e.target.value)}
          className="h-11 px-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px]"
        >
          {r.periods.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <span
          data-testid="gst-clock"
          className={`text-[14px] font-medium ${!r.filed && p.over && left < 0 ? "text-[var(--danger)]" : ""}`}
        >
          {clock}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card padding="none" className="overflow-hidden self-start">
          <div className="px-5 pt-4 pb-2 text-[15px] font-semibold">
            {p.label}: {niceDate(p.from)} to {niceDate(p.to)}
          </div>
          <dl data-testid="gst-figures">
            {r.figures.map((f) => (
              <div
                key={f.label}
                className={`flex justify-between gap-4 px-5 py-2.5 border-t border-[var(--border)] text-[14px] ${f.strong ? "font-semibold" : ""} ${f.total ? "text-[17px]" : ""}`}
              >
                <dt>{f.label}</dt>
                <dd className="tabular">{f.amount}</dd>
              </div>
            ))}
          </dl>
          <p className="px-5 py-3 text-[13px] text-[var(--ink-muted)] border-t border-[var(--border)]">
            From {r.counts.invoices} {r.counts.invoices === 1 ? "invoice or credit note" : "invoices and credit notes"} and {r.counts.bills}{" "}
            {r.counts.bills === 1 ? "bill" : "bills"} dated in the period, checked against the books. {w.portal ? `Key these into the return on ${w.portal}.` : "Key these into the return."}
          </p>
        </Card>

        <div className="space-y-4">
          <Card padding="lg">
            <div className="text-[15px] font-semibold mb-2">
              {r.problems.length ? "What would make it wrong" : "Nothing would make it wrong"}
            </div>
            {r.problems.length === 0 ? (
              <p className="text-[14px] text-[var(--ink-muted)]">The documents and the books agree, and every line has what the statements need.</p>
            ) : (
              <ul className="space-y-3" data-testid="gst-problems">
                {r.problems.map((x, i) => (
                  <li key={i} className="text-[14px]">
                    <Link to={x.href} className="font-medium text-[var(--danger)] underline underline-offset-2">
                      {x.what}
                    </Link>
                    <p className="text-[13px] text-[var(--ink-muted)] mt-0.5">{x.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {r.unfinished.length > 0 && (
            <Card padding="lg">
              <div className="text-[15px] font-semibold mb-2">Not in the books yet</div>
              <p className="text-[13px] text-[var(--ink-muted)] mb-2">These may belong in this period. Look before filing.</p>
              <ul className="space-y-1.5 text-[14px]">
                {r.unfinished.map((u) => (
                  <li key={u.what}>
                    <Link to={u.href} className="underline underline-offset-2">
                      {u.what}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {w.statements && (
          <Card padding="lg">
            <div className="text-[15px] font-semibold mb-1">The two statements</div>
            <p className="text-[13px] text-[var(--ink-muted)] mb-3">
              In MIRA&rsquo;s own layout. Upload them to the statement portal as they are.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy !== ""} onClick={() => download("input")}>
                {busy === "input" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Input Tax Statement
              </Button>
              <Button variant="outline" disabled={busy !== ""} onClick={() => download("output")}>
                {busy === "output" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Output Tax Statement
              </Button>
            </div>
          </Card>
          )}

          {can("close") && p.over && !r.filed && (
            <Card padding="lg">
              <div className="text-[15px] font-semibold mb-1">Filed it?</div>
              <p className="text-[13px] text-[var(--ink-muted)] mb-3">
                Say so here and the countdown stops. The figures you filed are kept, so a later change to this period shows up.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  id="gst-reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={`${w.portal || "Filing"} reference, if any`}
                  className="h-11 px-4 flex-1 min-w-[200px] rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px]"
                />
                <Button variant="accent" disabled={filed.isPending} onClick={markFiled}>
                  {filed.isPending && <Loader2 size={14} className="animate-spin" />}
                  {p.label} is filed
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      <Withholding />
    </div>
  );
}

const monthsBack = (n) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return { key: d.toLocaleDateString("en-CA").slice(0, 7), label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
  });

const SELECT = "h-11 px-3 max-w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[14px]";

/**
 * Withholding tax on payments to non-residents: which suppliers it applies to,
 * and the month's payments for the return. Where the country has no such tax
 * in Sentryfi, nothing shows.
 */
function Withholding() {
  const { companyId, can } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const [month, setMonth] = useState(monthsBack(1)[0].key);
  const [adding, setAdding] = useState({ supplier: "", category: "" });
  const { data } = useQuery({
    queryKey: ["withholding", companyId, month],
    queryFn: () => apiClient.get("/tax/withholding", { params: { month } }).then((r) => r.data),
    enabled: Boolean(companyId),
  });
  if (!data?.available) return null;
  const m = data.month;
  const marked = data.suppliers.filter((x) => x.category);
  const others = data.suppliers.filter((x) => !x.category);
  const manage = can("manage_settings");

  async function mark(id, category) {
    try {
      await apiClient.put(`/tax/withholding/suppliers/${id}`, { category: category || null });
      qc.invalidateQueries({ queryKey: ["withholding", companyId] });
      setAdding({ supplier: "", category: "" });
    } catch (ex) {
      toast.error("Not changed", ex.message);
    }
  }

  function csv() {
    const cell = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const rows = [
      ["Date paid", "Paid to", "TIN", "Kind of payment", "Rate", "Amount paid", "Tax withheld", "Bill"],
      ...m.payments.map((p) => [p.paidOn, p.payee, p.tin, p.categoryLabel, p.ratePct + "%", p.gross, p.withheld, p.billNo || ""]),
    ];
    const blob = new Blob(["\ufeff" + rows.map((r) => r.map(cell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `withholding-tax-${m.key}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const kinds = data.categories.map((c) => (
    <option key={c.code} value={c.code}>
      {c.ratePct}%: {c.label}
    </option>
  ));

  return (
    <section className="mt-8" aria-labelledby="nwt-title">
      <h2 id="nwt-title" className="text-[20px] font-semibold tracking-[-0.01em]">Withholding tax on payments abroad</h2>
      <p className="text-[14px] text-[var(--ink-muted)] mt-1 max-w-[75ch]">
        Paying a non-resident for rent, royalties, interest, services or work done here, the tax is kept back from what they are paid and paid over with the {m.form} by the 15th of the next month. Mark who it applies to; payments do the rest.
      </p>
      <div className="grid gap-4 mt-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
        <Card padding="lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} className={SELECT}>
              {monthsBack(12).map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
            {m.payments.length > 0 && (
              <Button variant="outline" onClick={csv}>
                <Download size={15} /> CSV
              </Button>
            )}
          </div>
          <div className="mt-4">
            <div className="text-[13px] text-[var(--ink-muted)]">
              To pay for {m.label}, due {m.dueLabel}
            </div>
            <div className="text-[26px] font-semibold tabular mt-1" data-testid="nwt-total">
              <Money amount={m.total} />
            </div>
          </div>
          {m.payments.length === 0 ? (
            <p className="text-[14px] text-[var(--ink-muted)] mt-3">Nothing was kept back this month, so there is no {m.form} to file for it.</p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--border)] text-[14px]">
              {m.payments.map((p, i) => (
                <li key={i} className="py-2.5 flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-medium truncate">{p.payee}</span>
                    <span className="block text-[12px] text-[var(--ink-muted)]">
                      {p.paidOn} · {p.ratePct}% of <Money amount={p.gross} />
                    </span>
                  </span>
                  <span className="tabular font-semibold">
                    <Money amount={p.withheld} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="lg">
          <div className="text-[15px] font-semibold">Non-resident suppliers</div>
          {marked.length === 0 ? (
            <p className="text-[14px] text-[var(--ink-muted)] mt-1">None marked yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {marked.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 min-w-[8rem] text-[14px] font-medium truncate">{x.name}</span>
                  <select aria-label={`Kind of payment to ${x.name}`} disabled={!manage} value={x.category} onChange={(e) => mark(x.id, e.target.value)} className={SELECT}>
                    {kinds}
                  </select>
                  {manage && (
                    <button type="button" onClick={() => mark(x.id, null)} className="h-11 px-2 text-[13px] text-[var(--ink-muted)] hover:text-[var(--danger)]">
                      Not abroad
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {manage && others.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[var(--border)] grid gap-2">
              <select aria-label="Supplier" value={adding.supplier} onChange={(e) => setAdding({ ...adding, supplier: e.target.value })} className={SELECT}>
                <option value="">Mark a supplier as non-resident…</option>
                {others.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
              <select aria-label="Kind of payment" value={adding.category} onChange={(e) => setAdding({ ...adding, category: e.target.value })} className={SELECT}>
                <option value="">What is paid to them?</option>
                {kinds}
              </select>
              <Button variant="outline" disabled={!adding.supplier || !adding.category} onClick={() => mark(adding.supplier, adding.category)}>
                Mark as non-resident
              </Button>
            </div>
          )}
          <p className="text-[12px] text-[var(--ink-muted)] mt-4">Rates and kinds of payment as MIRA lists them; your accountant confirms them before the first return.</p>
        </Card>
      </div>
    </section>
  );
}
