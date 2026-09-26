import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { PhoneShell } from "@/components/phone/PhoneShell";
import { RecordBill } from "@/components/bills/RecordBill";
import { apiClient } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import { useSendOrKeep } from "@/context/OutboxContext";
import { useToast } from "@/context/UIContext";
import { formatDate } from "@/lib/utils";

/**
 * One count. While it is being counted it is blind: the counter sees each item
 * and its unit and says how many are there, and nobody sees what the books say.
 * Once submitted, those who read the books see each difference and its value;
 * one beyond the tolerance waits for someone other than the counter.
 * Field staff count on their board, with nothing about money anywhere.
 */

const INPUT =
  "w-28 h-12 px-3 text-right rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[17px] text-[var(--ink)] tabular outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15";

export default function Count() {
  const { id } = useParams();
  const { companyId, can } = useCompany();
  const { user } = useAuth();
  const [snapping, setSnapping] = useState(false);
  const { data: c, isLoading } = useQuery({
    queryKey: ["stock", companyId, "count", id],
    queryFn: () => apiClient.get(`/counts/${id}`).then((r) => r.data),
    enabled: Boolean(companyId),
  });
  const mine = c && c.counterId === user?.id;
  const body = isLoading || !c ? <Skeleton className="h-40 rounded-2xl" /> : c.status === "counting" && mine ? <Counting c={c} /> : <Review c={c} canDecide={can("record") && !mine} reads={can("read")} />;

  // Field staff count on their board.
  if (!can("read")) {
    const done = c ? c.lines.filter((l) => l.counted !== null).length : 0;
    return (
      <PhoneShell heading={c ? c.kindName : "Count"} unit="" figure={c ? `${done}/${c.lines.length}` : "…"} position={c ? c.place : ""} sync="" onSnap={() => setSnapping(true)}>
        <div className="px-5 py-4">{body}</div>
        <RecordBill open={snapping} onClose={() => setSnapping(false)} />
      </PhoneShell>
    );
  }
  return (
    <div>
      <PageHeader
        title={c ? `${c.kindName} · ${c.place}` : "Count"}
        description={c ? `Counted by ${c.counter}, started ${formatDate(c.createdAt)}${c.note ? ` · ${c.note}` : ""}` : ""}
        actions={
          <Link to="/counts" className="text-[14px] underline">
            All counts
          </Link>
        }
      />
      {body}
    </div>
  );
}

/** The counter's screen: item, unit, how many. Kept on the phone without signal. */
function Counting({ c }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const [values, setValues] = useState(() => Object.fromEntries(c.lines.map((l) => [l.itemId, l.counted ?? ""])));
  const [saved, setSaved] = useState(() => Object.fromEntries(c.lines.map((l) => [l.itemId, l.counted !== null])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = useSendOrKeep((b) => ({ url: `/counts/${c.id}/lines/${b.itemId}`, body: { counted: b.counted }, label: `Counted ${b.counted} of ${b.name}` }));
  const done = Object.values(saved).filter(Boolean).length;

  async function save(l) {
    const v = String(values[l.itemId] ?? "").trim();
    if (v === "" || (saved[l.itemId] && v === String(l.counted ?? ""))) return;
    setErr("");
    try {
      await go.mutateAsync({ itemId: l.itemId, counted: v, name: l.name });
      setSaved((s) => ({ ...s, [l.itemId]: true }));
    } catch (ex) {
      setErr(`${l.name}: ${ex.message}`);
    }
  }

  async function submit() {
    setErr("");
    setBusy(true);
    try {
      for (const l of c.lines) await save(l);
      const r = await apiClient.post(`/counts/${c.id}/submit`);
      toast.success(r.data.status === "posted" ? "Count submitted and in the books" : "Count submitted", r.data.status === "posted" ? "Every difference was small enough to post at once." : `${r.data.over} ${r.data.over === 1 ? "difference waits" : "differences wait"} for someone to approve.`);
      qc.invalidateQueries({ queryKey: ["stock", companyId] });
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="counting">
      <p className="text-[14px] text-[var(--ink-muted)] mb-3">
        Count what is really there and enter it. The books' figure stays hidden until you submit. {done} of {c.lines.length} counted.
      </p>
      <Card padding="none" className="overflow-hidden">
        <div className="divide-y divide-[var(--border)]">
          {c.lines.map((l) => (
            <label key={l.itemId} className="flex items-center gap-3 px-4 py-3" data-testid="count-line">
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-medium break-words">{l.name}</span>
                <span className="block text-[13px] text-[var(--ink-muted)]">in {l.unit}</span>
              </span>
              {saved[l.itemId] && <Check size={18} className="text-[var(--success)] shrink-0" aria-label="Saved" />}
              <input
                aria-label={`How many ${l.name}, in ${l.unit}`}
                inputMode="decimal"
                value={values[l.itemId]}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [l.itemId]: e.target.value }));
                  setSaved((s) => ({ ...s, [l.itemId]: false }));
                }}
                onBlur={() => save(l)}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className={INPUT}
              />
            </label>
          ))}
        </div>
      </Card>
      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-3">
          {err}
        </p>
      )}
      <div className="flex justify-end mt-4">
        <Button variant="accent" onClick={submit} disabled={busy || !Object.values(values).some((v) => String(v).trim() !== "")}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          Submit the count
        </Button>
      </div>
    </div>
  );
}

/** After submitting: the differences, for those who read the books; the decision, for someone other than the counter. */
function Review({ c, canDecide, reads }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  async function act(what, done) {
    setErr("");
    setBusy(what);
    try {
      await apiClient.post(`/counts/${c.id}/${what}`);
      toast.success(done);
      qc.invalidateQueries({ queryKey: ["stock", companyId] });
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy("");
    }
  }

  if (!reads || c.blind) {
    const said = { counting: "Being counted. What the books say stays hidden until it is submitted.", submitted: "Sent. Someone will look at it.", posted: "Sent and in the books. Thank you.", cancelled: "This count was cancelled." }[c.status];
    return <p className="text-[16px]" data-testid="count-state">{said}</p>;
  }
  const over = c.lines.filter((l) => l.over).length;
  return (
    <div data-testid="count-review">
      {c.status === "submitted" && (
        <p className="rounded-2xl px-4 py-3 mb-4 bg-[var(--warning)]/12 text-[14px] font-medium">
          {over === 1 ? "One difference is" : `${over} differences are`} beyond MVR {c.tolerance} and {over === 1 ? "waits" : "wait"} for someone other than {c.counter} to approve.
        </p>
      )}
      <Card padding="none" className="overflow-hidden">
        <div className="hidden md:grid grid-cols-[minmax(0,1fr)_100px_100px_110px_130px] gap-3 px-4 py-2.5 border-b border-[var(--border)] text-[12px] font-medium text-[var(--ink-muted)]">
          <span>Item</span>
          <span className="text-right">Books said</span>
          <span className="text-right">Counted</span>
          <span className="text-right">Difference</span>
          <span className="text-right">Worth</span>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {c.lines.map((l) => (
            <div key={l.itemId} className="grid grid-cols-2 md:grid-cols-[minmax(0,1fr)_100px_100px_110px_130px] gap-x-3 gap-y-1 px-4 py-3 items-center" data-testid="review-line">
              <span className="col-span-2 md:col-span-1 min-w-0">
                <span className="block text-[15px] font-medium break-words">{l.name}</span>
                {l.over && <span className="inline-block mt-1 rounded-full bg-[var(--warning)]/15 text-[var(--warning)] text-[11px] font-semibold px-2 py-0.5">Beyond tolerance</span>}
                {l.reason && <span className="block text-[13px] text-[var(--ink-muted)]">{l.reason}</span>}
              </span>
              {l.counted === null ? (
                <span className="col-span-2 md:col-span-4 text-[13px] text-[var(--ink-muted)] md:text-right">Not counted</span>
              ) : (
                <>
                  <span className="text-[14px] md:text-right tabular">
                    <span className="md:hidden text-[12px] text-[var(--ink-muted)] mr-1.5">books</span>
                    {l.book} {l.unit}
                  </span>
                  <span className="text-[14px] text-right tabular">
                    <span className="md:hidden text-[12px] text-[var(--ink-muted)] mr-1.5">counted</span>
                    {l.counted}
                  </span>
                  <span className={`text-[14px] md:text-right tabular font-semibold ${l.difference.startsWith("-") ? "text-[var(--danger)]" : ""}`}>{l.difference === "0" ? "Agrees" : l.difference}</span>
                  <span className="text-[14px] text-right tabular">{l.value && l.value !== "0.00" ? <Money amount={l.value} /> : "—"}</span>
                </>
              )}
            </div>
          ))}
        </div>
      </Card>
      {c.status === "posted" && <p className="text-[13px] text-[var(--ink-muted)] mt-3">In the books{c.decidedBy ? `, approved by ${c.decidedBy}` : ""}. Differences went to Stock counted short or over at average cost.</p>}
      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-3">
          {err}
        </p>
      )}
      {(c.status === "submitted" || c.status === "counting") && canDecide && (
        <div className="flex flex-wrap justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={() => act("cancel", "Count cancelled")} disabled={Boolean(busy)}>
            Cancel the count
          </Button>
          {c.status === "submitted" && (
            <>
              <Button variant="outline" onClick={() => act("reopen", `Sent back to ${c.counter}`)} disabled={Boolean(busy)}>
                Count again
              </Button>
              <Button variant="accent" onClick={() => act("approve", "Approved and in the books")} disabled={Boolean(busy)}>
                {busy === "approve" && <Loader2 size={14} className="animate-spin" />}
                Approve and post
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
