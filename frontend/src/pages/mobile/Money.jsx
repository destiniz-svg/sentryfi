import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useBills, useBillMutations } from "@/hooks/useBills";
import { useAged, useSales, useSalesMutations } from "@/hooks/useSales";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { Money as Amount } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { byDay, DayHeader, EmptyState, laariText, MoneyRow, Segments } from "@/components/mobile/parts";

/**
 * Money, in the main app on a phone: bills and invoices as one place with two
 * views. A sticky total says what the list adds up to; rows run by day; a
 * swipe puts a waiting one in the books. Every other action (void, receive a
 * payment, credit) stays on the full Bills and Invoices pages, linked below.
 */

const BILL = {
  draft: { tone: "neutral", label: "Not in the books" },
  awaiting_review: { tone: "accent", label: "Needs a decision" },
  posted: { tone: "success", label: "In the books" },
  reversed: { tone: "neutral", label: "Reversed" },
  discarded: { tone: "neutral", label: "Void" },
};

function invoicePill(inv) {
  if (inv.voided) return { tone: "neutral", label: "Void" };
  if (inv.status === "draft") return { tone: "neutral", label: "Draft" };
  if (inv.settled) return { tone: "success", label: "Settled" };
  if (inv.dueDate && new Date(inv.dueDate) < new Date(new Date().toDateString())) return { tone: "danger", label: "Late" };
  return { tone: "accent", label: "Owed" };
}

export default function MobileMoney() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "invoices" ? "invoices" : "bills";

  return (
    <div className="space-y-4">
      <h1 className="font-display text-[30px] font-bold tracking-tight">Money</h1>
      <Segments
        label="Money"
        value={view}
        onChange={(v) => setParams(v === "bills" ? {} : { view: v }, { replace: true })}
        options={[
          { value: "bills", label: "Bills" },
          { value: "invoices", label: "Invoices" },
        ]}
      />
      {view === "bills" ? <BillList /> : <InvoiceList />}
    </div>
  );
}

function Total({ label, amount, sub }) {
  return (
    <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-[var(--bg)]">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="text-[13px] text-[var(--ink-muted)]">{label}</div>
        <div className="font-display text-[28px] font-bold leading-tight">
          <span className="text-[15px] text-[var(--ink-muted)] mr-1">MVR</span>
          <Amount amount={amount} />
        </div>
        {sub && <div className="text-[13px] text-[var(--ink-muted)]">{sub}</div>}
      </div>
    </div>
  );
}

function Days({ rows, dateOf, render }) {
  return byDay(rows, dateOf).map((g) => (
    <section key={g.key}>
      <DayHeader date={g.date} />
      <div className="rounded-2xl border border-[var(--border)] overflow-hidden divide-y divide-[var(--border)]">
        {g.rows.map(render)}
      </div>
    </section>
  ));
}

function BillList() {
  const { data: bills, isPending } = useBills();
  const { post } = useBillMutations();
  const { can } = useCompany();
  const toast = useToast();
  const [busy, setBusy] = useState(null);

  const live = useMemo(() => (bills || []).filter((b) => b.status !== "discarded" && !b.voided_at), [bills]);
  const waiting = live.filter((b) => b.status === "draft" || b.status === "awaiting_review");
  const waitingTotal = waiting.reduce((s, b) => s + BigInt(b.gross_laari || 0), 0n);

  async function putIn(bill) {
    setBusy(bill.id);
    try {
      const r = await post.mutateAsync(bill.id);
      toast.success(`Entry ${r.entryNo} · MVR ${r.total}`, "It is in the books, and the two sides agree.");
    } catch (err) {
      toast.error("Not yet", err.message);
    } finally {
      setBusy(null);
    }
  }

  if (isPending) return <Skeleton className="h-[240px] rounded-2xl" />;
  if (!live.length)
    return <EmptyState title="No bills yet" body="Tap the yellow Record button and photograph one. It is read for you, you check it, and it goes in the books." />;

  return (
    <>
      <Total
        label={waiting.length ? `${waiting.length} waiting to go in the books` : "Every bill is in the books"}
        amount={laariText(waitingTotal)}
        sub={waiting.length > 0 && can("record") ? "Swipe a waiting bill left to put it in" : null}
      />
      <Days
        rows={live}
        dateOf={(b) => b.issue_date || b.received_at}
        render={(b) => (
          <MoneyRow
            key={b.id}
            who={b.supplier_name || "Nobody named yet"}
            line={[b.bill_no, b.tax_laari !== "0" ? `incl. ${b.tax} GST` : null].filter(Boolean).join(" · ")}
            amount={b.gross}
            pill={BILL[b.status]}
            action={
              can("record") && (b.status === "draft" || b.status === "awaiting_review")
                ? { label: "Put in the books", run: () => putIn(b), busy: busy === b.id }
                : null
            }
          />
        )}
      />
      <Link to="/bills" className="block text-center text-[15px] font-semibold text-[var(--deep)] py-3">
        Every bill, with every action
      </Link>
    </>
  );
}

function InvoiceList() {
  const { data: invoices, isPending } = useSales();
  const { data: aged } = useAged();
  const { post } = useSalesMutations();
  const { can } = useCompany();
  const toast = useToast();
  const [busy, setBusy] = useState(null);

  const live = useMemo(() => (invoices || []).filter((i) => !i.voided), [invoices]);

  async function send(inv) {
    setBusy(inv.id);
    try {
      await post.mutateAsync(inv.id);
      toast.success(`${inv.invoiceNo || "Invoice"} is in the books`, `MVR ${inv.gross} owed by ${inv.customer || "the customer"}.`);
    } catch (err) {
      toast.error("Not yet", err.message);
    } finally {
      setBusy(null);
    }
  }

  if (isPending) return <Skeleton className="h-[240px] rounded-2xl" />;
  if (!live.length)
    return (
      <EmptyState
        title="No invoices yet"
        body="Raise one from the yellow Record button. What the customer owes is tracked from the moment it goes in the books."
      />
    );

  return (
    <>
      <Total label="Customers owe you" amount={aged?.total || "0.00"} />
      <Days
        rows={live}
        dateOf={(i) => i.issueDate}
        render={(i) => (
          <MoneyRow
            key={i.id}
            who={i.customer || "Nobody named yet"}
            line={[i.invoiceNo, !i.settled && i.status === "posted" && i.outstanding !== i.gross ? `${i.outstanding} left` : null]
              .filter(Boolean)
              .join(" · ")}
            amount={i.gross}
            pill={invoicePill(i)}
            action={can("record") && i.status === "draft" ? { label: "Put in the books", run: () => send(i), busy: busy === i.id } : null}
          />
        )}
      />
      <Link to="/invoices" className="block text-center text-[15px] font-semibold text-[var(--deep)] py-3">
        Every invoice, with every action
      </Link>
    </>
  );
}
