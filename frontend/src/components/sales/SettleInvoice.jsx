import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { salesApi } from "@/api/sales";
import { useSalesMutations } from "@/hooks/useSales";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";

/**
 * What happens to an invoice after it is in the books: money arrives against
 * it, or part of it is taken back.
 *
 * Both default to what is left on the invoice, because that is the usual
 * answer, and both let it be less — a customer paying half now is ordinary,
 * and so is crediting two days that were not worked. Neither lets it be more:
 * the server refuses, and the button says so before it gets that far.
 */

const FIELD =
  "w-full h-11 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15";

const clean = (s) => String(s || "").replace(/,/g, "").trim();
const today = () => new Date().toISOString().slice(0, 10);

function laari(text) {
  const t = clean(text);
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  return Number(w) * 100 + Number((f + "00").slice(0, 2));
}

function show(l) {
  return `${Math.floor(l / 100).toLocaleString("en-US")}.${String(l % 100).padStart(2, "0")}`;
}

/** Money in, against one invoice. */
export function ReceiveMoney({ invoice, onClose }) {
  const open = Boolean(invoice);
  const { companyId } = useCompany();
  const toast = useToast();
  const { receive } = useSalesMutations();

  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [receivedOn, setReceivedOn] = useState(today());
  const [reference, setReference] = useState("");
  const [err, setErr] = useState("");

  const { data: accounts } = useQuery({
    queryKey: ["money-accounts", companyId],
    queryFn: salesApi.moneyAccounts,
    enabled: Boolean(companyId) && open,
  });

  useEffect(() => {
    if (!invoice) return;
    setAmount(clean(invoice.outstanding));
    setReceivedOn(today());
    setReference("");
    setErr("");
  }, [invoice]);

  if (!invoice) return null;

  const left = laari(invoice.outstanding) ?? 0;
  const asked = laari(amount);
  const into = accountId || accounts?.[0]?.id || "";
  const intoName = accounts?.find((a) => a.id === into)?.name;

  const blocker =
    asked === null || asked <= 0
      ? "How much came in?"
      : asked > left
        ? `Only ${show(left)} is left on it`
        : !into
          ? "Which account did it land in?"
          : null;
  const label = blocker || `Received MVR ${show(asked)}${intoName ? ` into ${intoName}` : ""}`;

  async function onSubmit(e) {
    e.preventDefault();
    if (blocker) return setErr(blocker);
    setErr("");
    try {
      const result = await receive.mutateAsync({
        amount: show(asked).replace(/,/g, ""),
        accountId: into,
        receivedOn,
        reference: reference.trim() || null,
        allocations: [{ invoiceId: invoice.id, amount: show(asked).replace(/,/g, "") }],
      });
      toast.success(
        `MVR ${result.applied} against ${invoice.invoiceNo}`,
        asked === left ? "It is settled." : `MVR ${show(left - asked)} is still owed on it.`
      );
      onClose();
    } catch (ex) {
      setErr(ex.message || "That could not be recorded.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      as="form"
      onSubmit={onSubmit}
      title={`Money in · ${invoice.invoiceNo}`}
      description={`${invoice.customer || "The customer"} owes MVR ${invoice.outstanding} on this invoice.`}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">How much</span>
            <input
              id="receive-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className={`${FIELD} tabular`}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">On</span>
            <input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} className={`${FIELD} tabular`} />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium block mb-1.5">Into</span>
          <select id="receive-into" value={into} onChange={(e) => setAccountId(e.target.value)} className={FIELD}>
            {(accounts || []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium block mb-1.5">Reference</span>
          <input
            id="receive-reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="The transfer reference on the bank statement"
            className={FIELD}
          />
          <span className="block text-[13px] text-[var(--ink-muted)] mt-1.5 leading-snug">
            Worth copying exactly: it is what matches this to the statement when the bank is
            brought in.
          </span>
        </label>
      </div>

      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">
          {err}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant={blocker ? "outline" : "accent"} disabled={receive.isPending}>
          {receive.isPending && <Loader2 size={14} className="animate-spin" />}
          {label}
        </Button>
      </div>
    </Modal>
  );
}

/** Taking some or all of an invoice back. */
export function CreditInvoice({ invoice, onClose }) {
  const open = Boolean(invoice);
  const toast = useToast();
  const { credit } = useSalesMutations();

  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!invoice) return;
    setAmount(clean(invoice.outstanding));
    setReason("");
    setErr("");
  }, [invoice]);

  if (!invoice) return null;

  const left = laari(invoice.outstanding) ?? 0;
  const asked = laari(amount);
  const blocker =
    asked === null || asked <= 0
      ? "How much is being credited?"
      : asked > left
        ? `Only ${show(left)} is left on it`
        : reason.trim().length < 3
          ? "Say why"
          : null;

  async function onSubmit(e) {
    e.preventDefault();
    if (blocker) return setErr(blocker);
    setErr("");
    try {
      const result = await credit.mutateAsync({
        id: invoice.id,
        amount: show(asked).replace(/,/g, ""),
        reason: reason.trim(),
      });
      toast.success(
        `${result.noteNo} · MVR ${result.credited} credited`,
        `Of which MVR ${result.ofWhichTax} is GST that is no longer owed.`
      );
      onClose();
    } catch (ex) {
      setErr(ex.message || "That could not be credited.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      as="form"
      onSubmit={onSubmit}
      title={`Credit note · ${invoice.invoiceNo}`}
      description="Takes it back out of what the customer owes, and the GST with it. The invoice stays as it was issued."
    >
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">How much, including GST</span>
          <input
            id="credit-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className={`${FIELD} tabular`}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">Why</span>
          <input
            id="credit-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Two days were not worked"
            className={FIELD}
          />
          <span className="block text-[13px] text-[var(--ink-muted)] mt-1.5 leading-snug">
            It goes on the credit note the customer receives, and into the journal.
          </span>
        </label>
      </div>

      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">
          {err}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant={blocker ? "outline" : "accent"} disabled={credit.isPending}>
          {credit.isPending && <Loader2 size={14} className="animate-spin" />}
          {blocker || `Credit MVR ${show(asked)}`}
        </Button>
      </div>
    </Modal>
  );
}
