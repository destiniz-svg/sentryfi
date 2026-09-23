import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Printer, FileDown, ShieldCheck, Mail, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/context/UIContext";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { FittedPaper } from "@/components/documents/DocumentPaper";
import { PrintCopy } from "@/components/documents/PrintCopy";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { compose, SIZES, KIND_LABEL, templateWith } from "@/lib/documents";
import { formatDate } from "@/lib/utils";
import { FIELD } from "@/lib/shipments";

/**
 * One document, as it is sent: the issued copy once it has gone into the
 * books, otherwise drawn as it is now. Print it, or print to PDF. The size
 * can be changed for printing (a receipt printer, an A5 pad) without
 * changing what the document says.
 */

const BACK = { invoice: "/invoices", credit_note: "/invoices", quote: "/orders?kind=quote", sales_order: "/orders?kind=sale", purchase_order: "/orders?kind=purchase", delivery_note: "/orders?kind=sale", goods_received: "/orders?kind=purchase", receipt: "/invoices", statement: "/invoices" };

export default function Document() {
  const { kind, id } = useParams();
  const { companyId } = useCompany();
  const { data, isLoading, error } = useQuery({
    queryKey: ["document", companyId, kind, id],
    queryFn: () => apiClient.get(`/documents/${kind}/${id}`).then((r) => r.data),
    enabled: Boolean(companyId),
  });
  const [size, setSize] = useState(null);
  const [emailing, setEmailing] = useState(false);

  if (error) return <p className="text-[15px] text-[var(--ink-muted)]">{error.message}</p>;
  if (isLoading || !data) return <Skeleton className="h-[80vh] rounded-2xl" />;
  const t = templateWith(data.template);
  const verifyUrl = data.issuedCopy ? `${window.location.origin}/v/${data.issuedCopy.sha256}` : null;
  const model = compose({ data: data.data, brand: data.brand, template: data.template, size: size || t.size, verifyUrl });

  return (
    <div className="max-w-[980px] mx-auto">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Link to={BACK[kind] || "/"} className="inline-flex items-center gap-1.5 h-10 px-3 -ml-3 rounded-full text-[14px] text-[var(--ink-muted)] hover:text-[var(--ink)]">
          <ArrowLeft size={16} /> Back
        </Link>
        <h1 className="font-display text-[22px] font-bold tracking-tight mr-auto">
          {KIND_LABEL[kind]} {data.data.number}
        </h1>
        <select aria-label="Paper" value={size || t.size} onChange={(e) => setSize(e.target.value)} className={FIELD.replace("w-full", "w-44")}>
          {Object.entries(SIZES).map(([k, s]) => (
            <option key={k} value={k}>
              {s.label}
            </option>
          ))}
        </select>
        {kind === "invoice" && data.issuedCopy && (
          <Button variant="outline" onClick={() => setEmailing(true)} data-testid="email-invoice">
            <Mail size={15} /> Email
          </Button>
        )}
        <Button variant="outline" onClick={() => window.print()}>
          <FileDown size={15} /> PDF
        </Button>
        <Button onClick={() => window.print()}>
          <Printer size={15} /> Print
        </Button>
      </div>
      <p className="text-[13px] text-[var(--ink-muted)] mb-4 flex items-start gap-2" data-testid="copy-note">
        {data.issuedCopy ? (
          <>
            <ShieldCheck size={15} className="shrink-0 mt-px text-[var(--success)]" />
            <span>
              The copy kept when it was issued on {formatDate(data.issuedCopy.at)}. Later changes to the design never reach it. Fingerprint {data.issuedCopy.sha256.slice(0, 12)}.
            </span>
          </>
        ) : (
          <span>
            {kind === "invoice"
              ? "A draft, drawn as it is now. When it goes into the books, it is kept exactly as it looks then."
              : "Drawn as it stands now, with your current design."}{" "}
            For a PDF, choose Save as PDF in the print window.
          </span>
        )}
      </p>
      <div className={model.size.receipt ? "max-w-[340px] mx-auto" : ""}>
        <FittedPaper model={model} />
      </div>
      <PrintCopy model={model} />
      {emailing && <EmailInvoice id={id} number={data.data.number} to={data.data.to?.email || ""} onClose={() => setEmailing(false)} />}
    </div>
  );
}

/** Sends the invoice to its customer: a private link to their page, where it is drawn as issued. */
function EmailInvoice({ id, number, to: first, onClose }) {
  const toast = useToast();
  const [to, setTo] = useState(first);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await apiClient.post(`/sales/${id}/email`, { to: to.trim() || undefined, note: note.trim() || undefined });
      toast.success(`${number} sent to ${r.data.to}`, "They get a link to their page, where it is drawn exactly as issued and can be printed or saved as a PDF.");
      onClose();
    } catch (err) {
      toast.error("Not sent", err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} as="form" onSubmit={send} title={`Email ${number}`} description="A private link to their page: this invoice as issued, what else they owe, and how to pay. Replies come to your company's address.">
      <div className="space-y-3">
        <label className="block">
          <span className="block text-[13px] font-medium mb-1.5">To</span>
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="accounts@customer.mv" className={FIELD} required />
        </label>
        <label className="block">
          <span className="block text-[13px] font-medium mb-1.5">A note (optional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={600} className={FIELD.replace("h-11", "min-h-[84px] py-2.5")} placeholder="Thank you for the work this month." />
        </label>
        <Button type="submit" variant="accent" disabled={busy || !to.trim()} className="w-full">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={15} />} Send it
        </Button>
      </div>
    </Modal>
  );
}
