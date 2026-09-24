import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, MessageSquare, Printer, X } from "lucide-react";
import { apiClient } from "@/api/client";
import { Money } from "@/components/ui/Money";
import { formatDate } from "@/lib/utils";
import { FittedPaper } from "@/components/documents/DocumentPaper";
import { PrintCopy } from "@/components/documents/PrintCopy";
import { Questions } from "@/components/documents/Questions";
import { compose, templateWith } from "@/lib/documents";

/**
 * The customer portal: what a company's customer sees from their private
 * link, without an account. What is waiting for their answer (quotes and
 * proforma invoices to accept), what is asked of them in advance, their
 * invoices with what is still owed, and how to pay. Any document opens as its
 * paper, with a place to ask about it; the company's answer appears there.
 */

const n = (s) => Number(String(s ?? "").replace(/,/g, "")) || 0;
const BOX = "rounded-2xl border border-[var(--border)] bg-[var(--surface)]";
const FIELD = "h-11 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] outline-none focus:border-[var(--ink)] w-full";
const H2 = "mt-8 mb-2 text-[13px] uppercase tracking-[0.12em] font-display font-bold text-[var(--ink-muted)]";

export default function Portal() {
  const { token } = useParams();
  const qc = useQueryClient();
  // A link sent for one document (?open=quote:<id>) opens the page at it.
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get("open")?.split(":")[1] || null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => document.getElementById(`doc-${open}`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 300);
    return () => clearTimeout(t);
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { data, error, isLoading } = useQuery({
    queryKey: ["portal", token],
    queryFn: () => apiClient.get(`/portal/${token}`).then((r) => r.data),
    retry: false,
  });
  const reload = () => qc.invalidateQueries({ queryKey: ["portal", token] });

  if (isLoading) return <main className="min-h-screen bg-[var(--bg)] p-6 text-[var(--ink-muted)]">Opening…</main>;
  if (error)
    return (
      <main className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
        <p role="alert" className="max-w-sm text-[15px]">
          {error.message || "This link has been turned off, or is not complete. Ask for a new one."}
        </p>
      </main>
    );

  const cur = data.company.currency || "MVR";
  const owed = n(data.owed) > 0;
  const toAnswer = [
    ...(data.quotes || []).filter((q) => q.status === "quoted").map((q) => ({ ...q, kind: "quote", label: "Quotation", gross: q.total })),
    ...(data.requests || []).filter((r) => r.kind === "proforma" && !r.acceptedAt && r.status === "open"),
  ];
  const asked = (data.requests || []).filter((r) => !["invoiced", "cancelled"].includes(r.status) && !toAnswer.some((x) => x.id === r.id));
  const earlier = [
    ...(data.quotes || []).filter((q) => q.status !== "quoted").map((q) => ({ ...q, kind: "quote", label: "Quotation", gross: q.total })),
    ...(data.requests || []).filter((r) => r.status === "invoiced"),
  ];
  const row = (d, kind, right) => (
    <Row key={d.id} token={token} kind={kind} d={d} open={open === d.id} onToggle={() => setOpen(open === d.id ? null : d.id)} thread={data.threads?.[d.id] || []} onAsked={reload} right={right} />
  );

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-8 print:bg-white print:p-0">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[13px] uppercase tracking-[0.12em] font-display font-bold text-[var(--ink-muted)]">{data.company.name}</div>
            <h1 className="font-display text-[28px] font-semibold tracking-tight mt-1">{data.customer}</h1>
            {data.company.tin && <div className="text-[13px] text-[var(--ink-muted)]">Their GST number {data.company.tin}</div>}
          </div>
          <button type="button" onClick={() => window.print()} className="print:hidden h-10 px-4 rounded-full border border-[var(--border)] bg-[var(--surface)] inline-flex items-center gap-2 text-[14px]">
            <Printer size={15} /> Print
          </button>
        </div>

        <section className={`mt-6 ${BOX} p-5`} data-testid="portal-owed">
          <div className="text-[13px] text-[var(--ink-muted)]">{owed ? "You owe" : "Nothing is owed"}</div>
          <div className="text-[32px] font-semibold tabular">
            {cur} <Money amount={data.owed} />
          </div>
          {n(data.heldForYou) > 0 && <p className="text-[14px] mt-1">Paid in advance and held for you: <b className="tabular">{cur} {data.heldForYou}</b>, taken off your next tax invoice.</p>}
          {(owed || asked.length > 0) && data.company.paymentDetails && (
            <div className="mt-3 pt-3 border-t border-[var(--border)]">
              <div className="text-[13px] font-medium">How to pay</div>
              <p className="text-[15px] whitespace-pre-line mt-1">{data.company.paymentDetails}</p>
              <p className="text-[13px] text-[var(--ink-muted)] mt-1">Put the invoice or proforma number in the transfer&apos;s reference, so the payment is matched to it.</p>
            </div>
          )}
        </section>

        {toAnswer.length > 0 && (
          <>
            <h2 className={H2}>Waiting for your answer</h2>
            <ul className={`${BOX} divide-y divide-[var(--border)]`} data-testid="portal-answer">
              {toAnswer.map((d) => row(d, d.kind, <Answer token={token} d={d} onDone={reload} />))}
            </ul>
          </>
        )}

        {asked.length > 0 && (
          <>
            <h2 className={H2}>Asked for in advance</h2>
            <ul className={`${BOX} divide-y divide-[var(--border)]`} data-testid="portal-advance">
              {asked.map((d) => row(d, d.kind, null))}
            </ul>
          </>
        )}

        <h2 className={H2}>Invoices</h2>
        {data.invoices.length === 0 ? (
          <p className="text-[15px] text-[var(--ink-muted)]">No invoices yet.</p>
        ) : (
          <ul className={`${BOX} divide-y divide-[var(--border)]`} data-testid="portal-invoices">
            {data.invoices.map((i) => row({ ...i, label: "Invoice" }, "invoice", null))}
          </ul>
        )}

        {earlier.length > 0 && (
          <>
            <h2 className={H2}>Earlier</h2>
            <ul className={`${BOX} divide-y divide-[var(--border)]`}>{earlier.map((d) => row(d, d.kind, null))}</ul>
          </>
        )}
        <p className="mt-8 text-[12px] text-[var(--ink-muted)] print:hidden">Kept by {data.company.name} in Sentryfi. This page is for you alone; please do not share the link.</p>
      </div>
    </main>
  );
}

const WORD = { quoted: "Waiting for you", accepted: "Accepted", declined: "Declined", expired: "Past its date", cancelled: "Withdrawn", open: "Waiting for you", "part paid": "Part paid", paid: "Paid", invoiced: "Invoiced" };

/** One document: its line, and opened, its paper and questions. */
function Row({ token, kind, d, open, onToggle, thread, onAsked, right }) {
  const invoice = kind === "invoice";
  const paid = invoice && n(d.owed) === 0;
  const status = invoice ? (paid ? "Paid" : `${d.owed} to pay`) : kind === "quote" ? WORD[d.status] : d.acceptedAt && d.status === "open" ? "Accepted" : WORD[d.status] || d.status;
  const waiting = thread.some((q) => q.open);
  return (
    <li className="px-5 py-3 scroll-mt-4" id={`doc-${d.id}`}>
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 text-left" aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium">
            {invoice ? d.number : `${d.label} ${d.number}`}
            {thread.length > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-[12px] font-normal text-[var(--ink-muted)]">
                <MessageSquare size={12} aria-hidden="true" /> {waiting ? "waiting for an answer" : `${thread.length} ${thread.length === 1 ? "message" : "messages"}`}
              </span>
            )}
          </div>
          <div className="text-[13px] text-[var(--ink-muted)] truncate">
            {formatDate(d.issued)}
            {d.due ? ` · due ${formatDate(d.due)}` : d.until ? ` · good until ${formatDate(d.until)}` : ""}
            {d.subject ? ` · ${d.subject}` : ""}
          </div>
        </div>
        <div className="text-right">
          <span className="text-[15px] font-semibold"><Money amount={d.gross} /></span>
          <div className={`text-[12px] ${paid || ["accepted", "paid", "invoiced"].includes(d.status) ? "text-[var(--success)]" : "text-[var(--ink-muted)]"}`}>{status}</div>
        </div>
        <ChevronDown size={16} className={`print:hidden text-[var(--ink-muted)] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {right}
      {open && (
        <>
          <Paper token={token} kind={kind} id={d.id} />
          <Questions
            thread={thread}
            me="customer"
            askName
            title="Ask about this"
            empty="Something not right, or not clear? Ask here; the answer comes back to this page."
            placeholder={`Your question about ${d.number}`}
            onSend={async ({ body, name }) => {
              await apiClient.post(`/portal/${token}/questions`, { kind, documentId: d.id, body, name });
              onAsked();
            }}
          />
        </>
      )}
    </li>
  );
}

/** Accepting or declining, with the name of whoever answers. */
function Answer({ token, d, onDone }) {
  const [mode, setMode] = useState(null);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true);
    setErr("");
    try {
      if (d.kind === "quote") await apiClient.post(`/portal/${token}/quotes/${d.id}`, { accepted: mode === "yes", name, reason: reason || null });
      else await apiClient.post(`/portal/${token}/requests/${d.id}/accept`, { name });
      onDone();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }
  if (!mode) {
    return (
      <div className="mt-3 flex flex-wrap gap-2 print:hidden">
        <button type="button" onClick={() => setMode("yes")} className="h-10 px-4 rounded-full bg-[var(--ink)] text-[var(--bg)] text-[14px] font-medium inline-flex items-center gap-1.5">
          <Check size={15} /> Accept
        </button>
        {d.kind === "quote" && (
          <button type="button" onClick={() => setMode("no")} className="h-10 px-4 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[14px] inline-flex items-center gap-1.5">
            <X size={15} /> Decline
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-xl bg-[var(--surface-2)] p-3 grid gap-2 print:hidden">
      <p className="text-[14px]">{mode === "yes" ? `Accept ${d.label.toLowerCase()} ${d.number} for ${d.gross}.` : `Decline quotation ${d.number}.`}</p>
      <input aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={FIELD} />
      {mode === "no" && <input aria-label="Why (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why (optional)" className={FIELD} />}
      {err && <p role="alert" className="text-[13px] text-[var(--danger)]">{err}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={go} disabled={busy || name.trim().length < 2} className="h-10 px-4 rounded-full bg-[var(--ink)] text-[var(--bg)] text-[14px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
          {busy && <Loader2 size={14} className="animate-spin" />} {mode === "yes" ? "Yes, accept it" : "Decline it"}
        </button>
        <button type="button" onClick={() => setMode(null)} className="h-10 px-4 rounded-full text-[14px] text-[var(--ink-muted)]">Not now</button>
      </div>
    </div>
  );
}

/** A document drawn as the company sent it, and printing just that one. */
function Paper({ token, kind, id }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-doc", token, kind, id],
    queryFn: () => apiClient.get(`/portal/${token}/documents/${kind}/${id}`).then((r) => r.data),
  });
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done, { once: true });
    window.print();
    return () => window.removeEventListener("afterprint", done);
  }, [printing]);
  if (error) return <p className="mt-3 text-[14px] text-[var(--ink-muted)]">{error.message}</p>;
  if (isLoading || !data) return <p className="mt-3 text-[14px] text-[var(--ink-muted)]">Opening…</p>;
  const verifyUrl = data.issuedCopy ? `${window.location.origin}/v/${data.issuedCopy.sha256}` : null;
  const model = compose({ data: data.data, brand: data.brand, template: data.template, size: templateWith(data.template).size === "a5" ? "a5" : "a4", verifyUrl });
  return (
    <div className="mt-4 print:hidden" data-testid="portal-paper">
      <div className="rounded-xl bg-[var(--surface-2)] p-2 sm:p-3">
        <FittedPaper model={model} />
      </div>
      <button type="button" onClick={() => setPrinting(true)} className="mt-3 h-10 px-4 rounded-full border border-[var(--border)] bg-[var(--surface)] inline-flex items-center gap-2 text-[14px]">
        <Printer size={15} /> Print or save as a PDF
      </button>
      {printing && <PrintCopy model={model} />}
    </div>
  );
}
