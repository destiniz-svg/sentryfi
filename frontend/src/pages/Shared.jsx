import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { apiClient } from "@/api/client";
import { FittedPaper } from "@/components/documents/DocumentPaper";
import { PrintCopy } from "@/components/documents/PrintCopy";
import { compose, templateWith, KIND_LABEL } from "@/lib/documents";

/**
 * One document from a private link: a purchase order to a supplier, a
 * delivery note, a credit note, a receipt or a statement, drawn exactly as the
 * company sent it. No account, read-only, printable.
 */
export default function Shared() {
  const { token } = useParams();
  const { data, error, isLoading } = useQuery({ queryKey: ["shared", token], queryFn: () => apiClient.get(`/shared/${token}`).then((r) => r.data), retry: false });
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done, { once: true });
    window.print();
    return () => window.removeEventListener("afterprint", done);
  }, [printing]);

  if (isLoading) return <main className="min-h-screen bg-[var(--bg)] p-6 text-[var(--ink-muted)]">Opening…</main>;
  if (error)
    return (
      <main className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
        <p role="alert" className="max-w-sm text-[15px]">{error.message || "This link has been turned off, or is not complete. Ask for a new one."}</p>
      </main>
    );
  const verifyUrl = data.issuedCopy ? `${window.location.origin}/v/${data.issuedCopy.sha256}` : null;
  const model = compose({ data: data.data, brand: data.brand, template: data.template, size: templateWith(data.template).size === "a5" ? "a5" : "a4", verifyUrl });
  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="text-[13px] uppercase tracking-[0.12em] font-display font-bold text-[var(--ink-muted)]">{data.brand?.name || data.brand?.legalName}</div>
            <h1 className="font-display text-[26px] font-semibold tracking-tight mt-1">
              {KIND_LABEL[data.kind]} {data.data.number}
            </h1>
          </div>
          <button type="button" onClick={() => setPrinting(true)} className="h-10 px-4 rounded-full border border-[var(--border)] bg-[var(--surface)] inline-flex items-center gap-2 text-[14px]">
            <Printer size={15} /> Print or PDF
          </button>
        </div>
        <div className="rounded-2xl bg-[var(--surface-2)] p-2 sm:p-4" data-testid="shared-paper">
          <FittedPaper model={model} />
        </div>
        <p className="mt-6 text-[12px] text-[var(--ink-muted)]">Sent by {data.brand?.legalName || data.brand?.name} from Sentryfi. This link is for you; please do not share it.</p>
      </div>
      {printing && <PrintCopy model={model} />}
    </main>
  );
}
