import { CloudOff, Loader2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useOutbox } from "@/context/OutboxContext";

/**
 * Bills that are on the phone and not yet on the server.
 *
 * This exists for one reason: a person who photographed a bill with no signal
 * has no way of knowing whether it survived. Silence would be read as "it
 * worked", and the first time it had not, they would stop trusting the app
 * with the only copy of a piece of paper.
 *
 * So it names them, says what is happening, and disappears the moment the
 * last one is sent. Deliberately not yellow: waiting is the ordinary state on
 * a site, not a risk, and yellow follows the risk.
 */

export function WaitingToSend() {
  const { items, count, online, sending, flush } = useOutbox();
  if (count === 0) return null;

  return (
    <Card padding="lg" className="mb-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-[var(--ink-muted)]">
          {sending ? (
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          ) : (
            <CloudOff size={18} aria-hidden="true" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-[var(--ink)]">
            {count === 1
              ? "One bill is waiting on this phone"
              : `${count} bills are waiting on this phone`}
          </p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--ink-muted)]">
            {sending
              ? "Sending now."
              : online
                ? "They send themselves. Nothing leaves here until the server has it."
                : "No signal. They send themselves the moment you are back."}
          </p>

          {/* Named, because "3 bills" is not something anyone can check
              against the paper in their hand. */}
          <ul className="mt-2.5 space-y-1">
            {items.slice(0, 4).map((item) => (
              <li
                key={item.ref}
                className="flex items-baseline justify-between gap-3 text-[13px]"
              >
                <span className="truncate text-[var(--ink)]">
                  {item.payload?.supplierName || "Nobody named yet"}
                </span>
                <span className="tabular shrink-0 text-[var(--ink-muted)]">
                  {item.payload?.amount}
                </span>
              </li>
            ))}
            {count > 4 && (
              <li className="text-[13px] text-[var(--ink-muted)]">and {count - 4} more</li>
            )}
          </ul>

          {online && !sending && (
            <Button
              type="button"
              variant="outline"
              onClick={() => flush()}
              className="mt-3"
            >
              <RefreshCw size={16} /> Send now
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
