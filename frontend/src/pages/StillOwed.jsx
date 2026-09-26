import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { formatDate } from "@/lib/utils";

/**
 * What is still owed, across open orders: what is still to go out to
 * customers, still to come in from suppliers, and what has come in but waits
 * for the supplier's bill. Each line opens its order, where it can be received,
 * sent, or closed short.
 */

const n = (s) => Number(String(s ?? "").replace(/,/g, "")) || 0;

export default function StillOwed() {
  const { companyId } = useCompany();
  const { data: lines = [], isLoading } = useQuery({
    queryKey: ["orders", companyId, "owed"],
    queryFn: () => apiClient.get("/orders/owed").then((r) => r.data.lines),
    enabled: Boolean(companyId),
  });
  const toGo = lines.filter((l) => l.kind === "sale" && n(l.left) > 0);
  const toCome = lines.filter((l) => l.kind === "purchase" && n(l.left) > 0);
  const waiting = lines.filter((l) => n(l.waitingBill) > 0);

  return (
    <div>
      <PageHeader title="Still owed" description="What open orders still have to send and to bring, and what has come in waiting for its bill." />
      {isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : !lines.length ? (
        <Card padding="lg">
          <p className="text-[16px] font-semibold">Nothing is owed</p>
          <p className="text-[14px] text-[var(--ink-muted)] mt-1.5">Every open order has gone out, come in and been billed.</p>
        </Card>
      ) : (
        <div className="grid gap-6">
          <Group title="To go out to customers" rows={toGo} say={(l) => `${l.left} ${l.unit || ""} still to go of ${l.ordered}`} />
          <Group title="To come in from suppliers" rows={toCome} say={(l) => `${l.left} ${l.unit || ""} still to come of ${l.ordered}`} />
          <Group title="Come in, waiting for the bill" rows={waiting} say={(l) => `${l.waitingBill} ${l.unit || ""} arrived and not yet billed: not in stock until the bill is in the books`} />
        </div>
      )}
    </div>
  );
}

function Group({ title, rows, say }) {
  if (!rows.length) return null;
  return (
    <section aria-label={title} data-testid="owed-group">
      <h2 className="text-[17px] font-semibold mb-2.5">{title}</h2>
      <Card padding="none" className="overflow-hidden">
        <div className="divide-y divide-[var(--border)]">
          {rows.map((l) => (
            <Link key={`${l.lineId}-${title}`} to={`/orders/${l.orderId}`} className="flex items-center gap-3 px-4 py-3 min-h-11 hover:bg-[var(--surface-2)]" data-testid="owed-line">
              <span className="min-w-0 flex-1">
                {l.late && <span className="inline-block mb-1 rounded-full bg-[var(--warning)]/15 text-[var(--warning)] text-[11px] font-semibold px-2 py-0.5">Late</span>}
                <span className="block text-[15px] font-medium break-words">{l.description}</span>
                <span className="block text-[13px] text-[var(--ink-muted)] break-words">
                  {say(l)} · {l.number}, {l.party}
                  {l.expectedOn ? ` · expected ${formatDate(l.expectedOn)}` : ""}
                </span>
              </span>
              <ChevronRight size={16} className="text-[var(--ink-muted)] shrink-0" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </Card>
    </section>
  );
}
