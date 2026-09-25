import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useBills } from "@/hooks/useBills";
import { useAged, useSales } from "@/hooks/useSales";
import { Money as Amount } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, laariText, Segments } from "@/components/mobile/parts";
import { BillList } from "@/components/bills/BillList";
import { InvoiceList } from "@/components/sales/InvoiceList";

/**
 * Money, in the main app on a phone: bills and invoices as one place with two
 * views. A sticky total says what the list adds up to; below it is the same
 * list the Bills and Invoices pages show, with every next step in view.
 */

export default function MobileMoney() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "invoices" ? "invoices" : "bills";

  return (
    <div className="space-y-4">
      <h1 className="font-display text-[28px] font-semibold tracking-tight">Money</h1>
      <Segments
        label="Money"
        value={view}
        onChange={(v) => setParams(v === "bills" ? {} : { view: v }, { replace: true })}
        options={[
          { value: "bills", label: "Bills" },
          { value: "invoices", label: "Invoices" },
        ]}
      />
      {view === "bills" ? <BillsView /> : <InvoicesView />}
    </div>
  );
}

function Total({ label, amount, sub }) {
  return (
    <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-[var(--bg)]">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="text-[13px] text-[var(--ink-muted)]">{label}</div>
        {amount != null && (
          <div className="font-display text-[28px] font-bold leading-tight">
            <span className="text-[15px] text-[var(--ink-muted)] mr-1">MVR</span>
            <Amount amount={amount} />
          </div>
        )}
        {sub && <div className="text-[13px] text-[var(--ink-muted)]">{sub}</div>}
      </div>
    </div>
  );
}

function BillsView() {
  const { data: bills, isPending } = useBills();

  const live = useMemo(() => (bills || []).filter((b) => b.status !== "discarded" && !b.voided_at), [bills]);
  const waiting = live.filter((b) => b.status === "draft" || b.status === "awaiting_review");
  const waitingTotal = waiting.reduce((s, b) => s + BigInt(b.gross_laari || 0), 0n);

  if (isPending) return <Skeleton className="h-[240px] rounded-2xl" />;
  if (!live.length)
    return <EmptyState title="No bills yet" body="Tap the yellow Record button and photograph one. It is read for you, you check it, and it goes in the books." />;

  return (
    <>
      <Total
        label={waiting.length ? `${waiting.length} waiting to go in the books` : "Every bill is in the books"}
        amount={waiting.length ? laariText(waitingTotal) : null}
      />
      <BillList bills={live} />
    </>
  );
}

function InvoicesView() {
  const { data: invoices, isPending } = useSales();
  const { data: aged } = useAged();

  const live = useMemo(() => (invoices || []).filter((i) => !i.voided), [invoices]);

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
      <InvoiceList rows={live} />
    </>
  );
}
