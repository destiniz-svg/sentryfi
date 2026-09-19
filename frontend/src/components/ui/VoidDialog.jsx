import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/**
 * Taking a money record out of the books.
 *
 * Nothing here is deleted. A voided record keeps its place and its number,
 * stops counting towards every total, and carries the reason it was voided.
 * That is what established accounting systems do, and it is what the ledger
 * underneath already enforces — a posted entry cannot be removed by anyone,
 * and a correction is a new opposite entry with a reason attached.
 *
 * The dialog names the record and the amount before asking, because the
 * question "are you sure?" is unanswerable without them. The reason is
 * required rather than optional: a void without a reason is only a quieter
 * delete, and the reason is the entire difference between a correction and a
 * record going missing.
 */
export function VoidDialog({ open, onClose, onConfirm, what, amount, busy }) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setTouched(false);
    }
  }, [open]);

  const tooShort = reason.trim().length < 3;

  function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (tooShort) {
      inputRef.current?.focus();
      return;
    }
    onConfirm(reason.trim());
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      as="form"
      onSubmit={submit}
      title={`Void ${what}?`}
      initialFocus={inputRef}
    >
      <p className="text-sm text-[var(--ink)]">
        {amount ? (
          <>
            <span className="font-semibold tabular">{amount}</span> stops counting towards your
            totals.{" "}
          </>
        ) : (
          <>It stops counting towards your totals. </>
        )}
        The record stays where it is, keeps its number, and shows that you voided it and why.
        Nothing is deleted.
      </p>

      <label className="block mt-5">
        <span className="block text-xs font-medium text-[var(--ink-muted)] mb-1.5">
          Why are you voiding it?
        </span>
        <input
          ref={inputRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="Duplicate of the supplier's reissued invoice"
          aria-invalid={touched && tooShort ? "true" : undefined}
          aria-describedby={touched && tooShort ? "void-reason-error" : undefined}
          className="h-11 w-full rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15"
        />
      </label>

      {touched && tooShort && (
        <p id="void-reason-error" role="alert" className="text-sm text-[var(--danger)] mt-2">
          Give a reason before voiding. Whoever reads the books later — including you — will want
          to know why this went.
        </p>
      )}

      <div className="flex items-center justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>
          Keep it
        </Button>
        <Button type="submit" variant="accent" disabled={busy}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          Void {what}
        </Button>
      </div>
    </Modal>
  );
}
