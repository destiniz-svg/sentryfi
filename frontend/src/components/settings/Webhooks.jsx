import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Send, Trash2, Webhook } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { formatDate } from "@/lib/utils";
import { FIELD } from "@/lib/shipments";
import { cn } from "@/lib/utils";

/**
 * Webhooks (backend services/webhooks.js): addresses told the moment an
 * invoice, a bill or money received goes into the books. Signed with a secret
 * shown once; the details are fetched with a key.
 */
const EVENT_TEXT = { "invoice.posted": "An invoice goes into the books", "bill.posted": "A bill goes into the books", "money.received": "Money comes in" };

export function Webhooks() {
  const { companyId, can } = useCompany();
  const qc = useQueryClient();
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState(["invoice.posted"]);
  const [made, setMade] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: ["webhooks", companyId], queryFn: () => apiClient.get("/webhooks").then((r) => r.data), enabled: Boolean(companyId) && can("manage_settings") });
  if (!can("manage_settings")) return null;

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await apiClient.post("/webhooks", { url: url.trim(), events });
      setMade(r.data);
      setUrl("");
      qc.invalidateQueries({ queryKey: ["webhooks", companyId] });
    } catch (err) {
      toast.error("Not added", err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding="lg" data-testid="webhooks">
      <CardTitle>Webhooks</CardTitle>
      <p className="text-[14px] text-[var(--ink-muted)] mt-1.5 leading-relaxed max-w-[68ch]">
        Tell your own software the moment something goes into the books. Sentryfi sends which record it was, its entry and its total, signed so you can check it came from us; your software reads the rest with a key.
      </p>

      <form onSubmit={add} className="mt-5 space-y-3">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-software.example/sentryfi" aria-label="Address" className={FIELD} />
        <div className="flex flex-wrap gap-2" role="group" aria-label="When">
          {(data?.events || Object.keys(EVENT_TEXT)).map((ev) => {
            const on = events.includes(ev);
            return (
              <button key={ev} type="button" aria-pressed={on} onClick={() => setEvents((x) => (on ? x.filter((y) => y !== ev) : [...x, ev]))} className={cn("h-10 px-3.5 rounded-full text-[13px] font-medium inline-flex items-center gap-1.5", on ? "bg-[var(--ink)] text-[var(--surface)]" : "bg-[var(--surface-2)] text-[var(--ink-muted)]")}>
                <Check size={13} className={on ? "" : "opacity-0"} aria-hidden="true" />
                {EVENT_TEXT[ev] || ev}
              </button>
            );
          })}
        </div>
        <Button type="submit" disabled={busy || !url.trim() || !events.length}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Webhook size={15} />} Add the webhook
        </Button>
      </form>

      {made && (
        <div className="mt-4 rounded-2xl bg-[var(--surface-2)] p-4 text-[13px]" data-testid="new-webhook">
          <p className="font-semibold text-[14px]">Its signing secret, shown once:</p>
          <pre className="mt-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 py-2 overflow-x-auto">{made.secret}</pre>
          <p className="text-[var(--ink-muted)] mt-2 leading-relaxed">
            Each delivery carries <code>Sentryfi-Signature: t=…,v1=…</code>. Compute HMAC-SHA256 of <code>t.body</code> with this secret and compare it with v1.
          </p>
        </div>
      )}

      {data?.webhooks?.length > 0 && (
        <ul className="mt-5 divide-y divide-[var(--border)]">
          {data.webhooks.map((w) => (
            <li key={w.id} className="py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium truncate">{w.url}</p>
                <p className="text-[12px] text-[var(--ink-muted)]">
                  {w.events.filter((e) => e !== "ping").map((e) => EVENT_TEXT[e] || e).join(" · ")}
                  {w.last?.at && ` · last sent ${formatDate(w.last.at)}: ${w.last.error ? w.last.error : "delivered"}`}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={async () => {
                  await apiClient.post(`/webhooks/${w.id}/test`);
                  toast.success("Test sent", "A ping event is on its way.");
                  setTimeout(() => qc.invalidateQueries({ queryKey: ["webhooks", companyId] }), 2500);
                }}
                aria-label={`Send a test to ${w.url}`}
              >
                <Send size={14} /> Test
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  await apiClient.delete(`/webhooks/${w.id}`);
                  qc.invalidateQueries({ queryKey: ["webhooks", companyId] });
                }}
                aria-label={`Turn off ${w.url}`}
              >
                <Trash2 size={14} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
