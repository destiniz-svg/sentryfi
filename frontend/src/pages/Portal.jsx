import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Printer } from "lucide-react";
import { apiClient } from "@/api/client";
import { Money } from "@/components/ui/Money";
import { formatDate } from "@/lib/utils";

/**
 * The customer portal: what a company's customer sees from their private
 * link, without an account. Their invoices, what is still owed on each and in
 * all, and how to pay. Read-only; printable.
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
            <h1 className="font-display text-[30px] font-bold tracking-tight mt-1">{data.customer}</h1>
            {data.company.tin && <div className="text-[13px] text-[var(--ink-muted)]">Their GST number {data.company.tin}</div>}
          </div>
          <button type="button" onClick={() => window.print()} className="print:hidden h-10 px-4 rounded-full border border-[var(--border)] bg-[var(--surface)] inline-flex items-center gap-2 text-[14px]">
            <Printer size={15} /> Print
          </button>
        </div>

        <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5" data-testid="portal-owed">
          <div className="text-[13px] text-[var(--ink-muted)]">{owed ? "You owe" : "Nothing is owed"}</div>
          <div className="text-[32px] font-semibold tabular">
            MVR <Money amount={data.owed} />
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
                      <Money amount={i.gross} className="text-[15px] font-semibold" />
                      <div className={`text-[12px] ${paid ? "text-[var(--success)]" : "text-[var(--ink-muted)]"}`}>{paid ? "Paid" : `MVR ${i.owed} to pay`}</div>
                    </div>
                    <ChevronDown size={16} className={`print:hidden text-[var(--ink-muted)] transition-transform ${open === i.id ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                  {open === i.id && (
                    <table className="w-full mt-3 text-[14px] tabular">
                      <tbody className="divide-y divide-[var(--border)]">
                        {i.lines.map((l, k) => (
                          <tr key={k}>
                            <td className="py-1.5 pr-3">
                              {l.description}
                              <span className="block text-[12px] text-[var(--ink-muted)]">
                                {l.quantity} {l.unit || ""} × {l.price}
                              </span>
                            </td>
                            <td className="py-1.5 text-right">
                              <Money amount={l.amount} />
                            </td>
                          </tr>
                        ))}
                        {i.tax !== "0.00" && (
                          <tr>
                            <td className="py-1.5 text-[var(--ink-muted)]">GST</td>
                            <td className="py-1.5 text-right">
                              <Money amount={i.tax} />
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
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
