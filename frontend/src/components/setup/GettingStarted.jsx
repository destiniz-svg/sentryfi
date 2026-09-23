import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronDown, X } from "lucide-react";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { cn } from "@/lib/utils";

/**
 * Getting the books going, at the top of Home until it is done.
 *
 * One step at a time: the next thing to do, why it matters in a sentence, and
 * the button that goes there. The rest are a tap away. Every tick comes from
 * the books (GET /companies/current/setup), so nothing is ticked that was not
 * done. It can be put away; it goes by itself when every step is done.
 */
const HIDE = (companyId) => `sentryfi.setup.hidden.${companyId}`;

export function GettingStarted({ className }) {
  const { companyId, can } = useCompany();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDE(companyId)) === "1";
    } catch {
      return false;
    }
  });
  const [all, setAll] = useState(false);
  const { data } = useQuery({
    queryKey: ["setup", companyId],
    queryFn: () => apiClient.get("/companies/current/setup").then((r) => r.data),
    enabled: Boolean(companyId) && can("read") && !hidden,
  });
  if (hidden || !data || data.done === data.total) return null;
  const next = data.steps.find((s) => !s.done);
  const hide = () => {
    try {
      localStorage.setItem(HIDE(companyId), "1");
    } catch {
      /* it comes back next time; no harm */
    }
    setHidden(true);
  };

  return (
    <section aria-labelledby="getting-started" className={cn("rounded-[24px] bg-[var(--surface)] lift p-5 sm:p-6", className)} data-testid="getting-started">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="getting-started" className="text-[17px] font-semibold tracking-[-0.01em]">
            Getting your books going
          </h2>
          <p className="text-[13px] text-[var(--ink-muted)] mt-0.5">
            {data.done} of {data.total} done. Each is ticked off from your books, not by hand.
          </p>
        </div>
        <button type="button" onClick={hide} aria-label="Put this away" title="Put this away" className="h-8 w-8 shrink-0 rounded-full bg-[var(--surface-2)] inline-flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)]">
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-4 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={data.total} aria-valuenow={data.done} aria-label="Steps done">
        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(data.done / data.total) * 100}%` }} />
      </div>

      {next && (
        <div className="mt-5 rounded-2xl bg-[var(--surface-2)] p-4" data-testid="next-step">
          <p className="text-[12px] text-[var(--ink-muted)]">Next</p>
          <p className="text-[16px] font-semibold mt-0.5">{next.title}</p>
          <p className="text-[14px] text-[var(--ink-muted)] leading-snug mt-1">{next.why}</p>
          <Link to={next.href} className="mt-3 inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-[var(--ink)] text-[var(--surface)] text-[14px] font-medium">
            Do it now <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      )}

      <button type="button" onClick={() => setAll(!all)} aria-expanded={all} className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]">
        {all ? "Fewer" : `All ${data.total} steps`} <ChevronDown size={14} aria-hidden="true" className={cn("transition-transform", all && "rotate-180")} />
      </button>
      {all && (
        <ol className="mt-3 space-y-1">
          {data.steps.map((s) => (
            <li key={s.key}>
              <Link to={s.href} className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-[var(--surface-2)]">
                <span className={cn("mt-0.5 h-5 w-5 shrink-0 rounded-full inline-flex items-center justify-center", s.done ? "bg-[var(--ink)] text-[var(--surface)]" : "border-2 border-[var(--border)]")} aria-hidden="true">
                  {s.done && <Check size={12} strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-[14px] font-medium", s.done && "text-[var(--ink-muted)] line-through decoration-[var(--border)]")}>
                    {s.title}
                    <span className="sr-only">{s.done ? ", done" : ", not done yet"}</span>
                  </span>
                  {!s.done && <span className="block text-[13px] text-[var(--ink-muted)] leading-snug">{s.why}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
