import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { formatDate } from "@/lib/utils";

/**
 * Emails to customers that go by themselves: the month's statement, and
 * reminders when an invoice is late. Each carries a private link to the
 * customer's page. Off until turned on; each goes once.
 */
export function CustomerMailSection() {
  const { companyId, can } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["customer-mail", companyId], queryFn: () => apiClient.get("/customer-mail").then((r) => r.data), enabled: Boolean(companyId) });
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    if (data && !f) setF({ ...data.settings, days: data.settings.reminderDays.join(", ") });
  }, [data, f]);
  if (isLoading || !f) return <Skeleton className="h-64 rounded-2xl" />;

  async function save(next) {
    setBusy("save");
    try {
      const body = { monthlyStatements: next.monthlyStatements, reminders: next.reminders, reminderDays: String(next.days).split(/[,\s]+/).filter(Boolean).map(Number) };
      await apiClient.put("/customer-mail", body);
      qc.invalidateQueries({ queryKey: ["customer-mail", companyId] });
      toast.success("Saved", next.monthlyStatements || next.reminders ? "They go by themselves from the next hour." : "Nothing goes by itself.");
    } catch (ex) {
      toast.error("Not saved", ex.message);
    } finally {
      setBusy(null);
    }
  }
  async function sendNow() {
    setBusy("send");
    try {
      const r = await apiClient.post("/customer-mail/send");
      qc.invalidateQueries({ queryKey: ["customer-mail", companyId] });
      toast.success(r.data.sent ? `${r.data.sent} sent` : "Nothing due today", r.data.sent ? "Each to the customer's email, with a link to their page." : "Everything due has gone already.");
    } catch (ex) {
      toast.error("Not sent", ex.message);
    } finally {
      setBusy(null);
    }
  }
  const manage = can("manage_settings");
  const toggle = (k) => {
    const next = { ...f, [k]: !f[k] };
    setF(next);
    save(next);
  };
  const Switch = ({ k, title, line }) => (
    <label className="flex items-start gap-3 py-3 cursor-pointer">
      <input type="checkbox" checked={f[k]} disabled={!manage || busy === "save"} onChange={() => toggle(k)} className="h-5 w-5 mt-0.5 accent-[var(--ink)]" />
      <span>
        <span className="block text-[15px] font-semibold">{title}</span>
        <span className="block text-[13px] text-[var(--ink-muted)] mt-0.5">{line}</span>
      </span>
    </label>
  );
  const waiting = data.due.statements.length + data.due.reminders.length;

  return (
    <div className="space-y-4">
      <Card padding="lg">
        <h2 className="text-[16px] font-semibold">Emails that go by themselves</h2>
        <p className="text-[14px] text-[var(--ink-muted)] mt-1 max-w-prose">To each customer's email address, from your company, with replies to you, and a private link to their page with every invoice and how to pay.</p>
        <div className="mt-2 divide-y divide-[var(--border)]">
          {Switch({ k: "monthlyStatements", title: "The month's statement", line: "In the first days of each month, to every customer who owes you something." })}
          {Switch({ k: "reminders", title: "Reminders when an invoice is late", line: "Once on each of these days after the due date. A reminder day missed is not sent late." })}
        </div>
        {f.reminders && (
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-[13px] text-[var(--ink-muted)]">Days after the due date</span>
            <input aria-label="Reminder days" value={f.days} disabled={!manage} onChange={(e) => setF({ ...f, days: e.target.value })} className="h-10 px-3 w-36 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[14px] tabular" />
            {manage && (
              <Button variant="outline" size="sm" onClick={() => save(f)} disabled={busy === "save"}>
                Save days
              </Button>
            )}
          </div>
        )}
        {data.noEmail > 0 && <p className="text-[13px] text-[var(--warning)] mt-3">{data.noEmail} {data.noEmail === 1 ? "customer has" : "customers have"} no email address, so nothing goes to them.</p>}
      </Card>

      <Card padding="lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold">{waiting ? `${waiting} due to go` : "Nothing due to go"}</h2>
            <p className="text-[13px] text-[var(--ink-muted)] mt-0.5">They go on the hour; send them now if you would rather.</p>
          </div>
          {can("record") && (
            <Button variant="outline" onClick={sendNow} disabled={busy === "send" || !waiting}>
              {busy === "send" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send now
            </Button>
          )}
        </div>
        {(data.due.statements.length > 0 || data.due.reminders.length > 0) && (
          <ul className="mt-3 divide-y divide-[var(--border)] text-[14px]">
            {data.due.statements.map((s) => (
              <li key={s.key} className="py-2 flex justify-between gap-3"><span>Statement to {s.name}</span><span className="text-[var(--ink-muted)] tabular">{s.owed} owed</span></li>
            ))}
            {data.due.reminders.map((r) => (
              <li key={r.key} className="py-2 flex justify-between gap-3"><span>Reminder to {r.name} for {r.number}</span><span className="text-[var(--ink-muted)] tabular">{r.daysLate} days late</span></li>
            ))}
          </ul>
        )}
        {data.recent.length > 0 && (
          <>
            <h3 className="text-[13px] font-medium text-[var(--ink-muted)] mt-5">Sent</h3>
            <ul className="mt-1 divide-y divide-[var(--border)] text-[14px]">
              {data.recent.map((r, i) => (
                <li key={i} className="py-2 flex justify-between gap-3">
                  <span>{r.kind === "statement" ? `Statement to ${r.customer}` : `Reminder for ${r.invoiceNo} to ${r.customer}`}</span>
                  <span className="text-[var(--ink-muted)]">{formatDate(r.at)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
