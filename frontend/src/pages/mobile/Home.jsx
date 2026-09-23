import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowDownRight, ArrowUpRight, ChevronRight, Landmark, Percent, ReceiptText, Wallet } from "lucide-react";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/mobile/parts";
import { WaitingToSend } from "@/components/bills/WaitingToSend";
import { GettingStarted } from "@/components/setup/GettingStarted";
import { useT } from "@/lib/i18n";

/**
 * Home, in the main app on a phone (DESIGN.md, "The phone, refined").
 *
 * One black card for the figure that matters (cash and bank now, which way it
 * is going, how long it lasts), four figures side by side, money out
 * month by month, where the cash sits, then what needs the owner. Everything
 * comes from journal lines (/figures) and from the same list the desk's "What
 * needs you" reads (/attention). Yellow only ever marks the one thing to see.
 */

const KIND = {
  money_at_risk: { dot: "var(--danger)", label: "Costs money" },
  blocked: { dot: "var(--warning)", label: "Waiting on you" },
  ageing: { dot: "var(--warning)", label: "Getting old" },
  waiting: { dot: "var(--ink-muted)", label: "Ready" },
};

/** Three months of spending kept aside is the usual cushion. */
const CUSHION = 3;

export default function MobileHome() {
  const { companyId } = useCompany();
  const { t } = useT();
  const figures = useQuery({
    queryKey: ["figures", companyId],
    queryFn: () => apiClient.get("/figures").then((r) => r.data),
    enabled: Boolean(companyId),
  });
  const attention = useQuery({
    queryKey: ["attention", companyId],
    queryFn: () => apiClient.get("/attention").then((r) => r.data),
    enabled: Boolean(companyId),
  });

  const f = figures.data;
  const items = attention.data?.items || [];

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Home</h1>
      <WaitingToSend className="" />
      {!f ? <Skeleton className="h-[176px] rounded-[24px]" /> : <CashCard f={f} />}

      <GettingStarted />

      {f && <Figures f={f} />}

      {f && (f.spendByMonth || []).filter((m) => !m.beforeBooks).length > 1 && <MoneyOut f={f} />}

      {f?.cashIsReal && (f.cashPlaces || []).length > 0 && (
        <section aria-labelledby="where" className="rounded-[24px] bg-[var(--surface)] lift p-5">
          <h2 id="where" className="text-[17px] font-semibold tracking-[-0.01em]">{t("Where the cash is")}</h2>
          <ul className="mt-3 space-y-3">
            {f.cashPlaces.slice(0, 4).map((p) => (
              <li key={p.name} className="flex items-center gap-3">
                <Chip icon={/tin|cash/i.test(p.name) ? Wallet : Landmark} />
                <span className="min-w-0 flex-1 text-[15px] truncate">{p.name}</span>
                <span className="text-[15px] font-semibold tabular">
                  <Money amount={p.amount} />
                </span>
              </li>
            ))}
          </ul>
          {f.cashPlaces.length > 4 && (
            <Link to="/bank" className="mt-4 flex items-center justify-between rounded-full bg-[var(--surface-2)] h-10 px-4 text-[14px] font-medium">
              {f.cashPlaces.length - 4} more places
              <ChevronRight size={16} aria-hidden="true" className="text-[var(--ink-muted)]" />
            </Link>
          )}
        </section>
      )}

      <section aria-labelledby="needs-you">
        <h2 id="needs-you" className="text-[17px] font-semibold tracking-[-0.01em] px-1 pb-3">
          {t("Needs you")}
        </h2>
        {attention.isPending ? (
          <Skeleton className="h-[88px] rounded-[20px]" />
        ) : items.length === 0 ? (
          <EmptyState title="Nothing is waiting on you" body="Bills, late customers and bank lines that need a person show up here, most costly first." />
        ) : (
          <div className="space-y-3">
            {items.map((it, i) => (
              <Link key={i} to={it.href} className="flex items-center gap-3 rounded-[20px] bg-[var(--surface)] lift px-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[12px] text-[var(--ink-muted)]">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: KIND[it.kind]?.dot || "var(--ink-muted)" }} aria-hidden="true" />
                    {KIND[it.kind]?.label || "Ready"}
                  </div>
                  <div className="mt-1 text-[15px] font-semibold leading-snug">{it.title}</div>
                  {it.detail && <div className="mt-0.5 text-[13px] text-[var(--ink-muted)] leading-snug">{it.detail}</div>}
                </div>
                <span className="h-8 w-8 shrink-0 rounded-full bg-[var(--surface-2)] inline-flex items-center justify-center text-[var(--ink-muted)]" aria-hidden="true">
                  <ChevronRight size={16} />
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** A small icon in a pale circle: the reference's one icon treatment. */
function Chip({ icon: Icon, dark }) {
  return (
    <span className={`h-9 w-9 shrink-0 rounded-full inline-flex items-center justify-center ${dark ? "bg-white/10 text-white" : "bg-[var(--surface-2)] text-[var(--ink)]"}`} aria-hidden="true">
      <Icon size={17} strokeWidth={1.75} />
    </span>
  );
}

function CashCard({ f }) {
  const unit = f.currency || "MVR";
  const { t } = useT();
  if (!f.cashIsReal) {
    return (
      <div className="rounded-[24px] bg-[var(--ink-panel)] text-[var(--on-ink-panel)] p-6">
        <div className="text-[14px] opacity-70">Cash and bank</div>
        <div className="mt-1.5 text-[26px] font-semibold leading-tight tracking-[-0.01em]">Not known yet</div>
        <p className="mt-2 text-[14px] leading-[1.45] opacity-75">Bring in a bank statement and this shows what you have, where it is, and which way it is going.</p>
        <Link to="/bank" className="inline-flex items-center mt-5 rounded-full bg-[var(--accent)] text-[var(--on-accent)] text-[15px] font-semibold px-5 h-11">
          Bring a statement in
        </Link>
      </div>
    );
  }

  const change = String(f.cashChange30 || "0.00");
  const down = /^[-−]/.test(change);
  const flat = /^[-−]?0\.00$/.test(change);
  const runway = f.runwayMonths;

  return (
    <div className="rounded-[24px] bg-[var(--ink-panel)] text-[var(--on-ink-panel)] p-6 flex items-start justify-between gap-4" data-testid="cash-card">
      <div className="min-w-0">
        <div className="text-[14px] opacity-70">{t("Cash and bank now")}</div>
        <div className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.02em] tabular whitespace-nowrap">
          <span className="text-[14px] font-medium opacity-60 mr-1 align-[0.35em]">{unit}</span>
          <Money amount={f.inBankAndCash} className="text-inherit" />
        </div>
        <div className="mt-4 flex items-center gap-1.5 text-[13px]" style={{ color: flat ? "inherit" : down ? "#ff9d8f" : "var(--accent)" }}>
          {!flat && (down ? <ArrowDownRight size={15} aria-hidden="true" /> : <ArrowUpRight size={15} aria-hidden="true" />)}
          <span className={flat ? "opacity-70" : ""}>{flat ? "Level over 30 days" : `${change.replace(/^[-−]/, "")} ${down ? "down" : "up"} in 30 days`}</span>
        </div>
      </div>
      {runway != null && (
        <div className="shrink-0 text-right">
          <div className="text-[13px] opacity-70">{t("It lasts")}</div>
          <div className="mt-2 text-[20px] font-semibold leading-none">
            {runway < 1 ? "Under a month" : `${runway >= 10 ? Math.round(runway) : runway} months`}
          </div>
          <div className="mt-4 h-1.5 w-24 rounded-full bg-white/15 overflow-hidden ml-auto" role="img" aria-label={`${Math.round(Math.min(runway / CUSHION, 1) * 100)}% of a ${CUSHION}-month cushion`}>
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(runway / CUSHION, 1) * 100}%` }} />
          </div>
          <div className="mt-1.5 text-[11px] opacity-60">of {CUSHION} months to keep</div>
        </div>
      )}
    </div>
  );
}

/** The figures an owner looks for, all four at once: nothing hides off the edge. */
function Figures({ f }) {
  const unit = f.currency || "MVR";
  const { t } = useT();
  const cards = [
    { icon: ArrowDownLeft, value: f.owedToUs, label: "Owed to you", to: "/invoices" },
    { icon: ArrowUpRight, value: f.owedToSuppliers, label: "You owe suppliers", to: "/bills" },
    { icon: ReceiptText, value: f.spentThisMonth, label: "Spent this month", to: "/figures" },
    { icon: Percent, value: f.gstOwed, label: "GST to set aside", to: "/tax" },
  ].filter((c) => c.value != null);
  return (
    <div className="grid grid-cols-2 gap-3" role="list" aria-label="Figures">
      {cards.map((c) => (
        <Link key={c.label} to={c.to} role="listitem" className="relative min-w-0 rounded-[20px] bg-[var(--surface)] lift p-4">
          <Chip icon={c.icon} />
          <div className="mt-3 text-[17px] font-semibold tracking-[-0.01em] tabular truncate">
            <Money amount={c.value} />
          </div>
          <div className="mt-0.5 text-[13px] text-[var(--ink-muted)] truncate">
            {t(c.label)}
            <span className="sr-only">, {unit}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Money out by month: grey columns, this month's in yellow with its figure above. */
const MONTH = { Jan: "January", Feb: "February", Mar: "March", Apr: "April", May: "May", Jun: "June", Jul: "July", Aug: "August", Sep: "September", Oct: "October", Nov: "November", Dec: "December" };
const short = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}m` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));

/** A figure that counts to its new value rather than jumping. */
function CountUp({ value }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduce) return setShown(value);
    const a = from.current;
    const t0 = performance.now();
    let raf;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 420);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(a + (value - a) * eased);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);
  const [whole, cents] = (shown / 100).toFixed(2).split(".");
  return (
    <span className="tabular">
      {Number(whole).toLocaleString("en-US")}
      <span className="text-[var(--ink-muted)]">.{cents}</span>
    </span>
  );
}

/**
 * Money out by month. Tap a bar, or run a finger along them, to read any
 * month against the one before; the dotted line is the average of the months
 * the books were kept. Months before the books began are shown as not kept,
 * not as months when nothing was spent.
 */
function MoneyOut({ f }) {
  const { t } = useT();
  const reduce = useReducedMotion();
  const [range, setRange] = useState(6);
  const months = f.spendByMonth.slice(-range);
  const [pick, setPick] = useState(null);
  const at = pick === null || pick >= months.length ? months.length - 1 : pick;
  const chart = useRef(null);
  const kept = months.filter((m) => !m.beforeBooks);
  const max = Math.max(...months.map((m) => m.raw), 1);
  const avg = kept.length ? kept.reduce((a, m) => a + m.raw, 0) / kept.length : 0;
  const m = months[at];
  const prev = months[at - 1];
  const change = prev && !prev.beforeBooks && prev.raw > 0 && !m.beforeBooks ? Math.round(((m.raw - prev.raw) / prev.raw) * 100) : null;
  const choose = (i) => {
    if (i === at || i < 0 || i >= months.length) return;
    setPick(i);
    navigator.vibrate?.(4);
  };
  // A finger dragged along the bars reads each month it passes.
  const scrub = (e) => {
    const box = chart.current?.getBoundingClientRect();
    if (!box) return;
    choose(Math.floor(((e.clientX - box.left) / box.width) * months.length));
  };
  const year = m.ym ? m.ym.slice(0, 4) : "";

  return (
    <section aria-labelledby="money-out" className="rounded-[24px] bg-[var(--surface)] lift p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="money-out" className="text-[17px] font-semibold tracking-[-0.01em]">{t("Money out")}</h2>
          <p className="text-[13px] text-[var(--ink-muted)] mt-0.5">By month, from the books</p>
        </div>
        <div role="tablist" aria-label="How many months" className="flex gap-1 p-1 rounded-full bg-[var(--surface-2)] shrink-0">
          {[6, 12].map((n) => (
            <button
              key={n}
              type="button"
              role="tab"
              aria-selected={range === n}
              onClick={() => {
                setRange(n);
                setPick(null);
              }}
              className={`relative h-8 px-3 rounded-full text-[13px] font-medium transition-colors ${range === n ? "text-[var(--surface)]" : "text-[var(--ink-muted)]"}`}
            >
              {range === n && <motion.span layoutId="money-out-range" className="absolute inset-0 rounded-full bg-[var(--ink)]" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <span className="relative">{n}M</span>
            </button>
          ))}
        </div>
      </div>

      {/* The month being read. */}
      <div className="mt-4 flex items-end justify-between gap-3" aria-live="polite">
        <div>
          <div className="text-[12px] text-[var(--ink-muted)]">
            {MONTH[m.label] || m.label} {year}
          </div>
          <div className="text-[26px] font-semibold tracking-[-0.02em] leading-tight">
            {m.beforeBooks ? <span className="text-[17px] font-medium text-[var(--ink-muted)]">Before these books</span> : <CountUp value={Math.round(m.raw)} />}
          </div>
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          {change !== null && (
            <motion.span
              key={`${m.ym}`}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className={`mb-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                change > 0 ? "bg-[var(--danger)]/10 text-[var(--danger)]" : "bg-[var(--success)]/12 text-[var(--success)]"
              }`}
            >
              {change > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {Math.abs(change)}% on {prev.label}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="relative mt-3">
        {/* The average of the months kept. */}
        {avg > 0 && (
          <div className="absolute inset-x-0 pointer-events-none z-10" style={{ bottom: `${(avg / max) * 100}%`, top: "auto", height: 0 }}>
            <div className="border-t border-dashed border-[var(--ink-muted)]/50" />
            <span className="absolute left-0 -top-[18px] text-[10px] text-[var(--ink-muted)] bg-[var(--surface)] pr-1">avg {short(avg / 100)}</span>
          </div>
        )}
        <div
          ref={chart}
          onPointerDown={scrub}
          onPointerMove={(e) => (e.pointerType === "mouse" || e.buttons) && scrub(e)}
          className="relative flex items-end h-[132px] touch-pan-y select-none cursor-pointer"
          role="group"
          aria-label={`Money out by month: ${months.map((x) => `${x.label} ${x.beforeBooks ? "not kept" : x.amount}`).join(", ")}`}
        >
          {months.map((x, i) => {
            const on = i === at;
            const h = x.beforeBooks ? 6 : Math.max(4, (x.raw / max) * 100);
            return (
              <button
                key={x.ym}
                type="button"
                aria-label={`${MONTH[x.label] || x.label}: ${x.beforeBooks ? "before these books" : x.amount}`}
                aria-pressed={on}
                onClick={() => choose(i)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft") choose(i - 1), e.currentTarget.previousSibling?.focus();
                  if (e.key === "ArrowRight") choose(i + 1), e.currentTarget.nextSibling?.focus();
                }}
                className="flex-1 h-full flex items-end justify-center outline-none focus-visible:[&>span]:ring-2 focus-visible:[&>span]:ring-[var(--ink)]"
              >
                <motion.span
                  className={`block rounded-full ${range === 12 ? "w-2" : "w-3"} ${x.beforeBooks ? "border border-dashed border-[var(--border)] bg-transparent" : ""}`}
                  initial={reduce ? false : { height: 0 }}
                  animate={{
                    height: `${h}%`,
                    backgroundColor: x.beforeBooks ? "rgba(0,0,0,0)" : on ? "var(--accent)" : "var(--border)",
                    scaleX: on && !x.beforeBooks ? 1.35 : 1,
                  }}
                  transition={{ height: { type: "spring", stiffness: 140, damping: 20, delay: reduce ? 0 : i * 0.035 }, default: { duration: 0.2 } }}
                />
              </button>
            );
          })}
        </div>
        <div className="flex mt-2">
          {months.map((x, i) => (
            <span
              key={x.ym}
              className={`flex-1 text-center text-[11px] truncate transition-colors ${i === at ? "text-[var(--ink)] font-semibold" : x.beforeBooks ? "text-[var(--ink-muted)]/50" : "text-[var(--ink-muted)]"}`}
            >
              {range === 12 ? String(x.label).slice(0, 1) : String(x.label).slice(0, 3)}
            </span>
          ))}
        </div>
      </div>
      {kept.length < months.length && (
        <p className="text-[12px] text-[var(--ink-muted)] mt-3">Dotted months are before these books began.</p>
      )}
    </section>
  );
}
