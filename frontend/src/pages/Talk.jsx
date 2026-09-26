import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Conversation } from "@/components/talk/Conversation";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { FieldFrame } from "@/components/phone/FieldFrame";

/**
 * One record's conversation on its own page: for a bank line or a claim,
 * which have no page of their own, and for someone let in to talk about a
 * record they cannot open (site staff asked about a bill, say). They see what
 * it is and what is said, never the books behind it.
 */
/** A journal entry asked about: its lines, who posted it and when. */
function EntryLines({ id }) {
  const { companyId } = useCompany();
  const { data } = useQuery({ queryKey: ["entry", companyId, id], queryFn: () => apiClient.get(`/audit/entries/${id}`).then((r) => r.data.entry) });
  if (!data) return <Skeleton className="h-24 rounded-2xl mt-5" />;
  return (
    <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3" data-testid="entry-lines">
      <p className="text-[13px] text-[var(--ink-muted)]">
        {data.narrative} · dated {data.on} · posted by {data.posted_by}
        {data.reversed_by ? ` · reversed by entry ${data.reversed_by}` : ""}
      </p>
      <div className="overflow-x-auto mt-2">
        <table className="w-full text-[13px] tabular">
          <thead>
            <tr className="text-[var(--ink-muted)]">
              <th className="text-left font-medium py-1">Account</th>
              <th className="text-right font-medium py-1">Debit</th>
              <th className="text-right font-medium py-1">Credit</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l, i) => (
              <tr key={i} className="border-t border-[var(--border)]">
                <td className="py-1.5 pr-2">{l.account}{l.memo ? ` · ${l.memo}` : ""}</td>
                <td className="py-1.5 text-right">{l.debit === "0.00" ? "" : l.debit}</td>
                <td className="py-1.5 text-right">{l.credit === "0.00" ? "" : l.credit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Talk() {
  const { kind, id } = useParams();
  const { companyId, can } = useCompany();
  const { data, error } = useQuery({ queryKey: ["comments", companyId, kind, id], queryFn: () => apiClient.get(`/comments/${kind}/${id}`).then((r) => r.data), enabled: Boolean(companyId) });
  if (error) return <p className="text-[15px] text-[var(--ink-muted)]">{error.message}</p>;
  if (!data) return <Skeleton className="h-64 rounded-2xl" />;
  const own = data.record.href.startsWith("/talk/");
  const list = { bank_line: "/bank", claim: "/claims" }[kind];
  return (
    <FieldFrame figure={data.record.title} position="What was said, and what they asked you">
    <div className="max-w-[760px] mx-auto">
      {/* On the phone board the band already says what this is. */}
      {can("read") && (<>
      <Link
        to={list || "/inbox"}
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
      <div className="flex items-end justify-between gap-3 flex-wrap mt-1">
        <h1 className="font-display text-[24px] font-bold tracking-tight">{data.record.title}</h1>
        {data.record.opens && !own && (
          <Link to={data.record.href} className="h-10 px-4 rounded-full border border-[var(--border)] text-[14px] font-medium inline-flex items-center gap-1.5 hover:bg-[var(--surface-2)]">
            Open it <ArrowUpRight size={15} />
          </Link>
        )}
      </div>
      </>)}
      {!data.record.opens && <p className="text-[14px] text-[var(--ink-muted)] mt-1">You were brought into this conversation. You see what is said here, not the record itself.</p>}
      {kind === "entry" && can("read") && <EntryLines id={id} />}
      <Conversation kind={kind} id={id} className="mt-5" />
    </div>
    </FieldFrame>
  );
}
