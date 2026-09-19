import { useState } from "react";
import { Plus, Receipt, Ban, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { VoidDialog } from "@/components/ui/VoidDialog";
import { RecordBill } from "@/components/bills/RecordBill";
import { useBills, useBillMutations } from "@/hooks/useBills";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { formatDate } from "@/lib/utils";

/**
 * What is owed, and what still needs a person.
 *
 * Bills that are in the books and bills that are waiting are shown in one
 * list, because the useful question is "what needs me?" rather than "show me
 * the posted ones". A bill waiting on a decision says which decision, in the
 * row, so the answer never requires opening it.
 */

const STATUS = {
  draft: { tone: "neutral", label: "Not in the books yet" },
  awaiting_review: { tone: "accent", label: "Needs a decision" },
  posted: { tone: "success", label: "In the books" },
  reversed: { tone: "neutral", label: "Reversed" },
  discarded: { tone: "neutral", label: "Void" },
};

export default function Bills() {
  const { data: bills, isLoading } = useBills();
  const { post, voidBill } = useBillMutations();
  const { can } = useCompany();
  const toast = useToast();

  const [recording, setRecording] = useState(false);
  const [voiding, setVoiding] = useState(null);
  const [posting, setPosting] = useState(null);

  const canRecord = can("record");

  async function onPost(bill) {
    setPosting(bill.id);
    try {
      const result = await post.mutateAsync(bill.id);
      toast.success(
        `Entry ${result.entryNo} · MVR ${result.total}`,
        "It is in the books, and the two sides agree."
      );
    } catch (err) {
      // These are decisions for a person, not failures of the app, so they are
      // said plainly rather than as an error.
      toast.error("Not yet", err.message);
    } finally {
      setPosting(null);
    }
  }

  async function confirmVoid(reason) {
    await voidBill.mutateAsync({ id: voiding.id, reason });
    setVoiding(null);
  }

  return (
    <div>
      <PageHeader
        title="Bills"
        description="What you owe, and what is still waiting on a decision."
        actions={
          canRecord &&
          bills?.length > 0 && (
            <Button variant="accent" onClick={() => setRecording(true)}>
              <Plus size={16} /> Record a bill
            </Button>
          )
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : !bills?.length ? (
        <EmptyState
          icon={Receipt}
          title="No bills yet"
          description={
            canRecord
              ? "Record the first one. It takes what is on the paper and nothing more."
              : "Nothing has been recorded here yet."
          }
          action={
            canRecord && (
              <Button variant="accent" onClick={() => setRecording(true)}>
                <Plus size={16} /> Record a bill
              </Button>
            )
          }
        />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="hidden md:grid grid-cols-[1.4fr_1fr_1fr_auto_auto] gap-4 px-5 py-3 border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
            <span>Supplier</span>
            <span>Dated</span>
            <span className="text-right">Amount</span>
            <span>Status</span>
            <span />
          </div>

          <div className="divide-y divide-[var(--border)]">
            {bills.map((bill) => {
              const status = STATUS[bill.status] || STATUS.draft;
              const isVoid = Boolean(bill.voided_at);
              return (
                <div
                  key={bill.id}
                  className="group grid grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_auto_auto] gap-x-4 gap-y-1 px-5 py-4 items-center"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[var(--ink)] truncate">
                      {bill.supplier_name || "Nobody named yet"}
                    </div>
                    {bill.bill_no && (
                      <div className="text-xs text-[var(--ink-muted)] tabular truncate">
                        {bill.bill_no}
                      </div>
                    )}
                  </div>

                  <div className="text-sm text-[var(--ink-muted)] tabular hidden md:block">
                    {bill.issue_date ? formatDate(bill.issue_date) : "—"}
                  </div>

                  <div className="text-sm font-semibold tabular text-right">
                    <span className={isVoid ? "line-through text-[var(--ink-muted)]" : "text-[var(--ink)]"}>
                      {bill.gross}
                    </span>
                    {bill.tax_laari !== "0" && !isVoid && (
                      <span className="block text-[11px] font-normal text-[var(--ink-muted)]">
                        incl. {bill.tax} GST
                      </span>
                    )}
                  </div>

                  <div className="order-3 md:order-none col-span-2 md:col-span-1">
                    <Badge tone={isVoid ? "neutral" : status.tone} title={bill.void_reason || undefined}>
                      {isVoid ? "Void" : status.label}
                    </Badge>
                    {bill.gst_treatment === "unknown" && !isVoid && (
                      <span className="block text-[11px] text-[var(--ink-muted)] mt-1 leading-snug">
                        Say how its GST was quoted
                      </span>
                    )}
                  </div>

                  <div className="justify-self-end flex items-center gap-1.5">
                    {canRecord && !isVoid && bill.status !== "posted" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onPost(bill)}
                        disabled={posting === bill.id}
                      >
                        {posting === bill.id && <Loader2 size={13} className="animate-spin" />}
                        Put in the books
                      </Button>
                    )}
                    {canRecord && !isVoid && (
                      <button
                        onClick={() => setVoiding(bill)}
                        aria-label={`Void the bill from ${bill.supplier_name || "this supplier"}`}
                        className="h-11 w-11 rounded-full flex items-center justify-center text-[var(--ink-muted)] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity hover:bg-[var(--surface-2)] hover:text-[var(--danger)]"
                      >
                        <Ban size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <RecordBill open={recording} onClose={() => setRecording(false)} />

      <VoidDialog
        open={!!voiding}
        onClose={() => setVoiding(null)}
        onConfirm={confirmVoid}
        busy={voidBill.isPending}
        what={voiding ? `the bill from ${voiding.supplier_name || "this supplier"}` : "this bill"}
        amount={voiding ? voiding.gross : null}
      />
    </div>
  );
}
