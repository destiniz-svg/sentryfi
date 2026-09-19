import { Link } from "react-router-dom";
import { ArrowRight, Camera, Plus } from "lucide-react";
import { useDashboard } from "@/hooks/useDashboard";
import { useSettings } from "@/hooks/useSettings";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/Badge";
import { formatMoney, formatDate } from "@/lib/utils";

/**
 * The board, in the desk register.
 *
 * It replaces a grid of rounded metric tiles, a collections gauge, a status
 * donut, an ageing chart and a top-clients list — eleven focal points, roughly
 * eight competing yellows, and a 46px vanity percentage as the largest thing on
 * screen. DESIGN.md forbids that pattern by name.
 *
 * What is here instead is the concept from Web.dc.html: what was spent, where
 * it went, what is owed, and the movements behind it. One yellow, on the month the
 * user is in. Everything else is ink, concrete and hairline.
 *
 * Where the backend cannot yet answer a question the design asks — cash and
 * bank position, GST due — the card says so rather than showing an invented
 * figure. PRODUCT.md forbids passing made-up numbers off as real.
 */

const Card = ({ children, className = "" }) => (
  <div
    className={
      "rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-card " +
      className
    }
  >
    {children}
  </div>
);

const Kicker = ({ children }) => (
  <span className="text-[13px] font-medium text-[var(--ink-muted)]">{children}</span>
);

function Figure({ label, value, currency, note, chip, chipTone = "quiet", pending }) {
  return (
    <Card className="p-[18px]">
      <div className="flex items-start justify-between gap-2">
        <Kicker>{label}</Kicker>
        {chip ? (
          <span
            className={
              "inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-semibold " +
              (chipTone === "loud"
                ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                : "bg-[var(--surface-2)] text-[var(--ink-muted)]")
            }
          >
            {chip}
          </span>
        ) : null}
      </div>
      {pending ? (
        <div className="pt-2.5 text-[15px] leading-[1.45] text-[var(--ink-muted)]">{note}</div>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5 pt-2.5">
            <span className="text-[14px] font-medium text-[var(--ink-muted)]">{currency}</span>
            <span className="tabular text-[30px] leading-none font-semibold tracking-[-.02em]">
              {value}
            </span>
          </div>
          <div className="pt-1.5 text-[12px] text-[var(--ink-muted)]">{note}</div>
        </>
      )}
    </Card>
  );
}

export default function Dashboard() {
  const { data, isLoading } = useDashboard();
  const { data: settings } = useSettings();
  const currency = settings?.currency || "MVR";
  const money = (n) => formatMoney(Number(n) || 0, currency).replace(/^[^\d-]+/, "").trim();

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[132px] rounded-[14px]" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <Skeleton className="h-[288px] rounded-[14px]" />
          <Skeleton className="h-[288px] rounded-[14px]" />
        </div>
      </div>
    );
  }

  const s = data.stats || {};
  const spent = Number(s.spentThisMonth) || 0;
  const spentLast = Number(s.spentLastMonth) || 0;
  const delta = spentLast > 0 ? Math.round(((spent - spentLast) / spentLast) * 100) : null;

  const series = (data.spendSeries || []).map((r) => ({ ...r, spend: Number(r.spend) || 0 }));
  const peak = Math.max(1, ...series.map((r) => r.spend));
  const codes = (data.spendByCode || []).map((r) => ({ ...r, amount: Number(r.amount) || 0 }));
  const codePeak = Math.max(1, ...codes.map((r) => r.amount));
  const recent = data.recentInvoices || [];
  const nothingYet = spent === 0 && !recent.length;

  return (
    <div className="space-y-4">
      {/* the four figures */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure
          label="Spent this month"
          currency={currency}
          value={money(spent)}
          note={
            delta === null
              ? "No month to compare with yet"
              : `${Math.abs(delta)}% ${delta >= 0 ? "more" : "less"} than last month`
          }
          chip={delta === null ? null : `${delta >= 0 ? "+" : "−"}${Math.abs(delta)}%`}
          chipTone={delta !== null && delta > 0 ? "loud" : "quiet"}
        />
        <Figure
          label="Owed to you"
          currency={currency}
          value={money(s.outstanding)}
          note={
            s.overdueCount
              ? `${s.overdueCount} ${s.overdueCount === 1 ? "invoice is" : "invoices are"} overdue`
              : "Nothing is overdue"
          }
          chip={s.overdueCount ? `${s.overdueCount} late` : null}
          chipTone={s.overdueCount ? "loud" : "quiet"}
        />
        <Figure
          label="Earned this month"
          currency={currency}
          value={money(s.paidThisMonth)}
          note={`${s.invoiceCount || 0} invoices, ${s.clientCount || 0} customers in total`}
        />
        <Figure
          label="In bank and cash"
          pending
          note="Not connected yet. Import a bank statement and this becomes your real position."
        />
      </div>

      {nothingYet ? (
        <Card className="p-8">
          <EmptyState
            title="Nothing recorded yet"
            description="Snap your first bill or add an expense. This board fills in as you record, and shows what you spent, where it went, and what is still owed to you."
            action={
              <Link
                to="/expenses"
                className="h-11 px-5 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] text-[var(--ink)] text-[15px] font-semibold"
              >
                <Plus size={16} />
                Add the first expense
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          {/* money out, by month */}
          <Card className="p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[16px] font-semibold">Money out, by month</h2>
              <Kicker>Last six months</Kicker>
            </div>
            <ul className="flex items-end gap-4 h-[190px] pt-6" aria-label="Money out by month">
              {series.map((r, i) => {
                const current = i === series.length - 1;
                return (
                  <li key={r.ym} className="flex-1 flex flex-col items-center gap-2">
                    <span className="tabular text-[12px] font-semibold text-[var(--ink-muted)]">
                      {r.spend >= 1000 ? Math.round(r.spend / 1000) + "k" : Math.round(r.spend)}
                    </span>
                    <span
                      className="block w-full rounded-t-lg border"
                      style={{
                        height: Math.max(3, Math.round((r.spend / peak) * 132)),
                        background: current ? "var(--accent)" : "var(--surface-2)",
                        borderColor: current ? "var(--accent)" : "var(--border)",
                      }}
                    />
                    <span className="text-[12px] font-medium text-[var(--ink-muted)]">
                      {r.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* where it went */}
          <Card className="p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[16px] font-semibold">Where it went</h2>
              <Link
                to="/expenses"
                className="text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                All expenses
              </Link>
            </div>
            {codes.length === 0 ? (
              <p className="pt-4 text-[14px] leading-[1.5] text-[var(--ink-muted)]">
                Nothing spent this month yet.
              </p>
            ) : (
              <ul className="pt-4">
                {codes.map((c) => (
                  <li
                    key={c.code}
                    className="grid items-center gap-3 py-2"
                    style={{ gridTemplateColumns: "minmax(0,1fr) 88px" }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium">{c.code}</span>
                      <span className="block h-[7px] mt-1.5 rounded-full bg-[var(--surface-2)]">
                        <span
                          className="block h-[7px] rounded-full bg-[var(--ink)]"
                          style={{ width: `${Math.max(2, Math.round((c.amount / codePeak) * 100))}%` }}
                        />
                      </span>
                    </span>
                    <span className="tabular text-[14px] font-semibold text-right">
                      {money(c.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* the movements behind it */}
      {recent.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-baseline justify-between gap-3 px-5 py-4 border-b border-[var(--border)]">
            <h2 className="text-[16px] font-semibold">Latest invoices</h2>
            <Link
              to="/invoices"
              className="inline-flex items-center gap-1.5 text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
            >
              See all <ArrowRight size={14} />
            </Link>
          </div>
          <ul>
            {recent.slice(0, 5).map((inv) => (
              <li key={inv.id} className="border-b border-[var(--border)] last:border-b-0">
                <Link
                  to={`/invoices/${inv.id}`}
                  className="grid items-center gap-x-4 px-5 py-3.5 hover:bg-[var(--surface-2)] transition-colors"
                  style={{ gridTemplateColumns: "minmax(0,1fr) 96px 110px 120px" }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">
                      {inv.client_name || "No customer"}
                    </span>
                    <span className="block truncate text-[12px] text-[var(--ink-muted)] tabular">
                      {inv.invoice_number}
                    </span>
                  </span>
                  <span className="text-[13px] text-[var(--ink-muted)] tabular hidden sm:block">
                    {inv.issue_date ? formatDate(inv.issue_date) : ""}
                  </span>
                  <span>
                    <StatusBadge status={inv.effective_status || inv.status} />
                  </span>
                  <span className="tabular text-[15px] font-semibold text-right">
                    {formatMoney(inv.total, inv.currency || currency)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* the two things the phone is for */}
      <div className="flex flex-wrap gap-3">
        <Link
          to="/expenses"
          className="h-11 px-5 inline-flex items-center gap-2 rounded-full bg-[var(--ink)] text-[var(--bg)] text-[15px] font-semibold"
        >
          <Camera size={16} />
          Record a bill
        </Link>
        <Link
          to="/invoices/new"
          className="h-11 px-5 inline-flex items-center gap-2 rounded-full border border-[var(--border)] text-[15px] font-semibold"
        >
          <Plus size={16} />
          New invoice
        </Link>
      </div>
    </div>
  );
}
