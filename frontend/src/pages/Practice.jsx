import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Landmark, Lock, Percent } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { ROLE_TEXT } from "@/lib/roles";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Every company you keep books for, on one page (backend routes/practice.js):
 * for an accountant with several clients, or an owner with several companies.
 * What needs a person, the tax return, the bank, the last close and how far
 * setup has come; one tap opens that company's books.
 */
const KIND_DOT = { money_at_risk: "var(--danger)", blocked: "var(--warning)", ageing: "var(--warning)", waiting: "var(--ink-muted)" };

export default function Practice() {
  const { choose } = useCompany();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["practice"], queryFn: () => apiClient.get("/practice").then((r) => r.data.companies) });

  const open = (id) => {
    choose(id);
    navigate("/dashboard");
  };

  return (
    <div className="max-w-[1100px]">
      <PageHeader title="All your companies" description="Every set of books you keep, and what each needs, in one place." />
      {isLoading || !data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64 rounded-[24px]" />
          <Skeleton className="h-64 rounded-[24px]" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2" data-testid="practice">
          {data.map((c) => (
            <section key={c.id} className="rounded-[24px] bg-[var(--surface)] lift p-5 sm:p-6 min-w-0 flex flex-col" data-testid="practice-company">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[17px] font-semibold tracking-[-0.01em] truncate">{c.name}</h2>
                  <p className="text-[13px] text-[var(--ink-muted)]">{c.roles.map((r) => ROLE_TEXT[r]?.label || r).join(", ")}</p>
                </div>
                {c.reads && !c.error && (
                  <span className={cn("shrink-0 h-8 px-3 rounded-full text-[13px] font-medium inline-flex items-center", c.atRisk ? "bg-[var(--danger)]/10 text-[var(--danger)]" : c.needs ? "bg-[var(--surface-2)]" : "bg-[var(--success)]/10 text-[var(--success)]")}>
                    {c.needs ? `${c.needs} ${c.needs === 1 ? "thing needs" : "things need"} a person` : "All clear"}
                  </span>
                )}
              </div>

              {!c.reads ? (
                <p className="text-[14px] text-[var(--ink-muted)] mt-4 flex-1">Your role here feeds the books from the field; it does not read them.</p>
              ) : c.error ? (
                <p className="text-[14px] text-[var(--danger)] mt-4 flex-1">Could not be read just now: {c.error}</p>
              ) : (
                <>
                  {c.top.length > 0 && (
                    <ul className="mt-4 space-y-1.5">
                      {c.top.map((t, i) => (
                        <li key={i} className="flex items-start gap-2 text-[14px] leading-snug">
                          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: KIND_DOT[t.kind] || "var(--ink-muted)" }} aria-hidden="true" />
                          <span className="min-w-0">{t.title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <dl className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1 content-end">
                    <Fact icon={Percent} label={c.taxReturn ? c.taxReturn.label : "Tax"} value={taxLine(c.taxReturn)} tone={c.taxReturn && !c.taxReturn.filed && c.taxReturn.daysLeft !== null ? (c.taxReturn.daysLeft < 0 ? "danger" : c.taxReturn.daysLeft <= 14 ? "warning" : null) : null} />
                    <Fact icon={Landmark} label="Bank" value={c.bankToExplain ? `${c.bankToExplain} lines to explain` : "Explained"} tone={c.bankToExplain ? "warning" : null} />
                    <Fact icon={Lock} label="Closed" value={c.closedThrough ? `to ${formatDate(c.closedThrough)}` : "Nothing yet"} />
                  </dl>
                  {c.setup.done < c.setup.total && (
                    <div className="mt-4">
                      <p className="text-[12px] text-[var(--ink-muted)]">
                        Getting going: {c.setup.done} of {c.setup.total}
                      </p>
                      <div className="mt-1.5 h-1 rounded-full bg-[var(--surface-2)] overflow-hidden" aria-hidden="true">
                        <div className="h-full rounded-full bg-[var(--ink)] opacity-80" style={{ width: `${(c.setup.done / c.setup.total) * 100}%` }} />
                      </div>
                    </div>
                  )}
                </>
              )}
              <button type="button" onClick={() => open(c.id)} className="mt-5 self-start inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-[var(--ink)] text-[var(--surface)] text-[14px] font-medium">
                Open its books <ArrowRight size={15} aria-hidden="true" />
              </button>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function taxLine(r) {
  if (!r) return "Not registered";
  if (r.filed) return "Filed";
  if (r.daysLeft === null) return `${r.owe} so far`;
  return r.daysLeft < 0 ? `${-r.daysLeft} days late` : `Due in ${r.daysLeft} days`;
}

function Fact({ icon: Icon, label, value, tone }) {
  return (
    <div className="rounded-2xl bg-[var(--surface-2)] px-3 py-2.5 min-w-0">
      <dt className="flex items-center gap-1.5 text-[12px] text-[var(--ink-muted)] truncate">
        <Icon size={13} aria-hidden="true" /> {label}
      </dt>
      <dd className="mt-0.5 text-[14px] font-medium truncate" style={tone ? { color: `var(--${tone})` } : undefined}>
        {value}
      </dd>
    </div>
  );
}
