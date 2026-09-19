import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useBills, useBillMutations } from "@/hooks/useBills";
import { useCompany } from "@/context/CompanyContext";
import { useOutbox } from "@/context/OutboxContext";
import { useUndo } from "@/context/UndoContext";
import { PhoneShell } from "@/components/phone/PhoneShell";
import { RecordBill } from "@/components/bills/RecordBill";

/**
 * Every bill, on the rule.
 *
 * One list, not two: the useful question on a site is "what needs me?", not
 * "show me the posted ones". A bill that is waiting says so in its own row and
 * carries the one action it needs, so the answer never requires opening it.
 *
 * Putting a bill in the books hands the ten-second undo to the strip slot,
 * which is the only place an undo lives. It is never drawn over the shutter.
 */

export default function PhoneBillsBoard() {
  const { companyId } = useCompany();
  const { data: bills, isPending } = useBills();
  const { post } = useBillMutations();
  const { can } = useCompany();
  const { count, items } = useOutbox();
  const { offer } = useUndo();

  const [snapping, setSnapping] = useState(false);
  const [posting, setPosting] = useState(null);
  const [failed, setFailed] = useState(null);

  const { data: figures } = useQuery({
    queryKey: ["figures", companyId],
    queryFn: () => apiClient.get("/figures").then((r) => r.data),
    enabled: Boolean(companyId),
  });

  const live = (bills || []).filter((b) => !b.voided_at);
  const waiting = live.filter((b) => b.status !== "posted");

  async function putInBooks(bill) {
    setPosting(bill.id);
    setFailed(null);
    try {
      const result = await post.mutateAsync(bill.id);
      // The strip takes it from here: ten seconds, then it is simply done.
      offer({
        billId: bill.id,
        entryId: result.entryId,
        entryNo: result.entryNo,
        total: result.total,
        who: bill.supplier_name || "this bill",
      });
    } catch (err) {
      // Not a fault: a bill that cannot be posted is a decision somebody has
      // to make, and the row says which one.
      setFailed({ id: bill.id, message: err.message });
    } finally {
      setPosting(null);
    }
  }

  return (
    <PhoneShell
      heading="Owed to suppliers"
      unit={figures?.currency || "MVR"}
      figure={figures?.owedToSuppliers || "0.00"}
      position={waiting.length ? `${waiting.length} still waiting on you` : "Nothing waiting"}
      sync={count > 0 ? `${count} waiting` : "Up to date"}
      onSnap={() => setSnapping(true)}
    >
      {count > 0 && (
        <>
          <div className="phone-section">
            <span className="phone-section-h">On this phone</span>
          </div>
          <div className="phone-rule">
            {items.map((item) => (
              <div key={item.ref} className="phone-row">
                <div className="phone-row-date">Held</div>
                <div className="min-w-0">
                  <div className="phone-row-who">
                    {item.payload?.supplierName || "Nobody named yet"}
                  </div>
                  <div className="phone-row-what">Sends itself when there is signal</div>
                </div>
                <div className="phone-row-amount is-waiting">{item.payload?.amount}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="phone-section">
        <span className="phone-section-h">Bills</span>
      </div>

      {isPending ? (
        <p className="px-5 text-[15px]" style={{ color: "var(--ink-muted)" }}>
          Reading the books.
        </p>
      ) : live.length === 0 ? (
        <div className="px-5 pt-1">
          <div
            className="border-t pt-4 font-display text-[28px] leading-[1.05] font-bold"
            style={{ borderColor: "var(--border)" }}
          >
            Nothing recorded yet
          </div>
          <p className="mt-2 text-[15px] leading-[1.45]">
            Snap the first one with the yellow button.
          </p>
        </div>
      ) : (
        <div className="phone-rule">
          {live.map((bill) => {
            const inBooks = bill.status === "posted";
            const blocked = bill.gst_treatment === "unknown";
            return (
              <div key={bill.id} className="phone-row">
                <div className="phone-row-date">{shortDate(bill.issue_date)}</div>
                <div className="min-w-0">
                  <div className="phone-row-who">
                    {bill.supplier_name || "Nobody named yet"}
                  </div>
                  <div className="phone-row-what">
                    {failed?.id === bill.id
                      ? failed.message
                      : inBooks
                        ? `In the books${bill.bill_no ? ` · ${bill.bill_no}` : ""}`
                        : blocked
                          ? "Needs to know how its tax was quoted"
                          : "Not in the books yet"}
                  </div>
                  {!inBooks && can("record") && (
                    <button
                      type="button"
                      onClick={() => putInBooks(bill)}
                      disabled={posting === bill.id}
                      className="phone-row-do"
                    >
                      {posting === bill.id ? "Putting it in" : "Put it in the books"}
                    </button>
                  )}
                </div>
                {/* Red and signed once the money has moved; plain ink while
                    it is still only a document. Struck through means voided,
                    and a bill waiting on a decision is not that. */}
                <div className={`phone-row-amount${inBooks ? " is-out" : ""}`}>
                  {inBooks ? `−${bill.gross}` : bill.gross}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RecordBill open={snapping} onClose={() => setSnapping(false)} />
    </PhoneShell>
  );
}

function shortDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}`.toUpperCase();
}
