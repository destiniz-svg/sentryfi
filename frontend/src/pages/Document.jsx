import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Printer, FileDown, ShieldCheck, Share2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Questions } from "@/components/documents/Questions";
import { ShareDocument } from "@/components/documents/Share";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { FittedPaper } from "@/components/documents/DocumentPaper";
import { PrintCopy } from "@/components/documents/PrintCopy";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { compose, SIZES, KIND_LABEL, templateWith } from "@/lib/documents";
import { formatDate } from "@/lib/utils";
import { FIELD } from "@/lib/shipments";
import { Attachments } from "@/components/documents/Attachments";
import { LateFee } from "@/components/sales/LateFee";
import { Conversation } from "@/components/talk/Conversation";

/**
 * One document, as it is sent: the issued copy once it has gone into the
 * books, otherwise drawn as it is now. Print it, or print to PDF. The size
 * can be changed for printing (a receipt printer, an A5 pad) without
 * changing what the document says.
 */

const BACK = { invoice: "/invoices", credit_note: "/invoices", quote: "/orders?kind=quote", sales_order: "/orders?kind=sale", purchase_order: "/orders?kind=purchase", delivery_note: "/orders?kind=sale", goods_received: "/orders?kind=purchase", receipt: "/invoices", statement: "/invoices", proforma: "/advances", retainer: "/advances" };
const QUESTIONED = ["invoice", "quote", "proforma", "retainer"];
// Documents that carry papers of their own (drawings, timesheets, specs).
const ATTACHABLE = ["invoice", "quote", "sales_order", "purchase_order", "proforma", "retainer", "credit_note"];
// Documents the team can talk about (the customer has a thread of their own).
const TALKED = ["invoice", "credit_note", "quote", "sales_order", "purchase_order", "proforma", "retainer"];
// Every document with someone to send it to.
const SENT = ["invoice", "quote", "proforma", "retainer", "sales_order", "delivery_note", "goods_received", "credit_note", "receipt", "statement", "purchase_order"];

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
    <div className="max-w-[980px] xl:max-w-none mx-auto">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Back to wherever it was opened from (Money on a phone, Invoices at the desk); the list for its kind when opened from a link. */}
        <Link
          to={BACK[kind] || "/"}
          onClick={(e) => {
            if (window.history.state?.idx > 0) {
              e.preventDefault();
              window.history.back();
            }
          }}
          className="inline-flex items-center gap-1.5 h-11 px-3 -ml-3 rounded-full text-[14px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
        >
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
        {kind === "invoice" && data.data.to?.name && <LateFee invoiceId={id} number={data.data.number} customer={data.data.to.name} />}
        {SENT.includes(kind) && (kind !== "invoice" || data.issuedCopy) && data.data.to?.name && (
          <Button variant="outline" onClick={() => setEmailing(true)} data-testid="share-document">
            <Share2 size={15} /> Send
          </Button>
        )}
        <Button variant="outline" onClick={() => window.print()}>
          <FileDown size={15} /> PDF
        </Button>
        <Button onClick={() => window.print()}>
          <Printer size={15} /> Print
        </Button>
      </div>
      {/* Wide screens: the paper, and beside it what the team says about it, both in view. Narrower: one under the other. */}
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_420px] xl:gap-6 xl:items-start">
      <div className="min-w-0">
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
      {model.missing.length > 0 && (
        <div role="note" data-testid="mira-missing" className="mb-4 rounded-2xl border border-[var(--warning)] bg-[var(--warning-soft)] p-3.5 text-[14px]">
          <p className="font-semibold">Not yet a complete MIRA tax invoice</p>
          <ul className="mt-1 grid gap-0.5 text-[var(--ink-muted)]">
            {model.missing.map((m) => (
              <li key={m.what}>
                {m.href ? <Link to={m.href} className="underline underline-offset-4 text-[var(--ink)]">{m.what}</Link> : <span className="text-[var(--ink)]">{m.what}</span>} is missing{m.note ? `, ${m.note}` : m.href ? "" : ". Add it on their contact."}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={model.size.receipt ? "max-w-[340px] mx-auto" : ""}>
        <FittedPaper model={model} />
      </div>
      </div>
      <aside aria-label="Attachments and conversation" data-testid="doc-side" className="xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto xl:overscroll-contain xl:grid xl:gap-4 xl:[&>*]:mt-0 print:hidden">
        {TALKED.includes(kind) && <Conversation kind={kind} id={id} title={QUESTIONED.includes(kind) ? "Team conversation" : "Conversation"} />}
        {QUESTIONED.includes(kind) && <DocumentQuestions kind={kind} id={id} />}
        {ATTACHABLE.includes(kind) && <Attachments kind={kind} id={id} />}
      </aside>
      </div>
      <PrintCopy model={model} />
      {emailing && <ShareDocument kind={kind} id={id} number={data.data.number} to={data.data.to} onClose={() => setEmailing(false)} />}
    </div>
  );
}

/** What the customer asked from their link, and the answer, under the document. */
function DocumentQuestions({ kind, id }) {
  const { companyId, can } = useCompany();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["questions", companyId, kind, id], queryFn: () => apiClient.get(`/documents/${kind}/${id}/questions`).then((r) => r.data.questions), enabled: Boolean(companyId), refetchInterval: 15_000 });
  if (!data || (!data.length && !can("record"))) return null;
  return (
    <Questions
      thread={data}
      me="company"
      title="From the customer"
      empty="Nothing asked yet. Customers ask from their link to this document, and you answer here; they see the answer on the same page."
      placeholder="Answer the customer"
      sendLabel="Reply"
      onSend={async ({ body }) => {
        await apiClient.post(`/documents/${kind}/${id}/questions`, { body });
        qc.invalidateQueries({ queryKey: ["questions", companyId, kind, id] });
        qc.invalidateQueries({ queryKey: ["attention", companyId] });
      }}
    />
  );
}

