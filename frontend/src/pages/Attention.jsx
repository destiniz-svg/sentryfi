import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check } from "lucide-react";
import { apiClient } from "@/api/client";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCompany } from "@/context/CompanyContext";

/**
 * What needs you.
 *
 * The product record calls this the central idea and the app's only
 * notification surface. It replaces a dashboard of figures with a short list
 * of things that need a person: a figure tells you how you did, this tells you
 * what to do.
 *
 * Three things it deliberately is not.
 *
 * It is not a count. "3 items need review" is a number to be dismissed; a row
 * that names the money and the supplier is a thing to be finished.
 *
 * It is not ordered by time. It is ordered by what it costs to ignore, which
 * is why a supplier billed twice sits above a bill recorded this morning.
 *
 * It is not a feed. When there is nothing, it says so in a sentence rather
 * than showing an empty container, because "nothing is waiting on you" is
 * information and an empty list is an absence of it.
 */

const TONE = {
  // The one yellow field, and it goes to the thing that costs money. Every
  // other row is ink on white, because a screen where everything is loud is a
  // screen where nothing is.
  money_at_risk: {
    band: "bg-[var(--accent)]",
    label: "Costs money",
    labelClass: "text-[var(--on-accent)]",
  },
  blocked: { band: "bg-[var(--ink)]", label: "Waiting on you", labelClass: "text-[var(--bg)]" },
  ageing: { band: "bg-[var(--ink)]", label: "Getting old", labelClass: "text-[var(--bg)]" },
  waiting: { band: "bg-[var(--border)]", label: "Ready", labelClass: "text-[var(--ink)]" },
};

export default function Attention() {
  const { companyId } = useCompany();

  const { data, isLoading } = useQuery({
    queryKey: ["attention", companyId],
    queryFn: () => apiClient.get("/attention").then((r) => r.data),
    enabled: Boolean(companyId),
    // The whole point is that it is current when you look at it.
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  const items = data?.items || [];

  return (
    <div className="max-w-[760px]">
      <h1 className="font-display text-[28px] font-semibold tracking-tight text-[var(--ink)]">
        What needs you
      </h1>
      <p className="text-[var(--ink-muted)] mt-1.5 text-[15px]">
        Everything waiting on a person, in the order it costs you. Nothing else in
        here will interrupt you.
      </p>

      <div className="mt-7">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[76px] rounded-2xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Card padding="lg" className="flex items-start gap-4">
            <span className="h-11 w-11 shrink-0 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[var(--success)]">
              <Check size={20} />
            </span>
            <span>
              <span className="block text-[17px] font-semibold text-[var(--ink)]">
                Nothing is waiting on you.
              </span>
              <span className="block text-[15px] text-[var(--ink-muted)] mt-1 leading-relaxed">
                Every bill that has come in is either in the books or decided. Go and do the job.
              </span>
            </span>
          </Card>
        ) : (
          <ul className="space-y-2">
            {items.map((item, i) => {
              const tone = TONE[item.kind] || TONE.waiting;
              return (
                <li key={`${item.kind}-${i}`}>
                  <Card padding="none" className="overflow-hidden">
                    <Link
                      to={item.href}
                      className="flex items-stretch gap-0 group focus-visible:outline-none"
                    >
                      {/* The band carries the weight, so the row itself stays
                          ink on white and the list reads as one thing. */}
                      <span className={`w-1.5 shrink-0 ${tone.band}`} aria-hidden="true" />

                      <span className="flex-1 min-w-0 p-5">
                        <span className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-block text-[12px] font-semibold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full ${tone.band} ${tone.labelClass}`}
                          >
                            {tone.label}
                          </span>
                        </span>
                        <span className="block text-[17px] font-semibold text-[var(--ink)] mt-2 tabular">
                          {item.title}
                        </span>
                        <span className="block text-[15px] text-[var(--ink-muted)] mt-1 leading-relaxed">
                          {item.detail}
                        </span>
                      </span>

                      {/* The action is named, not implied by an arrow alone. */}
                      <span className="shrink-0 self-center pr-5 pl-3 hidden sm:flex items-center gap-2 text-[15px] font-semibold text-[var(--ink)] group-hover:gap-3 transition-[gap]">
                        {item.does}
                        <ArrowRight size={16} />
                      </span>
                    </Link>
                  </Card>

                  {/* On a phone the action needs its own line rather than
                      being cut off the side of the row. */}
                  <span className="sm:hidden block text-[15px] font-semibold text-[var(--ink)] px-5 pb-4 -mt-2">
                    {item.does} →
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
