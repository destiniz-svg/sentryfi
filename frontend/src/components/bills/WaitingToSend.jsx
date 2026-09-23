import { CloudOff, Loader2, RefreshCw, TriangleAlert, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useOutbox } from "@/context/OutboxContext";

/**
 * What is on this phone and not yet on the server: bills, and every other
 * thing done with no signal (a cash spend, a count, cash received, a
 * delivery, a claim).
 *
 * This exists for one reason: a person who did something with no signal has
 * no way of knowing whether it survived. Silence would be read as "it
 * worked", and the first time it had not, they would stop trusting the app.
 *
 * So it names each one, says what is happening, and disappears the moment
 * the last one is sent. One the server refused (the tin was closed, a count
 * needs a reason) stays, says why, and can be let go: sending it again would
 * only be refused again. Deliberately not yellow: waiting is the ordinary
 * state on a site, not a risk.
 */

export function WaitingToSend({ className = "mb-4" }) {
  const { items, sends, count, online, sending, flush, discard } = useOutbox();
  if (count === 0) return null;

  const rows = [
    ...items.map((i) => ({ ref: i.ref, label: i.payload?.supplierName || "A bill, nobody named yet", side: i.payload?.amount })),
    ...sends.map((s) => ({ ref: s.ref, label: s.label, refused: s.refused, send: true })),
  ];
  const refused = rows.filter((r) => r.refused);

  return (
    <Card padding="lg" className={className} data-testid="waiting-to-send">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-[var(--ink-muted)]">
          {sending ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <CloudOff size={18} aria-hidden="true" />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-[var(--ink)]">{count === 1 ? "One thing is waiting on this phone" : `${count} things are waiting on this phone`}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--ink-muted)]">
            {sending ? "Sending now." : online ? "They send themselves. Nothing leaves here until the server has it." : "No signal. They send themselves the moment you are back."}
          </p>

          {/* Named, because "3 things" is not something anyone can check against what they did. */}
          <ul className="mt-2.5 space-y-1.5">
            {rows.slice(0, 6).map((r) => (
              <li key={r.ref} className="text-[13px]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[var(--ink)]">{r.label}</span>
                  {r.side && <span className="tabular shrink-0 text-[var(--ink-muted)]">{r.side}</span>}
                  {r.refused && (
                    <button type="button" onClick={() => discard(r.ref)} className="shrink-0 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]" aria-label={`Let go: ${r.label}`}>
                      <X size={12} aria-hidden="true" /> Let it go
                    </button>
                  )}
                </div>
                {r.refused && (
                  <p className="mt-0.5 flex items-start gap-1 text-[12px] text-[var(--danger)]">
                    <TriangleAlert size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                    Not taken: {r.refused}
                  </p>
                )}
              </li>
            ))}
            {rows.length > 6 && <li className="text-[13px] text-[var(--ink-muted)]">and {rows.length - 6} more</li>}
          </ul>
          {refused.length > 0 && <p className="mt-2 text-[12px] text-[var(--ink-muted)]">Do it again the right way, then let the old one go.</p>}

          {online && !sending && rows.some((r) => !r.refused) && (
            <Button type="button" variant="outline" onClick={() => flush()} className="mt-3">
              <RefreshCw size={16} /> Send now
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
