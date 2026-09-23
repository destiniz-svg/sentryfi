import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Printer } from "lucide-react";
import { apiClient } from "@/api/client";
import { Money } from "@/components/ui/Money";
import { formatDate } from "@/lib/utils";
import { FittedPaper } from "@/components/documents/DocumentPaper";
import { PrintCopy } from "@/components/documents/PrintCopy";
import { compose, templateWith } from "@/lib/documents";

/**
 * The customer portal: what a company's customer sees from their private
 * link, without an account. Their invoices, what is still owed on each and in
 * all, and how to pay. Read-only; printable. Opening an invoice draws it as
 * it was issued: the same paper the company sent.
 */
export default function Portal() {
  const { token } = useParams();
  const [open, setOpen] = useState(null);
  const { data, error, isLoading } = useQuery({
    queryKey: ["portal", token],
    queryFn: () => apiClient.get(`/portal/${token}`).then((r) => r.data),
    retry: false,
  });

  if (isLoading) return <main className="min-h-screen bg-[var(--bg)] p-6 text-[var(--ink-muted)]">Opening…</main>;
  if (error)
    return (
      <main className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
        <p role="alert" className="max-w-sm text-[15px]">
          {error.message || "This link has been turned off, or is not complete. Ask for a new one."}
        </p>
      </main>
    );

  const owed = Number(data.owed.replace(/,/g, "")) > 0;
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

        <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5" data-testid="portal-owed">
          <div className="text-[13px] text-[var(--ink-muted)]">{owed ? "You owe" : "Nothing is owed"}</div>
          <div className="text-[32px] font-semibold tabular">
            {data.company.currency || "MVR"} <Money amount={data.owed} />
          </div>
          {owed && data.company.paymentDetails && (
            <div className="mt-3 pt-3 border-t border-[var(--border)]">
              <div className="text-[13px] font-medium">How to pay</div>
              <p className="text-[15px] whitespace-pre-line mt-1">{data.company.paymentDetails}</p>
              <p className="text-[13px] text-[var(--ink-muted)] mt-1">Put the invoice number in the transfer's reference, so the payment is matched to it.</p>
            </div>
          )}
        </section>

        <h2 className="mt-8 mb-2 text-[13px] uppercase tracking-[0.12em] font-display font-bold text-[var(--ink-muted)]">Invoices</h2>
        {data.invoices.length === 0 ? (
          <p className="text-[15px] text-[var(--ink-muted)]">No invoices yet.</p>
        ) : (
          <ul className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]" data-testid="portal-invoices">
            {data.invoices.map((i) => {
              const paid = Number(i.owed.replace(/,/g, "")) === 0;
              return (
                <li key={i.id} className="px-5 py-3">
                  <button type="button" onClick={() => setOpen(open === i.id ? null : i.id)} className="w-full flex items-center gap-3 text-left" aria-expanded={open === i.id}>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-medium">{i.number}</div>
                      <div className="text-[13px] text-[var(--ink-muted)] truncate">
                        {formatDate(i.issued)}
                        {i.due ? ` · due ${formatDate(i.due)}` : ""}
                        {i.subject ? ` · ${i.subject}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[15px] font-semibold">
                        {i.currency !== (data.company.currency || "MVR") && <span className="text-[12px] text-[var(--ink-muted)] mr-1">{i.currency}</span>}
                        <Money amount={i.gross} />
                      </span>
                      <div className={`text-[12px] ${paid ? "text-[var(--success)]" : "text-[var(--ink-muted)]"}`}>{paid ? "Paid" : `${data.company.currency || "MVR"} ${i.owed} to pay`}</div>
                    </div>
                    <ChevronDown size={16} className={`print:hidden text-[var(--ink-muted)] transition-transform ${open === i.id ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                  {open === i.id && <IssuedInvoice token={token} id={i.id} />}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-8 text-[12px] text-[var(--ink-muted)] print:hidden">Kept by {data.company.name} in Sentryfi. This page is for you alone; please do not share the link.</p>
      </div>
    </main>
  );
}

/** One invoice as it was issued, and printing just that invoice. */
function IssuedInvoice({ token, id }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-invoice", token, id],
    queryFn: () => apiClient.get(`/portal/${token}/invoices/${id}`).then((r) => r.data),
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
  if (isLoading || !data) return <p className="mt-3 text-[14px] text-[var(--ink-muted)]">Opening the invoice…</p>;
  const verifyUrl = data.issuedCopy ? `${window.location.origin}/v/${data.issuedCopy.sha256}` : null;
  const model = compose({ data: data.data, brand: data.brand, template: data.template, size: templateWith(data.template).size === "a5" ? "a5" : "a4", verifyUrl });
  return (
    <div className="mt-4 print:hidden" data-testid="portal-paper">
      <div className="rounded-xl bg-[var(--surface-2)] p-2 sm:p-3">
        <FittedPaper model={model} />
      </div>
      <button type="button" onClick={() => setPrinting(true)} className="mt-3 h-10 px-4 rounded-full border border-[var(--border)] bg-[var(--surface)] inline-flex items-center gap-2 text-[14px]">
        <Printer size={15} /> Print or save this invoice as a PDF
      </button>
      {printing && <PrintCopy model={model} />}
    </div>
  );
}
