import { useNavigate } from "react-router-dom";
import { ArrowLeftRight, Camera, ChevronRight, FileText, Mic, Wallet } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useCompany } from "@/context/CompanyContext";

/**
 * Everything that puts money in the books, one tap from anywhere.
 *
 * Opens over wherever the person is rather than taking them somewhere, and
 * nothing it starts is recorded until they confirm. Each row goes straight to
 * the flow it names; rows a person may not use are not shown at all.
 */
export function RecordSheet({ open, onClose, onBill }) {
  const navigate = useNavigate();
  const { can } = useCompany();
  const go = (to) => {
    onClose();
    navigate(to);
  };

  const rows = [
    can("record") && { icon: Camera, name: "Photograph a bill", sub: "Read, checked by you, recorded", run: () => (onClose(), onBill()), first: true },
    can("record") && { icon: Mic, name: "Say it", sub: "In Dhivehi or English", run: () => (onClose(), onBill()) },
    can("record") && { icon: FileText, name: "Raise an invoice", sub: "To a customer, with GST added", run: () => go("/invoices?new=1") },
    (can("approve") || can("adjust")) && { icon: ArrowLeftRight, name: "Move money", sub: "Between banks, tins and currencies", run: () => go("/bank?move=1") },
    (can("approve") || can("adjust")) && { icon: Wallet, name: "Give cash to a tin", sub: "Held until the holder confirms", run: () => go("/bank") },
  ].filter(Boolean);

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="sheet"
      title="Record"
      description="Nothing is in the books until you confirm."
      className="rounded-t-[22px] border-t-0 bg-[var(--bg)]"
    >
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        {rows.map((r, i) => (
          <button
            key={r.name}
            type="button"
            onClick={r.run}
            className={`w-full flex items-center gap-3.5 min-h-[64px] px-3.5 py-2.5 text-left ${i ? "border-t border-[var(--border)]" : ""}`}
          >
            <span
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                r.first ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--surface-2)] text-[var(--ink)]"
              }`}
            >
              <r.icon size={20} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold">{r.name}</span>
              <span className="block text-[13px] text-[var(--ink-muted)]">{r.sub}</span>
            </span>
            <ChevronRight size={18} className="text-[var(--ink-muted)]" aria-hidden="true" />
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="w-full mt-3 h-[52px] rounded-[14px] border border-[var(--border)] bg-[var(--surface)] font-semibold"
      >
        Cancel
      </button>
    </Modal>
  );
}
