import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { gstApi } from "@/api/gst";
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
    </div>
  );
}
