import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ListTree, Plus, Receipt, Ban, Loader2, Undo2, MoreHorizontal } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { VoidDialog } from "@/components/ui/VoidDialog";
import { RecordBill } from "@/components/bills/RecordBill";
import { WaitingToSend } from "@/components/bills/WaitingToSend";
import { useQueryClient } from "@tanstack/react-query";
import { BillSplit } from "@/components/bills/BillSplit";
import { billsApi } from "@/api/bills";
import { useBills, useBillMutations } from "@/hooks/useBills";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { formatDate } from "@/lib/utils";
import { Days, MoneyRow } from "@/components/mobile/parts";

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
  const { can, companyId } = useCompany();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [recording, setRecording] = useState(false);
  const [voiding, setVoiding] = useState(null);
  const [posting, setPosting] = useState(null);
  const [reversing, setReversing] = useState(null);
  const [splitting, setSplitting] = useState(null);

  const canRecord = can("record");

  async function onPost(bill) {
    setPosting(bill.id);
    try {
      const result = await post.mutateAsync(bill.id);
      queryClient.invalidateQueries({ queryKey: ["stock", companyId] });
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

  /**
   * Takes a posted bill back out of the books.
   *
   * A bill that is in the books cannot be voided — that used to leave its
   * expense and its payable behind while the row said "void", so the list and
   * the ledger disagreed about the same money. Money that has moved comes
   * back out through a reversal, which is a second entry with a reason on it
   * and leaves both in the journal.
   */
  async function onReverse(bill) {
    setReversing(bill.id);
    try {
      const result = await billsApi.reverse(bill.id);
      toast.success(
        `Taken back out · entry ${result.entryNo}`,
        "Both the original and its reversal stay in the journal."
      );
      queryClient.invalidateQueries({ queryKey: ["bills", companyId] });
      queryClient.invalidateQueries({ queryKey: ["stock", companyId] });
      queryClient.invalidateQueries({ queryKey: ["figures", companyId] });
      queryClient.invalidateQueries({ queryKey: ["attention", companyId] });
    } catch (err) {
      toast.error("Not taken back out", err.message);
    } finally {
      setReversing(null);
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

      {/* Above the list, because a bill held on the phone is not in the list
          — and somebody looking for the one they just photographed needs to
          find it here rather than conclude it was lost. */}
      <WaitingToSend />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : !bills?.length ? (
        <EmptyState
          icon={Receipt}
          title="Nothing recorded yet"
          description={
            canRecord
              ? "Record the first one. It takes what is on the paper and nothing more."
              : "Nothing has been recorded here yet."
          }
          action={
            canRecord && (
              <Button variant="outline" onClick={() => setRecording(true)}>
                <Plus size={16} /> Record a bill
              </Button>
            )
          }
        />
      ) : (
        <>
        {/* Phone and tablet: the Money list, one card a day, the next step a swipe away. */}
        <div className="lg:hidden">
          {canRecord && <p className="text-[13px] text-[var(--ink-muted)] px-1">Swipe a bill left for its next step.</p>}
          <Days
            rows={bills}
            dateOf={(b) => b.issue_date || b.received_at}
            render={(bill) => {
              const isVoid = Boolean(bill.voided_at);
              const status = STATUS[bill.status] || STATUS.draft;
              return (
                <MoneyRow
                  key={bill.id}
                  to={`/bills/${bill.id}`}
                  who={bill.supplier_name || "Nobody named yet"}
                  line={[bill.bill_no, bill.tax_laari !== "0" && !isVoid ? `incl. ${bill.tax} GST` : null, bill.gst_treatment === "unknown" && !isVoid ? "Say how its GST was quoted" : null].filter(Boolean).join(" · ")}
                  amount={bill.gross}
                  struck={isVoid}
                  pill={isVoid ? { tone: "neutral", label: "Void" } : status}
                  action={
                    canRecord && !isVoid
                      ? bill.status === "posted"
                        ? [{ label: "Take it back out", run: () => onReverse(bill), busy: reversing === bill.id }]
                        : [
                            { label: "Put in the books", run: () => onPost(bill), busy: posting === bill.id },
                            { label: "What it was for", run: () => setSplitting(bill) },
                            { label: "Void it", run: () => setVoiding(bill) },
                          ]
                      : null
                  }
                />
              );
            }}
          />
        </div>
        <Card padding="none" className="overflow-hidden hidden lg:block">
          <div className="hidden xl:grid grid-cols-[minmax(0,1.4fr)_120px_150px_minmax(0,1fr)_344px] gap-4 px-5 py-3 border-b border-[var(--border)] text-[12px] text-[var(--ink-muted)] font-medium">
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
              // In the books means the money has moved, and moved money is
              // reversed, never voided.
              const inBooks = bill.status === "posted";
              const who = bill.supplier_name || "this supplier";
              const more = canRecord && !isVoid
                ? inBooks
                  ? [{ label: "Take it back out", icon: Undo2, onSelect: () => onReverse(bill) }]
                  : [{ label: "Void it", icon: Ban, onSelect: () => setVoiding(bill) }]
                : [];
              const menu = more.length > 0 && <RowMenu label={`More for the bill from ${who}`} busy={reversing === bill.id} items={more} />;
              const decide = canRecord && !isVoid && !inBooks;
              return (
                <div
                  key={bill.id}
                  className="group grid grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1.4fr)_120px_150px_minmax(0,1fr)_344px] gap-x-4 gap-y-1 px-5 py-4 items-center"
                >
                  <div className="min-w-0">
                    {/* The bill's own page: its lines, the photograph, what is paid and owed. */}
                    <Link
                      to={`/bills/${bill.id}`}
                      className="block text-sm font-semibold text-[var(--ink)] truncate underline decoration-transparent underline-offset-4 hover:decoration-[var(--ink)]"
                    >
                      {bill.supplier_name || "Nobody named yet"}
                    </Link>
                    {bill.bill_no && (
                      <div className="text-xs text-[var(--ink-muted)] tabular truncate">
                        {bill.bill_no}
                      </div>
                    )}
                  </div>

                  <div className="text-sm text-[var(--ink-muted)] tabular hidden xl:block">
                    {bill.issue_date ? formatDate(bill.issue_date) : "—"}
                  </div>

                  <div className="text-sm font-semibold tabular text-right">
                    <span className={isVoid ? "line-through text-[var(--ink-muted)]" : "text-[var(--ink)]"}>
                      <Money amount={bill.gross} />
                    </span>
                    {bill.tax_laari !== "0" && !isVoid && (
                      <span className="block text-[13px] font-normal text-[var(--ink-muted)]">
                        incl. {bill.tax} GST
                      </span>
                    )}
                  </div>

                  <div className="order-3 xl:order-none col-span-2 xl:col-span-1 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                    <Badge tone={isVoid ? "neutral" : status.tone} title={bill.void_reason || undefined}>
                      {isVoid ? "Void" : status.label}
                    </Badge>
                    {bill.gst_treatment === "unknown" && !isVoid && (
                      <span className="block text-[13px] text-[var(--ink-muted)] mt-1 leading-snug">
                        Say how its GST was quoted
                      </span>
                    )}
                    </div>
                    <div className="xl:hidden -my-2 -mr-2">{menu}</div>
                  </div>

                  <div className={`order-4 xl:order-none col-span-2 xl:col-span-1 xl:justify-self-end flex-wrap items-center gap-1.5 ${decide ? "flex" : "hidden xl:flex"}`}>
                    {canRecord && !isVoid && bill.status !== "posted" && (
                      <Button variant="ghost" onClick={() => setSplitting(bill)} aria-label={`What the bill from ${bill.supplier_name || "this supplier"} was for`}>
                        <ListTree size={14} /> What it was for
                      </Button>
                    )}
                    {canRecord && !isVoid && bill.status !== "posted" && (
                      <Button
                        variant="outline"
                        onClick={() => onPost(bill)}
                        disabled={posting === bill.id}
                      >
                        {posting === bill.id && <Loader2 size={13} className="animate-spin" />}
                        Put in the books
                      </Button>
                    )}
                    <div className="hidden xl:block">{menu}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        </>
      )}

      <RecordBill open={recording} onClose={() => setRecording(false)} />
      {splitting && <BillSplit bill={splitting} onClose={() => setSplitting(null)} />}

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

/**
 * A row's quieter actions, behind one button: kept within reach, never one
 * slip of a thumb away. Escape or a tap elsewhere closes it.
 */
function RowMenu({ label, items, busy }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const key = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen(!open)}
        className="h-11 w-11 rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)] disabled:opacity-50"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <MoreHorizontal size={18} />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 bottom-full mb-1 xl:bottom-auto xl:top-full xl:mt-1 xl:mb-0 z-20 min-w-[200px] rounded-2xl bg-[var(--surface)] p-1.5 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.3)] border border-[var(--border)]">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className="w-full h-11 px-3 rounded-xl flex items-center gap-2.5 text-[14px] text-left hover:bg-[var(--surface-2)]"
            >
              {it.icon && <it.icon size={15} className="text-[var(--ink-muted)]" />}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
