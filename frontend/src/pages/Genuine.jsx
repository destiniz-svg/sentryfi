import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { apiClient } from "@/api/client";
import { KIND_LABEL, longDate } from "@/lib/documents";
import { formatDate } from "@/lib/utils";

/**
 * What the QR code on an issued document opens: is this paper genuine? It
 * reads the copy kept when the document was issued and says what that copy
 * says, so the reader can hold the paper beside it and compare. Public, no
 * account; it shows nothing the paper does not already show.
 */
export default function Genuine() {
  const { sha } = useParams();
  const sample = sha === "sample";
  const { data, error, isLoading } = useQuery({
    queryKey: ["genuine", sha],
    queryFn: () => apiClient.get(`/verify/${sha}`).then((r) => r.data),
    retry: false,
    enabled: !sample,
  });

  let body;
  if (sample)
    body = (
      <Verdict icon={ShieldAlert} tone="var(--ink-muted)" title="This is the sample">
        On a real document, once it has been issued, this code opens the copy kept on that day, so whoever holds the paper can see it came from the company and has not been changed.
      </Verdict>
    );
  else if (isLoading) body = <p className="text-[15px] text-[var(--ink-muted)]">Checking…</p>;
  else if (error)
    body = (
      <Verdict icon={ShieldX} tone="var(--danger)" title="No document matches this code">
        Sentryfi keeps no issued document with this fingerprint. Treat the paper with care and ask the company that sent it.
      </Verdict>
    );
  else
    body = (
      <>
        <Verdict icon={data.cancelled ? ShieldAlert : ShieldCheck} tone={data.cancelled ? "var(--warning)" : "var(--success)"} title={data.cancelled ? "Genuine, but cancelled since" : "Genuine and unchanged"}>
          {data.cancelled
            ? "This document was issued as below, and has been cancelled since. It is no longer owed."
            : "This is the copy kept when the document was issued. If the paper in your hand says something different, it was changed after it left the company."}
        </Verdict>
        <dl className="mt-6 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
          <Row label="From">
            {data.from}
            {data.tin && <span className="block text-[13px] text-[var(--ink-muted)]">TIN {data.tin}</span>}
          </Row>
          <Row label="Document">
            {KIND_LABEL[data.kind] || "Document"} {data.number}
          </Row>
          <Row label="Dated">{longDate(data.issued)}</Row>
          {data.to && <Row label="To">{data.to}</Row>}
          {data.total && (
            <Row label="Total">
              <span className="tabular font-semibold">
                {data.currency} {data.total}
              </span>
            </Row>
          )}
          <Row label="Kept on">{formatDate(data.keptAt)}</Row>
        </dl>
      </>
    );

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-10">
      <div className="max-w-md mx-auto">
        <p className="text-[13px] uppercase tracking-[0.12em] font-display font-bold text-[var(--ink-muted)]">Sentryfi · document check</p>
        <div className="mt-4">{body}</div>
      </div>
    </main>
  );
}

function Verdict({ icon: Icon, tone, title, children }) {
  return (
    <div>
      <Icon size={36} style={{ color: tone }} aria-hidden="true" />
      <h1 className="font-display text-[28px] font-semibold tracking-tight mt-3">{title}</h1>
      <p className="text-[15px] text-[var(--ink-muted)] mt-2 leading-relaxed">{children}</p>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex gap-4 px-5 py-3.5">
      <dt className="w-24 shrink-0 text-[13px] text-[var(--ink-muted)] pt-0.5">{label}</dt>
      <dd className="min-w-0 text-[15px]">{children}</dd>
    </div>
  );
}
