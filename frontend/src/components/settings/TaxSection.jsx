import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { taxApi } from "@/api/tax";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";

/**
 * The tax pack the books are kept under, the rates in force today, and a rate
 * change from a date.
 *
 * A change is a new row, never an edit, and it only reaches documents dated on
 * or after it: every bill and invoice keeps the rate it was computed at.
 */

const pct = (bp) => (bp === null || bp === undefined ? "Not set" : `${bp / 100}%`);
const niceDate = (iso) =>
  iso ? new Date(String(iso).slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";

export function TaxSection() {
  const { companyId, can } = useCompany();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["tax", companyId, "settings"], queryFn: () => taxApi.overview() });

  const [rate, setRate] = useState("");
  const [percent, setPercent] = useState("");
  const [from, setFrom] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const save = useMutation({ mutationFn: taxApi.setRate });

  if (isLoading || !data) return <Card padding="lg" className="max-w-2xl">Reading the tax pack.</Card>;

  const code = rate || data.defaultRate;
  const bp = Math.round(Number(String(percent).replace(",", ".")) * 100);
  const blocker =
    percent.trim() === "" || !Number.isFinite(bp) || bp < 0 || bp > 10000
      ? "Give the new rate"
      : !from
        ? "From which date?"
        : reason.trim().length < 3
          ? "Say why"
          : null;

  async function onSubmit(e) {
    e.preventDefault();
    if (blocker) return setErr(blocker);
    setErr("");
    try {
      await save.mutateAsync({ rate: code, bp, from, reason: reason.trim() });
      queryClient.invalidateQueries({ queryKey: ["tax", companyId] });
      toast.success(`${pct(bp)} from ${niceDate(from)}`, "Bills and invoices dated before it keep the rate they had.");
      setPercent("");
      setFrom("");
      setReason("");
    } catch (ex) {
      setErr(ex.message || "That could not be saved.");
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card padding="lg">
        <CardHeader>
          <div>
            <CardTitle className="text-base">{data.pack.name} tax pack</CardTitle>
            <CardDescription className="mt-1">
              {data.pack.filing.authority
                ? `Returns to ${data.pack.filing.authority}, due by day ${data.pack.filing.dueDay} of the month after the period.`
                : "No filing forms. The books are kept correctly; filing is up to you."}
            </CardDescription>
          </div>
        </CardHeader>
        <ul className="divide-y divide-[var(--border)]" data-testid="tax-rates">
          {data.rates.map((r) => (
            <li key={r.code} className="flex items-baseline justify-between gap-4 py-3">
              <span className="text-[14px] font-medium">{r.label}</span>
              <span className="text-[13px] text-[var(--ink-muted)]">
                {r.from ? `since ${niceDate(r.from)}${r.source === "company" ? ", set by you" : ""}` : "no rate yet"}
              </span>
              <span className="tabular text-[16px] font-semibold">{pct(r.bp)}</span>
            </li>
          ))}
        </ul>
      </Card>

      {can("manage_settings") && (
        <Card padding="lg">
          <CardHeader>
            <div>
              <CardTitle className="text-base">Change a rate from a date</CardTitle>
              <CardDescription className="mt-1">
                Only for documents dated on or after it. Nothing already recorded changes.
              </CardDescription>
            </div>
          </CardHeader>
          <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.rates.length > 1 && (
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium block mb-1.5">Which rate</span>
                <select
                  id="tax-rate-code"
                  value={code}
                  onChange={(e) => setRate(e.target.value)}
                  className="w-full h-11 px-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px]"
                >
                  {data.rates.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block">
              <span className="text-sm font-medium block mb-1.5">New rate, %</span>
              <Input id="tax-rate-percent" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} className="tabular" placeholder="8" />
            </label>
            <label className="block">
              <span className="text-sm font-medium block mb-1.5">From</span>
              <Input id="tax-rate-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="tabular" />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium block mb-1.5">Why</span>
              <Input id="tax-rate-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Amendment to the GST Act" />
            </label>
            {err && (
              <p role="alert" className="sm:col-span-2 text-[13px] text-[var(--danger)]">
                {err}
              </p>
            )}
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" variant={blocker ? "outline" : "accent"} disabled={save.isPending}>
                {save.isPending && <Loader2 size={14} className="animate-spin" />}
                {blocker || `${pct(bp)} from ${niceDate(from)}`}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {data.changes.length > 0 && (
        <Card padding="lg">
          <CardTitle className="text-base mb-3">Rates you have set</CardTitle>
          <ul className="divide-y divide-[var(--border)] text-[14px]">
            {data.changes.map((c, i) => (
              <li key={i} className="py-2.5 flex flex-wrap gap-x-4">
                <span className="tabular font-medium">{pct(c.rate_bp)}</span>
                <span>from {niceDate(c.from)}</span>
                {c.reason && <span className="text-[var(--ink-muted)]">{c.reason}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
