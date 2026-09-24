import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, FileText } from "lucide-react";
import { apiClient } from "@/api/client";
import { billsApi } from "@/api/bills";
import { useBillMutations } from "@/hooks/useBills";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { Badge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * One bill, opened from Money on a phone or from Bills at the desk: who it is from, what it comes to
 * and how its GST was quoted, what is paid and what is still owed, its lines,
 * the photograph, and the entry it became. Waiting bills can be put in the
 * books from here; everything else a bill can have done to it stays on Bills.
 */

const STATUS = {
  draft: { tone: "neutral", label: "Not in the books" },
  awaiting_review: { tone: "accent", label: "Needs a decision" },
  posted: { tone: "success", label: "In the books" },
  reversed: { tone: "neutral", label: "Reversed" },
  discarded: { tone: "neutral", label: "Void" },
};

const GST_WAY = {
  inclusive: "included in the price",
  exclusive: "added on top",
  none_unregistered: "none, supplier not registered",
  unknown: "not yet said how it was quoted",
};

const day = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null);

export default function MobileBill() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { companyId, can } = useCompany();
  const toast = useToast();
  const { post } = useBillMutations();
  const [busy, setBusy] = useState(false);

  const { data, isPending, error } = useQuery({
    queryKey: ["bill", companyId, id],
    queryFn: () => apiClient.get(`/bills/${id}`).then((r) => r.data),
    enabled: Boolean(companyId),
  });
  const { data: paper } = useQuery({
    queryKey: ["bill-paper", companyId, id],
    queryFn: () => billsApi.paper(id),
    enabled: Boolean(companyId),
  });

  // Back to wherever it was opened from; the bill list when opened straight from a link.
  const onPhone = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const back = () => (window.history.state?.idx > 0 ? nav(-1) : nav(onPhone ? "/money" : "/bills"));

  async function putIn() {
    setBusy(true);
    try {
      const r = await post.mutateAsync(id);
      qc.invalidateQueries({ queryKey: ["bill", companyId, id] });
      toast.success(`Entry ${r.entryNo} · MVR ${r.total}`, "It is in the books, and the two sides agree.");
    } catch (err) {
      toast.error("Not yet", err.message);
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <button type="button" onClick={back} className="-ml-2 h-11 pr-3 inline-flex items-center gap-1 text-[15px] font-semibold text-[var(--ink-muted)]">
      <ChevronLeft size={20} aria-hidden="true" /> Back
    </button>
  );

  if (isPending) {
    return (
      <div className="space-y-4 max-w-[640px] mx-auto">
        {header}
        <Skeleton className="h-[320px] rounded-[20px]" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-4 max-w-[640px] mx-auto">
        {header}
        <p className="text-[15px] text-[var(--ink-muted)]">This bill could not be opened. It may belong to another company.</p>
      </div>
    );
  }

  const { bill, lines } = data;
  const voided = Boolean(bill.voided_at) || bill.status === "discarded";
  const status = voided ? STATUS.discarded : STATUS[bill.status] || STATUS.draft;
  const waiting = !voided && (bill.status === "draft" || bill.status === "awaiting_review");
  const posted = bill.status === "posted" && !voided;
  const foreign = bill.fcGross && bill.currency && bill.currency.trim() !== "MVR";

  return (
    <div className="space-y-4 pb-6 max-w-[640px] mx-auto">
      {header}

      <div>
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight">{bill.supplier_name || "Nobody named yet"}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[14px] text-[var(--ink-muted)]">
          {bill.bill_no && <span className="tabular">{bill.bill_no}</span>}
          {bill.issue_date && <span>· {day(bill.issue_date)}</span>}
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </div>

      <section className="rounded-[20px] bg-[var(--surface)] lift px-5 py-4">
        <div className="text-[13px] text-[var(--ink-muted)]">Total</div>
        <div className={`font-display text-[32px] font-bold leading-tight ${voided ? "line-through text-[var(--ink-muted)]" : ""}`}>
          <span className="text-[15px] text-[var(--ink-muted)] mr-1">MVR</span>
          <Money amount={bill.gross} />
        </div>
        {foreign && (
          <div className="text-[14px] text-[var(--ink-muted)] tabular">
            {bill.currency.trim()} {bill.fcGross}
            {bill.fx_rate ? ` at ${Number(bill.fx_rate)}` : ""}
          </div>
        )}
        <dl className="mt-3 divide-y divide-[var(--border)] text-[15px]">
          <Row k="Before GST" v={<Money amount={bill.net} />} />
          <Row k={`GST, ${GST_WAY[bill.gst_treatment] || "as quoted"}`} v={<Money amount={bill.tax} />} />
          {posted && <Row k="Paid" v={<Money amount={bill.paid} />} />}
          {posted && <Row k="Still owed" v={<Money amount={bill.owed} />} strong />}
        </dl>
      </section>

      {lines.length > 0 && (
        <section>
          <h2 className="text-[13px] text-[var(--ink-muted)] mb-2 px-1">What it was for</h2>
          <div className="rounded-[20px] bg-[var(--surface)] lift divide-y divide-[var(--border)]">
            {lines.map((l, i) => (
              <div key={i} className="flex items-baseline gap-3 px-5 py-3">
                <span className="min-w-0 flex-1 text-[15px]">
                  {l.description}
                  {l.quantity && Number(l.quantity) !== 1 && <span className="text-[var(--ink-muted)]"> × {Number(l.quantity)}</span>}
                </span>
                <span className="text-[15px] font-semibold tabular">
                  <Money amount={l.net} />
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {paper?.length > 0 && (
        <section>
          <h2 className="text-[13px] text-[var(--ink-muted)] mb-2 px-1">The bill itself</h2>
          <div className="grid grid-cols-2 gap-3">
            {paper.map((a) => (
              <a key={a.id} href={`/api/attachments/${a.id}/file`} target="_blank" rel="noreferrer" className="block rounded-[16px] overflow-hidden bg-[var(--surface)] lift">
                {a.content_type?.startsWith("image/") ? (
                  <img src={`/api/attachments/${a.id}/file`} alt={`The bill: ${a.filename}`} loading="lazy" className="w-full aspect-[3/4] object-cover" />
                ) : (
                  <span className="flex flex-col items-center justify-center gap-2 aspect-[3/4] p-3 text-center text-[13px] text-[var(--ink-muted)]">
                    <FileText size={28} aria-hidden="true" />
                    <span className="break-all">{a.filename}</span>
                  </span>
                )}
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-[20px] bg-[var(--surface)] lift px-5 py-2">
        <dl className="divide-y divide-[var(--border)] text-[15px]">
          {bill.due_date && <Row k="Due" v={day(bill.due_date)} />}
          {bill.received_at && <Row k="Recorded" v={day(bill.received_at)} />}
          {bill.entry_no && <Row k="Entry" v={`No. ${bill.entry_no}`} />}
          {voided && bill.void_reason && <Row k="Why it was voided" v={bill.void_reason} />}
        </dl>
      </section>

      {waiting && can("record") && (
        <button
          type="button"
          onClick={putIn}
          disabled={busy}
          className="w-full h-14 rounded-full bg-[var(--accent)] text-[var(--on-accent)] text-[16px] font-semibold disabled:opacity-60"
        >
          {busy ? "Putting it in the books…" : "Put in the books"}
        </button>
      )}

      <Link to="/bills" className="block text-center text-[15px] font-semibold text-[var(--deep)] py-2">
        Everything else, on Bills
      </Link>
    </div>
  );
}

function Row({ k, v, strong }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-[var(--ink-muted)]">{k}</dt>
      <dd className={`text-right tabular ${strong ? "font-bold" : "font-semibold"}`}>{v}</dd>
    </div>
  );
}
