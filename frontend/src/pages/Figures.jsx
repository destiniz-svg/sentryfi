import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCompany } from "@/context/CompanyContext";
import { formatDate } from "@/lib/utils";

/**
 * Where things stand, from the books.
 *
 * The screen this replaces read the purchased product's own tables, so posting
 * a bill to the ledger changed nothing on it. Every figure here comes from
 * journal lines instead, which means it moves the moment something is posted
 * and it cannot disagree with the books — there is only one set of records
 * underneath it.
 *
 * It also serves a second purpose the app did not have: a way to look at what
 * is actually in the ledger. "In the books" is a claim until somebody can see
 * the entry.
 */

export default function Figures() {
  const { companyId } = useCompany();

  const { data, isLoading } = useQuery({
    queryKey: ["figures", companyId],
    queryFn: () => apiClient.get("/figures").then((r) => r.data),
    enabled: Boolean(companyId),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[34px] w-[220px] rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[128px] rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const f = data || {};
  const peak = Math.max(1, ...(f.spendByMonth || []).map((m) => m.raw));
  const codePeak = Math.max(1, ...(f.spendByAccount || []).map((c) => c.raw));
  const thisMonth = new Date().toISOString().slice(0, 7);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-[28px] font-semibold tracking-tight text-[var(--ink)]">
        Figures
      </h1>

      {f.entries === 0 ? (
        <Card padding="lg">
          <p className="text-[17px] font-semibold text-[var(--ink)]">Nothing in the books yet</p>
          <p className="text-[15px] text-[var(--ink-muted)] mt-1 leading-relaxed">
            Every figure here comes from the books, so they start when the first bill goes in.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Figure label="Spent this month" currency={f.currency} value={f.spentThisMonth} />
            <Figure label="Owed to suppliers" currency={f.currency} value={f.owedToSuppliers} />
            <Figure label="Earned" currency={f.currency} value={f.earned} />
            <Figure
              label="In bank and cash"
              currency={f.currency}
              value={f.inBankAndCash}
              // A zero here means nothing has been imported, not that the
              // account is empty. Saying which is the difference between a
              // figure and a lie.
              pending={!f.cashIsReal}
              note="Not connected yet. Import a bank statement and this becomes your real position."
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card padding="lg">
              <h2 className="text-[16px] font-semibold">Money out, by month</h2>
              <div className="mt-5 space-y-3">
                {(f.spendByMonth || []).map((m) => (
                  <div key={m.ym} className="flex items-center gap-3">
                    <span className="w-9 text-[13px] text-[var(--ink-muted)] shrink-0">
                      {m.label}
                    </span>
                    <span className="flex-1 h-[7px] rounded-full bg-[var(--surface-2)] overflow-hidden">
                      <span
                        className={`block h-[7px] rounded-full ${
                          m.ym === thisMonth ? "bg-[var(--accent)]" : "bg-[var(--surface-2)]"
                        }`}
                        style={{
                          width: `${Math.max(2, Math.round((m.raw / peak) * 100))}%`,
                          background: m.ym === thisMonth ? undefined : "var(--border)",
                        }}
                      />
                    </span>
                    <span className="tabular text-[13px] text-[var(--ink)] shrink-0 w-24 text-right">
                      {m.amount}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card padding="lg">
              <h2 className="text-[16px] font-semibold">Where it went</h2>
              {(f.spendByAccount || []).length === 0 ? (
                <p className="text-[15px] text-[var(--ink-muted)] mt-4">Nothing spent this month.</p>
              ) : (
                <div className="mt-5 space-y-3">
                  {f.spendByAccount.map((c) => (
                    <div key={c.name} className="flex items-center gap-3">
                      <span className="w-32 text-[13px] text-[var(--ink)] truncate shrink-0">
                        {c.name}
                      </span>
                      <span className="flex-1 h-[7px] rounded-full bg-[var(--surface-2)] overflow-hidden">
                        <span
                          className="block h-[7px] rounded-full bg-[var(--ink)]"
                          style={{ width: `${Math.max(2, Math.round((c.raw / codePeak) * 100))}%` }}
                        />
                      </span>
                      <span className="tabular text-[13px] text-[var(--ink)] shrink-0 w-24 text-right">
                        {c.amount}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* The books themselves. Until this existed, "in the books" was a
              claim nobody could check. */}
          <Card padding="none" className="overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border)]">
              <h2 className="text-[16px] font-semibold">What has been recorded</h2>
              <p className="text-[13px] text-[var(--ink-muted)] mt-0.5">
                Every entry in the books, newest first. Numbered without gaps.
              </p>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {(f.recent || []).map((e) => (
                <div
                  key={e.entryNo}
                  className="grid grid-cols-[auto_1fr_auto] gap-4 px-5 py-4 items-baseline"
                >
                  <span className="tabular text-[13px] text-[var(--ink-muted)] w-8">
                    {e.entryNo}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] text-[var(--ink)] truncate">
                      {e.narrative}
                    </span>
                    <span className="block text-[13px] text-[var(--ink-muted)]">
                      {formatDate(e.date)}
                    </span>
                  </span>
                  <span className="tabular text-[15px] font-semibold text-[var(--ink)]">
                    {e.amount}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Figure({ label, currency, value, pending, note }) {
  return (
    <Card padding="lg">
      <div className="text-[13px] font-medium text-[var(--ink-muted)]">{label}</div>
      {pending ? (
        <div className="pt-2.5 text-[15px] leading-[1.45] text-[var(--ink-muted)]">{note}</div>
      ) : (
        <div className="flex items-baseline gap-1.5 pt-2.5">
          <span className="text-[14px] font-medium text-[var(--ink-muted)]">{currency}</span>
          <span className="tabular text-[30px] leading-none font-semibold tracking-[-.02em]">
            {value}
          </span>
        </div>
      )}
    </Card>
  );
}
