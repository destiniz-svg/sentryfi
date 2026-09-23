import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Printer, FileDown, ShieldCheck } from "lucide-react";
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

const BACK = { invoice: "/invoices" };

export default function Document() {
  const { kind, id } = useParams();
  const { companyId } = useCompany();
  const { data, isLoading, error } = useQuery({
    queryKey: ["document", companyId, kind, id],
    queryFn: () => apiClient.get(`/documents/${kind}/${id}`).then((r) => r.data),
    enabled: Boolean(companyId),
  });
  const [size, setSize] = useState(null);

  if (error) return <p className="text-[15px] text-[var(--ink-muted)]">{error.message}</p>;
  if (isLoading || !data) return <Skeleton className="h-[80vh] rounded-2xl" />;
  const t = templateWith(data.template);
  const model = compose({ data: data.data, brand: data.brand, template: data.template, size: size || t.size });

  return (
    <div className="max-w-[980px] mx-auto">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Link to={BACK[kind] || "/"} className="inline-flex items-center gap-1.5 h-10 px-3 -ml-3 rounded-full text-[14px] text-[var(--ink-muted)] hover:text-[var(--ink)]">
          <ArrowLeft size={16} /> {KIND_LABEL[kind]}s
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
          <span>A draft, drawn as it is now. When it goes into the books, it is kept exactly as it looks then. For a PDF, choose Save as PDF in the print window.</span>
        )}
      </p>
      <div className={model.size.receipt ? "max-w-[340px] mx-auto" : ""}>
        <FittedPaper model={model} />
      </div>
      <PrintCopy model={model} />
    </div>
  );
}
