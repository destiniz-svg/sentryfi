import { useEffect, useMemo, useState } from "react";
import { Plus, Wallet, Ban, Loader2, CreditCard } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/dashboard/StatCard";
import { usePayments, usePaymentMutations } from "@/hooks/useFeatures";
import { VoidDialog } from "@/components/ui/VoidDialog";
import { useInvoices } from "@/hooks/useInvoices";
import { formatMoney, formatDate, today } from "@/lib/utils";

export default function Payments() {
  const { data, isLoading } = usePayments();
  const { voidPayment } = usePaymentMutations();
  const [voiding, setVoiding] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const payments = data?.payments || [];

  async function confirmVoid(reason) {
    await voidPayment.mutateAsync({ id: voiding.id, reason });
    setVoiding(null);
  }

  return (
    <div>
      <PageHeader
        title="Payments"
        description="A ledger of every payment received against your invoices."
        actions={
          <Button variant="accent" onClick={() => setModalOpen(true)}>
            <Plus size={16} /> Record Payment
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6 max-w-2xl">
        <StatCard label="Total received" value={formatMoney(data?.totals?.total || 0)} icon={Wallet} accent />
        <StatCard label="Received this month" value={formatMoney(data?.totals?.thisMonth || 0)} icon={CreditCard} />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : payments.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No payments recorded"
          description="Record a payment against an invoice to build your ledger."
          action={<Button variant="accent" onClick={() => setModalOpen(true)}><Plus size={16} /> Record Payment</Button>}
        />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_1.4fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
            <span>Date</span><span>Invoice / Client</span><span>Method</span><span className="text-right">Amount</span><span></span>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {payments.map((p) => (
              <div key={p.id} className="group grid grid-cols-2 md:grid-cols-[1fr_1.4fr_1fr_1fr_auto] gap-x-4 gap-y-1 px-5 py-4 items-center">
                <div className="text-sm text-[var(--ink-muted)] tabular">{formatDate(p.paid_on)}</div>
                <div className="order-3 md:order-none col-span-2 md:col-span-1 min-w-0">
                  <div className="text-sm font-semibold text-[var(--ink)] tabular truncate">{p.invoice_number}</div>
                  <div className="text-xs text-[var(--ink-muted)] truncate">{p.client_name || "No client"}</div>
                </div>
                <div className="hidden md:block">
                  {p.method ? <Badge tone="neutral">{p.method}</Badge> : <span className="text-xs text-[var(--ink-muted)]">—</span>}
                </div>
                <div className="text-sm font-semibold tabular text-right flex items-center justify-end gap-2">
                  {p.voided_at && <Badge tone="neutral" title={p.void_reason || undefined}>Void</Badge>}
                  <span className={p.voided_at ? "line-through text-[var(--ink-muted)]" : "text-[var(--success)]"}>
                    {formatMoney(p.amount, p.currency)}
                  </span>
                </div>
                {!p.voided_at && <button onClick={() => setVoiding(p)} className="justify-self-end h-7 w-7 rounded-full flex items-center justify-center text-[var(--ink-muted)] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity hover:bg-[var(--surface-2)] hover:text-[var(--danger)]">
                  <Ban size={13} />
                </button>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <VoidDialog
        open={!!voiding}
        onClose={() => setVoiding(null)}
        onConfirm={confirmVoid}
        busy={voidPayment.isPending}
        what={`this payment`}
        amount={voiding ? formatMoney(voiding.amount, voiding.currency) : null}
      />

      <RecordPaymentModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

const METHODS = ["Bank transfer", "Credit card", "Check", "PayPal", "Cash", "Other"];

function RecordPaymentModal({ open, onClose }) {
  const { data: invoices } = useInvoices();
  const { create } = usePaymentMutations();
  const [form, setForm] = useState({ invoiceId: "", amount: "", method: "Bank transfer", paid_on: "", notes: "" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  // Unpaid invoices first — those are what you'd normally record against.
  const options = useMemo(
    () => (invoices || []).filter((i) => i.effective_status !== "paid").concat((invoices || []).filter((i) => i.effective_status === "paid")),
    [invoices]
  );

  useEffect(() => {
    if (open) {
      setForm({ invoiceId: "", amount: "", method: "Bank transfer", paid_on: today(), notes: "" });
      setErr("");
    }
  }, [open]);

  function pickInvoice(id) {
    const inv = (invoices || []).find((i) => i.id === id);
    setForm((f) => ({ ...f, invoiceId: id, amount: inv ? inv.total : f.amount }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.invoiceId) return setErr("Select an invoice");
    if (!(Number(form.amount) > 0)) return setErr("Enter a valid amount");
    setSaving(true);
    setErr("");
    try {
      await create.mutateAsync({ ...form, amount: Number(form.amount) });
      onClose();
    } catch (ex) {
      setErr(ex.message || "Couldn't record payment");
    } finally {
      setSaving(false);
    }
  }

  const selectClass = "h-10 w-full rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]";

  return (
    <Modal
      open={open}
      onClose={onClose}
      as="form"
      onSubmit={onSubmit}
      size="md"
      title={"Record payment"}
    >
            <div className="space-y-3">
              <Field label="Invoice *">
                <select className={selectClass} value={form.invoiceId} onChange={(e) => pickInvoice(e.target.value)}>
                  <option value="">— Select an invoice —</option>
                  {options.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.invoice_number} · {i.client_name || "No client"} · {formatMoney(i.total, i.currency)}{i.effective_status === "paid" ? " (paid)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount *">
                  <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="tabular" placeholder="0.00" />
                </Field>
                <Field label="Date">
                  <Input type="date" value={form.paid_on} onChange={(e) => setForm((f) => ({ ...f, paid_on: e.target.value }))} />
                </Field>
              </div>
              <Field label="Method">
                <select className={selectClass} value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}>
                  {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Notes">
                <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Reference / memo" />
              </Field>
            </div>
            {err && <p role="alert" className="text-sm text-[var(--danger)] mt-3">{err}</p>}
            <div className="flex items-center justify-end gap-2 mt-6">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="accent" disabled={saving}>
                {saving && <Loader2 size={14} className="animate-spin" />}
                Record payment
              </Button>
            </div>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[var(--ink-muted)] mb-1.5">{label}</span>
      {children}
    </label>
  );
}
