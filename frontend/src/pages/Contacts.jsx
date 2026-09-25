import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MessageCircle, Plus, Search, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ContactForm } from "@/components/contacts/ContactForm";
import { waNumber } from "@/components/documents/Share";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { cn } from "@/lib/utils";

/**
 * Customers, or suppliers: the same list read from either side. The first
 * thing on it is the sentence the owner would say out loud ("MVR 782,592
 * owed to you by 12 customers, 211,884 of it late"); the filters carry their
 * own counts and sums, so choosing one is also reading it. Each row names the
 * business, what it owes or is owed, and how late, with WhatsApp one tap away.
 */

const n = (s) => Number(String(s || "0").replace(/,/g, ""));
const ago = (d) => {
  if (!d) return null;
  const days = Math.round((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return "over a year ago";
};
const plain = (laari) => (Number(laari) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });

export default function Contacts() {
  const { companyId, can } = useCompany();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const suppliers = params.get("side") === "suppliers";
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("owed");
  // ?new=1 is a Record shortcut: the form opens at once.
  const [adding, setAdding] = useState(() => params.get("new") === "1");
  const { data, isLoading } = useQuery({ queryKey: ["contacts", companyId], queryFn: () => apiClient.get("/contacts").then((r) => r.data), enabled: Boolean(companyId) });

  const word = suppliers ? "supplier" : "customer";
  const side = useMemo(() => (data?.contacts || []).filter((c) => (suppliers ? c.supplier : c.customer)), [data, suppliers]);
  const owed = (c) => n(suppliers ? c.payable : c.receivable);
  const live = side.filter((c) => !c.archived);
  const withBalance = live.filter((c) => owed(c) > 0);
  const late = live.filter((c) => (suppliers ? c.dueThisWeek : c.overdue));
  const lateSum = late.reduce((s, c) => s + n(suppliers ? c.dueThisWeek : c.overdue), 0);
  const FILTERS = [
    { key: "all", label: "All", count: live.length },
    { key: "balance", label: suppliers ? "You owe" : "Owe you", count: withBalance.length, sum: suppliers ? data?.totals.payable : data?.totals.receivable },
    { key: "late", label: suppliers ? "Due this week" : "Overdue", count: late.length, sum: late.length ? lateSum.toLocaleString("en-US", { minimumFractionDigits: 2 }) : null },
    { key: "archived", label: "Archived", count: side.length - live.length },
  ];

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase();
    let list = filter === "archived" ? side.filter((c) => c.archived) : filter === "balance" ? withBalance : filter === "late" ? late : live;
    if (words) list = list.filter((c) => [c.name, c.phone, c.email, c.tin, ...(c.tags || [])].some((x) => String(x || "").toLowerCase().includes(words)));
    const by = {
      owed: (a, b) => (b.oldestDays || 0) - (a.oldestDays || 0) || owed(b) - owed(a) || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      recent: (a, b) => String(b.lastOn || "").localeCompare(String(a.lastOn || "")),
    }[sort];
    return [...list].sort(by);
  }, [side, filter, q, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalSentence = (() => {
    if (!data) return suppliers ? "Who you buy from, and what you owe them." : "Who buys from you, and what they owe.";
    if (!withBalance.length) return suppliers ? `You owe none of your ${live.length} suppliers anything right now.` : `None of your ${live.length} customers owes you anything right now.`;
    const total = suppliers ? data.totals.payable : data.totals.receivable;
    const tail = suppliers ? (lateSum ? `, ${plain(lateSum * 100)} of it due this week.` : ".") : lateSum ? `, ${plain(lateSum * 100)} of it overdue.` : ", none of it overdue.";
    return suppliers ? `You owe MVR ${total} to ${withBalance.length} ${withBalance.length === 1 ? "supplier" : "suppliers"}${tail}` : `MVR ${total} owed to you by ${withBalance.length} ${withBalance.length === 1 ? "customer" : "customers"}${tail}`;
  })();

  return (
    <div>
      <PageHeader
        title={suppliers ? "Suppliers" : "Customers"}
        description={totalSentence}
        actions={
          can("record") && (
            <Button variant="accent" onClick={() => setAdding(true)}>
              <Plus size={16} /> Add {word}
            </Button>
          )
        }
      />

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
        <label className="relative flex-1 min-w-0 lg:max-w-[420px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Find a ${word}: name, phone, TIN, group`}
            aria-label={`Find a ${word}`}
            className="w-full h-11 pl-11 pr-4 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[15px] outline-none focus:border-[var(--ink)] placeholder:text-[var(--ink-muted)]"
          />
        </label>
        <div role="tablist" aria-label={`Which ${word}s`} className="flex flex-wrap gap-2">
          {FILTERS.filter((f) => f.key !== "archived" || f.count > 0).map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "h-10 sm:h-11 px-3.5 sm:px-4 rounded-full border text-[14px] whitespace-nowrap transition-colors inline-flex items-center gap-1.5",
                filter === f.key ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-semibold" : "bg-[var(--surface)] border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
              )}
            >
              {f.label}
              <span className={cn("tabular text-[13px]", filter === f.key ? "opacity-70" : "opacity-80")}>{f.count}</span>
            </button>
          ))}
        </div>
        <label className="lg:ml-auto flex items-center gap-2 text-[13px] text-[var(--ink-muted)]">
          Order
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-10 px-3 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[14px] text-[var(--ink)]">
            <option value="owed">{suppliers ? "Most owed" : "Latest and most owed"}</option>
            <option value="name">A to Z</option>
            <option value="recent">Most recent</option>
          </select>
        </label>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : !side.length ? (
        <EmptyState
          icon={Users}
          title={suppliers ? "No suppliers yet" : "No customers yet"}
          description={suppliers ? "They arrive by themselves as bills are recorded, or add one here with a phone number and, when you have it, their TIN." : "They arrive by themselves as invoices are raised, or add one here: a name and a WhatsApp number are enough."}
          action={
            can("record") && (
              <Button variant="accent" onClick={() => setAdding(true)}>
                <Plus size={16} /> Add {word}
              </Button>
            )
          }
        />
      ) : !shown.length ? (
        <p className="text-[15px] text-[var(--ink-muted)] py-10 text-center">No {word}s match that.</p>
      ) : (
        <div className="rounded-[20px] bg-[var(--surface)] lift overflow-hidden" data-testid="contacts">
          {/* The desk reads it as a table; a phone as a list of rows. */}
          <div className="hidden md:grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_88px] gap-4 px-5 h-11 items-center border-b border-[var(--border)] text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
            <span>{suppliers ? "Supplier" : "Customer"}</span>
            <span>Reach them</span>
            <span className="text-right">{suppliers ? "You owe" : "Owes you"}</span>
            <span className="text-right">{suppliers ? "Due this week" : "Overdue"}</span>
            <span />
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {shown.map((c) => (
              <Row key={c.id} c={c} suppliers={suppliers} onOpen={() => nav(`/contacts/${c.id}${suppliers ? "?side=suppliers" : ""}`)} />
            ))}
          </ul>
        </div>
      )}

      {adding && (
        <ContactForm
          side={suppliers ? "suppliers" : "customers"}
          onClose={() => setAdding(false)}
          onSaved={(id) => {
            setAdding(false);
            nav(`/contacts/${id}`);
          }}
        />
      )}
    </div>
  );
}

function Row({ c, suppliers, onOpen }) {
  const amount = suppliers ? c.payable : c.receivable;
  const zero = Number(String(amount).replace(/,/g, "")) <= 0;
  const late = suppliers ? c.dueThisWeek : c.overdue;
  const wa = waNumber(c.phone);
  const sub = [...(c.tags || []), ago(c.lastOn) && `active ${ago(c.lastOn)}`].filter(Boolean).join(" · ");
  return (
    <li className="group relative">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_88px] gap-x-4 gap-y-1 items-center px-5 py-3.5 min-h-[64px] hover:bg-[var(--surface-2)]/60 transition-colors">
        <div className="min-w-0">
          {/* The name is the link; the whole row answers to it. */}
          <Link to={`/contacts/${c.id}${suppliers ? "?side=suppliers" : ""}`} className="block text-[15px] font-semibold truncate after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {c.name}
          </Link>
          <div className="text-[13px] text-[var(--ink-muted)] truncate">{sub || (c.customer && c.supplier ? "Customer and supplier" : "Nothing yet")}</div>
        </div>
        <div className="hidden md:block min-w-0 text-[14px] text-[var(--ink-muted)] truncate">{c.phone || c.email || "No phone or email yet"}</div>
        <div className="text-right">
          <Money amount={amount} className={cn("text-[15px] font-semibold", zero && "text-[var(--ink-muted)] font-medium")} />
          {/* On a phone the lateness sits under the amount. */}
          {late && <div className="md:hidden text-[12px] font-semibold text-[var(--danger)] mt-0.5">{suppliers ? `${late} due this week` : `${c.oldestDays} days over`}</div>}
        </div>
        <div className="hidden md:block text-right">
          {late ? (
            <span className="inline-flex flex-col items-end">
              <Money amount={late} className="text-[15px] font-semibold text-[var(--danger)]" />
              {!suppliers && <span className="text-[12px] text-[var(--danger)]">{c.oldestDays} days over</span>}
            </span>
          ) : (
            <span className="text-[14px] text-[var(--ink-muted)]">—</span>
          )}
        </div>
        <div className="hidden md:flex items-center justify-end gap-1 relative z-10">
          {wa && (
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${c.name}`} title="WhatsApp" className="h-9 w-9 rounded-full inline-flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]">
              <MessageCircle size={16} />
            </a>
          )}
          <button type="button" onClick={onOpen} tabIndex={-1} aria-hidden="true" className="h-9 w-9 rounded-full inline-flex items-center justify-center text-[var(--ink-muted)]">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </li>
  );
}
