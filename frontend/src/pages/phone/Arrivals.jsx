import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PhoneShell } from "@/components/phone/PhoneShell";
import { RecordBill } from "@/components/bills/RecordBill";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useSendOrKeep } from "@/context/OutboxContext";
import { useToast } from "@/context/UIContext";
import { formatDate, today } from "@/lib/utils";

/**
 * Goods on the way, for someone at the other end who does not read the books:
 * procurement, or site staff on a jetty. Quantities only. All of it came is the
 * usual answer and one tap; fewer asks why. Kept on the phone without signal.
 */

const FIELD =
  "w-full h-[52px] px-4 bg-[var(--surface)] text-[var(--ink)] text-[17px] border-2 border-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)]";
const n = (s) => Number(String(s ?? "").replace(/,/g, ""));

export default function Arrivals() {
  const { companyId } = useCompany();
  const [snapping, setSnapping] = useState(false);
  const [open, setOpen] = useState(null); // the delivery being said
  const { data: coming = [], isLoading } = useQuery({
    queryKey: ["stock", companyId, "on-the-way"],
    queryFn: () => apiClient.get("/stock/on-the-way").then((r) => r.data.onTheWay),
    enabled: Boolean(companyId),
  });

  return (
    <PhoneShell heading="On the way" unit="" figure={isLoading ? "…" : String(coming.length)} position="Say what came when it comes" sync="" onSnap={() => setSnapping(true)}>
      {!isLoading && coming.length === 0 && (
        <div className="px-5 py-6">
          <p className="text-[17px] font-semibold">Nothing on the way</p>
          <p className="text-[15px] text-[var(--ink-muted)] mt-1">When the office sends stock, it shows here for you to say it arrived.</p>
        </div>
      )}
      {coming.map((t) => (
        <div key={t.id} className="px-5 py-4 border-b border-[var(--border)]" data-testid="on-the-way-card">
          <p className="text-[18px] font-semibold leading-snug">
            <span className="tabular">{t.quantity}</span> {t.unit} {t.item}
          </p>
          <p className="text-[15px] text-[var(--ink-muted)] mt-0.5">
            {t.from} to <span className="text-[var(--ink)]">{t.to}</span>
          </p>
          <p className="text-[13px] text-[var(--ink-muted)] mt-0.5">
            Sent {formatDate(t.sentOn)}
            {t.sentBy ? ` by ${t.sentBy}` : ""}
            {t.note ? ` · ${t.note}` : ""}
          </p>
          {open === t.id ? (
            <Say sent={t} onDone={() => setOpen(null)} />
          ) : (
            <button type="button" className="phone-do mt-3" onClick={() => setOpen(t.id)}>
              It arrived
            </button>
          )}
        </div>
      ))}
      <RecordBill open={snapping} onClose={() => setSnapping(false)} />
    </PhoneShell>
  );
}

function Say({ sent, onDone }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const [received, setReceived] = useState(sent.quantity);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const go = useSendOrKeep((body) => ({ url: `/stock/transfers/${sent.id}/arrive`, body, label: `${body.received} ${sent.unit} of ${sent.item} arrived at ${sent.to}` }));
  const missing = n(sent.quantity) - n(received);
  const short = received.trim() !== "" && missing > 0;
  const over = missing < 0;

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      const on = today() < sent.sentOn ? sent.sentOn : today();
      const r = await go.mutateAsync({ received, on, reason: short ? reason : null });
      if (r.queued) toast.success("Kept on this phone", "It is marked as arrived by itself when there is signal.");
      else toast.success(`${r.received} ${sent.unit} of ${sent.item} at ${r.to}`, n(r.short) > 0 ? `${r.short} short, with your reason.` : "All of it came.");
      qc.invalidateQueries({ queryKey: ["stock", companyId] });
      onDone();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-3">
      <label className="block">
        <span className="text-sm font-medium block mb-1.5">How many came, in {sent.unit}</span>
        <input id="arrive-qty" value={received} onChange={(e) => setReceived(e.target.value)} inputMode="decimal" className={`${FIELD} tabular`} />
      </label>
      {over && <p className="text-[14px]">Only {sent.quantity} were sent. Tell the office about the extra.</p>}
      {short && (
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">
            Why {missing} {sent.unit} {missing === 1 ? "is" : "are"} short
          </span>
          <input id="arrive-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="One bag split on the jetty" className={FIELD} autoFocus />
        </label>
      )}
      {err && (
        <p role="alert" className="text-[13px]" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      )}
      <button type="submit" className="phone-do" disabled={go.isPending || received.trim() === "" || over || (short && reason.trim().length < 3)}>
        {go.isPending ? "Saving" : short ? "Record what came" : "All of it came"}
      </button>
      <button type="button" className="text-[15px] underline self-start min-h-11" onClick={onDone}>
        Not yet
      </button>
    </form>
  );
}
